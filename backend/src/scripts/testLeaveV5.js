/**
 * v5 rule tests — edit/resubmit, HR Office approval reach, and the
 * department-scoped approval queue. Runs in a throwaway database.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const LIVE = process.env.DB_NAME;
const TEST = 'finance_erp_v5test';

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
      (1,'ADMIN'), (2,'HEAD_OF_PROGRAMS'), (3,'GENERAL_USER'),
      (4,'PROGRAM_LEAD'), (5,'FINANCE_CLERK')`);
  await root.query(`INSERT INTO \`${TEST}\`.departments (id, department_name, department_code, is_active, updated_at) VALUES
      (13,'Church Peace and Just Societies','CPJS',1,NOW()),
      (15,'Finance and Organization Sustainability','FOS',1,NOW()),
      (17,'Admin and HR','AHR',1,NOW())`);
  await root.query(`INSERT INTO \`${TEST}\`.users
      (id, employee_id, email, password_hash, first_name, last_name, role_id, department_id, is_active, updated_at) VALUES
      (1,'E1','admin@t','x','Super','Admin',1,17,1,NOW()),
      (2,'E2','ahrhop@t','x','Hilda','Office',2,17,1,NOW()),
      (3,'E3','ahrlead@t','x','Leo','Office',4,17,1,NOW()),
      (4,'E4','cpjshop@t','x','Carl','Peace',2,13,1,NOW()),
      (5,'E5','cpjsstaff@t','x','Cathy','Staff',3,13,1,NOW()),
      (6,'E6','fosclerk@t','x','Fiona','Clerk',5,15,1,NOW()),
      (7,'E7','foshop@t','x','Frank','Finance',2,15,1,NOW())`);
  await root.query(`INSERT INTO \`${TEST}\`.hr_leave_types
      (id, leave_code, leave_name, is_active, is_deductible, is_accrual_target, monthly_accrual_days, requires_document) VALUES
      (1,'AL','Annual Leave',1,1,1,2.5,0),
      (2,'SL','Sick Leave',1,0,0,0,0),
      (3,'SU','Study Leave',1,0,0,0,1)`);
  await root.end();

  process.env.DB_NAME = TEST;
  const hrService = require('./../services/hr.service');
  const leaveApproval = require('./../services/leaveApproval.service');
  const roles = require('./../config/roles');
  const db = require('./../config/database');

  const ADMIN    = { id: 1, role: 'ADMIN',            department_id: 17, department_code: 'AHR' };
  const AHR_HOP  = { id: 2, role: 'HEAD_OF_PROGRAMS', department_id: 17, department_code: 'AHR' };
  const AHR_LEAD = { id: 3, role: 'PROGRAM_LEAD',     department_id: 17, department_code: 'AHR' };
  const CPJS_HOP = { id: 4, role: 'HEAD_OF_PROGRAMS', department_id: 13, department_code: 'CPJS' };
  const CLERK    = { id: 6, role: 'FINANCE_CLERK',    department_id: 15, department_code: 'FOS' };
  const FOS_HOP  = { id: 7, role: 'HEAD_OF_PROGRAMS', department_id: 15, department_code: 'FOS' };

  const YEAR = new Date().getFullYear();
  const avail = async (empId) => {
    const r = await db.query(
      `SELECT entitlement + carried_forward - taken AS a
       FROM hr_leave_balances WHERE employee_id=? AND leave_type_id=1 AND fiscal_year=?`,
      [empId, YEAR]);
    return r.length ? Number(r[0].a) : null;
  };

  try {
    // ── 1. Access levels ────────────────────────────────────────────────────
    console.log('\n1. Access levels');
    check('Super Admin      → FULL',       roles.hrAccessLevel(ADMIN) === 'FULL');
    check('Admin & HR HOP   → FULL',       roles.hrAccessLevel(AHR_HOP) === 'FULL');
    check('Admin & HR Lead  → FULL',       roles.hrAccessLevel(AHR_LEAD) === 'FULL');
    check('CPJS HOP         → DEPARTMENT', roles.hrAccessLevel(CPJS_HOP) === 'DEPARTMENT');
    check('FOS HOP          → DEPARTMENT', roles.hrAccessLevel(FOS_HOP) === 'DEPARTMENT');
    check('Finance Clerk    → SELF',       roles.hrAccessLevel(CLERK) === 'SELF');

    await hrService.syncEmployeesFromUsers();
    const emps = await db.query('SELECT id, user_id FROM hr_employees ORDER BY user_id');
    const empOf = (uid) => emps.find((e) => e.user_id === uid).id;

    for (const e of emps) {
      await db.query(
        `INSERT INTO hr_leave_balances (employee_id, leave_type_id, fiscal_year, entitlement, carried_forward, taken, pending)
         VALUES (?,1,?,20,0,0,0) ON DUPLICATE KEY UPDATE entitlement=20, taken=0, pending=0`,
        [e.id, YEAR]);
    }

    // ── 2. Finance Clerk routes to their department head ────────────────────
    console.log('\n2. Finance Clerk leave routing');
    const clerkReq = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-03-02`, end_date: `${YEAR}-03-04` }, 6);
    let blocked = false;
    try { await hrService.approveLeaveRequest(clerkReq.id, CPJS_HOP, { approved: true }); }
    catch { blocked = true; }
    check('a HOP from another department cannot approve', blocked);

    const clerkDec = await hrService.approveLeaveRequest(clerkReq.id, FOS_HOP, { approved: true });
    check('the Finance HOP approves the clerk', clerkDec.status === 'APPROVED');

    // ── 3. HR Office may approve any department ─────────────────────────────
    console.log('\n3. HR Office approval reach');
    const cpjsReq = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-04-01`, end_date: `${YEAR}-04-03`, reason: 'Trip' }, 5);
    const byLead = await hrService.approveLeaveRequest(cpjsReq.id, AHR_LEAD, { approved: true });
    check('Admin & HR Lead approves a CPJS request', byLead.status === 'APPROVED');

    const cpjsReq2 = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-04-10`, end_date: `${YEAR}-04-11` }, 5);
    const byAhrHop = await hrService.approveLeaveRequest(cpjsReq2.id, AHR_HOP, { approved: true });
    check('Admin & HR HOP approves a CPJS request', byAhrHop.status === 'APPROVED');

    // ── 4. Approval queue scoping ───────────────────────────────────────────
    console.log('\n4. Approval queue scoping');
    const pendingCpjs = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-05-05`, end_date: `${YEAR}-05-06` }, 5);

    const deptQueue = await hrService.getLeaveRequests({
      pendingForApprover: AHR_HOP, pendingScope: 'department', limit: 50,
    });
    check('HR Office department queue excludes other departments',
      deptQueue.data.every((r) => Number(r.department_id) === 17),
      `${deptQueue.data.length} row(s)`);

    const allQueue = await hrService.getLeaveRequests({
      pendingForApprover: AHR_HOP, pendingScope: 'all', limit: 50,
    });
    check('HR Office "all" queue reaches other departments',
      allQueue.data.some((r) => Number(r.department_id) === 13),
      `${allQueue.data.length} row(s)`);

    const cpjsQueue = await hrService.getLeaveRequests({
      pendingForApprover: CPJS_HOP, pendingScope: 'all', limit: 50,
    });
    check('a department head cannot widen past their own department',
      cpjsQueue.data.every((r) => Number(r.department_id) === 13),
      `${cpjsQueue.data.length} row(s)`);

    // ── 5. Edit while pending ───────────────────────────────────────────────
    console.log('\n5. Editing a pending request');
    const staffEmp = empOf(5);
    const beforeEdit = await avail(staffEmp);
    const edited = await hrService.updateLeaveRequest(pendingCpjs.id,
      { start_date: `${YEAR}-05-05`, end_date: `${YEAR}-05-09`, reason: 'Extended' },
      { id: 5, role: 'GENERAL_USER', isHrOffice: false });
    check('days recomputed', Number(edited.days_requested) === 5, `${edited.days_requested} days`);
    check('still pending', edited.status === 'PENDING');
    check('editing still deducts nothing before approval',
      Number(await avail(staffEmp)) === beforeEdit,
      `${beforeEdit} → ${await avail(staffEmp)}`);

    let refused = false;
    try {
      await hrService.updateLeaveRequest(pendingCpjs.id, { reason: 'nope' },
        { id: 6, role: 'FINANCE_CLERK', isHrOffice: false });
    } catch { refused = true; }
    check('someone else cannot edit your request', refused);

    // ── 6. Resubmit after rejection ─────────────────────────────────────────
    console.log('\n6. Resubmitting a rejected request');
    const rej = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-06-01`, end_date: `${YEAR}-06-03` }, 5);
    await hrService.approveLeaveRequest(rej.id, CPJS_HOP, { approved: false, comments: 'Peak period' });

    const afterReject = await avail(staffEmp);
    const resub = await hrService.updateLeaveRequest(rej.id,
      { start_date: `${YEAR}-07-01`, end_date: `${YEAR}-07-02`, change_note: 'Moved out of peak' },
      { id: 5, role: 'GENERAL_USER', isHrOffice: false });
    check('flagged as a resubmission', resub.resubmitted === true);
    check('back to PENDING', resub.status === 'PENDING');
    check('resubmitting deducts nothing until approved',
      Number(await avail(staffEmp)) === afterReject,
      `${afterReject} → ${await avail(staffEmp)}`);

    const row = await hrService.getLeaveRequestById(rej.id);
    check('rejection reason cleared', !row.rejection_reason);
    check('approver cleared', !row.approved_by);

    const trail = await hrService.getLeaveAuditTrail(rej.id);
    const actions = trail.map((t) => t.action).join(' → ');
    check('trail keeps the whole history', actions === 'SUBMITTED → REJECTED → RESUBMITTED', actions);

    // A decided request is closed for editing.
    const done = await hrService.createLeaveRequest(
      { leave_type_id: 1, start_date: `${YEAR}-08-01`, end_date: `${YEAR}-08-02` }, 5);
    await hrService.approveLeaveRequest(done.id, CPJS_HOP, { approved: true });
    refused = false;
    try {
      await hrService.updateLeaveRequest(done.id, { reason: 'x' },
        { id: 5, role: 'GENERAL_USER', isHrOffice: false });
    } catch { refused = true; }
    check('an approved request can no longer be edited', refused);

    // ── 7. Employee edit audit ──────────────────────────────────────────────
    console.log('\n7. Employee record audit');
    await hrService.updateEmployee(staffEmp,
      { position_title: 'Programme Officer', highest_qualification: 'MSc' },
      { id: 2, role: 'HEAD_OF_PROGRAMS' });
    const audit = await hrService.getEmployeeAudit(staffEmp);
    check('edit recorded', audit.length === 1);
    check('actor captured', Number(audit[0].actor_user_id) === 2, audit[0].actor_role);
    check('changed fields captured',
      audit[0].changes && audit[0].changes.position_title
      && audit[0].changes.position_title.to === 'Programme Officer',
      Object.keys(audit[0].changes || {}).join(', '));

    const emp = await hrService.getEmployeeById(staffEmp);
    check('record names the last editor', !!emp.updated_by_name, emp.updated_by_name);

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
