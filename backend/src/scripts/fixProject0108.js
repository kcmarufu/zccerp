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

  // Wipe existing 0108 budget lines (project_id=96, donor_id=78)
  const [del] = await c.query('DELETE FROM budget_lines WHERE project_id = 96');
  console.log(`Cleared ${del.affectedRows} existing budget lines for project 0108.`);

  // IDs: project 0108=96 | donor Act for Peace(H1)=78
  // Depts: Admin(AHR)=17 | HSD=14 | CPJS=13

  const lines = [
    { code:'H1/0108/H4A2',         name:'Salaries - AfP',                                                                                                                                                                                    dept:17, amt:49341.00 },
    { code:'H1/0108/H4A3',         name:'Admin Costs - AfP',                                                                                                                                                                                 dept:17, amt:6653.00  },
    { code:'HSD/H1/0108/A1.1.1',   name:'Activity 1.1.1 Train in vocational skills (Sewing, cosmetology, digital/basic enterprise skills, baking, small business skills, etc.). 60 refugees',                                               dept:14, amt:7500.00  },
    { code:'HSD/H1/0108/A1.1.2',   name:'Activity 1.1.2 Training of refugees on financial literacy, basic business management, and entrepreneurship training. 200 individuals (including those who are outside the vocational skills training cohort)', dept:14, amt:1800.00  },
    { code:'HSD/H1/0108/A1.2.1',   name:'Activity 1.2.1 Provide business start-up kits to 20 VCT graduates to enable them to start a business. Protection Integration',                                                                    dept:14, amt:7000.00  },
    { code:'HSD/H1/0108/A1.2.2',   name:'Activity 1.2.2 Support 5 groups(women and youths) with business start-up kits (Grinding mill, arts and crafts, ICT, value addition, processing, and packaging)',                                  dept:14, amt:2900.00  },
    { code:'HSD/H1/0108/A1.2.3',   name:'Activity 1.2.3 Exposure visits and exhibitions (participate in local exhibitions, attend Trade fairs, exposure visits etc) for 10 refugees, once per year',                                        dept:14, amt:2200.00  },
    { code:'HSD/H1/0108/A1.3.1',   name:'Activity 1.3.1 -Training of ISAL groups (savings management, loan administration, record keeping, and financial accountability, etc.)10 groups, approx. 150 individuals',                         dept:14, amt:1500.00  },
    { code:'HSD/H1/0108/A1.3.3',   name:'Activity 1.3.3 Facilitation allowance for community facilitators',                                                                                                                                  dept:14, amt:1800.00  },
    { code:'CPJS/H1/0108/A2.1.1',  name:'Activity 2.1.1 Conduct 2 refresher training for existing local peace committees',                                                                                                                   dept:13, amt:1280.00  },
    { code:'CPJS/H1/0108/A2.1.2',  name:'Activity 2.1.2 Support community-led peace initiatives e.g. Community Dialogues, sports for Peace, Prayer Meetings',                                                                              dept:13, amt:1790.00  },
    { code:'CPJS/H1/0108/A2.1.3',  name:'Activity 2.1.3 Facilitate quarterly peace committee coordination meetings',                                                                                                                         dept:13, amt:480.00   },
    { code:'CPJS/H1/0108/A2.2.1',  name:'Activity 2.2.1 -Refresher training of the Protection Committee/s, covering GBV, inclusion, and case management. 25 individuals',                                                                  dept:13, amt:225.00   },
    { code:'CPJS/H1/0108/A2.2.2',  name:'Activity 2.2.2 -Conduct training of local structures (includes CCWs local Church leaders) to deliver targeted PSS sessions for vulnerable individuals. 25 individuals participating',             dept:13, amt:225.00   },
    { code:'CPJS/H1/0108/A2.3.1',  name:'Activity 2.3.1 -Establish community-level one-stop referral coordination platforms and conduct one-stop centre events',                                                                            dept:13, amt:1135.00  },
    { code:'CPJS/H1/0108/A3.1.1',  name:'Activity 3.1.1 Development of a policy brief documenting policy issues affecting Citizens in TRS and proposed policy',                                                                             dept:13, amt:4270.00  },
    { code:'CPJS/H1/0108/A3.1.2',  name:'Activity 3.1.2 One Multi-stakeholder Dialogue meeting on TRC Targeting Church Leaders, CSOs',                                                                                                      dept:13, amt:7230.00  },
    { code:'CPJS/H1/0108/A3.1.3',  name:'Activity 3.1.3 Advocacy for increased government expenditure to TRC through Engagement with Parliament and Local Government',                                                                      dept:13, amt:1360.00  },
    { code:'HSD/H1/0108/A4.1.1',   name:'Project vehicle running costs (811km/month @ $0.74/km) for implementation and monitoring of self reliance and economic empowerment activities',                                                    dept:14, amt:7200.00  },
    { code:'CPJS/H1/0108/A4.1.2',  name:'Vehicle hire and fuel for implementation and monitoring of Peace Building and advocacy Year 1',                                                                                                     dept:13, amt:4091.00  },
    { code:'HSD/H1/0108/A4.1.3',   name:'Stakeholder allowances for Project monitoring and other support visits',                                                                                                                            dept:14, amt:400.00   },
    { code:'HSD/H1/0108/A4.1.4',   name:'Field staff travel costs',                                                                                                                                                                          dept:14, amt:990.00   },
    { code:'HSD/H1/0108/A4.1.5',   name:'Monitoring and stakeholder engagement costs',                                                                                                                                                       dept:14, amt:3720.00  },
    { code:'HSD/H1/0108/A4.1.6',   name:'Provincial and district inception meeting (10 pple province, 10 ppl district)',                                                                                                                     dept:14, amt:200.00   },
    { code:'HSD/H1/0108/A4.1.7',   name:'Annual review Meetings (Inperson)',                                                                                                                                                                 dept:14, amt:950.00   },
    { code:'HSD/H1/0108/A4.1.8',   name:'Baseline Survey (Including Gender Assessment)',                                                                                                                                                     dept:14, amt:1750.00  },
    { code:'HSD/H1/0108/A4.1.9',   name:'Business Development Initiatives (Core Organisational Cost 10%)',                                                                                                                                   dept:14, amt:13110.00 },
  ];

  // Verify total
  const total = lines.reduce((s, l) => s + l.amt, 0);
  console.log(`Expected total: $131,100.00 | Calculated: $${total.toFixed(2)} | Match: ${total === 131100 ? '✓ YES' : '✗ NO'}`);

  let inserted = 0;
  for (const l of lines) {
    await c.query(
      `INSERT INTO budget_lines
        (budget_code, budget_name, donor_id, project_id, department_id, fiscal_year,
         allocated_amount, spent_amount, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, 78, 96, ?, 2026, ?, 0, 1, ?, NOW(), NOW())`,
      [l.code, l.name, l.dept, l.amt, adminId]
    );
    console.log(`  ✓ [${l.code}] $${l.amt.toFixed(2)}`);
    inserted++;
  }

  // Update Act for Peace total_allocated
  await c.query(`UPDATE donors SET total_allocated=(SELECT COALESCE(SUM(allocated_amount),0) FROM budget_lines WHERE donor_id=78) WHERE id=78`);
  console.log(`\nUpdated Act for Peace total_allocated.`);
  console.log(`Done! ${inserted} budget lines inserted for project 0108.`);
  await c.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
