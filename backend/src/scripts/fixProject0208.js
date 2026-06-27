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

  // Wipe existing 0208 budget lines (project_id=99, donor_id=80)
  const [del] = await c.query('DELETE FROM budget_lines WHERE project_id = 99');
  console.log(`Cleared ${del.affectedRows} existing budget lines for project 0208.`);

  // IDs: project 0208=99 | donor CFGB(H2)=80
  // Depts: Admin(AHR)=17 | HSD=14

  const lines = [
    { code:'H2/0208/H4A2',           name:'Salaries-CFGB HERD',                                                                          dept:17, amt:205374.00 },
    { code:'H2/0208/H4A3',           name:'Admin Costs-CFGB HERD',                                                                       dept:17, amt:23387.88  },
    { code:'HSD/H2/0208/H3A1/7010',  name:'Facilitate review of community based DRR plans by 360 people',                                dept:14, amt:2160.00   },
    { code:'HSD/H2/0208/H3A1/7011',  name:'Training of asset management committees members on asset maintenance and management',         dept:14, amt:252.00    },
    { code:'HSD/H2/0208/H3A1/7012',  name:'Follow up second phase training for 60 ISALs groups in operation wards',                      dept:14, amt:1620.00   },
    { code:'HSD/H2/0208/H3A1/7015',  name:'Creation and rehabilitation of community gardens and environmental assets',                    dept:14, amt:19656.00  },
    { code:'HSD/H2/0208/H3A1/7016',  name:'Refresher training of 130 lead farmers',                                                      dept:14, amt:1170.00   },
    { code:'HSD/H2/0208/H3A1/7017',  name:'Refresher training of 1300 farmers',                                                          dept:14, amt:7800.00   },
    { code:'HSD/H2/0208/H3A1/7018',  name:'Farmer field days',                                                                           dept:14, amt:1600.00   },
    { code:'HSD/H2/0208/H3A1/7019',  name:'Farmer exchange visits',                                                                      dept:14, amt:1600.00   },
    { code:'HSD/H2/0208/H3A1/7020',  name:'Farmer field schools',                                                                        dept:14, amt:2400.00   },
    { code:'HSD/H2/0208/H3A1/7021',  name:'Three-day advanced training on Conservation Agriculture for project staff',                   dept:14, amt:4080.00   },
    { code:'HSD/H2/0208/H3A1/7022',  name:'Conduct seed fairs',                                                                          dept:14, amt:600.00    },
    { code:'HSD/H2/0208/H3A1/7023',  name:'Training of IGEs groups',                                                                     dept:14, amt:1600.00   },
    { code:'HSD/H2/0208/H3A1/7024',  name:'Supporting IGEs group with start up packs',                                                   dept:14, amt:4000.00   },
    { code:'HSD/H2/0208/H3A1/7025',  name:'Gender Accountability training',                                                              dept:14, amt:480.00    },
    { code:'HSD/H2/0208/H3A1/7026',  name:'Male engagement sessions',                                                                    dept:14, amt:600.00    },
    { code:'HSD/H2/0208/H3A1/7027',  name:'Gender role competitions',                                                                    dept:14, amt:2400.00   },
    { code:'HSD/H2/0208/H3A1/7028',  name:'Gender role prizes',                                                                          dept:14, amt:400.00    },
  ];

  const total = lines.reduce((s, l) => s + l.amt, 0);
  console.log(`Lines total: $${total.toFixed(2)} | Project budget: $392,775.88 | Remaining to add: $${(392775.88 - total).toFixed(2)}`);

  let inserted = 0;
  for (const l of lines) {
    await c.query(
      `INSERT INTO budget_lines
        (budget_code, budget_name, donor_id, project_id, department_id, fiscal_year,
         allocated_amount, spent_amount, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, 80, 99, ?, 2026, ?, 0, 1, ?, NOW(), NOW())`,
      [l.code, l.name, l.dept, l.amt, adminId]
    );
    console.log(`  ✓ [${l.code}] $${l.amt.toFixed(2)}`);
    inserted++;
  }

  // Update CFGB total_allocated
  await c.query(`UPDATE donors SET total_allocated=(SELECT COALESCE(SUM(allocated_amount),0) FROM budget_lines WHERE donor_id=80) WHERE id=80`);
  console.log(`\nUpdated CFGB total_allocated.`);
  console.log(`Done! ${inserted} budget lines inserted for project 0208.`);
  await c.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
