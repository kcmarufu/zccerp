/**
 * v4 rule tests — supporting documents, manual adjustments, negative balances
 * and the user→employee directory sync.
 *
 * Runs entirely in a throwaway database; the live one is never written to.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const LIVE = process.env.DB_NAME;
const TEST = 'finance_erp_v4test';

const TABLES = [
  'roles', 'departments', 'users',
  'hr_leave_types', 'hr_employees', 'hr_leave_balances',
  'hr_leave_requests', 'hr_leave_audit', 'hr_leave_accrual_log',
  'hr_leave_attachments', 'hr_leave_adjustments',
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
      VALUES (10,'Health Services','HSD',1,NOW()), (20,'Admin & HR','AHR',1,NOW())`);
  await root.query(`INSERT INTO \`${TEST}\`.users (id, employee_id, email, password_hash, first_name, last_name, role_id, department_id, is_active) VALUES
      (1,'E-ADM','admin@test','x','Super','Admin',1,20,1),
      (2,'E-HOP','hop@test','x','Helen','Ops',2,10,1),
      (3,'E-STF','staff@test','x','Sam','Staff',3,10,1)`);
  await root.query(`INSERT INTO \`${TEST}\`.hr_leave_types
      (id, leave_code, leave_name, is_active, is_deductible, is_accrual_target, monthly_accrual_days, requires_document) VALUES
      (1,'AL','Annual Leave',1,1,1,2.5,0),
      (2,'SL','Sick Leave',1,0,0,0,0),
      (3,'SU','Study Leave',1,0,0,0,1)`);
  await root.end();

  process.env.DB_NAME = TEST;
  const hrService = require('./../services/hr.service');
  const db = require('./../config/database');

  const HOP  = { id: 2, role: 'HEAD_OF_PROGRAMS', department_id: 10 };
  const YEAR = new Date().getFullYear();

  const avail = async (empId, typeId = 1) => {
    const r = await db.query(
      `SELECT entitlement + carried_forward - taken - pending AS a
       FROM hr_leave_balances WHERE employee_id=? AND leave_type_id=? AND fiscal_year=?`,
      [empId, typeId, YEAR]
    );
    return r.length ? Number(r[0].a) : null;
  };

  try {
    // ── 1. Directory sync ────────────────────────────────────────────────────
    console.log('\n1. Employee directory sync');
    const created = await hrService.syncEmployeesFromUsers();
    check('all three users mirrored', created === 3, `${created} created`);
    const again = await hrService.syncEmployeesFromUsers();
    check('re-run creates nothing (idempotent)', again === 0, `${again} created`);

    const emps = await db.query('SELECT id, user_id, employee_number FROM hr_employees ORDER BY user_id');
    const staff = emps.find((e) => e.user_id === 3);
    check('employee number derived from user id', staff.employee_number === 'ZCC-0003', staff.employee_number);

    // A newly added user must appear on the next sync.
    await db.query(
      `INSERT INTO users (id, employee_id, email, password_hash, first_name, last_name, role_id, department_id, is_active, updated_at)
       VALUES (4,'E-NEW','new@test','x','Nina','Newstarter',3,10,1,NOW())`
    );
    const afterNew = await hrService.syncEmployeesFromUsers();
    check('a newly created user appears in the directory', afterNew === 1, `${afterNew} created`);

    // ── 2. Supporting documents ──────────────────────────────────────────────
    console.log('\n2. Supporting documents');
    let blocked = false, msg = '';
    try {
      await hrService.createLeaveRequest(
        { leave_type_id: 3, start_date: `${YEAR}-05-01`, end_date: `${YEAR}-05-10` }, 3
      );
    } catch (e) { blocked = true; msg = e.message; }
    check('Study Leave without a document is refused', blocked, msg);

    const withDoc = await hrService.createLeaveRequest({
      leave_type_id: 3,
      start_date: `${YEAR}-05-01`, end_date: `${YEAR}-05-10`,
      attachments: [{
        file_name: 'acceptance-letter.pdf',
        file_path: '/tmp/acceptance-letter.pdf',
        file_size: 2048,
        mime_type: 'application/pdf',
      }],
    }, 3);
    check('Study Leave with a document is accepted', !!withDoc.id, `request ${withDoc.id}`);

    const atts = await hrService.getLeaveAttachments(withDoc.id);
    check('attachment stored against the request', atts.length === 1, atts[0]?.file_name);

    const nonMandatory = await hrService.createLeaveRequest(
      { leave_type_id: 2, start_date: `${YEAR}-05-20`, end_date: `${YEAR}-05-21` }, 3
    );
    check('other types need no document', !!nonMandatory.id);

    // ── 3. Negative balances ─────────────────────────────────────────────────
    console.log('\n3. Requesting more days than are available');
    const staffEmp = staff.id;
    await db.query(
      `INSERT INTO hr_leave_balances (employee_id, leave_type_id, fiscal_year, entitlement, carried_forward, taken, pending)
       VALUES (?, 1, ?, 3, 0, 0, 0)
       ON DUPLICATE KEY UPDATE entitlement = 3, taken = 0, pending = 0`,
      [staffEmp, YEAR]
    );
    check('starting balance is 3 days', (await avail(staffEmp)) === 3);

    const over = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-06-01`, end_date: `${YEAR}-06-10`, reason: 'Needed' }, 3
    );
    check('10-day request accepted despite only 3 days', Number(over.days_requested) === 10);
    check('projected balance is negative', Number(over.balance_after) === -7, `${over.balance_after}`);

    const dec = await hrService.approveLeaveRequest(over.id, HOP, { approved: true });
    check('approval succeeds', dec.status === 'APPROVED');
    check('balance goes negative after approval', (await avail(staffEmp)) === -7, `${await avail(staffEmp)}`);

    // ── 4. Manual adjustments ────────────────────────────────────────────────
    console.log('\n4. Manual balance adjustments');
    let refused = false;
    try {
      await hrService.adjustLeaveBalance({
        employeeId: staffEmp, leaveTypeId: 1, fiscalYear: YEAR,
        adjustmentDays: 5, reason: '', actor: HOP,
      });
    } catch (e) { refused = true; }
    check('adjustment without a reason is refused', refused);

    refused = false;
    try {
      await hrService.adjustLeaveBalance({
        employeeId: staffEmp, leaveTypeId: 1, fiscalYear: YEAR,
        adjustmentDays: 0, reason: 'nothing', actor: HOP,
      });
    } catch (e) { refused = true; }
    check('zero-day adjustment is refused', refused);

    const topUp = await hrService.adjustLeaveBalance({
      employeeId: staffEmp, leaveTypeId: 1, fiscalYear: YEAR,
      adjustmentDays: 12, reason: 'Opening balance correction', actor: HOP,
    });
    check('top-up applied', Number(topUp.adjustment_days) === 12);
    check('balance moved -7 → 5', Number(topUp.balance_after) === 5,
      `${topUp.balance_before} → ${topUp.balance_after}`);

    const deduct = await hrService.adjustLeaveBalance({
      employeeId: staffEmp, leaveTypeId: 1, fiscalYear: YEAR,
      adjustmentDays: -2, reason: 'Leave taken before go-live', actor: HOP,
    });
    check('deduction applied', Number(deduct.balance_after) === 3, `${deduct.balance_after}`);

    const log = await hrService.getLeaveAdjustments({ year: YEAR });
    check('both adjustments logged with reasons', log.length === 2,
      log.map((l) => `${l.adjustment_days}d "${l.reason}"`).join('; '));
    check('actor recorded', Number(log[0].adjusted_by) === 2);

    // ── 5. Register & accrual report ─────────────────────────────────────────
    console.log('\n5. Register and accrual reporting');
    const reg = await hrService.getLeaveRegister({ year: YEAR });
    check('register covers every active employee', reg.length === 4, `${reg.length} rows`);
    const samRow = reg.find((r) => r.employee_id === staffEmp);
    check('register shows the net manual adjustment', Number(samRow.manual_adjustments) === 10,
      `${samRow.manual_adjustments}`);
    check('register shows remaining days', Number(samRow.remaining_days) === 3,
      `${samRow.remaining_days}`);

    await hrService.runMonthlyAccrual({ triggeredByUserId: 1 });
    const rep = await hrService.getAccrualReport({ year: YEAR });
    check('accrual report totals present', Number(rep.totals.days_accrued) > 0,
      `${rep.totals.days_accrued} days`);
    check('accruals broken down by department', rep.byDepartment.length >= 1,
      rep.byDepartment.map((d) => d.department_name).join(', '));
    check('adjustment totals per department', rep.adjustments.length >= 1,
      `+${rep.adjustments[0]?.days_added} / -${rep.adjustments[0]?.days_removed}`);

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
