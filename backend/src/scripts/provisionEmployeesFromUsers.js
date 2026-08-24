/**
 * Provision hr_employees records from active users.
 *
 * The Leave module keys everything off hr_employees (balances, requests,
 * accrual), linked back to users via hr_employees.user_id. Any active user
 * without an employee record cannot apply for leave and is skipped by the
 * monthly accrual job — so this script closes that gap.
 *
 * Idempotent: users that already have an employee record are left untouched,
 * so it is safe to re-run after onboarding new staff.
 *
 * Usage:
 *   node src/scripts/provisionEmployeesFromUsers.js           # apply
 *   node src/scripts/provisionEmployeesFromUsers.js --dry-run # preview only
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Build a stable employee number: ZCC-<paddedUserId>.
 * Deriving it from the user id keeps re-runs deterministic and collision-free.
 */
const employeeNumberFor = (userId) => `ZCC-${String(userId).padStart(4, '0')}`;

(async () => {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    // Active users with no employee record yet.
    const [pending] = await conn.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.department_id,
              r.role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN hr_employees e ON e.user_id = u.id
       WHERE u.is_active = TRUE AND e.id IS NULL
       ORDER BY u.id`
    );

    if (pending.length === 0) {
      console.log('Every active user already has an employee record — nothing to do.');
      return;
    }

    console.log(`${pending.length} active user(s) need an employee record.`);
    if (DRY_RUN) {
      console.table(pending.map((u) => ({
        user_id: u.id,
        employee_number: employeeNumberFor(u.id),
        name: `${u.first_name} ${u.last_name}`,
        role: u.role_name,
        department_id: u.department_id,
      })));
      console.log('\n--dry-run: no changes written.');
      return;
    }

    // The accrual-target leave type, so each new employee starts with a
    // balance row for the current year (entitlement accrues from zero).
    const [types] = await conn.query(
      `SELECT id FROM hr_leave_types WHERE is_active = 1 AND is_accrual_target = 1 LIMIT 1`
    );
    const accrualTypeId = types.length ? types[0].id : null;
    const fiscalYear = new Date().getFullYear();

    let created = 0;
    let balanced = 0;

    for (const u of pending) {
      await conn.beginTransaction();
      try {
        const [res] = await conn.execute(
          `INSERT INTO hr_employees
             (user_id, employee_number, first_name, last_name,
              department_id, employment_type, employment_status, is_active)
           VALUES (?, ?, ?, ?, ?, 'FULL_TIME', 'ACTIVE', 1)`,
          [
            u.id,
            employeeNumberFor(u.id),
            u.first_name || 'Unknown',
            u.last_name  || 'Unknown',
            u.department_id || null,
          ]
        );
        created += 1;

        if (accrualTypeId) {
          // Zeroed balance row; the 25th-of-month job tops up entitlement.
          await conn.execute(
            `INSERT INTO hr_leave_balances
               (employee_id, leave_type_id, fiscal_year,
                entitlement, carried_forward, taken, pending)
             VALUES (?, ?, ?, 0, 0, 0, 0)
             ON DUPLICATE KEY UPDATE employee_id = employee_id`,
            [res.insertId, accrualTypeId, fiscalYear]
          );
          balanced += 1;
        }

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        console.error(`  ! user ${u.id} (${u.email}): ${err.code || err.message}`);
      }
    }

    console.log(`\nCreated ${created} employee record(s); ${balanced} opening balance row(s) for ${fiscalYear}.`);
    console.log('Run the monthly accrual (or wait for the 25th) to credit leave days.');
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error('Provisioning failed:', err);
  process.exit(1);
});
