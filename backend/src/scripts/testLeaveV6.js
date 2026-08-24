/**
 * v6 rule tests — the real leave types and their free-day allowances.
 *
 *   Vacation      every day charged to the accrued pool
 *   Maternity     never charged
 *   Examination   never charged
 *   Study         every day charged
 *   Compassionate first 12 days free, excess charged
 *   Sick          first 90 days in a rolling 12 months free, excess charged
 *
 * Runs in a throwaway database; the live one is never written to.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const LIVE = process.env.DB_NAME;
const TEST = 'finance_erp_v6test';

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
      (3,'E3','staff@t','x','Cathy','Staff',3,13,1,NOW())`);

  // The canonical six types, exactly as migration v6 configures them.
  await root.query(`INSERT INTO \`${TEST}\`.hr_leave_types
      (id, leave_code, leave_name, is_active, is_deductible, is_accrual_target,
       monthly_accrual_days, requires_document, free_days_limit, free_days_window_months) VALUES
      (1,'VL','Vacation Leave',1,1,1,2.5,0,NULL,NULL),
      (2,'ML','Maternity Leave',1,0,0,0,0,NULL,NULL),
      (3,'CL','Compassionate Leave',1,1,0,0,0,12,12),
      (4,'SU','Study Leave',1,1,0,0,1,NULL,NULL),
      (5,'EX','Examination Day Leave',1,0,0,0,0,NULL,NULL),
      (6,'SL','Sick Leave',1,1,0,0,0,90,12)`);
  await root.end();

  process.env.DB_NAME = TEST;
  const hrService = require('./../services/hr.service');
  const db = require('./../config/database');

  const HOP  = { id: 2, role: 'HEAD_OF_PROGRAMS', department_id: 13, department_code: 'CPJS' };
  const YEAR = new Date().getFullYear();

  const vacBal = async (empId) => {
    const r = await db.query(
      `SELECT entitlement + carried_forward - taken AS a
       FROM hr_leave_balances WHERE employee_id=? AND leave_type_id=1 AND fiscal_year=?`,
      [empId, YEAR]);
    return r.length ? Number(r[0].a) : 0;
  };

  const raiseAndApprove = async (typeId, start, end, userId = 3, extra = {}) => {
    const r = await hrService.createLeaveRequest(
      { leave_type_id: typeId, start_date: start, end_date: end, ...extra }, userId);
    await hrService.approveLeaveRequest(r.id, HOP, { approved: true });
    return r;
  };

  try {
    await hrService.syncEmployeesFromUsers();
    const emps = await db.query('SELECT id, user_id FROM hr_employees ORDER BY user_id');
    const staff = emps.find((e) => e.user_id === 3).id;

    const reset = async (days) => {
      await db.query('DELETE FROM hr_leave_requests WHERE employee_id = ?', [staff]);
      await db.query(
        `INSERT INTO hr_leave_balances (employee_id, leave_type_id, fiscal_year, entitlement, carried_forward, taken, pending)
         VALUES (?,1,?,?,0,0,0)
         ON DUPLICATE KEY UPDATE entitlement=VALUES(entitlement), taken=0, pending=0`,
        [staff, YEAR, days]);
    };

    // ── 1. Vacation — every day charged ────────────────────────────────────
    console.log('\n1. Vacation Leave (fully deductible)');
    await reset(100);
    const vac = await raiseAndApprove(1, `${YEAR}-02-02`, `${YEAR}-02-06`);
    check('5 days charged', Number(vac.deductible_days) === 5, `${vac.deductible_days}`);
    check('balance 100 → 95', (await vacBal(staff)) === 95, `${await vacBal(staff)}`);

    // ── 2. Maternity / Examination — never charged ─────────────────────────
    console.log('\n2. Maternity and Examination Day Leave (never deducted)');
    await reset(100);
    const mat = await raiseAndApprove(2, `${YEAR}-03-01`, `${YEAR}-05-30`);
    check('90-day maternity charges nothing', Number(mat.deductible_days) === 0);
    check('balance untouched', (await vacBal(staff)) === 100, `${await vacBal(staff)}`);

    const exam = await raiseAndApprove(5, `${YEAR}-06-01`, `${YEAR}-06-02`);
    check('examination leave charges nothing', Number(exam.deductible_days) === 0);
    check('balance still untouched', (await vacBal(staff)) === 100);

    // ── 3. Study — fully charged, and needs a document ─────────────────────
    console.log('\n3. Study Leave (deductible, document required)');
    await reset(100);
    let blocked = false;
    try { await hrService.createLeaveRequest({ leave_type_id: 4, start_date: `${YEAR}-07-01`, end_date: `${YEAR}-07-03` }, 3); }
    catch { blocked = true; }
    check('refused without a document', blocked);

    const study = await raiseAndApprove(4, `${YEAR}-07-01`, `${YEAR}-07-03`, 3, {
      attachments: [{ file_name: 'letter.pdf', file_path: '/tmp/letter.pdf', file_size: 10, mime_type: 'application/pdf' }],
    });
    check('3 days charged', Number(study.deductible_days) === 3);
    check('balance 100 → 97', (await vacBal(staff)) === 97, `${await vacBal(staff)}`);

    // ── 4. Compassionate — 12 free, then charged ───────────────────────────
    console.log('\n4. Compassionate Leave (12 free days, then charged)');
    await reset(100);
    const c1 = await raiseAndApprove(3, `${YEAR}-02-01`, `${YEAR}-02-08`);   // 8 days
    check('first 8 days all free', Number(c1.deductible_days) === 0 && Number(c1.free_days_used) === 8,
      `free=${c1.free_days_used} charged=${c1.deductible_days}`);
    check('balance untouched', (await vacBal(staff)) === 100);

    const c2 = await raiseAndApprove(3, `${YEAR}-04-01`, `${YEAR}-04-07`);   // 7 days
    check('next 7 days split 4 free / 3 charged',
      Number(c2.free_days_used) === 4 && Number(c2.deductible_days) === 3,
      `free=${c2.free_days_used} charged=${c2.deductible_days}`);
    check('balance 100 → 97', (await vacBal(staff)) === 97, `${await vacBal(staff)}`);

    const c3 = await raiseAndApprove(3, `${YEAR}-06-01`, `${YEAR}-06-02`);   // 2 days
    check('allowance exhausted — both days charged',
      Number(c3.free_days_used) === 0 && Number(c3.deductible_days) === 2);
    check('balance 97 → 95', (await vacBal(staff)) === 95, `${await vacBal(staff)}`);

    // ── 5. Sick — 90 free in a rolling 12 months ───────────────────────────
    console.log('\n5. Sick Leave (90 free days in a rolling 12 months)');
    await reset(200);
    const s1 = await raiseAndApprove(6, `${YEAR}-01-01`, `${YEAR}-03-31`);   // 90 days
    check('first 90 days all free',
      Number(s1.free_days_used) === 90 && Number(s1.deductible_days) === 0,
      `free=${s1.free_days_used} charged=${s1.deductible_days}`);
    check('balance untouched', (await vacBal(staff)) === 200, `${await vacBal(staff)}`);

    const s2 = await raiseAndApprove(6, `${YEAR}-05-01`, `${YEAR}-05-05`);   // 5 days
    check('beyond the allowance every day is charged',
      Number(s2.free_days_used) === 0 && Number(s2.deductible_days) === 5);
    check('balance 200 → 195', (await vacBal(staff)) === 195, `${await vacBal(staff)}`);

    // ── 6. Editing does not double-count the allowance ─────────────────────
    console.log('\n6. Editing a request re-splits cleanly');
    await reset(100);
    const e1 = await hrService.createLeaveRequest(
      { leave_type_id: 3, start_date: `${YEAR}-02-01`, end_date: `${YEAR}-02-10` }, 3);  // 10 free
    check('10 days free on submit', Number(e1.free_days_used) === 10 && Number(e1.deductible_days) === 0);

    const e2 = await hrService.updateLeaveRequest(e1.id,
      { start_date: `${YEAR}-02-01`, end_date: `${YEAR}-02-20` },                        // now 20 days
      { id: 3, role: 'GENERAL_USER', isHrOffice: false });
    check('re-split gives 12 free / 8 charged, not 2 free',
      Number(e2.free_days_used) === 12 && Number(e2.deductible_days) === 8,
      `free=${e2.free_days_used} charged=${e2.deductible_days}`);
    // Still unapproved, so nothing has come off the balance — but the request
    // now carries the corrected 12 free / 8 chargeable split.
    check('balance untouched while the edit awaits approval',
      (await vacBal(staff)) === 100, `${await vacBal(staff)}`);
    const edited = await hrService.getLeaveRequestById(e1.id);
    check('the stored split is the corrected one',
      Number(edited.deductible_days) === 8 && Number(edited.free_days_used) === 12,
      `free=${edited.free_days_used} charged=${edited.deductible_days}`);

    // ── 7. Accrual history statement ───────────────────────────────────────
    console.log('\n7. Accrual history');
    await reset(0);
    await hrService.runMonthlyAccrual({ triggeredByUserId: 1 });
    await hrService.adjustLeaveBalance({
      employeeId: staff, leaveTypeId: 1, fiscalYear: YEAR,
      adjustmentDays: 6, reason: 'Opening balance', actor: HOP,
    });
    await raiseAndApprove(1, `${YEAR}-09-01`, `${YEAR}-09-02`);

    const hist = await hrService.getEmployeeAccrualHistory(staff, { year: YEAR });
    check('accrual credit recorded', Number(hist.totals.accrued) === 2.5, `${hist.totals.accrued}`);
    check('manual top-up recorded', Number(hist.totals.adjusted) === 6, `${hist.totals.adjusted}`);
    check('days taken recorded', Number(hist.totals.taken) === 2, `${hist.totals.taken}`);
    check('net matches the balance', Number(hist.totals.net) === (await vacBal(staff)),
      `net=${hist.totals.net} balance=${await vacBal(staff)}`);
    check('statement is chronological with a running balance',
      hist.events.length === 3 && hist.events[hist.events.length - 1].balance_after === hist.totals.net,
      hist.events.map((e) => `${e.type}:${e.days}`).join(' '));

    // ── 8. Newest-first ordering ───────────────────────────────────────────
    console.log('\n8. Request ordering');
    const list = await hrService.getLeaveRequests({ employeeId: staff, limit: 50 });
    const dates = list.data.map((r) => new Date(r.created_at).getTime());
    check('list is newest first',
      dates.every((d, i) => i === 0 || dates[i - 1] >= d),
      `${list.data.length} row(s)`);
    check('list exposes the owner for the edit check',
      list.data.length > 0 && Number(list.data[0].employee_user_id) === 3,
      `employee_user_id=${list.data[0]?.employee_user_id}`);

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
