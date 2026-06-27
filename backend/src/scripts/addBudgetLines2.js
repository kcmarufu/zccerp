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

  // Project IDs: RRF=94 | Parish Dialogues=95 | Walk the Talk=97
  // Donor IDs:   Act Alliance(H15)=77 | Act for Peace(H1)=78
  // Dept IDs:    Admin(AHR)=17 | HSD=14 | CPJS=13

  const lines = [
    // ── RRF Project (1501, donor 77) ───────────────────────────────────────
    { code:'H15/1501/H4A2',          name:'Salaries-Act RRF',                                                                                           pid:94, did:77, dept:17, amt:5307.00 },
    { code:'H15/1501/C2A3',          name:'Admin Costs-Act RRF',                                                                                        pid:94, did:77, dept:17, amt:2897.00 },
    { code:'HSD/H15/1501/H2A1/7130', name:'Food assistance and Nutrition support',                                                                       pid:94, did:77, dept:14, amt:8960.00 },
    { code:'HSD/H15/1501/H2A1/7131', name:'Transportation of Food Items',                                                                               pid:94, did:77, dept:14, amt:1000.00 },
    { code:'HSD/H15/1501/H2A1/7132', name:'Support 74 households (521 individuals)',                                                                    pid:94, did:77, dept:14, amt:3726.00 },
    { code:'HSD/H15/1501/H2A1/7133', name:'Capacitate 50 Faith leader Local leader',                                                                    pid:94, did:77, dept:14, amt: 350.00 },
    { code:'HSD/H15/1501/H2A1/7134', name:'Training of 30 faith leaders',                                                                               pid:94, did:77, dept:14, amt: 250.00 },
    { code:'HSD/H15/1501/H2A1/7135', name:'Inception Meetings',                                                                                         pid:94, did:77, dept:14, amt: 150.00 },
    { code:'HSD/H15/1501/H2A1/7136', name:'Government stakeholder allowances',                                                                          pid:94, did:77, dept:14, amt: 660.00 },
    { code:'HSD/H15/1501/H2A1/7137', name:'Monitoring vehicle mileage',                                                                                 pid:94, did:77, dept:14, amt: 200.00 },
    { code:'HSD/H15/1501/H2A1/7138', name:'Vehicle mileage at $0.50 per km x 600km',                                                                   pid:94, did:77, dept:14, amt: 600.00 },
    { code:'HSD/H15/1501/H2A1/7139', name:'Transportation of NFIs',                                                                                     pid:94, did:77, dept:14, amt: 900.00 },

    // ── Support for Parish Dialogues (1502, donor 77) ──────────────────────
    { code:'HSD/H15/1502/H4A1',      name:'Support for Parish Dialogues',                                                                               pid:95, did:77, dept:13, amt:2000.00 },

    // ── Zimbabwe 2026 Walk the Talk Project (0107, donor 78) ───────────────
    { code:'HSD/H1/0107/H4A1/7291',  name:'Installation of security fencing at police base - 50m by 100m by 2 with gate',                              pid:97, did:78, dept:14, amt:2400.00 },
    { code:'HSD/H1/0107/H4A1/7292',  name:'Provision of power at police base - 2KVA Solar system with lights and plugs',                               pid:97, did:78, dept:14, amt:1150.00 },
    { code:'HSD/H1/0107/H4A1/7293',  name:'Provision of office furniture for the police base - Chairs, table and one bench',                           pid:97, did:78, dept:14, amt: 480.00 },
    { code:'HSD/H1/0107/H4A1/7294',  name:'Installation of flag round pole and 20m rope',                                                              pid:97, did:78, dept:14, amt:  50.00 },
    { code:'HSD/H1/0107/H4A1/7295',  name:'Verenda Door caps by 1 at police base',                                                                     pid:97, did:78, dept:14, amt: 100.00 },
    { code:'HSD/H1/0107/H4A1/7296',  name:'Establishment of a Cooking area and laundry sink',                                                          pid:97, did:78, dept:14, amt:1000.00 },
    { code:'HSD/H1/0107/H4A1/7297',  name:'Provision of 6 single beds for WMS - 2 per room',                                                           pid:97, did:78, dept:14, amt: 990.00 },
    { code:'HSD/H1/0107/H4A1/7298',  name:'Provision of 12 blankets for WMS at 2 per bed',                                                             pid:97, did:78, dept:14, amt: 360.00 },
    { code:'HSD/H1/0107/H4A1/7299',  name:'Provision of 6 lockers and small wardrobes - 2 per room',                                                   pid:97, did:78, dept:14, amt: 480.00 },
    { code:'HSD/H1/0107/H4A1/7300',  name:'Installation of solar power at the Waiting Mothers Shelter - 3.2KVA with lights and plugs',                 pid:97, did:78, dept:14, amt:1600.00 },
    { code:'HSD/H1/0107/H4A1/7301',  name:'Paving surrounding area for accessibility at WMS',                                                          pid:97, did:78, dept:14, amt: 500.00 },
    { code:'HSD/H1/0107/H4A1/7302',  name:'Installation of washing line and port rake at WMS',                                                         pid:97, did:78, dept:14, amt: 140.00 },
    { code:'HSD/H1/0107/H4A1/7303',  name:'Veranda door caps by 3 at WMS',                                                                             pid:97, did:78, dept:14, amt: 300.00 },
    { code:'HSD/H1/0107/H4A1/7304',  name:'Project vehicle running costs (1642km/month @ $0.74/km) to implement the additional activities',            pid:97, did:78, dept:14, amt:1656.00 },
    { code:'HSD/H1/0107/H4A1/7305',  name:'Stakeholder allowances for project monitoring and other support visits',                                    pid:97, did:78, dept:14, amt: 200.00 },
    { code:'HSD/H1/0107/H4A1/7306',  name:'Exit meeting and official handover costs of police base and waiting mothers shelter to government stakeholders', pid:97, did:78, dept:14, amt:2834.00 },
    { code:'HSD/H1/0107/H4A1/7307',  name:'Research and ZCC capacity building on fundraising',                                                         pid:97, did:78, dept:14, amt:5911.50 },
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
      [l.code, l.name, l.did, l.pid, l.dept, l.amt, adminId]
    );
    console.log(`✓ [${l.code}] ${l.name} — $${l.amt.toFixed(2)}`);
    inserted++;
  }

  // Update donor total_allocated from sum of their budget lines
  await c.query(`UPDATE donors d SET total_allocated=(SELECT COALESCE(SUM(bl.allocated_amount),0) FROM budget_lines bl WHERE bl.donor_id=d.id) WHERE id IN (77,78)`);
  console.log('\nUpdated total_allocated for Act Alliance & Act for Peace.');
  console.log(`\nDone! ${inserted} budget lines inserted.`);
  await c.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
