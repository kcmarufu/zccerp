require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
  const c = await mysql.createConnection({ host:process.env.DB_HOST||'localhost', port:parseInt(process.env.DB_PORT||'3306'), user:process.env.DB_USER||'root', password:process.env.DB_PASSWORD||'', database:process.env.DB_NAME||'finance_erp' });
  const [[{id:adminId}]] = await c.query('SELECT id FROM users WHERE email=? LIMIT 1',['sysadmin@zccinzim.org']);
  // project_id=109 | donor Felm(H5)=84 | Depts: Admin(AHR)=17 | HSD=14
  const L=(code,name,dept,amt)=>({code,name,dept,amt});
  const lines=[
    L('H5/0508/H7A1',                'Salaries - Felm ECRA',                                                                                                                                           17, 81111.39),
    L('H5/0508/H7A3',                'Admin - Felm ECRA',                                                                                                                                              17,  6209.61),
    L('4037/H5/0508/H4A2/7252',      'Staff capacity strenthning',                                                                                                                                     14,  1500.00),
    L('4043/H5/0508/H2A1/7201',      'Training of 90 lead farmers on conservation agriculture-Refreshments for participants',                                                                           14,   945.00),
    L('4038/H5/0508/H2A1/7201',      'Training of 90 lead farmers on conservation agriculture-Stationery expenses',                                                                                    14,   405.00),
    L('4043/H5/0508/H2A1/7204',      'Training of 90 lead farmers on establishment of seed banks-Refreshments for participants',                                                                       14,   945.00),
    L('4038/H5/0508/H2A1/7204',      'Training of 90 lead farmers on establishment of seed banks-Stationery expenses',                                                                                 14,   405.00),
    L('4015/H5/0508/H2A1/7206',      'Provision of 900 hermetic bags for storage for farmer seed banks',                                                                                               14,  1800.00),
    L('7006/H5/0508/H2A1/7207',      'Drlling of borehole and solarization x 2',                                                                                                                       14, 28000.00),
    L('4015/H5/0508/H2A1/7210',      'Establishing of gardens 2 gardens',                                                                                                                              14,  8000.00),
    L('4015/H5/0508/H2A1/7211',      'Purchase of gardern inputs -Procurement of seed starter pack',                                                                                                   14,  1500.00),
    L('4043/H5/0508/H2A1/7212',      'Trainings on garden production -Refreshments for participants',                                                                                                  14,   200.00),
    L('4038/H5/0508/H2A1/7212',      'Trainings on garden production -Stationery for participants',                                                                                                    14,   100.00),
    L('4043/H5/0508/H2A1/7213',      'Training of asset management-Refreshments for participants',                                                                                                     14,   160.00),
    L('4038/H5/0508/H2A1/7213',      'Training of asset management-Stationery for participants',                                                                                                       14,    80.00),
    L('4043/H5/0508/H2A1/7214',      'Training of Lead farmers on agro-forestry -Refreshments for participants',                                                                                       14,   200.00),
    L('4038/H5/0508/H2A1/7214',      'Training of Lead farmers on agro-forestry -Stationery for participants',                                                                                         14,   100.00),
    L('4015/H5/0508/H2A1/7215',      'Procurement and distribution of agro forestry trees to 20 lead farmers',                                                                                         14,   600.00),
    L('7006/H5/0508/H2A1/7216',      'Construction of sanitation facilities -Squat holes',                                                                                                             14,  1000.00),
    L('7007/H5/0508/H2A1/7218',      'Procurement and distribution of small livestock/Goats',                                                                                                          14,  2000.00),
    L('4043/H5/0508/H2A1/7220',      'Training of livestock champions on small livestock production -Refreshments for participants',                                                                    14,   360.00),
    L('4038/H5/0508/H2A1/7220',      'Training of livestock champions on small livestock production -Stationery for participants',                                                                      14,   180.00),
    L('4027/H5/0508/H2A1/7222',      'Training of District Civil protection committee on DRRM-Stakeholder Allowances',                                                                                 14,  1800.00),
    L('4043/H5/0508/H2A1/7223',      'Training of Ward based civil protection community on DRRM-Refreshments for participants',                                                                        14,   900.00),
    L('4038/H5/0508/H2A1/7223',      'Training of Ward based civil protection community on DRRM-Stationery for participants',                                                                          14,   450.00),
    L('4043/H5/0508/H2A1/7224',      'Facilitate formation/reviving of community based DRR plans-Refreshments for participants',                                                                       14,   900.00),
    L('4038/H5/0508/H2A1/7224',      'Facilitate formation/reviving of community based DRR plans-Stationery for participants',                                                                         14,   450.00),
    L('4043/H5/0508/H2A1/7226',      'Gender sensitivity and SGBV training for community structures-Refreshments for participants',                                                                    14,   900.00),
    L('4038/H5/0508/H2A1/7226',      'Gender sensitivity and SGBV training for community structures-Stationery for participants',                                                                      14,   450.00),
    L('4017/H5/0508/H2A1/7228',      'Gender awareness campaigns-Procurement of IEC Material',                                                                                                         14,  1500.00),
    L('4043/H5/0508/H2A1/7229',      'Sensetisation meeting on women and youth empowerment and leadership-Refreshments for participants',                                                               14,   450.00),
    L('4038/H5/0508/H2A1/7229',      'Sensetisation meeting on women and youth empowerment and leadership-Stationery for participants',                                                                 14,   225.00),
    L('4027/H5/0508/H2A1/7230',      'Stakeholder mapping and engagement meetings on PWDs-Stakeholder Allowance for participants',                                                                      14,   600.00),
    L('4043/H5/0508/H2A1/7232',      'Training on PWDs rights and inclusion for community structures-Refreshments for participants',                                                                    14,   900.00),
    L('4038/H5/0508/H2A1/7232',      'Training on PWDs rights and inclusion for community structures-Stationery for participants',                                                                      14,   450.00),
    L('4017/H5/0508/H2A1/7234',      'Conduct Awareness campaign on PWDs rights and inclusion.-Procurement of IEC and hire of PA System',                                                              14,  1500.00),
    L('4043/H5/0508/H2A1/7236',      'Training of 30 Internal Savings and Landings (ISALs) groups, including youth and men.-Refreshments for participants',                                            14,  1260.00),
    L('4038/H5/0508/H2A1/7236',      'Training of 30 Internal Savings and Landings (ISALs) groups, including youth and men.- Stationery for participants',                                             14,   630.00),
    L('4043/H5/0508/H2A1/7238',      'Training of 105 households (15 groups) including youth on livelihoods diversification-Refreshments for participants',                                            14,   840.00),
    L('4038/H5/0508/H2A1/7238',      'Training of 105 households (15 groups) including youth on livelihoods diversification-Stationery for participants',                                              14,   315.00),
    L('4015/H5/0508/H2A1/7239',      'Procurement and distribution of IGE start up kits -IGE Materials $500 x 5 groups',                                                                               14,  2500.00),
    L('6010/H5/0508/H2A1',           'Field Office Rent',                                                                                                                                              14,  4590.00),
    L('6001/H5/0508/H2A1/7269',      'Field Office Utilities',                                                                                                                                         14,  1800.00),
    L('6013/H5/0508/H2A1',           'Field Office Security',                                                                                                                                          14,  2100.00),
    L('6012/H5/0508/H2A1/7268',      'Field Office General Mainatanance',                                                                                                                              14,   810.00),
    L('6011/H5/0508/H2A1',           'Internet Subscription Starlink',                                                                                                                                 14,   270.00),
    L('6004/H5/0508/H2A1/7270',      'Telecommunications and internet',                                                                                                                                14,   972.00),
    L('4012/H5/0508/H2A1',           'Project Vehicles running costs',                                                                                                                                 14,  9450.00),
    L('7003/H5/0508/H2A1',           'Project motorbikes running costs',                                                                                                                               14,  1530.00),
    L('6008/H5/0508/H2A1',           'Bank charges',                                                                                                                                                   14,  2585.00),
    L('7002/H5/0508/H2A1/7247',      'Procurement of project Motor Vehicle',                                                                                                                           14, 15000.00),
    L('7004/H5/0508/H2A1/7248',      'Procurement of project Laptops',                                                                                                                                 14,  2250.00),
    L('7004/H5/0508/H2A1/7249',      'Procurement of project tablets',                                                                                                                                 14,   450.00),
    L('7007/H5/0508/H2A1/7250',      'Project Backup solar battery and small invertor',                                                                                                                14,  1462.00),
    L('7004/H5/0508/H2A1/7251',      'Project mini-starlink kit',                                                                                                                                      14,   440.00),
    L('4009/H5/0508/H2A1/7253',      'Staff pdm - Baseline',                                                                                                                                           14,  1800.00),
    L('4009/H5/0508/H2A1/7257',      'Annual Review',                                                                                                                                                  14,   990.00),
    L('4009/H5/0508/H2A1/7258',      'HQ Programme Monitoring - Staff pdm',                                                                                                                            14,  2970.00),
    L('4027/H5/0508/H2A1/7259',      'Joint Stakeholder Monitoring-Stakeholder allowances',                                                                                                            14,   330.00),
    L('4027/H5/0508/H2A1/7260',      'Provincial sensitization meeting-Lunch allowances',                                                                                                              14,   600.00),
    L('4027/H5/0508/H2A1/7261',      'District sensitization meeting-Lunch allowances',                                                                                                                14,   600.00),
    L('4009/H5/0508/H2A1/7262',      'Staff travel costs',                                                                                                                                             14,  2800.00),
    L('4009/H5/0508/H2A1/7263',      'Head Office Travel cost',                                                                                                                                        14,  2970.00),
    L('4031/H5/0508/H2A1/7264',      'Support to coordination initiatives (meetings, activities such as food and nutrition surveys)',                                                                   14,   830.00),
    L('4009/H5/0508/H2A1/7265',      'Staff orientation (Staff travel costs and accommodation.)',                                                                                                       14,  1650.00),
    L('4027/H5/0508/H2A1/7267',      'Stakeholder allowances(Includes lunch allowances for Disability Focal Persons)',                                                                                  14,  2000.00),
    L('4008/H5/0508/H4A2',           'Capacity strengthening',                                                                                                                                         14,  1800.00),
    L('4037/H5/0508/H4A3',           'Contribution to software subscriptions',                                                                                                                         14,  2430.00),
  ];
  const total=lines.reduce((s,l)=>s+l.amt,0);
  console.log(`Total: $${total.toFixed(2)} | Expected: $218,300.00 | Match: ${Math.abs(total-218300)<0.01?'✓ YES':'✗ NO'}`);
  let inserted=0;
  for(const l of lines){
    await c.query(`INSERT INTO budget_lines (budget_code,budget_name,donor_id,project_id,department_id,fiscal_year,allocated_amount,spent_amount,is_active,created_by,created_at,updated_at) VALUES(?,?,84,109,?,2026,?,0,1,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE budget_name=VALUES(budget_name),allocated_amount=VALUES(allocated_amount),department_id=VALUES(department_id),updated_at=NOW()`,[l.code,l.name,l.dept,l.amt,adminId]);
    console.log(`  ✓ [${l.code}] $${l.amt.toFixed(2)}`);
    inserted++;
  }
  await c.query(`UPDATE donors SET total_allocated=(SELECT COALESCE(SUM(allocated_amount),0) FROM budget_lines WHERE donor_id=84) WHERE id=84`);
  console.log(`\nUpdated Felm total_allocated. Done! ${inserted}/68 lines inserted.`);
  await c.end();
}
run().catch(e=>{console.error(e.message);process.exit(1);});
