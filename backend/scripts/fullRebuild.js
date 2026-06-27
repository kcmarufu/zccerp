/**
 * Full Database Rebuild Script
 * - Keeps 4 departments: CPJS (13), HSD (14), Finance+OrgSustainability (15→renamed), Admin+HR (17→renamed)
 * - Moves critical users to correct depts, deletes users in removed depts
 * - Clears all operational data, projects, budget lines, donors
 * - Rebuilds: 10 CPJS partners / 15 projects / 30 budget lines
 *             8 HSD partners / 23 projects / 46 budget lines
 *             1 Admin donor / 1 project / 4 budget lines (5000 USD)
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const c = await mysql.createConnection(process.env.DATABASE_URL);
  console.log('🔄 Starting full database rebuild...\n');

  try {
    await c.execute('SET FOREIGN_KEY_CHECKS = 0');

    // ── 1. CLEAR ALL OPERATIONAL & REFERENCE DATA ──────────────────────────
    console.log('Clearing all data...');
    const toClear = [
      'per_diem_trip_items','per_diem_cost_distribution','per_diem_claims',
      'reconciliation_items','reconciliations',
      'proc_committee_votes','proc_committee_reviews','proc_approval_logs',
      'proc_quotation_items','proc_quotations','proc_request_attachments',
      'proc_request_items','proc_requests',
      'approval_logs','request_items','attachments','notifications','requests',
      'budget_transactions','donor_transactions',
      'budget_lines','projects','donors',
    ];
    for (const t of toClear) {
      try { await c.execute(`DELETE FROM ${t}`); console.log(`  ✓ Cleared ${t}`); }
      catch (e) { console.log(`  - Skipped ${t} (${e.code})`); }
    }

    // ── 2. MOVE KEY USERS BEFORE DELETING THEIR DEPARTMENTS ────────────────
    console.log('\nRehoming users...');
    // finance@zccinzim.org was in FIN (20) → move to Finance+OrgSust (15)
    await c.execute("UPDATE users SET department_id=15 WHERE email='finance@zccinzim.org'");
    // hop@zccinzim.org was in OPS (21) → move to HSD (14)
    await c.execute("UPDATE users SET department_id=14 WHERE email='hop@zccinzim.org'");
    console.log('  ✓ finance@zccinzim.org → dept 15');
    console.log('  ✓ hop@zccinzim.org     → dept 14');

    // ── 3. DELETE USERS IN REMOVED DEPARTMENTS ─────────────────────────────
    const [du] = await c.execute('DELETE FROM users WHERE department_id NOT IN (13,14,15,17) OR department_id IS NULL');
    console.log(`\n  ✓ Deleted ${du.affectedRows} users from removed departments`);

    // ── 4. DELETE UNWANTED DEPARTMENTS ─────────────────────────────────────
    const [dd] = await c.execute('DELETE FROM departments WHERE id NOT IN (13,14,15,17)');
    console.log(`  ✓ Deleted ${dd.affectedRows} departments`);

    // ── 5. RENAME DEPARTMENTS ──────────────────────────────────────────────
    await c.execute("UPDATE departments SET department_name='Finance and Organization Sustainability', department_code='FOS' WHERE id=15");
    await c.execute("UPDATE departments SET department_name='Admin and HR', department_code='AHR' WHERE id=17");
    console.log('  ✓ Dept 15 → Finance and Organization Sustainability');
    console.log('  ✓ Dept 17 → Admin and HR');

    // ── 6. RESOLVE CREATED-BY USER ─────────────────────────────────────────
    const [[adm]] = await c.execute("SELECT id FROM users WHERE email='sysadmin@zccinzim.org' LIMIT 1");
    const createdBy = adm.id;
    console.log(`\n  Using sysadmin (id ${createdBy}) as created_by`);

    // ── 7. CREATE ADMIN DONOR ──────────────────────────────────────────────
    console.log('\nCreating Admin donor...');
    const [adr] = await c.execute(
      "INSERT INTO donors (donor_code,donor_name,currency_code,donor_type,total_committed,total_allocated,total_spent,fiscal_year,is_active,created_by,updated_at) VALUES ('ADMIN-INT','Administration (Internal)','USD','ADMIN',5000,0,0,2026,1,?,NOW())",
      [createdBy]
    );
    const adminDonorId = adr.insertId;
    console.log('  ✓ ADMIN-INT created');

    // ── 8. CPJS PARTNERS (10) ──────────────────────────────────────────────
    console.log('\nCreating CPJS partners...');
    const cpjsDonorData = [
      ['ACT-ZW-2026',    'ACT Alliance Zimbabwe',           'USD', 250000],
      ['NCA-ZW-2026',    'Norwegian Church Aid Zimbabwe',   'USD', 180000],
      ['TEAR-ZW-2026',   'Tearfund United Kingdom',         'GBP', 150000],
      ['CA-ZW-2026',     'Christian Aid Zimbabwe',          'GBP', 120000],
      ['WCC-ZW-2026',    'World Council of Churches',       'USD',  90000],
      ['KAIROS-ZW-2026', 'KAIROS Canada Zimbabwe',          'USD',  75000],
      ['ICCO-ZW-2026',   'ICCO Cooperation Zimbabwe',       'EUR', 200000],
      ['BROT-ZW-2026',   'Bread for the World',             'EUR', 160000],
      ['DCA-ZW-2026',    'DanChurchAid Zimbabwe',           'USD', 100000],
      ['HEKS-ZW-2026',   'HEKS EPER Switzerland',           'USD',  85000],
    ];
    const cpjsD = {};
    for (const [code, name, cur, committed] of cpjsDonorData) {
      const [r] = await c.execute(
        "INSERT INTO donors (donor_code,donor_name,currency_code,donor_type,total_committed,total_allocated,total_spent,fiscal_year,is_active,created_by,updated_at) VALUES (?,?,'"+cur+"','EXTERNAL',?,0,0,2026,1,?,NOW())",
        [code, name, committed, createdBy]
      );
      cpjsD[code] = r.insertId;
      console.log(`  ✓ ${name}`);
    }

    // ── 9. HSD PARTNERS (8) ────────────────────────────────────────────────
    console.log('\nCreating HSD partners...');
    const hsdDonorData = [
      ['UNICEF-ZW-2026', 'UNICEF Zimbabwe',                'USD', 500000],
      ['WFP-ZW-2026',    'World Food Programme Zimbabwe',  'USD', 400000],
      ['UNHCR-ZW-2026',  'UNHCR Zimbabwe',                 'USD', 300000],
      ['STC-ZW-2026',    'Save the Children Zimbabwe',     'GBP', 250000],
      ['OXF-ZW-2026',    'Oxfam Zimbabwe',                 'USD', 200000],
      ['CARE-ZW-2026',   'CARE International Zimbabwe',    'USD', 180000],
      ['WV-ZW-2026',     'World Vision Zimbabwe',          'USD', 350000],
      ['FFH-ZW-2026',    'Food for the Hungry Zimbabwe',   'USD', 120000],
    ];
    const hsdD = {};
    for (const [code, name, cur, committed] of hsdDonorData) {
      const [r] = await c.execute(
        "INSERT INTO donors (donor_code,donor_name,currency_code,donor_type,total_committed,total_allocated,total_spent,fiscal_year,is_active,created_by,updated_at) VALUES (?,?,'"+cur+"','EXTERNAL',?,0,0,2026,1,?,NOW())",
        [code, name, committed, createdBy]
      );
      hsdD[code] = r.insertId;
      console.log(`  ✓ ${name}`);
    }

    // ── 10. CPJS PROJECTS (15) ─────────────────────────────────────────────
    console.log('\nCreating CPJS projects...');
    const cpjsProjData = [
      ['PBR-ACT-2026',  'Peace Building and Reconciliation Programme',  'ACT-ZW-2026',     50000],
      ['CEA-ACT-2026',  'Civic Education and Voter Awareness Programme', 'ACT-ZW-2026',     45000],
      ['CRA-NCA-2026',  'Constitutional Reform Advocacy',                'NCA-ZW-2026',     40000],
      ['SCH-NCA-2026',  'Social Cohesion and Healing Programme',         'NCA-ZW-2026',     35000],
      ['CUE-TEAR-2026', 'Church Unity and Ecumenism Programme',          'TEAR-ZW-2026',    30000],
      ['PEP-TEAR-2026', 'Parliamentary Engagement Programme',            'TEAR-ZW-2026',    28000],
      ['CDP-CA-2026',   'Community Dialogue and Peacebuilding',          'CA-ZW-2026',      32000],
      ['CAC-CA-2026',   'Constitution Amendment Campaign',               'CA-ZW-2026',      25000],
      ['RFA-WCC-2026',  'Religious Freedom Advocacy',                    'WCC-ZW-2026',     28000],
      ['GMZ-WCC-2026',  'Gukurahundi Memorialization Zimbabwe',          'WCC-ZW-2026',     22000],
      ['YPC-KAI-2026',  'Youth Peace Champions Programme',               'KAIROS-ZW-2026',  30000],
      ['IFD-ICCO-2026', 'Inter-Faith Dialogue Initiative',               'ICCO-ZW-2026',    38000],
      ['CLC-BROT-2026', 'Church Leadership Capacity Building',           'BROT-ZW-2026',    42000],
      ['TJP-DCA-2026',  'Transitional Justice Programme',                'DCA-ZW-2026',     35000],
      ['WPB-HEKS-2026', 'Women in Peacebuilding',                        'HEKS-ZW-2026',    28000],
    ];
    const cpjsP = {};
    for (const [code, name, donor, budget] of cpjsProjData) {
      const [r] = await c.execute(
        "INSERT INTO projects (project_code,project_name,donor_id,department_id,start_date,end_date,total_budget,is_active,created_by,updated_at) VALUES (?,?,?,13,'2026-01-01','2026-12-31',?,1,?,NOW())",
        [code, name, cpjsD[donor], budget, createdBy]
      );
      cpjsP[code] = r.insertId;
      console.log(`  ✓ ${code}`);
    }

    // ── 11. HSD PROJECTS (23) ──────────────────────────────────────────────
    console.log('\nCreating HSD projects...');
    const hsdProjData = [
      ['CRP-UNICEF-2026',  'Cholera Response Programme',           'UNICEF-ZW-2026', 120000],
      ['WASH-UNICEF-2026', 'WASH Infrastructure Project',          'UNICEF-ZW-2026', 100000],
      ['NSP-UNICEF-2026',  'Nutrition Support Programme',          'UNICEF-ZW-2026',  80000],
      ['MHP-UNICEF-2026',  'Maternal and Child Health Programme',  'UNICEF-ZW-2026',  75000],
      ['EFA-WFP-2026',     'Emergency Food Assistance Programme',  'WFP-ZW-2026',    150000],
      ['SFP-WFP-2026',     'School Feeding Programme',             'WFP-ZW-2026',     90000],
      ['LRP-WFP-2026',     'Livelihoods Recovery Programme',       'WFP-ZW-2026',     80000],
      ['RSP-UNHCR-2026',   'Refugee Support Programme',            'UNHCR-ZW-2026',   70000],
      ['DRP-UNHCR-2026',   'Displacement Response Programme',      'UNHCR-ZW-2026',   65000],
      ['PSI-UNHCR-2026',   'Psychosocial Support Initiative',      'UNHCR-ZW-2026',   50000],
      ['CPI-STC-2026',     'Child Protection Initiative',          'STC-ZW-2026',     85000],
      ['EIE-STC-2026',     'Education in Emergencies',             'STC-ZW-2026',     70000],
      ['ECD-STC-2026',     'Early Childhood Development',          'STC-ZW-2026',     60000],
      ['FSP-OXF-2026',     'Food Security Programme',              'OXF-ZW-2026',     65000],
      ['GBV-OXF-2026',     'Gender Based Violence Response',       'OXF-ZW-2026',     55000],
      ['CAP-CARE-2026',    'Climate Adaptation Project',           'CARE-ZW-2026',    75000],
      ['WEE-CARE-2026',    'Women Economic Empowerment',           'CARE-ZW-2026',    60000],
      ['HAR-WV-2026',      'HIV AIDS Community Response',          'WV-ZW-2026',      80000],
      ['VCS-WV-2026',      'Vulnerable Children Support',          'WV-ZW-2026',      70000],
      ['WSP-WV-2026',      'Water Sanitation and Hygiene Project', 'WV-ZW-2026',      90000],
      ['CAG-WV-2026',      'Conservation Agriculture Programme',   'WV-ZW-2026',      65000],
      ['DRP2-FFH-2026',    'Drought Relief Programme',             'FFH-ZW-2026',     55000],
      ['SFS-FFH-2026',     'Smallholder Farmer Support',           'FFH-ZW-2026',     45000],
    ];
    const hsdP = {};
    for (const [code, name, donor, budget] of hsdProjData) {
      const [r] = await c.execute(
        "INSERT INTO projects (project_code,project_name,donor_id,department_id,start_date,end_date,total_budget,is_active,created_by,updated_at) VALUES (?,?,?,14,'2026-01-01','2026-12-31',?,1,?,NOW())",
        [code, name, hsdD[donor], budget, createdBy]
      );
      hsdP[code] = r.insertId;
      console.log(`  ✓ ${code}`);
    }

    // ── 12. ADMIN PROJECT ──────────────────────────────────────────────────
    console.log('\nCreating Admin project...');
    const [apr] = await c.execute(
      "INSERT INTO projects (project_code,project_name,donor_id,department_id,start_date,end_date,total_budget,is_active,created_by,updated_at) VALUES ('ADM-INT-2026','Internal Administration',?,17,'2026-01-01','2026-12-31',5000,1,?,NOW())",
      [adminDonorId, createdBy]
    );
    const adminProjectId = apr.insertId;
    console.log('  ✓ ADM-INT-2026');

    // ── 13. CPJS BUDGET LINES (2 per project = 30) ────────────────────────
    console.log('\nCreating CPJS budget lines...');
    const cpjsBL = [
      // [projCode, blCode, name, category, amount, donorCode]
      ['PBR-ACT-2026',  'PBR-ACT-PROG',  'Programme Activities',          'COMMUNITY_OUTREACH',  30000,'ACT-ZW-2026'],
      ['PBR-ACT-2026',  'PBR-ACT-TRVL',  'Travel and Field Visits',       'TRANSPORT',           20000,'ACT-ZW-2026'],
      ['CEA-ACT-2026',  'CEA-ACT-PROG',  'Civic Education Activities',    'COMMUNITY_OUTREACH',  27000,'ACT-ZW-2026'],
      ['CEA-ACT-2026',  'CEA-ACT-TRVL',  'Outreach Travel',               'TRANSPORT',           18000,'ACT-ZW-2026'],
      ['CRA-NCA-2026',  'CRA-NCA-ADVO',  'Advocacy and Campaigns',        'ADVOCACY',            25000,'NCA-ZW-2026'],
      ['CRA-NCA-2026',  'CRA-NCA-CAP',   'Capacity Building',             'CAPACITY_BUILDING',   15000,'NCA-ZW-2026'],
      ['SCH-NCA-2026',  'SCH-NCA-DIAL',  'Dialogue Facilitation',         'COMMUNITY_OUTREACH',  22000,'NCA-ZW-2026'],
      ['SCH-NCA-2026',  'SCH-NCA-TRVL',  'Field Travel',                  'TRANSPORT',           13000,'NCA-ZW-2026'],
      ['CUE-TEAR-2026', 'CUE-TEAR-PROG', 'Ecumenism Programmes',          'PROCUREMENT',         18000,'TEAR-ZW-2026'],
      ['CUE-TEAR-2026', 'CUE-TEAR-PRDM', 'Staff Per Diem',                'PER_DIEM',            12000,'TEAR-ZW-2026'],
      ['PEP-TEAR-2026', 'PEP-TEAR-ENGM', 'Parliamentary Engagement',      'ADVOCACY',            18000,'TEAR-ZW-2026'],
      ['PEP-TEAR-2026', 'PEP-TEAR-TRVL', 'Harare Travel and Meetings',    'TRANSPORT',           10000,'TEAR-ZW-2026'],
      ['CDP-CA-2026',   'CDP-CA-DIAL',   'Community Dialogue Events',     'COMMUNITY_OUTREACH',  20000,'CA-ZW-2026'],
      ['CDP-CA-2026',   'CDP-CA-ACCM',   'Participant Accommodation',     'ACCOMMODATION',       12000,'CA-ZW-2026'],
      ['CAC-CA-2026',   'CAC-CA-CAMP',   'Campaign Materials',            'PROCUREMENT',         16000,'CA-ZW-2026'],
      ['CAC-CA-2026',   'CAC-CA-TRVL',   'Campaign Travel',               'TRANSPORT',            9000,'CA-ZW-2026'],
      ['RFA-WCC-2026',  'RFA-WCC-ADVO',  'Religious Freedom Advocacy',    'ADVOCACY',            18000,'WCC-ZW-2026'],
      ['RFA-WCC-2026',  'RFA-WCC-COMS',  'Communications and Media',      'PROCUREMENT',         10000,'WCC-ZW-2026'],
      ['GMZ-WCC-2026',  'GMZ-WCC-MEML',  'Memorialization Activities',    'COMMUNITY_OUTREACH',  15000,'WCC-ZW-2026'],
      ['GMZ-WCC-2026',  'GMZ-WCC-RSCH',  'Documentation and Research',    'RESEARCH',             7000,'WCC-ZW-2026'],
      ['YPC-KAI-2026',  'YPC-KAI-TRNG',  'Youth Training Workshops',      'CAPACITY_BUILDING',   20000,'KAIROS-ZW-2026'],
      ['YPC-KAI-2026',  'YPC-KAI-TRVL',  'Travel for Youth Camps',        'TRANSPORT',           10000,'KAIROS-ZW-2026'],
      ['IFD-ICCO-2026', 'IFD-ICCO-DIAL', 'Inter-Faith Dialogue',          'COMMUNITY_OUTREACH',  25000,'ICCO-ZW-2026'],
      ['IFD-ICCO-2026', 'IFD-ICCO-PRDM', 'Per Diem and Subsistence',      'PER_DIEM',            13000,'ICCO-ZW-2026'],
      ['CLC-BROT-2026', 'CLC-BROT-TRNG', 'Leadership Training',           'CAPACITY_BUILDING',   28000,'BROT-ZW-2026'],
      ['CLC-BROT-2026', 'CLC-BROT-MATL', 'Training Materials',            'PROCUREMENT',         14000,'BROT-ZW-2026'],
      ['TJP-DCA-2026',  'TJP-DCA-JUST',  'Transitional Justice Work',     'COMMUNITY_OUTREACH',  22000,'DCA-ZW-2026'],
      ['TJP-DCA-2026',  'TJP-DCA-TRVL',  'Community Travel',              'TRANSPORT',           13000,'DCA-ZW-2026'],
      ['WPB-HEKS-2026', 'WPB-HEKS-PROG', 'Women Peacebuilding Programmes','COMMUNITY_OUTREACH',  18000,'HEKS-ZW-2026'],
      ['WPB-HEKS-2026', 'WPB-HEKS-TRVL', 'Field Travel',                  'TRANSPORT',           10000,'HEKS-ZW-2026'],
    ];
    for (const [proj, code, name, cat, amt, donor] of cpjsBL) {
      await c.execute(
        'INSERT INTO budget_lines (budget_code,budget_name,donor_id,project_id,department_id,category,fiscal_year,allocated_amount,is_active,created_by,updated_at) VALUES (?,?,?,?,13,?,2026,?,1,?,NOW())',
        [code, name, cpjsD[donor], cpjsP[proj], cat, amt, createdBy]
      );
    }
    console.log(`  ✓ ${cpjsBL.length} budget lines`);

    // ── 14. HSD BUDGET LINES (2 per project = 46) ─────────────────────────
    console.log('\nCreating HSD budget lines...');
    const hsdBL = [
      ['CRP-UNICEF-2026',  'CRP-UNICEF-RESP', 'Emergency Response Activities',  'PROCUREMENT',        75000,'UNICEF-ZW-2026'],
      ['CRP-UNICEF-2026',  'CRP-UNICEF-MED',  'Medical Supplies and Equipment', 'PROCUREMENT',        45000,'UNICEF-ZW-2026'],
      ['WASH-UNICEF-2026', 'WASH-UNICEF-INF', 'WASH Infrastructure',            'PROCUREMENT',        65000,'UNICEF-ZW-2026'],
      ['WASH-UNICEF-2026', 'WASH-UNICEF-TRV', 'Field Operations Travel',        'TRANSPORT',          35000,'UNICEF-ZW-2026'],
      ['NSP-UNICEF-2026',  'NSP-UNICEF-NUTR', 'Nutrition Supplies',             'PROCUREMENT',        50000,'UNICEF-ZW-2026'],
      ['NSP-UNICEF-2026',  'NSP-UNICEF-FLD',  'Field Nutrition Activities',     'FIELD_OPERATIONS',   30000,'UNICEF-ZW-2026'],
      ['MHP-UNICEF-2026',  'MHP-UNICEF-HLT',  'Maternal Health Services',       'PROCUREMENT',        45000,'UNICEF-ZW-2026'],
      ['MHP-UNICEF-2026',  'MHP-UNICEF-TRV',  'Community Outreach Travel',      'TRANSPORT',          30000,'UNICEF-ZW-2026'],
      ['EFA-WFP-2026',     'EFA-WFP-FOOD',    'Food Commodity Procurement',     'PROCUREMENT',        95000,'WFP-ZW-2026'],
      ['EFA-WFP-2026',     'EFA-WFP-DIST',    'Food Distribution Logistics',    'TRANSPORT',          55000,'WFP-ZW-2026'],
      ['SFP-WFP-2026',     'SFP-WFP-MEAL',    'School Meal Supplies',           'MEAL',               60000,'WFP-ZW-2026'],
      ['SFP-WFP-2026',     'SFP-WFP-OPS',     'School Feeding Operations',      'FIELD_OPERATIONS',   30000,'WFP-ZW-2026'],
      ['LRP-WFP-2026',     'LRP-WFP-LIVE',    'Livelihoods Support Inputs',     'PROCUREMENT',        55000,'WFP-ZW-2026'],
      ['LRP-WFP-2026',     'LRP-WFP-TRN',     'Livelihood Skills Training',     'CAPACITY_BUILDING',  25000,'WFP-ZW-2026'],
      ['RSP-UNHCR-2026',   'RSP-UNHCR-SVC',   'Refugee Support Services',       'PROCUREMENT',        45000,'UNHCR-ZW-2026'],
      ['RSP-UNHCR-2026',   'RSP-UNHCR-TRV',   'Field Visits and Transport',     'TRANSPORT',          25000,'UNHCR-ZW-2026'],
      ['DRP-UNHCR-2026',   'DRP-UNHCR-DISP',  'Displacement Response',          'FIELD_OPERATIONS',   40000,'UNHCR-ZW-2026'],
      ['DRP-UNHCR-2026',   'DRP-UNHCR-ACCM',  'Emergency Accommodation',        'ACCOMMODATION',      25000,'UNHCR-ZW-2026'],
      ['PSI-UNHCR-2026',   'PSI-UNHCR-PSY',   'Psychosocial Activities',        'COMMUNITY_OUTREACH', 32000,'UNHCR-ZW-2026'],
      ['PSI-UNHCR-2026',   'PSI-UNHCR-TRV',   'Community Outreach Travel',      'TRANSPORT',          18000,'UNHCR-ZW-2026'],
      ['CPI-STC-2026',     'CPI-STC-CHLD',    'Child Protection Activities',    'FIELD_OPERATIONS',   55000,'STC-ZW-2026'],
      ['CPI-STC-2026',     'CPI-STC-TRN',     'Social Worker Training',         'CAPACITY_BUILDING',  30000,'STC-ZW-2026'],
      ['EIE-STC-2026',     'EIE-STC-EDU',     'Education Materials',            'PROCUREMENT',        45000,'STC-ZW-2026'],
      ['EIE-STC-2026',     'EIE-STC-TRV',     'School Visits and Field Work',   'TRANSPORT',          25000,'STC-ZW-2026'],
      ['ECD-STC-2026',     'ECD-STC-PROG',    'Early Childhood Activities',     'PROCUREMENT',        38000,'STC-ZW-2026'],
      ['ECD-STC-2026',     'ECD-STC-PRDM',    'Staff Per Diem and Subsistence', 'PER_DIEM',           22000,'STC-ZW-2026'],
      ['FSP-OXF-2026',     'FSP-OXF-FSEC',    'Food Security Interventions',    'PROCUREMENT',        42000,'OXF-ZW-2026'],
      ['FSP-OXF-2026',     'FSP-OXF-TRV',     'Field Operations Travel',        'TRANSPORT',          23000,'OXF-ZW-2026'],
      ['GBV-OXF-2026',     'GBV-OXF-RESP',    'GBV Response Activities',        'FIELD_OPERATIONS',   35000,'OXF-ZW-2026'],
      ['GBV-OXF-2026',     'GBV-OXF-SHLT',    'Safe Shelter Services',          'ACCOMMODATION',      20000,'OXF-ZW-2026'],
      ['CAP-CARE-2026',    'CAP-CARE-CLIM',   'Climate Adaptation Inputs',      'PROCUREMENT',        48000,'CARE-ZW-2026'],
      ['CAP-CARE-2026',    'CAP-CARE-TRN',    'Farmer Training and Extension',  'CAPACITY_BUILDING',  27000,'CARE-ZW-2026'],
      ['WEE-CARE-2026',    'WEE-CARE-ECO',    'Women Economic Activities',      'PROCUREMENT',        38000,'CARE-ZW-2026'],
      ['WEE-CARE-2026',    'WEE-CARE-TRV',    'Community Outreach Travel',      'TRANSPORT',          22000,'CARE-ZW-2026'],
      ['HAR-WV-2026',      'HAR-WV-HIV',      'HIV AIDS Programme Activities',  'FIELD_OPERATIONS',   52000,'WV-ZW-2026'],
      ['HAR-WV-2026',      'HAR-WV-MED',      'Medical and Health Supplies',    'PROCUREMENT',        28000,'WV-ZW-2026'],
      ['VCS-WV-2026',      'VCS-WV-CHLD',     'Child Support Activities',       'FIELD_OPERATIONS',   45000,'WV-ZW-2026'],
      ['VCS-WV-2026',      'VCS-WV-PRDM',     'Field Staff Per Diem',           'PER_DIEM',           25000,'WV-ZW-2026'],
      ['WSP-WV-2026',      'WSP-WV-WASH',     'WASH Construction Materials',    'PROCUREMENT',        60000,'WV-ZW-2026'],
      ['WSP-WV-2026',      'WSP-WV-TRV',      'Field Operations Travel',        'TRANSPORT',          30000,'WV-ZW-2026'],
      ['CAG-WV-2026',      'CAG-WV-AGRI',     'Agriculture Inputs',             'PROCUREMENT',        42000,'WV-ZW-2026'],
      ['CAG-WV-2026',      'CAG-WV-TRN',      'Farmer Training Workshops',      'CAPACITY_BUILDING',  23000,'WV-ZW-2026'],
      ['DRP2-FFH-2026',    'DRP2-FFH-DGHT',   'Drought Relief Supplies',        'PROCUREMENT',        36000,'FFH-ZW-2026'],
      ['DRP2-FFH-2026',    'DRP2-FFH-DIST',   'Relief Distribution Logistics',  'TRANSPORT',          19000,'FFH-ZW-2026'],
      ['SFS-FFH-2026',     'SFS-FFH-FARM',    'Smallholder Farm Inputs',        'PROCUREMENT',        30000,'FFH-ZW-2026'],
      ['SFS-FFH-2026',     'SFS-FFH-TRN',     'Farming Skills Training',        'CAPACITY_BUILDING',  15000,'FFH-ZW-2026'],
    ];
    for (const [proj, code, name, cat, amt, donor] of hsdBL) {
      await c.execute(
        'INSERT INTO budget_lines (budget_code,budget_name,donor_id,project_id,department_id,category,fiscal_year,allocated_amount,is_active,created_by,updated_at) VALUES (?,?,?,?,14,?,2026,?,1,?,NOW())',
        [code, name, hsdD[donor], hsdP[proj], cat, amt, createdBy]
      );
    }
    console.log(`  ✓ ${hsdBL.length} budget lines`);

    // ── 15. ADMIN BUDGET LINES ─────────────────────────────────────────────
    console.log('\nCreating Admin budget lines...');
    const adminBL = [
      ['ADM-MAINT-2026', 'Office Maintenance and Utilities', 'UTILITIES',    1500],
      ['ADM-HR-2026',    'HR Operations and Staff Welfare',  'STAFF_WELFARE', 1500],
      ['ADM-IT-2026',    'IT Support and Systems',           'IT_SYSTEMS',    1000],
      ['ADM-GEN-2026',   'General Administration',           'PROCUREMENT',   1000],
    ];
    for (const [code, name, cat, amt] of adminBL) {
      await c.execute(
        'INSERT INTO budget_lines (budget_code,budget_name,donor_id,project_id,department_id,category,fiscal_year,allocated_amount,is_active,created_by,updated_at) VALUES (?,?,?,?,17,?,2026,?,1,?,NOW())',
        [code, name, adminDonorId, adminProjectId, cat, amt, createdBy]
      );
    }
    console.log(`  ✓ ${adminBL.length} budget lines`);

    await c.execute('SET FOREIGN_KEY_CHECKS = 1');

    // ── SUMMARY ────────────────────────────────────────────────────────────
    const [[pc]] = await c.execute('SELECT COUNT(*) cnt FROM projects');
    const [[dc]] = await c.execute('SELECT COUNT(*) cnt FROM donors');
    const [[bc]] = await c.execute('SELECT COUNT(*) cnt FROM budget_lines');
    const [[uc]] = await c.execute('SELECT COUNT(*) cnt FROM users');
    const [[dpc]] = await c.execute('SELECT COUNT(*) cnt FROM departments');
    const depts = await c.execute('SELECT department_code, department_name FROM departments ORDER BY id');

    console.log('\n' + '═'.repeat(50));
    console.log('🎉 Database rebuild complete!');
    console.log('═'.repeat(50));
    console.log(`  Departments:  ${dpc.cnt}`);
    depts[0].forEach(d => console.log(`    - [${d.department_code}] ${d.department_name}`));
    console.log(`  Users:        ${uc.cnt}`);
    console.log(`  Partners:     ${dc.cnt}  (1 Admin + 10 CPJS + 8 HSD)`);
    console.log(`  Projects:     ${pc.cnt}  (1 Admin + 15 CPJS + 23 HSD)`);
    console.log(`  Budget Lines: ${bc.cnt}  (4 Admin + 30 CPJS + 46 HSD)`);
    console.log('═'.repeat(50));

  } catch (err) {
    await c.execute('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    console.error('\n❌ ERROR:', err.message);
    console.error(err.sql || '');
    process.exit(1);
  } finally {
    await c.end();
  }
}

main();
