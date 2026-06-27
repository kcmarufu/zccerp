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

  const [del] = await c.query('DELETE FROM budget_lines WHERE project_id = 99');
  console.log(`Cleared ${del.affectedRows} existing lines for project 0208.`);

  // project_id=99 | donor CFGB(H2)=80 | Depts: Admin(AHR)=17 | HSD=14
  const L = (code, name, dept, amt) => ({ code, name, dept, amt });
  const lines = [
    L('H2/0208/H4A2',           'Salaries-CFGB HERD',                                                                                                                                                                                                   17, 205374.00),
    L('H2/0208/H4A3',           'Admin Costs-CFGB HERD',                                                                                                                                                                                                 17,  23387.88),
    L('HSD/H2/0208/H3A1/7010',  'Facilitate review of community based DRR plans by 360 people',                                                                                                                                                           14,   2160.00),
    L('HSD/H2/0208/H3A1/7011',  'Training of asset management committees members on asset maintenance and management',                                                                                                                                    14,    252.00),
    L('HSD/H2/0208/H3A1/7012',  'Follow up second phase training for 60 ISALs groups in operation wards',                                                                                                                                                 14,   1620.00),
    L('HSD/H2/0208/H3A1/7015',  'Creation and rehabilitation of at least 4 community garderns and environmental assets -procurement,transportation of NFI and trees for asset creation and rehabilitation (community garden, soil and water conservation works)', 14, 19656.00),
    L('HSD/H2/0208/H3A1/7016',  'Refresher training of 130 lead farmers',                                                                                                                                                                                14,   1170.00),
    L('HSD/H2/0208/H3A1/7017',  'Refresher training of 1300 farmers on conservation agriculture, and integrated pest management through trained lead farmers',                                                                                           14,   7800.00),
    L('HSD/H2/0208/H3A1/7018',  'Farmer field days',                                                                                                                                                                                                     14,   1600.00),
    L('HSD/H2/0208/H3A1/7019',  'Farmer exchange visits',                                                                                                                                                                                                14,   1600.00),
    L('HSD/H2/0208/H3A1/7020',  'Farmer field schools',                                                                                                                                                                                                  14,   2400.00),
    L('HSD/H2/0208/H3A1/7021',  'Three-day advanced training on Conservation Agriculture for project staff',                                                                                                                                              14,   4080.00),
    L('HSD/H2/0208/H3A1/7022',  'Conduct seed fairs for locally produced seeds from community and individual seedbanks',                                                                                                                                  14,    600.00),
    L('HSD/H2/0208/H3A1/7023',  'Training of IGEs groups on on and off farm diversified livelihoods, marketing and value addition',                                                                                                                       14,   1600.00),
    L('HSD/H2/0208/H3A1/7024',  'Supporting IGEs group with start up packs',                                                                                                                                                                             14,   4000.00),
    L('HSD/H2/0208/H3A1/7025',  'Refresher training of 80 Gender and Accountability Focal Persons (GAFPs) on identification and reporting of gender and accountability issues for women and men',                                                        14,    480.00),
    L('HSD/H2/0208/H3A1/7026',  'Male engagement sessions',                                                                                                                                                                                              14,    600.00),
    L('HSD/H2/0208/H3A1/7027',  'Annual gender roles competitions (Men Can Cook and laundry)',                                                                                                                                                            14,   2400.00),
    L('HSD/H2/0208/H3A1/7028',  'Annual gender roles competitions prices',                                                                                                                                                                               14,    400.00),
    L('HSD/H2/0208/H3A1/7029',  'Dissermination of awareness messages on SGBV prevention, management and referral pathways through multiple channels',                                                                                                   14,   4800.00),
    L('HSD/H2/0208/H3A1/7030',  'Gender and SGBV national and international commemoration events',                                                                                                                                                        14,   2400.00),
    L('HSD/H2/0208/H3A1/7031',  'Development of SGBV and protection position paper -engagements, consultations, feedback and dissermination at community, district, provincial and national levels',                                                     14,    800.00),
    L('HSD/H2/0208/H3A1/7032',  'Procurement and distribution of bicycles and IEC materials to 40 GAFPs',                                                                                                                                                14,   6800.00),
    L('HSD/H2/0208/H3A1/7033',  'Conduct gender and protection case management (identification, follow up, support and referals)',                                                                                                                        14,   2000.00),
    L('HSD/H2/0208/H3A1/7034',  'Conduct SGBV and protection One Stop Shop services to the community for women and men',                                                                                                                                  14,   2400.00),
    L('HSD/H2/0208/H3A1/7035',  'Market exposure visit for staff to succesful projects (ADRA Mozambique)',                                                                                                                                                14,   9800.00),
    L('HSD/H2/0208/H3A1/7036',  'Market likages for livelihoods and IGE products (market fairs and exchange visits)',                                                                                                                                     14,   2000.00),
    L('HSD/H2/0208/H3A1/7037',  'Support to coordination initiatives (meetings, activities such as food and nutrition surveys)',                                                                                                                          14,   1000.00),
    L('HSD/H2/0208/H3A1/7038',  'Provincial sensitization meeting',                                                                                                                                                                                      14,    300.00),
    L('HSD/H2/0208/H3A1/7039',  'District sensitization meeting',                                                                                                                                                                                        14,    800.00),
    L('HSD/H2/0208/H3A1/7040',  'Quartely Review Meetings',                                                                                                                                                                                              14,   4000.00),
    L('HSD/H2/0208/H3A1/7041',  'Half Year and Anual Review Meetings',                                                                                                                                                                                   14,   3900.00),
    L('HSD/H2/0208/H3A1/7042',  'Field staff travel expenses (2 people @ 2day/month x $110/day)',                                                                                                                                                        14,   5280.00),
    L('HSD/H2/0208/H3A1/7043',  'Stakeholders allowances (2 stakeholders/ward x 3 days per months x 12 months x US$20)',                                                                                                                                 14,   3380.00),
    L('HSD/H2/0208/H3A1/7044',  'District stakeholders quartely update and review meetings',                                                                                                                                                             14,   1600.00),
    L('HSD/H2/0208/H3A1/7045',  'Annual sentinel evaluation survey',                                                                                                                                                                                     14,   1600.00),
    L('HSD/H2/0208/H3A1/7046',  'Head Office Program monitoring (3 people @ 2.5days/month x $110)',                                                                                                                                                      14,   6600.00),
    L('HSD/H2/0208/H3A1/7047',  'Maintenance of resilience knowledge management system hub',                                                                                                                                                             14,    800.00),
    L('HSD/H2/0208/H3A1/7048',  'Canadian Ambassador Visit',                                                                                                                                                                                             14,   5554.00),
    L('6010/H2/0208/H4A3',      'Office rent',                                                                                                                                                                                                           14,  10800.00),
    L('6001/H2/0208/H4A3',      'Office supplies and utilities',                                                                                                                                                                                         14,   2400.00),
    L('6013/H2/0208/H4A3',      'Office security',                                                                                                                                                                                                       14,   3600.00),
    L('6012/H2/0208/H4A3',      'Office general maintenance',                                                                                                                                                                                            14,   1800.00),
    L('6003/H2/0208/H4A3',      'Office stationery and consumables',                                                                                                                                                                                     14,   1200.00),
    L('5023/H2/0208/H4A2',      'Gender Consultancy fees',                                                                                                                                                                                               14,   3600.00),
    L('6015/H2/0208/H4A3',      'Project Vehicles running costs (2000km/month x$0.50/km)',                                                                                                                                                               14,  12000.00),
    L('6016/H2/0208/H4A3',      'Project motorbikes running costs (600km/month x$0.25/km x 3 motorbikes)',                                                                                                                                               14,   5400.00),
    L('4017/H2/0208/H4A3',      'Project Visibility Material',                                                                                                                                                                                           14,   2482.00),
    L('4028/H2/0208/H4A3',      'Localisation (Staff Team Building)',                                                                                                                                                                                    14,   2500.00),
  ];

  const total = lines.reduce((s, l) => s + l.amt, 0);
  console.log(`Calculated total: $${total.toFixed(2)} | Expected: $392,775.88 | Match: ${Math.abs(total - 392775.88) < 0.01 ? '✓ YES' : '✗ NO'}`);

  let inserted = 0;
  for (const l of lines) {
    await c.query(
      `INSERT INTO budget_lines (budget_code,budget_name,donor_id,project_id,department_id,fiscal_year,allocated_amount,spent_amount,is_active,created_by,created_at,updated_at)
       VALUES (?,?,80,99,?,2026,?,0,1,?,NOW(),NOW())`,
      [l.code, l.name, l.dept, l.amt, adminId]
    );
    console.log(`  ✓ [${l.code}] $${l.amt.toFixed(2)}`);
    inserted++;
  }

  await c.query(`UPDATE donors SET total_allocated=(SELECT COALESCE(SUM(allocated_amount),0) FROM budget_lines WHERE donor_id=80) WHERE id=80`);
  console.log(`\nUpdated CFGB total_allocated. Done! ${inserted}/49 lines inserted.`);
  await c.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
