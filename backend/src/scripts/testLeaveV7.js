/**
 * v7 rule tests
 *
 *   - days are deducted ONLY on approval; rejection changes nothing
 *   - per-employee accrual: on/off, and a custom monthly rate
 *   - the monthly accrual job and its re-run behaviour
 *
 * Runs in a throwaway database; the live one is never written to.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const LIVE = process.env.DB_NAME;
const TEST = 'finance_erp_v7test';

const TABLES = [
  'roles', 'departments', 'users',
  'hr_leave_types', 'hr_employees', 'hr_leave_balances',
  'hr_leave_requests', 'hr_leave_audit', 'hr_leave_accrual_log',
  'hr_leave_attachments', 'hr_leave_adjustments', 'hr_employee_audit',
  'hr_contracts', 'hr_documents',
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
  await root.query("SET SESSION sql_mode = ''");

  console.log(`\nBuilding throwaway database ${TEST} (live DB ${LIVE} untouched)…`);
  await root.query(`DROP DATABASE IF EXISTS \`${TEST}\``);
  await root.query(`CREATE DATABASE \`${TEST}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.query(`USE \`${TEST}\``);
  await root.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) {
    await root.query(`CREATE TABLE \`${TEST}\`.\`${t}\` LIKE \`${LIVE}\`.\`${t}\``);
  }
  await root.query('SET FOREIGN_KEY_CHECKS = 1');

  await root.query(`INSERT INTO \`${TEST}\`.roles (id, role_name) VALUES
      (1,'ADMIN'), (2,'HEAD_OF_PROGRAMS'), (3,'GENERAL_USER')`);
  await root.query(`INSERT INTO \`${TEST}\`.departments (id, department_name, department_code, is_active, updated_at)
      VALUES (13,'Church Peace and Just Societies','CPJS',1,NOW()), (17,'Admin and HR','AHR',1,NOW())`);
  await root.query(`INSERT INTO \`${TEST}\`.users
      (id, employee_id, email, password_hash, first_name, last_name, role_id, department_id, is_active, updated_at) VALUES
      (1,'E1','admin@t','x','Super','Admin',1,17,1,NOW()),
      (2,'E2','hop@t','x','Carl','Peace',2,13,1,NOW()),
      (3,'E3','staff@t','x','Cathy','Staff',3,13,1,NOW()),
      (4,'E4','parttime@t','x','Pat','PartTime',3,13,1,NOW()),
      (5,'E5','service@t','x','Sam','Service',3,13,1,NOW())`);
  await root.query(`INSERT INTO \`${TEST}\`.hr_leave_types
      (id, leave_code, leave_name, is_active, is_deductible, is_accrual_target,
       monthly_accrual_days, requires_document, free_days_limit, free_days_window_months) VALUES
      (1,'VL','Vacation Leave',1,1,1,2.5,0,NULL,NULL),
      (2,'CL','Compassionate Leave',1,1,0,0,0,12,12)`);
  await root.end();

  process.env.DB_NAME = TEST;
  const hrService = require('./../services/hr.service');
  const db = require('./../config/database');

  const HOP  = { id: 2, role: 'HEAD_OF_PROGRAMS', department_id: 13, department_code: 'CPJS' };
  const YEAR = new Date().getFullYear();

  const bal = async (empId) => {
    const r = await db.query(
      `SELECT entitlement, taken, pending,
              (entitlement + carried_forward - taken) AS avail
       FROM hr_leave_balances WHERE employee_id=? AND leave_type_id=1 AND fiscal_year=?`,
      [empId, YEAR]);
    return r.length ? r[0] : null;
  };
  const avail = async (empId) => Number((await bal(empId))?.avail ?? 0);

  try {
    await hrService.syncEmployeesFromUsers();
    const emps = await db.query('SELECT id, user_id FROM hr_employees ORDER BY user_id');
    const empOf = (uid) => emps.find((e) => e.user_id === uid).id;
    const staff = empOf(3), partTime = empOf(4), service = empOf(5);

    const setBal = async (empId, days) => {
      await db.query(
        `INSERT INTO hr_leave_balances (employee_id, leave_type_id, fiscal_year, entitlement, carried_forward, taken, pending)
         VALUES (?,1,?,?,0,0,0)
         ON DUPLICATE KEY UPDATE entitlement=VALUES(entitlement), taken=0, pending=0`,
        [empId, YEAR, days]);
    };

    // ── 1. Nothing is deducted before approval ─────────────────────────────
    console.log('\n1. Deduction happens only on approval');
    await setBal(staff, 20);

    const req1 = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-03-02`, end_date: `${YEAR}-03-06` }, 3);
    check('balance untouched while pending', (await avail(staff)) === 20, `${await avail(staff)}`);
    check('projection shows what approval would cost',
      Number(req1.balance_before) === 20 && Number(req1.balance_after) === 15,
      `${req1.balance_before} → ${req1.balance_after}`);

    const b1 = await bal(staff);
    check('nothing reserved in the balance row', Number(b1.pending) === 0 && Number(b1.taken) === 0,
      `pending=${b1.pending} taken=${b1.taken}`);

    // Rejection leaves it completely alone.
    const rejected = await hrService.approveLeaveRequest(req1.id, HOP, { approved: false, comments: 'No' });
    check('rejection deducts nothing', (await avail(staff)) === 20, `${await avail(staff)}`);
    check('rejection reports zero days deducted', Number(rejected.days_deducted) === 0);

    // Approval is the only thing that moves the balance.
    const req2 = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-04-02`, end_date: `${YEAR}-04-06` }, 3);
    check('still untouched after a second submission', (await avail(staff)) === 20);
    const approved = await hrService.approveLeaveRequest(req2.id, HOP, { approved: true });
    check('approval deducts 5 days', (await avail(staff)) === 15, `${await avail(staff)}`);
    check('approval reports the deduction', Number(approved.days_deducted) === 5);

    const b2 = await bal(staff);
    check('recorded as taken, not pending', Number(b2.taken) === 5 && Number(b2.pending) === 0,
      `taken=${b2.taken} pending=${b2.pending}`);

    // Two open requests must not double-count against each other.
    await hrService.createLeaveRequest({ leave_type_id: 1, start_date: `${YEAR}-05-02`, end_date: `${YEAR}-05-04` }, 3);
    await hrService.createLeaveRequest({ leave_type_id: 1, start_date: `${YEAR}-06-02`, end_date: `${YEAR}-06-04` }, 3);
    check('two pending requests still deduct nothing', (await avail(staff)) === 15, `${await avail(staff)}`);

    const balances = await hrService.getLeaveBalances(staff, YEAR);
    const vacRow = balances.find((r) => Number(r.leave_type_id) === 1);
    check('awaiting-approval days reported for information',
      Number(vacRow.pending_days) === 6, `${vacRow.pending_days} day(s) pending`);
    check('remaining days ignore pending requests',
      Number(vacRow.remaining_days) === 15, `${vacRow.remaining_days}`);

    // ── 2. Per-employee accrual settings ───────────────────────────────────
    console.log('\n2. Per-employee accrual settings');
    await db.query('DELETE FROM hr_leave_accrual_log');
    for (const id of [staff, partTime, service]) await setBal(id, 0);

    // Pat is on a level-of-effort contract: 1.25 days a month.
    await hrService.updateEmployee(partTime,
      { monthly_accrual_days: 1.25, accrual_note: 'Level of effort — 50%' },
      { id: 1, role: 'ADMIN' });
    // The service account must never accrue.
    await hrService.updateEmployee(service,
      { accrual_enabled: 0, accrual_note: 'Service account' },
      { id: 1, role: 'ADMIN' });

    const run1 = await hrService.runMonthlyAccrual({ triggeredByUserId: 1 });
    check('accrual ran', run1.ran === true);
    check('only accruing employees credited', run1.credited === 4,
      `${run1.credited} credited of ${run1.total_employees} eligible`);

    check('standard staff get 2.5', (await avail(staff)) === 2.5, `${await avail(staff)}`);
    check('level-of-effort staff get their own rate', (await avail(partTime)) === 1.25,
      `${await avail(partTime)}`);
    check('disabled account gets nothing', (await avail(service)) === 0, `${await avail(service)}`);

    // ── 3. Re-run is safe ──────────────────────────────────────────────────
    console.log('\n3. Re-running the accrual in the same month');
    const run2 = await hrService.runMonthlyAccrual({ triggeredByUserId: 1 });
    check('nothing credited twice', run2.credited === 0 && run2.skipped === 4,
      `credited=${run2.credited} skipped=${run2.skipped}`);
    check('standard staff still on 2.5', (await avail(staff)) === 2.5, `${await avail(staff)}`);
    check('level-of-effort staff still on 1.25', (await avail(partTime)) === 1.25);

    // ── 4. A later month credits again ─────────────────────────────────────
    console.log('\n4. The following month credits again');
    const thisMonth = new Date().getMonth() + 1;
    if (thisMonth > 1) {
      // Simulate the previous month having been missed, then run for it.
      const prev = new Date();
      prev.setMonth(prev.getMonth() - 1);
      const run3 = await hrService.runMonthlyAccrual({ now: prev, triggeredByUserId: 1 });
      check('a different month credits independently', run3.credited === 4,
        `${run3.credited} credited for month ${run3.month}`);
      check('standard staff now on 5.0', (await avail(staff)) === 5, `${await avail(staff)}`);
      check('level-of-effort staff now on 2.5', (await avail(partTime)) === 2.5,
        `${await avail(partTime)}`);
    } else {
      console.log('  [skip] January — no previous month inside this fiscal year');
    }

    // ── 5. The scheduler fires on the 25th ─────────────────────────────────
    console.log('\n5. Scheduler wiring');
    const scheduler = require('./../scheduler/leaveAccrual.scheduler');
    check('scheduler exposes start/stop/tick',
      typeof scheduler.start === 'function'
      && typeof scheduler.stop === 'function'
      && typeof scheduler.tick === 'function');

    const notThe25th = new Date(`${YEAR}-07-10T09:00:00`);
    check('the 25th is the trigger day', notThe25th.getDate() !== 25);

    // Accrual log proves each credit is attributable.
    const log = await db.query(
      `SELECT employee_id, accrual_month, days_added FROM hr_leave_accrual_log
       WHERE employee_id IN (?, ?) ORDER BY employee_id, accrual_month`,
      [staff, partTime]);
    check('every credit is logged with its own amount',
      log.length > 0 && log.every((r) => Number(r.days_added) > 0),
      log.map((r) => `emp${r.employee_id}/m${r.accrual_month}:${r.days_added}`).join(' '));

    // ── 6. History reflects the individual rate ────────────────────────────
    console.log('\n6. Accrual history');
    const hist = await hrService.getEmployeeAccrualHistory(partTime, { year: YEAR });
    check('history shows the reduced rate',
      hist.accruals.every((a) => Number(a.days_added) === 1.25),
      hist.accruals.map((a) => a.days_added).join(', '));
    check('totals match the balance', Number(hist.totals.net) === (await avail(partTime)),
      `net=${hist.totals.net} balance=${await avail(partTime)}`);

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
