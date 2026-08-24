/**
 * Rehearse the production migration.
 *
 * Builds a throwaway copy of the live database, rewinds it to the state the
 * server is in today (before any of the HR/Leave work), seeds representative
 * pre-existing data, then runs migration_hr_leave_PRODUCTION.sql TWICE and
 * checks that:
 *
 *   - it completes without error on a pre-migration schema
 *   - running it a second time changes nothing (idempotent)
 *   - no existing row is lost or altered unexpectedly
 *   - old leave requests still resolve, and would deduct correctly
 *
 * The live database is only ever READ from.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const LIVE = process.env.DB_NAME;
const TEST = 'finance_erp_migrationtest';
const SQL_FILE = path.join(__dirname, '../../../database/migration_hr_leave_PRODUCTION.sql');

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  [PASS] ${label}${detail ? ' — ' + detail : ''}`); }
  else      { fail += 1; console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`); }
};

/** Run a .sql file statement by statement, the same way the server script does. */
async function runSqlFile(conn, file) {
  const raw = fs.readFileSync(file, 'utf8');
  const cleaned = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const statements = cleaned.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);

  let executed = 0;
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
      executed += 1;
    } catch (err) {
      throw new Error(`Statement ${executed + 1} failed: ${err.sqlMessage || err.message}\n${stmt.slice(0, 200)}`);
    }
  }
  return executed;
}

(async () => {
  const root = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  await root.query("SET SESSION sql_mode = ''");

  console.log(`\nCloning ${LIVE} → ${TEST} (live database is only read)…`);
  await root.query(`DROP DATABASE IF EXISTS \`${TEST}\``);
  await root.query(`CREATE DATABASE \`${TEST}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  // Copy structure + data for the tables the migration touches, plus their deps.
  const TABLES = [
    'roles', 'departments', 'users',
    'hr_leave_types', 'hr_employees', 'hr_leave_balances', 'hr_leave_requests',
    'hr_contracts', 'hr_documents',
  ];
  await root.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of TABLES) {
    await root.query(`CREATE TABLE \`${TEST}\`.\`${t}\` LIKE \`${LIVE}\`.\`${t}\``);

    // Generated columns (hr_leave_balances.balance) cannot be inserted into,
    // so copy the real columns explicitly rather than SELECT *.
    const [cols] = await root.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         AND (EXTRA IS NULL OR EXTRA NOT LIKE '%GENERATED%')
       ORDER BY ORDINAL_POSITION`, [LIVE, t]);
    const list = cols.map((c) => `\`${c.COLUMN_NAME}\``).join(', ');
    await root.query(
      `INSERT INTO \`${TEST}\`.\`${t}\` (${list}) SELECT ${list} FROM \`${LIVE}\`.\`${t}\``);
  }
  await root.query('SET FOREIGN_KEY_CHECKS = 1');
  await root.end();

  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: TEST, multipleStatements: true,
  });
  await db.query("SET SESSION sql_mode = ''");

  try {
    // ── Rewind to the pre-migration state the live server is in ────────────
    console.log('\nRewinding to the pre-migration schema…');
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['hr_leave_audit', 'hr_leave_accrual_log', 'hr_leave_attachments',
                     'hr_leave_adjustments', 'hr_employee_audit']) {
      await db.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await db.query('SET FOREIGN_KEY_CHECKS = 1');

    const dropCol = async (table, col) => {
      const [r] = await db.query(
        `SELECT COUNT(*) c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [TEST, table, col]);
      if (r[0].c > 0) await db.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``);
    };
    for (const c of ['is_deductible', 'is_accrual_target', 'monthly_accrual_days',
                     'requires_document', 'free_days_limit', 'free_days_window_months']) {
      await dropCol('hr_leave_types', c);
    }
    for (const c of ['balance_before', 'balance_after', 'deductible_days', 'free_days_used']) {
      await dropCol('hr_leave_requests', c);
    }
    for (const c of ['highest_qualification', 'field_of_study', 'institution', 'year_qualified',
                     'professional_body', 'updated_by', 'accrual_enabled',
                     'monthly_accrual_days', 'accrual_note']) {
      await dropCol('hr_employees', c);
    }
    // Original narrow decimals and original leave codes.
    await db.query(`ALTER TABLE hr_leave_balances
      MODIFY COLUMN entitlement DECIMAL(5,1) NOT NULL DEFAULT 0,
      MODIFY COLUMN carried_forward DECIMAL(5,1) NOT NULL DEFAULT 0,
      MODIFY COLUMN taken DECIMAL(5,1) NOT NULL DEFAULT 0,
      MODIFY COLUMN pending DECIMAL(5,1) NOT NULL DEFAULT 0`);
    await db.query(`ALTER TABLE hr_leave_requests MODIFY COLUMN days_requested DECIMAL(5,1) NOT NULL`);
    await db.query(`UPDATE hr_leave_types SET leave_code='AL', leave_name='Annual Leave' WHERE leave_code='VL'`);
    await db.query(`DELETE FROM hr_leave_types WHERE leave_code='EX'`);
    await db.query(`UPDATE hr_leave_types SET is_active=1`);

    // ── Seed data that must survive untouched ──────────────────────────────
    const [[al]] = await db.query(`SELECT id FROM hr_leave_types WHERE leave_code='AL' LIMIT 1`);
    const [[sl]] = await db.query(`SELECT id FROM hr_leave_types WHERE leave_code='SL' LIMIT 1`);
    const [emps] = await db.query(`SELECT id FROM hr_employees ORDER BY id LIMIT 2`);
    if (emps.length === 0) throw new Error('No employees in the clone to test with');
    const emp = emps[0].id;

    await db.query(`DELETE FROM hr_leave_requests`);
    await db.query(
      `INSERT INTO hr_leave_requests (employee_id, leave_type_id, start_date, end_date, days_requested, reason, status)
       VALUES (?,?,'2026-02-01','2026-02-05',5,'historic approved','APPROVED'),
              (?,?,'2026-09-01','2026-09-03',3,'historic pending','PENDING'),
              (?,?,'2026-03-01','2026-03-02',2,'historic sick','APPROVED')`,
      [emp, al.id, emp, al.id, emp, sl.id]);
    await db.query(
      `UPDATE hr_leave_balances SET entitlement=20, taken=5, pending=3
       WHERE employee_id=? AND leave_type_id=?`, [emp, al.id]);

    const before = {
      users:     (await db.query('SELECT COUNT(*) c FROM users'))[0][0].c,
      employees: (await db.query('SELECT COUNT(*) c FROM hr_employees'))[0][0].c,
      requests:  (await db.query('SELECT COUNT(*) c FROM hr_leave_requests'))[0][0].c,
      balances:  (await db.query('SELECT COUNT(*) c FROM hr_leave_balances'))[0][0].c,
      types:     (await db.query('SELECT COUNT(*) c FROM hr_leave_types'))[0][0].c,
      taken:     (await db.query('SELECT taken FROM hr_leave_balances WHERE employee_id=? AND leave_type_id=?', [emp, al.id]))[0][0].taken,
    };
    console.log('Pre-migration snapshot:', before);

    // ── FIRST RUN ──────────────────────────────────────────────────────────
    console.log('\n=== FIRST RUN ===');
    const n1 = await runSqlFile(db, SQL_FILE);
    check('migration completes on a pre-migration schema', n1 > 0, `${n1} statements`);

    const [types] = await db.query(
      `SELECT leave_code, leave_name, is_deductible, is_accrual_target,
              monthly_accrual_days, requires_document, free_days_limit, is_active
       FROM hr_leave_types WHERE is_active=1 ORDER BY leave_name`);
    check('six active leave types', types.length === 6,
      types.map((t) => t.leave_code).join(', '));
    check('exactly one accrual target',
      types.filter((t) => t.is_accrual_target === 1).length === 1);

    const vl = types.find((t) => t.leave_code === 'VL');
    check('Vacation accrues 2.5/month', vl && Number(vl.monthly_accrual_days) === 2.5);
    const sick = types.find((t) => t.leave_code === 'SL');
    check('Sick Leave has the 90-day allowance', sick && Number(sick.free_days_limit) === 90);
    const comp = types.find((t) => t.leave_code === 'CL');
    check('Compassionate has the 12-day allowance', comp && Number(comp.free_days_limit) === 12);
    const study = types.find((t) => t.leave_code === 'SU');
    check('Study Leave requires a document', study && study.requires_document === 1);

    // ── Existing data preserved ────────────────────────────────────────────
    const after = {
      users:     (await db.query('SELECT COUNT(*) c FROM users'))[0][0].c,
      employees: (await db.query('SELECT COUNT(*) c FROM hr_employees'))[0][0].c,
      requests:  (await db.query('SELECT COUNT(*) c FROM hr_leave_requests'))[0][0].c,
      balances:  (await db.query('SELECT COUNT(*) c FROM hr_leave_balances'))[0][0].c,
      taken:     (await db.query('SELECT taken FROM hr_leave_balances WHERE employee_id=? AND leave_type_id=?', [emp, al.id]))[0][0].taken,
    };
    check('no users lost',     after.users === before.users,         `${before.users} → ${after.users}`);
    check('no employees lost', after.employees === before.employees, `${before.employees} → ${after.employees}`);
    check('no requests lost',  after.requests === before.requests,   `${before.requests} → ${after.requests}`);
    check('no balance rows lost', after.balances === before.balances, `${before.balances} → ${after.balances}`);
    check('days already taken untouched', Number(after.taken) === Number(before.taken),
      `${before.taken} → ${after.taken}`);
    check('leave types kept (deactivated, not deleted)',
      (await db.query('SELECT COUNT(*) c FROM hr_leave_types'))[0][0].c >= before.types,
      `${before.types} → ${(await db.query('SELECT COUNT(*) c FROM hr_leave_types'))[0][0].c}`);

    // ── Back-fill correctness ──────────────────────────────────────────────
    const [rows] = await db.query(
      `SELECT lr.reason, lr.days_requested, lr.deductible_days, lr.free_days_used, lt.leave_code
       FROM hr_leave_requests lr JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
       ORDER BY lr.id`);
    const approvedVac = rows.find((r) => r.reason === 'historic approved');
    check('historic approved request charged its full length',
      Number(approvedVac.deductible_days) === 5, `${approvedVac.deductible_days}`);
    const pendingVac = rows.find((r) => r.reason === 'historic pending');
    check('old pending request will deduct correctly when approved',
      Number(pendingVac.deductible_days) === 3, `${pendingVac.deductible_days}`);

    const [[bal]] = await db.query(
      'SELECT pending FROM hr_leave_balances WHERE employee_id=? AND leave_type_id=?', [emp, al.id]);
    check('stale reservations released (days now deduct on approval only)',
      Number(bal.pending) === 0, `pending=${bal.pending}`);

    // ── Precision ──────────────────────────────────────────────────────────
    const [[prec]] = await db.query(
      `SELECT NUMERIC_SCALE s FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME='hr_leave_balances' AND COLUMN_NAME='entitlement'`, [TEST]);
    check('day figures now hold 2 decimals', Number(prec.s) === 2, `scale=${prec.s}`);

    // ── SECOND RUN — must be a no-op ───────────────────────────────────────
    console.log('\n=== SECOND RUN (idempotency) ===');
    const n2 = await runSqlFile(db, SQL_FILE);
    check('re-running completes without error', n2 > 0, `${n2} statements`);

    const rerun = {
      users:     (await db.query('SELECT COUNT(*) c FROM users'))[0][0].c,
      requests:  (await db.query('SELECT COUNT(*) c FROM hr_leave_requests'))[0][0].c,
      types:     (await db.query('SELECT COUNT(*) c FROM hr_leave_types'))[0][0].c,
      activeTypes: (await db.query('SELECT COUNT(*) c FROM hr_leave_types WHERE is_active=1'))[0][0].c,
      taken:     (await db.query('SELECT taken FROM hr_leave_balances WHERE employee_id=? AND leave_type_id=?', [emp, al.id]))[0][0].taken,
    };
    check('no duplicate leave types created', rerun.activeTypes === 6, `${rerun.activeTypes} active`);
    check('nothing double-counted', Number(rerun.taken) === Number(before.taken),
      `taken=${rerun.taken}`);
    check('request count unchanged', rerun.requests === before.requests);

    const [rows2] = await db.query(
      `SELECT reason, deductible_days FROM hr_leave_requests ORDER BY id`);
    const again = rows2.find((r) => r.reason === 'historic approved');
    check('back-fill not applied twice', Number(again.deductible_days) === 5,
      `${again.deductible_days}`);

    // ── The application can read the migrated schema ───────────────────────
    console.log('\n=== APPLICATION SMOKE TEST ===');
    process.env.DB_NAME = TEST;
    const hrService = require('./../services/hr.service');
    const list = await hrService.getLeaveRequests({ limit: 10 });
    check('leave list query runs', Array.isArray(list.data), `${list.data.length} row(s)`);
    const reg = await hrService.getLeaveRegister({ year: 2026 });
    check('leave register query runs', Array.isArray(reg), `${reg.length} row(s)`);
    const an = await hrService.getLeaveAnalytics({ year: 2026 });
    check('analytics query runs', !!an.summary);
    const acc = await hrService.getAccrualReport({ year: 2026 });
    check('accrual report query runs', !!acc.totals);
    const hist = await hrService.getEmployeeAccrualHistory(emp, { year: 2026 });
    check('accrual history query runs', Array.isArray(hist.events));
    await require('./../config/database').pool.end();

  } finally {
    await db.end();
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
})().catch((e) => { console.error('\nMIGRATION REHEARSAL FAILED:\n', e.message); process.exit(1); });
