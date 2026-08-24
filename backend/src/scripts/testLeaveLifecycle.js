/**
 * Leave lifecycle test — runs against a throwaway database.
 *
 * Clones the relevant table structures from the live schema into
 * finance_erp_leavetest, seeds a minimal cast (Super Admin, HOP, staff member),
 * then exercises the whole flow:
 *
 *   1. staff applies for deductible leave  -> days reserved, balance_before/after set
 *   2. wrong approver is rejected          -> routing enforced
 *   3. HOP approves                        -> days deducted, audit trail written
 *   4. staff applies for NON-deductible    -> balance untouched
 *   5. HOP applies                         -> routed to Super Admin, not to themselves
 *   6. rejection                           -> reserved days released
 *   7. monthly accrual                     -> +2.5 days, and idempotent on re-run
 *
 * The live database is never written to. Drops and recreates the test DB.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const LIVE = process.env.DB_NAME;
const TEST = 'finance_erp_leavetest';

const TABLES = [
  'roles', 'departments', 'users',
  'hr_leave_types', 'hr_employees', 'hr_leave_balances',
  'hr_leave_requests', 'hr_leave_audit', 'hr_leave_accrual_log',
];

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  [PASS] ${label}${detail ? ' — ' + detail : ''}`); }
  else      { fail += 1; console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`); }
};

(async () => {
  const root = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  // Seed rows omit audit columns like updated_at; relax strict mode for setup.
  await root.query("SET SESSION sql_mode = ''");

  console.log(`\nBuilding throwaway database ${TEST} (live DB ${LIVE} untouched)…`);
  await root.query(`DROP DATABASE IF EXISTS \`${TEST}\``);
  await root.query(`CREATE DATABASE \`${TEST}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  // Clone structures in dependency order.
  await root.query(`USE \`${TEST}\``);
  await root.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) {
    await root.query(`CREATE TABLE \`${TEST}\`.\`${t}\` LIKE \`${LIVE}\`.\`${t}\``);
  }
  await root.query('SET FOREIGN_KEY_CHECKS = 1');

  // Seed the cast.
  await root.query(`INSERT INTO \`${TEST}\`.roles (id, role_name) VALUES
      (1,'ADMIN'), (2,'HEAD_OF_PROGRAMS'), (3,'GENERAL_USER')`);
  await root.query(`INSERT INTO \`${TEST}\`.departments (id, department_name, department_code, is_active)
      VALUES (10,'Health Services','HSD',1), (20,'Admin & HR','AHR',1)`);
  await root.query(`INSERT INTO \`${TEST}\`.users (id, employee_id, email, password_hash, first_name, last_name, role_id, department_id, is_active) VALUES
      (1,'E-ADM','admin@test','x','Super','Admin',1,20,1),
      (2,'E-HOP','hop@test','x','Helen','Ops',2,10,1),
      (3,'E-STF','staff@test','x','Sam','Staff',3,10,1),
      (4,'E-HOP2','hop2@test','x','Harry','Other',2,20,1)`);
  await root.query(`INSERT INTO \`${TEST}\`.hr_leave_types
      (id, leave_code, leave_name, is_active, is_deductible, is_accrual_target, monthly_accrual_days) VALUES
      (1,'AL','Annual Leave',1,1,1,2.5),
      (2,'SL','Sick Leave',1,0,0,0)`);
  await root.query(`INSERT INTO \`${TEST}\`.hr_employees
      (id, user_id, employee_number, first_name, last_name, department_id, employment_type, employment_status, is_active) VALUES
      (1,1,'ZCC-0001','Super','Admin',20,'FULL_TIME','ACTIVE',1),
      (2,2,'ZCC-0002','Helen','Ops',10,'FULL_TIME','ACTIVE',1),
      (3,3,'ZCC-0003','Sam','Staff',10,'FULL_TIME','ACTIVE',1)`);

  const YEAR = new Date().getFullYear();
  // Sam starts with 20 days of annual leave.
  await root.query(`INSERT INTO \`${TEST}\`.hr_leave_balances
      (employee_id, leave_type_id, fiscal_year, entitlement, carried_forward, taken, pending)
      VALUES (3,1,${YEAR},20,0,0,0), (2,1,${YEAR},15,0,0,0)`);
  await root.end();

  // Point the service at the test DB, then load it fresh.
  process.env.DB_NAME = TEST;
  const hrService = require('./../services/hr.service');
  const db = require('./../config/database');

  const ADMIN = { id: 1, role: 'ADMIN',            department_id: 20 };
  const HOP   = { id: 2, role: 'HEAD_OF_PROGRAMS', department_id: 10 };
  const HOP2  = { id: 4, role: 'HEAD_OF_PROGRAMS', department_id: 20 };

  const balanceOf = async (empId, typeId = 1) => {
    const r = await db.query(
      `SELECT entitlement + carried_forward - taken AS avail, taken, pending
       FROM hr_leave_balances WHERE employee_id=? AND leave_type_id=? AND fiscal_year=?`,
      [empId, typeId, YEAR]
    );
    return r[0];
  };

  try {
    // ── 1. Deductible application reserves days ─────────────────────────────
    console.log('\n1. Staff applies for 5 days Annual Leave (deductible)');
    const r1 = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-06-01`, end_date: `${YEAR}-06-05`, reason: 'Family visit' }, 3
    );
    check('days computed inclusively', Number(r1.days_requested) === 5, `${r1.days_requested} days`);
    check('balance_before recorded', Number(r1.balance_before) === 20, `${r1.balance_before}`);
    check('balance_after projected', Number(r1.balance_after) === 15, `${r1.balance_after}`);
    let b = await balanceOf(3);
    check('nothing deducted until the request is approved',
      Number(b.pending) === 0 && Number(b.taken) === 0, `pending=${b.pending} taken=${b.taken}`);

    // ── 2. Routing is enforced ──────────────────────────────────────────────
    console.log('\n2. Approval routing');
    let blocked = false;
    try { await hrService.approveLeaveRequest(r1.id, HOP2, { approved: true }); }
    catch (e) { blocked = true; }
    check('HOP of a DIFFERENT department cannot approve', blocked);

    blocked = false;
    try { await hrService.approveLeaveRequest(r1.id, { id: 3, role: 'GENERAL_USER', department_id: 10 }, { approved: true }); }
    catch (e) { blocked = true; }
    check('a general user cannot approve', blocked);

    // ── 3. Correct approver deducts ─────────────────────────────────────────
    console.log('\n3. HOP of the staff member\'s department approves');
    const a1 = await hrService.approveLeaveRequest(r1.id, HOP, { approved: true, comments: 'Enjoy' });
    check('status APPROVED', a1.status === 'APPROVED');
    check('days deducted', Number(a1.days_deducted) === 5, `${a1.days_deducted} days`);
    check('balance_after correct', Number(a1.balance_after) === 15, `${a1.balance_after}`);
    b = await balanceOf(3);
    check('approval records the days as taken',
      Number(b.pending) === 0 && Number(b.taken) === 5, `pending=${b.pending} taken=${b.taken}`);

    const trail1 = await hrService.getLeaveAuditTrail(r1.id);
    check('audit trail has SUBMITTED + APPROVED', trail1.length === 2,
      trail1.map(t => t.action).join(' -> '));
    check('trail records the approver', Number(trail1[1].actor_user_id) === 2);
    check('trail carries balance either side',
      Number(trail1[1].balance_before) === 20 && Number(trail1[1].balance_after) === 15,
      `${trail1[1].balance_before} -> ${trail1[1].balance_after}`);

    // ── 4. Non-deductible leaves the balance alone ──────────────────────────
    console.log('\n4. Staff applies for 3 days Sick Leave (non-deductible)');
    const before = (await balanceOf(3)).avail;
    const r2 = await hrService.createLeaveRequest(
      { leave_type_id: 2, start_date: `${YEAR}-07-01`, end_date: `${YEAR}-07-03`, reason: 'Flu' }, 3
    );
    check('no balance snapshot taken', r2.balance_before === null, `${r2.balance_before}`);
    check('flagged non-deductible', r2.is_deductible === false);
    const a2 = await hrService.approveLeaveRequest(r2.id, HOP, { approved: true });
    check('approved with zero deduction', Number(a2.days_deducted) === 0);
    check('annual balance unchanged', Number((await balanceOf(3)).avail) === Number(before),
      `${before} -> ${(await balanceOf(3)).avail}`);

    // ── 5. A HOP's own request routes to Super Admin ────────────────────────
    console.log('\n5. HOP applies for leave');
    const r3 = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-08-10`, end_date: `${YEAR}-08-12`, reason: 'Rest' }, 2
    );
    blocked = false;
    try { await hrService.approveLeaveRequest(r3.id, HOP, { approved: true }); }
    catch (e) { blocked = true; }
    check('HOP cannot approve their own request', blocked);

    const a3 = await hrService.approveLeaveRequest(r3.id, ADMIN, { approved: true });
    check('Super Admin approves the HOP', a3.status === 'APPROVED');
    check('HOP balance deducted', Number((await balanceOf(2)).taken) === 3,
      `taken=${(await balanceOf(2)).taken}`);

    // ── 6. Rejection releases the reservation ───────────────────────────────
    console.log('\n6. Rejection');
    const availBefore = Number((await balanceOf(3)).avail);
    const r4 = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-09-01`, end_date: `${YEAR}-09-04`, reason: 'Trip' }, 3
    );
    check('nothing deducted while it waits', Number((await balanceOf(3)).avail) === availBefore,
      `${availBefore} → ${(await balanceOf(3)).avail}`);
    const a4 = await hrService.approveLeaveRequest(r4.id, HOP, { approved: false, comments: 'Peak period' });
    check('status REJECTED', a4.status === 'REJECTED');
    check('rejection still leaves the balance alone',
      Number((await balanceOf(3)).avail) === availBefore,
      `${availBefore} -> ${(await balanceOf(3)).avail}`);
    const trail4 = await hrService.getLeaveAuditTrail(r4.id);
    check('rejection reason in trail', trail4[1].comments === 'Peak period');

    // ── 7. Monthly accrual ──────────────────────────────────────────────────
    console.log('\n7. Monthly accrual (+2.5 days on the 25th)');
    const preAccrual = Number((await balanceOf(3)).avail);
    const acc1 = await hrService.runMonthlyAccrual({ triggeredByUserId: 1 });
    check('accrual ran', acc1.ran === true);
    check('credited every active employee', acc1.credited === 3, `${acc1.credited} employees`);
    check('2.5 days per employee', Number(acc1.days_per_employee) === 2.5);
    check('balance grew by 2.5', Number((await balanceOf(3)).avail) === preAccrual + 2.5,
      `${preAccrual} -> ${(await balanceOf(3)).avail}`);

    const acc2 = await hrService.runMonthlyAccrual({ triggeredByUserId: 1 });
    check('re-run is idempotent (all skipped)', acc2.credited === 0 && acc2.skipped === 3,
      `credited=${acc2.credited} skipped=${acc2.skipped}`);
    check('balance did not double-credit', Number((await balanceOf(3)).avail) === preAccrual + 2.5);

    // ── 8. Analytics ────────────────────────────────────────────────────────
    console.log('\n8. Analytics');
    const an = await hrService.getLeaveAnalytics({ year: YEAR, highBalanceThreshold: 10 });
    check('summary present', Number(an.summary.employees) > 0, `${an.summary.employees} employees`);
    check('high-balance watch list populated', an.highBalances.length > 0,
      `${an.highBalances.length} over 10 days`);
    check('leave-type split present', an.byLeaveType.length === 2);
    check('accrual history recorded', an.accrualHistory.length === 1);

    const rows = await hrService.getLeaveExportRows({ year: YEAR });
    check('export rows returned', rows.length === 4, `${rows.length} requests`);

  } finally {
    await db.pool.end();
    const cleanup = await mysql.createConnection({
      host: process.env.DB_HOST, port: process.env.DB_PORT,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    });
    await cleanup.query(`DROP DATABASE IF EXISTS \`${TEST}\``);
    await cleanup.end();
    console.log(`\nDropped ${TEST}.`);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('\nTEST ERROR:', e); process.exit(1); });
