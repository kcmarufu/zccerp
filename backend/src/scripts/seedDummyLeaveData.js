/**
 * Seed dummy leave data for testing.
 *
 * 1. Mirrors every active user into hr_employees (via the same sync the
 *    Employee Directory uses).
 * 2. Gives each employee a varied Annual Leave balance so the analytics views
 *    have something meaningful to show — including a few deliberately high
 *    balances (the "too many days" watch list) and a few near zero.
 * 3. Back-fills accrual-log rows for the months already elapsed this year, so
 *    the accrual-per-department report is populated.
 *
 * Idempotent: re-running refreshes balances rather than stacking them up.
 *
 * THIS IS TEST DATA. Replace with real balances before go-live.
 *
 *   node src/scripts/seedDummyLeaveData.js
 *   node src/scripts/seedDummyLeaveData.js --clear   # remove the dummy data
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const CLEAR = process.argv.includes('--clear');

// ── Guard ───────────────────────────────────────────────────────────────────
// This writes fabricated balances over everybody's leave record. Running it on
// a live database would destroy real entitlements, so it refuses to start
// unless the operator has deliberately opted in.
if (!CLEAR && !process.argv.includes('--i-understand-this-is-test-data')) {
  console.error(`
REFUSING TO RUN — this script overwrites every employee's leave balance with
made-up figures. It is for a development database only.

  Development:  node src/scripts/seedDummyLeaveData.js --i-understand-this-is-test-data
  Undo:         node src/scripts/seedDummyLeaveData.js --clear

NEVER run this against production.
`);
  process.exit(1);
}
const YEAR = new Date().getFullYear();

/** Deterministic pseudo-random from an id, so re-runs give the same numbers. */
const seeded = (id, min, max) => {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x);
  return Math.round((min + frac * (max - min)) * 2) / 2; // nearest 0.5
};

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [[al]] = await c.query(
      `SELECT id, leave_name FROM hr_leave_types WHERE is_accrual_target = 1 AND is_active = 1 LIMIT 1`
    );
    if (!al) throw new Error('No accrual-target leave type configured');

    if (CLEAR) {
      const [r1] = await c.query(
        `DELETE FROM hr_leave_accrual_log WHERE fiscal_year = ? AND triggered_by IS NULL`, [YEAR]
      );
      const [r2] = await c.query(
        `UPDATE hr_leave_balances SET entitlement = 0, carried_forward = 0
         WHERE fiscal_year = ? AND leave_type_id = ?`, [YEAR, al.id]
      );
      console.log(`Cleared ${r1.affectedRows} accrual rows; reset ${r2.affectedRows} balances.`);
      return;
    }

    // ── 1. Mirror users into hr_employees ────────────────────────────────────
    const [sync] = await c.query(
      `INSERT INTO hr_employees
         (user_id, employee_number, first_name, last_name, department_id,
          employment_type, employment_status, is_active)
       SELECT u.id,
              CONCAT('ZCC-', LPAD(u.id, 4, '0')),
              COALESCE(NULLIF(TRIM(u.first_name), ''), 'Unknown'),
              COALESCE(NULLIF(TRIM(u.last_name),  ''), 'Unknown'),
              u.department_id, 'FULL_TIME', 'ACTIVE', 1
       FROM users u
       LEFT JOIN hr_employees e ON e.user_id = u.id
       WHERE u.is_active = TRUE AND e.id IS NULL`
    );
    console.log(`Employee records created: ${sync.affectedRows}`);

    const [employees] = await c.query(
      `SELECT e.id, e.employee_number, CONCAT(e.first_name,' ',e.last_name) AS name,
              d.department_name
       FROM hr_employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.employment_status = 'ACTIVE'
       ORDER BY e.id`
    );
    console.log(`Active employees: ${employees.length}`);

    // ── 2. Varied balances ───────────────────────────────────────────────────
    // Most people sit in a normal band; every 7th employee is given a high
    // balance so the watch list has entries; every 11th is left near zero.
    let high = 0, low = 0;

    for (const [i, emp] of employees.entries()) {
      let entitlement, taken;

      if (i % 7 === 0) {                    // hoarder — trips the watch list
        entitlement = seeded(emp.id, 38, 55);
        taken       = seeded(emp.id + 1, 0, 4);
        high += 1;
      } else if (i % 11 === 0) {            // heavy user — nearly exhausted
        entitlement = seeded(emp.id, 18, 26);
        taken       = seeded(emp.id + 2, 16, 24);
        low += 1;
      } else {                              // typical
        entitlement = seeded(emp.id, 20, 34);
        taken       = seeded(emp.id + 3, 3, 14);
      }

      if (taken > entitlement) taken = entitlement;

      await c.query(
        `INSERT INTO hr_leave_balances
           (employee_id, leave_type_id, fiscal_year,
            entitlement, carried_forward, taken, pending)
         VALUES (?, ?, ?, ?, 0, ?, 0)
         ON DUPLICATE KEY UPDATE
           entitlement = VALUES(entitlement),
           carried_forward = VALUES(carried_forward),
           taken = VALUES(taken)`,
        [emp.id, al.id, YEAR, entitlement, taken]
      );
    }
    console.log(`Balances seeded — ${high} high-balance, ${low} near-exhausted, rest typical.`);

    // ── 3. Back-fill the accrual log for elapsed months ──────────────────────
    // Gives the accruals-per-department report real rows to aggregate.
    const monthsElapsed = new Date().getMonth() + 1; // 1..12
    let logged = 0;
    for (let m = 1; m <= monthsElapsed; m += 1) {
      const [r] = await c.query(
        `INSERT IGNORE INTO hr_leave_accrual_log
           (employee_id, leave_type_id, fiscal_year, accrual_month, days_added, triggered_by)
         SELECT e.id, ?, ?, ?, 2.5, NULL
         FROM hr_employees e
         WHERE e.employment_status = 'ACTIVE'`,
        [al.id, YEAR, m]
      );
      logged += r.affectedRows;
    }
    console.log(`Accrual log rows created: ${logged} (months 1..${monthsElapsed} of ${YEAR})`);

    // ── Summary ──────────────────────────────────────────────────────────────
    const [[sum]] = await c.query(
      `SELECT COUNT(*) AS employees,
              ROUND(SUM(entitlement + carried_forward - taken - pending), 1) AS total_remaining,
              ROUND(AVG(entitlement + carried_forward - taken - pending), 1) AS avg_remaining,
              ROUND(MAX(entitlement + carried_forward - taken - pending), 1) AS max_remaining
       FROM hr_leave_balances WHERE fiscal_year = ? AND leave_type_id = ?`,
      [YEAR, al.id]
    );
    console.log('\nSeeded summary:', sum);
    console.log('\nDummy data only — run with --clear to remove, or import real balances.');
  } finally {
    await c.end();
  }
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
