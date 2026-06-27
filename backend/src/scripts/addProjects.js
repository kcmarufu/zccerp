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

  // Donor IDs (from DB)
  // H15=77, H1=78, H2=80, H4=82, C22=83, H5=84, H6=85, C23=86, C25=87, H7=88, H8=89, C21=90
  // Dept IDs: HSD=14, CPJS=13, FOS=15

  const projects = [
    // Act Alliance (H15 = id 77)
    { code: '1501', name: 'RRF Project',                                                       donor_id: 77, dept_id: 14, budget: 25000.00,    start: '2026-02-01', end: '2026-04-30' },
    { code: '1502', name: 'Support for Parish Dialogues',                                      donor_id: 77, dept_id: 13, budget: 2000.00,     start: '2026-03-01', end: '2026-06-30' },

    // Act for Peace (H1 = id 78)
    { code: '0108', name: 'Strengthening Protection, Resilience and Preparedness for displaced and host communities in Zimbabwe FY26', donor_id: 78, dept_id: 14, budget: 131100.00,  start: '2026-07-01', end: '2027-06-30' },
    { code: '0107', name: 'Zimbabwe 2026 Walk the Talk Project',                               donor_id: 78, dept_id: 14, budget: 20151.50,   start: '2026-01-01', end: '2026-06-30' },
    { code: '0106', name: 'Monitoring Visit',                                                  donor_id: 78, dept_id: 14, budget: 2992.00,    start: '2026-01-01', end: '2026-06-30' },

    // Canadian Food Grains Bank (H2 = id 80)
    { code: '0208', name: '#3200 Scaling up Livelihoods Project 2025 - 2026',                  donor_id: 80, dept_id: 14, budget: 392775.88,  start: '2025-08-01', end: '2026-07-30' },

    // Evangelical Lutheran Church of Wuerttemberg (H4 = id 82)
    { code: '0404', name: 'Ecumenical Youth Empowerment for Resilience and Social Transformation (E-YES)', donor_id: 82, dept_id: 14, budget: 34314.00,  start: '2026-01-01', end: '2026-07-31' },
    { code: '0401', name: 'Institutional Support 2026',                                        donor_id: 82, dept_id: 15, budget: 0.00,       start: '2026-01-01', end: '2026-06-30' }, // FOS = Finance dept

    // Evangelical Mission Werk (C22 = id 83)
    { code: '2201', name: 'Theological & Ecumenical Liaison Capacity Building',                donor_id: 83, dept_id: 13, budget: 0.00,       start: '2024-07-01', end: '2026-06-30' },

    // Global Ministries (H6 = id 85)
    { code: '0605', name: 'Peace and Reconciliation Program',                                  donor_id: 85, dept_id: 13, budget: 1826.00,    start: '2026-01-01', end: '2026-12-31' },

    // Nowergian Church Aid (C23 = id 86)
    { code: '2302', name: 'NAPA Project',                                                      donor_id: 86, dept_id: 13, budget: 69860.00,   start: '2026-01-01', end: '2026-12-30' },

    // Tearfund (C25 = id 87)
    { code: '2505', name: 'DMCA Training',                                                     donor_id: 87, dept_id: 14, budget: 9606.00,    start: '2025-10-01', end: '2027-09-30' },

    // UK Home Office (H7 = id 88)
    { code: '0701', name: 'Reintegration Programme Zimbabwe',                                  donor_id: 88, dept_id: 14, budget: 562500.00,  start: '2026-04-01', end: '2027-03-31' },

    // United Church of Canada (H8 = id 89)
    { code: '0806', name: 'In-Person Regional Meeting',                                        donor_id: 89, dept_id: 14, budget: 15890.74,   start: '2026-01-01', end: '2026-12-31' },
    { code: '0807', name: 'Sustainable Development, Youth Empowerment and Women Empowerment',  donor_id: 89, dept_id: 14, budget: 14442.00,   start: '2026-01-01', end: '2026-12-31' },
  ];

  let inserted = 0;
  for (const p of projects) {
    await c.query(
      `INSERT INTO projects
        (project_code, project_name, donor_id, department_id, total_budget,
         start_date, end_date, last_request_seq, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         project_name=VALUES(project_name), donor_id=VALUES(donor_id),
         department_id=VALUES(department_id), total_budget=VALUES(total_budget),
         start_date=VALUES(start_date), end_date=VALUES(end_date), updated_at=NOW()`,
      [p.code, p.name, p.donor_id, p.dept_id, p.budget, p.start, p.end, adminId]
    );
    console.log(`✓ [${p.code}] ${p.name}`);
    inserted++;
  }

  console.log(`\nDone! ${inserted} projects inserted.`);
  await c.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
