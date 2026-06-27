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

  // Update project 0108 name
  await c.query("UPDATE projects SET project_name=? WHERE project_code='0108'",
    ['Strengthening Protection, Livelihoods and Peace in Tongogara Refugee Camp']);
  console.log('Updated project 0108 name.');

  // IDs: 0108=96 | 0106=98 | 0208=99
  // Donors: Act for Peace(H1)=78 | CFGB(H2)=80
  // Depts: Admin(AHR)=17 | HSD=14 | CPJS=13

  const lines = [
    // ── Project 0108 – Strengthening Protection (donor 78) ────────────────
    { code:'H1/0108/H4A2',              name:'Salaries - AfP',                                                                                                                                                                                    pid:96, did:78, dept:17, amt:49341.00 },
    { code:'H1/0108/H4A3',              name:'Admin Costs - AfP',                                                                                                                                                                                 pid:96, did:78, dept:17, amt:6653.00  },
    { code:'HSD/H1/0108/A1.1.1',        name:'Activity 1.1.1 Train in vocational skills (Sewing, cosmetology, digital/basic enterprise skills, baking, small business skills, etc.). 60 refugees',                                               pid:96, did:78, dept:14, amt:7500.00  },
    { code:'HSD/H1/0108/A1.1.2',        name:'Activity 1.1.2 Training of refugees on financial literacy, basic business management, and entrepreneurship training. 200 individuals (including those who are outside the vocational skills training cohort)', pid:96, did:78, dept:14, amt:1800.00  },
    { code:'HSD/H1/0108/A1.2.1',        name:'Activity 1.2.1 Provide business start-up kits to 20 VCT graduates to enable them to start a business. Protection Integration',                                                                    pid:96, did:78, dept:14, amt:7000.00  },
    { code:'HSD/H1/0108/A1.2.2',        name:'Activity 1.2.2 Support 5 groups(women and youths) with business start-up kits (Grinding mill, arts and crafts, ICT, value addition, processing, and packaging)',                                  pid:96, did:78, dept:14, amt:2900.00  },
    { code:'HSD/H1/0108/A1.2.3',        name:'Activity 1.2.3 Exposure visits and exhibitions (participate in local exhibitions, attend Trade fairs, exposure visits etc) for 10 refugees, once per year',                                        pid:96, did:78, dept:14, amt:2200.00  },
    { code:'HSD/H1/0108/A1.3.1',        name:'Activity 1.3.1 -Training of ISAL groups (savings management, loan administration, record keeping, and financial accountability, etc.)10 groups, approx. 150 individuals',                         pid:96, did:78, dept:14, amt:1500.00  },
    { code:'HSD/H1/0108/A1.3.3',        name:'Activity 1.3.3 Facilitation allowance for community facilitators',                                                                                                                                  pid:96, did:78, dept:14, amt:1800.00  },
    { code:'CPJS/H1/0108/A2.1.1',       name:'Activity 2.1.1 Conduct 2 refresher training for existing local peace committees',                                                                                                                   pid:96, did:78, dept:13, amt:1280.00  },
    { code:'CPJS/H1/0108/A2.1.2',       name:'Activity 2.1.2 Support community-led peace initiatives e.g. Community Dialogues, sports for Peace, Prayer Meetings',                                                                              pid:96, did:78, dept:13, amt:1790.00  },
    { code:'CPJS/H1/0108/A2.1.3',       name:'Activity 2.1.3 Facilitate quarterly peace committee coordination meetings',                                                                                                                         pid:96, did:78, dept:13, amt:480.00   },
    { code:'CPJS/H1/0108/A2.2.1',       name:'Activity 2.2.1 Refresher training of the Protection Committee/s, covering GBV, inclusion, and case management. 25 individuals',                                                                   pid:96, did:78, dept:13, amt:225.00   },
    { code:'CPJS/H1/0108/A2.2.2',       name:'Activity 2.2.2 Conduct training of local structures (includes CCWs local Church leaders) to deliver targeted PSS sessions for vulnerable individuals. 25 individuals participating',              pid:96, did:78, dept:13, amt:225.00   },
    { code:'CPJS/H1/0108/A2.3.1',       name:'Activity 2.3.1 Establish community-level one-stop referral coordination platforms and conduct one-stop centre events',                                                                             pid:96, did:78, dept:13, amt:1135.00  },
    { code:'CPJS/H1/0108/A3.1.1',       name:'Activity 3.1.1 Development of a policy brief documenting policy issues affecting Citizens in TRS and proposed policy',                                                                             pid:96, did:78, dept:13, amt:4270.00  },
    { code:'CPJS/H1/0108/A3.1.2',       name:'Activity 3.1.2 One Multi-stakeholder Dialogue meeting on TRC Targeting Church Leaders, CSOs',                                                                                                      pid:96, did:78, dept:13, amt:7230.00  },
    { code:'CPJS/H1/0108/A3.1.3',       name:'Activity 3.1.3 Advocacy for increased government expenditure to TRC through Engagement with Parliament and Local Government',                                                                      pid:96, did:78, dept:13, amt:1360.00  },

    // ── Project 0106 – Monitoring Visit (donor 78) ────────────────────────
    { code:'HSD/H1/0106/7001',          name:'Staff Perdiems ZCC Head office staff',                                                                                                                                                              pid:98, did:78, dept:14, amt:440.00   },
    { code:'HSD/H1/0106/7002',          name:'Staff Perdiems field staff',                                                                                                                                                                        pid:98, did:78, dept:14, amt:80.00    },
    { code:'HSD/H1/0106/7003',          name:'Provincial Stakeholders lunch allowances - Courtesy Meeting',                                                                                                                                       pid:98, did:78, dept:14, amt:100.00   },
    { code:'HSD/H1/0106/7004',          name:'District stakeholders lunch allowances - Courtesy Meeting',                                                                                                                                         pid:98, did:78, dept:14, amt:100.00   },
    { code:'HSD/H1/0106/7005',          name:'District stakeholders lunch allowances (Field Accompaniment)',                                                                                                                                      pid:98, did:78, dept:14, amt:90.00    },
    { code:'HSD/H1/0106/7006',          name:'Total Monitoring,Design & Evaluation',                                                                                                                                                             pid:98, did:78, dept:14, amt:810.00   },
    { code:'HSD/H1/0106/7007',          name:'Vehicle Mileage',                                                                                                                                                                                   pid:98, did:78, dept:14, amt:1372.00  },

    // ── Project 0208 – CFGB Livelihoods (donor 80) ───────────────────────
    { code:'H2/0208/H4A2',              name:'Salaries-CFGB HERD',                                                                                                                                                                               pid:99, did:80, dept:17, amt:205374.00   },
    { code:'H2/0208/H4A3',              name:'Admin Costs-CFGB HERD',                                                                                                                                                                            pid:99, did:80, dept:17, amt:23387.88    },
    { code:'HSD/H2/0208/H3A1/7010',    name:'Facilitate review of community based DRR plans by 360 people',                                                                                                                                      pid:99, did:80, dept:14, amt:2160.00     },
    { code:'HSD/H2/0208/H3A1/7011',    name:'Training of asset management committees members on asset maintenance and management',                                                                                                               pid:99, did:80, dept:14, amt:252.00      },
    { code:'HSD/H2/0208/H3A1/7012',    name:'Follow up second phase training for 60 ISALs groups in operation wards',                                                                                                                            pid:99, did:80, dept:14, amt:1620.00     },
    { code:'HSD/H2/0208/H3A1/7015',    name:'Creation and rehabilitation of at least 4 community garderns and environmental assets -procurement, transportation of NFI and trees for asset creation and rehabilitation (community garden, soil and water conservation works)', pid:99, did:80, dept:14, amt:19656.00    },
    { code:'HSD/H2/0208/H3A1/7016',    name:'Refresher training of 130 lead farmers',                                                                                                                                                            pid:99, did:80, dept:14, amt:1170.00     },
    { code:'HSD/H2/0208/H3A1/7017',    name:'Refresher training of 1300 farmers on conservation agriculture, and integrated pest management through trained lead farmers',                                                                       pid:99, did:80, dept:14, amt:7800.00     },
    { code:'HSD/H2/0208/H3A1/7018',    name:'Farmer field days',                                                                                                                                                                                 pid:99, did:80, dept:14, amt:1600.00     },
    { code:'HSD/H2/0208/H3A1/7019',    name:'Farmer exchange visits',                                                                                                                                                                            pid:99, did:80, dept:14, amt:1600.00     },
    { code:'HSD/H2/0208/H3A1/7020',    name:'Farmer field schools',                                                                                                                                                                              pid:99, did:80, dept:14, amt:2400.00     },
    { code:'HSD/H2/0208/H3A1/7021',    name:'Three-day advanced training on Conservation Agriculture for project staff',                                                                                                                          pid:99, did:80, dept:14, amt:4080.00     },
    { code:'HSD/H2/0208/H3A1/7022',    name:'Conduct seed fairs for locally produced seeds from community and individual seedbanks',                                                                                                             pid:99, did:80, dept:14, amt:600.00      },
    { code:'HSD/H2/0208/H3A1/7023',    name:'Training of IGEs groups on on and off farm diversified livelihoods, marketing and value addition',                                                                                                  pid:99, did:80, dept:14, amt:1600.00     },
    { code:'HSD/H2/0208/H3A1/7024',    name:'Supporting IGEs group with start up packs',                                                                                                                                                         pid:99, did:80, dept:14, amt:4000.00     },
    { code:'HSD/H2/0208/H3A1/7025',    name:'Refresher training of 80 Gender and Accountability Focal Persons (GAFPs) on identification and reporting of gender and accountability issues for women and men',                                    pid:99, did:80, dept:14, amt:480.00      },
    { code:'HSD/H2/0208/H3A1/7026',    name:'Male engagement sessions',                                                                                                                                                                          pid:99, did:80, dept:14, amt:600.00      },
    { code:'HSD/H2/0208/H3A1/7027',    name:'Annual gender roles competitions (Men Can Cook and laundry)',                                                                                                                                        pid:99, did:80, dept:14, amt:2400.00     },
    { code:'HSD/H2/0208/H3A1/7028',    name:'Annual gender roles competitions prices',                                                                                                                                                           pid:99, did:80, dept:14, amt:400.00      },
    { code:'HSD/H2/0208/H3A1/7029',    name:'Dissermination of awareness messages on SGBV prevention, management and referral pathways through multiple channels',                                                                              pid:99, did:80, dept:14, amt:4800.00     },
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
    console.log(`✓ [${l.code}] $${l.amt.toFixed(2)}`);
    inserted++;
  }

  // Update donor total_allocated
  await c.query(`UPDATE donors d SET total_allocated=(SELECT COALESCE(SUM(bl.allocated_amount),0) FROM budget_lines bl WHERE bl.donor_id=d.id) WHERE id IN (78,80)`);
  console.log(`\nUpdated total_allocated for Act for Peace & CFGB.`);
  console.log(`Done! ${inserted} budget lines inserted.`);
  await c.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
