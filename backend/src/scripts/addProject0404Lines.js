require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'finance_erp'
  });
  const [admins] = await c.query('SELECT id FROM users WHERE email = ? LIMIT 1', ['sysadmin@zccinzim.org']);
  if (!admins.length) { console.error('sysadmin not found'); process.exit(1); }
  const adminId = admins[0].id;

  // project_id=100 | donor ELW(H4)=82 | Depts: Admin(AHR)=17 | HSD=14

  const L = (code, name, dept, amt) => ({ code, name, dept, amt });
  const lines = [
    L('H4/0404/H4A2',            'Salaries - E-YES',                                                                                                                                                                    17, 10156.52),
    L('H4/0404/H4A3',            'Admin Costs - E-YES',                                                                                                                                                                 17,  1118.48),
    L('HSD/H4/0404/H4A1/7120',   'Graduate Internship program',                                                                                                                                                        14,  5560.00),
    L('HSD/H4/0404/H4A1/7121',   'Facilitate Child Protection and Case Management Services, including therapeutic support, guidance and counselling, Bible study, and conflict resolution sessions',                   14,  2648.00),
    L('HSD/H4/0404/H4A1/7122',   'Organize School Policy Dialogue Forums to engage students, teachers, and administrators in reviewing and strengthening school-level policies',                                        14,  1588.00),
    L('HSD/H4/0404/H4A1/7122T',  'Total 2',                                                                                                                                                                            14,  4236.00),  // Excel subtotal row – auto-generated code
    L('HSD/H4/0404/H4A1/7123',   'Host 3 Kick Out Drugs Community Sports Tournaments',                                                                                                                                  14,  1483.00),
    L('HSD/H4/0404/H4A1/7123T',  'Host 3 Kick Out Drugs Community Sports Tournaments (Group Total)',                                                                                                                    14,  1483.00),  // Excel subtotal row – auto-generated code
    L('HSD/H4/0404/H4A1/7124',   'Sensitization meetings (Provincial, Districts and Schools)',                                                                                                                          14,   530.00),
    L('HSD/H4/0404/H4A1/7125',   'Staff travel costs',                                                                                                                                                                  14,   635.00),
    L('HSD/H4/0404/H4A1/7126',   'Stakeholder coordination and allowances',                                                                                                                                             14,   280.00),
    L('6015/H4/0404/H5A7',       'Mileage for project implementation and monitoring',                                                                                                                                   14,  2966.00),
    L('6008/H4/0404/H4A3',       'Project Bank charges and Fees',                                                                                                                                                       14,   740.00),
    L('6010/H4/0404/H4A3',       'District Office rentals, utilities, security and communication',                                                                                                                      14,   890.00),
  ];

  const total = lines.reduce((s, l) => s + l.amt, 0);
  console.log(`Total: $${total.toFixed(2)} | Expected: $34,314.00 | Match: ${Math.abs(total - 34314) < 0.01 ? '✓ YES' : '✗ NO'}`);

  let inserted = 0;
  for (const l of lines) {
    await c.query(
      `INSERT INTO budget_lines (budget_code,budget_name,donor_id,project_id,department_id,fiscal_year,allocated_amount,spent_amount,is_active,created_by,created_at,updated_at)
       VALUES (?,?,82,100,?,2026,?,0,1,?,NOW(),NOW())
       ON DUPLICATE KEY UPDATE budget_name=VALUES(budget_name),allocated_amount=VALUES(allocated_amount),department_id=VALUES(department_id),updated_at=NOW()`,
      [l.code, l.name, l.dept, l.amt, adminId]
    );
    console.log(`  ✓ [${l.code}] $${l.amt.toFixed(2)}`);
    inserted++;
  }

  await c.query(`UPDATE donors SET total_allocated=(SELECT COALESCE(SUM(allocated_amount),0) FROM budget_lines WHERE donor_id=82) WHERE id=82`);
  console.log(`\nUpdated ELW total_allocated. Done! ${inserted}/14 lines inserted.`);
  await c.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
