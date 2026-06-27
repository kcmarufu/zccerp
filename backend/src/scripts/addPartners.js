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

  // Get sysadmin ID
  const [admins] = await c.query('SELECT id FROM users WHERE email = ? LIMIT 1', ['sysadmin@zccinzim.org']);
  if (!admins.length) { console.error('sysadmin not found'); process.exit(1); }
  const adminId = admins[0].id;
  console.log('Using sysadmin ID:', adminId);

  // Check donor_type enum
  const [cols] = await c.query('SHOW COLUMNS FROM donors LIKE "donor_type"');
  console.log('donor_type options:', cols[0].Type);

  // Check departments
  const [depts] = await c.query('SELECT id, department_code FROM departments');
  console.log('Departments:', JSON.stringify(depts));

  const partners = [
    { code: 'H15', name: 'Act Alliance', type: 'ORGANIZATION', country: 'Zimbabwe', committed: 27000, contact: 'Sostina Takure', email: 'sota@dca.org', dept: 'HSD' },
    { code: 'H1',  name: 'Act for Peace', type: 'ORGANIZATION', country: 'Australia', committed: 154243.5, contact: 'Tracey Robinson', email: 'TRobinson@actforpeace.org.au', dept: 'HSD' },
    { code: 'C20', name: 'Bread for the World', type: 'ORGANIZATION', country: 'Germany', committed: 261357, contact: 'Johann Singer', email: 'johann.singer@brot-fuer-die-welt.de', dept: 'CPJS' },
    { code: 'H2',  name: 'Canadian Food Grains Bank', type: 'ORGANIZATION', country: 'Canada', committed: 392775.88, contact: 'Thivan Hoang', email: 'THoang@united-church.ca', dept: 'HSD' },
    { code: 'H3',  name: 'Christian Aid', type: 'ORGANIZATION', country: 'United Kingdom', committed: 165596, contact: 'Aulline H. Chapisa', email: 'AChapisa@christian-aid.org', dept: 'CPJS' },
    { code: 'H4',  name: 'Evangelical Lutheran Church of Wuerttemberg', type: 'ORGANIZATION', country: 'Germany', committed: 34314, contact: 'Giseal Riegraf', email: 'Gisela.Riegraf@elk-wue.de', dept: 'HSD' },
    { code: 'C22', name: 'Evangelical Mission Werk', type: 'ORGANIZATION', country: 'Germany', committed: 0, contact: 'Christiane Engel', email: 'christiane.engel@mission-weltweit.de', dept: 'CPJS' },
    { code: 'H5',  name: 'Felm', type: 'ORGANIZATION', country: 'Finland', committed: 356300, contact: 'Ruusa Gawasa', email: 'ruusa.gawaza@felm.org', dept: 'HSD' },
    { code: 'H6',  name: 'Global Ministries', type: 'ORGANIZATION', country: 'United States of America', committed: 1826, contact: 'Rev. Dr. LaMarco Cable', email: 'lcable@dom.disciples.org', dept: 'HSD' },
    { code: 'C23', name: 'Nowergian Church Aid', type: 'ORGANIZATION', country: 'Norway', committed: 69860, contact: 'James Karimi', email: 'james.karimi@nca.no', dept: 'CPJS' },
    { code: 'C25', name: 'Tearfund', type: 'ORGANIZATION', country: 'United Kingdom', committed: 81876, contact: 'Denver Mataswa', email: 'denver.mataswa@tearfund.org', dept: 'CPJS' },
    { code: 'H7',  name: 'UK Home Office', type: 'GOVERNMENT', country: 'United Kingdom', committed: 562500, contact: 'Anuja Parmar', email: 'Anuja.Parmar@homeoffice.gov.uk', dept: 'HSD' },
    { code: 'H8',  name: 'United Church of Canada', type: 'ORGANIZATION', country: 'Canada', committed: 30332.74, contact: 'Josephine Forcadilla', email: 'JForcadilla@united-church.ca', dept: 'HSD' },
    { code: 'C21', name: 'Church of Sweden', type: 'ORGANIZATION', country: 'Sweden', committed: 123143, contact: 'Obed Mugisha', email: 'Obed.Mugisha@svenskakyrkan.se', dept: 'CPJS' },
  ];

  let inserted = 0;
  for (const p of partners) {
    await c.query(
      `INSERT INTO donors
        (donor_code, donor_name, donor_type, contact_person, email, country,
         total_committed, total_allocated, total_spent, currency_code,
         fiscal_year, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'USD', 2026, 1, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         donor_name=VALUES(donor_name), contact_person=VALUES(contact_person),
         email=VALUES(email), country=VALUES(country),
         total_committed=VALUES(total_committed), updated_at=NOW()`,
      [p.code, p.name, p.type, p.contact, p.email, p.country, p.committed, adminId]
    );
    console.log(`✓ ${p.code} - ${p.name}`);
    inserted++;
  }

  console.log(`\nDone! ${inserted} partners inserted/updated.`);
  await c.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
