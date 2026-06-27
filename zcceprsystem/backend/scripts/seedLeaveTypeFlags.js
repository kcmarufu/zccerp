require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'finance_erp',
  });

  // Set Annual Leave (AL) as the monthly accrual target — 2.5 days/month
  const [a] = await c.query(
    "UPDATE hr_leave_types SET is_accrual_target=1, monthly_accrual_days=2.5 WHERE leave_code='AL'"
  );
  console.log(`Set AL (Annual Leave) as accrual target 2.5 days/month — ${a.affectedRows} row(s)`);

  // Unpaid Leave (UL) should not deduct from any leave balance
  const [u] = await c.query(
    "UPDATE hr_leave_types SET is_deductible=0 WHERE leave_code='UL'"
  );
  console.log(`Set UL (Unpaid Leave) as non-deductible — ${u.affectedRows} row(s)`);

  const [rows] = await c.query(
    'SELECT leave_code, leave_name, is_deductible, is_accrual_target, monthly_accrual_days FROM hr_leave_types ORDER BY id'
  );
  console.log('\nFinal leave types:');
  rows.forEach(r => console.log(
    `  ${r.leave_code} | ${r.leave_name.padEnd(22)} | deductible=${r.is_deductible} | accrual_target=${r.is_accrual_target} | days/month=${r.monthly_accrual_days}`
  ));

  await c.end();
  console.log('\nDone.');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
