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
  console.log('Using sysadmin ID:', adminId);

  // ── Step 1: Remove the two unassigned projects ──────────────────────────────
  const [del1] = await c.query('DELETE FROM projects WHERE project_code IN (?, ?)', ['0401', '2201']);
  console.log(`Deleted ${del1.affectedRows} projects (0401, 2201)`);

  // IDs (confirmed from DB):
  // Projects: RRF=94 | Parish Dialogues=95 | Walk the Talk=97
  // Donors:   Act Alliance (H15)=77 | Act for Peace (H1)=78
  // Depts:    AHR(Admin)=17 | HSD=14 | CPJS=13

  const lines = [
    // ── RRF Project (1501) ─────────────────────────────────────────────────
    { code: 'H15/1501/H4A2',           name: 'Salaries-Act RRF',                                          project_id: 94, donor_id: 77, dept_id: 17, amount: 5307.00 },
    { code: 'H15/1501/C2A3',           name: 'Admin Costs-Act RRF',                                       project_id: 94, donor_id: 77, dept_id: 17, amount: 2897.00 },
    { code: 'HSD/H15/1501/H2A1/7130',  name: 'Food assistance and Nutrition support',                     project_id: 94, donor_id: 77, dept_id: 14, amount: 8960.00 },
    { code: 'HSD/H15/1501/H2A1/7131',  name: 'Transportation of Food Items',                              project_id: 94, donor_id: 77, dept_id: 14, amount: 1000.00 },
    { code: 'HSD/H15/1501/H2A1/7132',  name: 'Support 74 households (521 individuals)',                   project_id: 94, donor_id: 77, dept_id: 14, amount: 3726.00 },
    { code: 'HSD/H15/1501/H2A1/7133',  name: 'Capacitate 50 Faith leader Local leader',                  project_id: 94, donor_id: 77, dept_id: 14, amount:  350.00 },
    { code: 'HSD/H15/1501/H2A1/7134',  name: 'Training of 30 faith leaders',                              project_id: 94, donor_id: 77, dept_id: 14, amount:  250.00 },
    { code: 'HSD/H15/1501/H2A1/7135',  name: 'Inception Meetings',                                        project_id: 94, donor_id: 77, dept_id: 14, amount:  150.00 },
    { code: 'HSD/H15/1501/H2A1/7136',  name: 'Government stakeholder allowances',                        project_id: 94, donor_id: 77, dept_id: 14, amount:  660.00 },
    { code: 'HSD/H15/1501/H2A1/7137',  name: 'Monitoring vehicle mileage',                                project_id: 94, donor_id: 77, dept_id: 14, amount:  200.00 },
    { code: 'HSD/H15/1501/H2A1/7138',  name: 'Vehicle mileage',                                           project_id: 94, donor_id: 77, dept_id: 14, amount:  600.00 },
    { code: 'HSD/H15/1501/H2A1/7139',  name: 'Transportation of NFIs',                                    project_id: 94, donor_id: 77, dept_id: 14, amount:  900.00 },

    // ── Support for Parish Dialogues (1502) ────────────────────────────────
    { code: 'HSD/H15/1502/H4A1',       name: 'Support for Parish Dialogues',                              project_id: 95, donor_id: 77, dept_id: 13, amount: 2000.00 },

    // ── Zimbabwe 2026 Walk the Talk Project (0107) ─────────────────────────
    { code: 'HSD/H1/0107/H4A1/7291',   name: 'Installation of security fencing at police base',          project_id: 97, donor_id: 78, dept_id: 14, amount: 2400.00 },
    { code: 'HSD/H1/0107/H4A1/7292',   name: 'Provision of power at police base',                        project_id: 97, donor_id: 78, dept_id: 14, amount: 1150.00 },
    { code: 'HSD/H1/0107/H4A1/7293',   name: 'Provision of office furniture',                            project_id: 97, donor_id: 78, dept_id: 14, amount:  480.00 },
    { code: 'HSD/H1/0107/H4A1/7294',   name: 'Installation of flag pole',                                project_id: 97, donor_id: 78, dept_id: 14, amount:   50.00 },
    { code: 'HSD/H1/0107/H4A1/7295',   name: 'Veranda door caps',                                        project_id: 97, donor_id: 78, dept_id: 14, amount:  100.00 },
    { code: 'HSD/H1/0107/H4A1/7296',   name: 'Cooking area establishment',                               project_id: 97, donor_id: 78, dept_id: 14, amount: 1000.00 },
    { code: 'HSD/H1/0107/H4A1/7297',   name: 'Beds provision',                                           project_id: 97, donor_id: 78, dept_id: 14, amount:  990.00 },
    { code: 'HSD/H1/0107/H4A1/7298',   name: 'Blankets provision',                                       project_id: 97, donor_id: 78, dept_id: 14, amount:  360.00 },
    { code: 'HSD/H1/0107/H4A1/7299',   name: 'Lockers and wardrobes',                                    project_id: 97, donor_id: 78, dept_id: 14, amount:  480.00 },
    { code: 'HSD/H1/0107/H4A1/7300',   name: 'Solar installation WMS',                                   project_id: 97, donor_id: 78, dept_id: 14, amount: 1600.00 },
    { code: 'HSD/H1/0107/H4A1/7301',   name: 'Paving',                                                   project_id: 97, donor_id: 78, dept_id: 14, amount:  500.00 },
    { code: 'HSD/H1/0107/H4A1/7302',   name: 'Washing line installation',                                project_id: 97, donor_id: 78, dept_id: 14, amount:  140.00 },
    { code: 'HSD/H1/0107/H4A1/7304',   name: 'Vehicle running costs',                                    project_id: 97, donor_id: 78, dept_id: 14, amount: 1656.00 },
    { code: 'HSD/H1/0107/H4A1/7305',   name: 'Stakeholder allowances',                                   project_id: 97, donor_id: 78, dept_id: 14, amount:  200.00 },
    { code: 'HSD/H1/0107/H4A1/7306',   name: 'Exit meeting',                                             project_id: 97, donor_id: 78, dept_id: 14, amount: 2834.00 },
    { code: 'HSD/H1/0107/H4A1/7307',   name: 'Research and capacity building',                           project_id: 97, donor_id: 78, dept_id: 14, amount: 5911.50 },
  ];

  let inserted = 0;
  for (const l of lines) {
    await c.query(
      `INSERT INTO budget_lines
        (budget_code, budget_name, donor_id, project_id, department_id, fiscal_year,
         allocated_amount, spent_amount, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 2026, ?, 0, 1, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         budget_name=VALUES(budget_name), allocated_amount=VALUES(allocated_amount),
         department_id=VALUES(department_id), updated_at=NOW()`,
      [l.code, l.name, l.donor_id, l.project_id, l.dept_id, l.amount, adminId]
    );
    console.log(`  ✓ [${l.code}] ${l.name} — $${l.amount.toFixed(2)}`);
    inserted++;
  }

  // ── Step 3: Update donor total_allocated for Act Alliance & Act for Peace ──
  // Act Alliance: sum of budget lines = 5307+2897+8960+1000+3726+350+250+150+660+200+600+900+2000 = 26800 (of 27000 committed - close but 200 unallocated intentional)
  // Act for Peace Walk the Talk lines sum
  await c.query(`
    UPDATE donors d SET total_allocated = (
      SELECT COALESCE(SUM(bl.allocated_amount),0) FROM budget_lines bl WHERE bl.donor_id = d.id
    ) WHERE id IN (77, 78)
  `);
  console.log('\nUpdated total_allocated for Act Alliance and Act for Peace.');

  console.log(`\nAll done! ${inserted} budget lines inserted.`);
  await c.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
