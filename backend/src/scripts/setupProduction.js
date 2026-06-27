/**
 * PRODUCTION SETUP SCRIPT
 * ========================
 * - Clears ALL requests, projects, donors, and non-admin users
 * - Resets the ADMIN-INT donor to zero (keeps it for internal use)
 * - Creates the 4 correct departments
 * - Adds all 38 production users with exact credentials
 *
 * Run: node src/scripts/setupProduction.js
 * (from the backend folder, with .env configured)
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { name: 'Admin and HR',                          code: 'AHR',  desc: 'Administration and Human Resources' },
  { name: 'Church Peace and Just Societies',        code: 'CPJS', desc: 'Church Peace and Just Societies' },
  { name: 'Finance and Organization Sustainability',code: 'FOS',  desc: 'Finance and Organization Sustainability' },
  { name: 'Humanitarian Services and Diakonia',     code: 'HSD',  desc: 'Humanitarian Services and Diakonia' },
];

// ─── USERS (exact as provided) ────────────────────────────────────────────────
// role values must match roles table: GENERAL_USER | PROGRAM_LEAD | HEAD_OF_PROGRAMS | FINANCE_CLERK | PROCUREMENT_OFFICER | PROCUREMENT_COMMITTEE
const USERS = [
  // Admin and HR
  { id:'AHR001', email:'temptation.vheremu@zccinzim.org', password:'Unity#ZccPower7',    first:'Temptation', last:'Vheremu',          dept:'AHR',  role:'HEAD_OF_PROGRAMS' },
  { id:'AHR002', email:'lynn.gwenzi@zccinzim.org',        password:'Grace&Truth@ZCC',    first:'Lynn',        last:'Gwenzi',           dept:'AHR',  role:'PROCUREMENT_OFFICER' },
  { id:'AHR003', email:'primrose.matava@zccinzim.org',    password:'!Grace25@',           first:'Primrose',    last:'Matava',           dept:'AHR',  role:'PROCUREMENT_OFFICER' },
  { id:'AHR004', email:'batson.ndava@zccinzim.org',       password:'Zcc_Church#2025',    first:'Batson',      last:'Ndava',            dept:'AHR',  role:'GENERAL_USER' },
  { id:'AHR005', email:'shephard.tengule@zccinzim.org',   password:'Faith26#01',          first:'Shephard',    last:'Tengule',          dept:'AHR',  role:'GENERAL_USER' },
  // Church Peace and Just Societies
  { id:'CPJS001',email:'onias.munamati@zccinzim.org',     password:'@HolyZcc!Rise26',    first:'Onias',       last:'Munamati',         dept:'CPJS', role:'PROGRAM_LEAD' },
  { id:'CPJS002',email:'admire.mutizwa@zccinzim.org',     password:'?Mutizwa4justice',   first:'Admire',      last:'Mutizwa',          dept:'CPJS', role:'PROGRAM_LEAD' },
  { id:'CPJS003',email:'michael.fatini@zccinzim.org',     password:'Just1ce!',            first:'Michael',     last:'Fatini',           dept:'CPJS', role:'GENERAL_USER' },
  { id:'CPJS004',email:'karen.manzera@zccinzim.org',      password:'Unity24@',            first:'Karen',       last:'Manzera',          dept:'CPJS', role:'GENERAL_USER' },
  { id:'CPJS005',email:'davison.marenga@zccinzim.org',    password:'Zcc@GraceFlow9',     first:'Davison',     last:'Marenga',          dept:'CPJS', role:'GENERAL_USER' },
  { id:'CPJS006',email:'annie.mbewe@zccinzim.org',        password:'Bless7@!',            first:'Annie',       last:'Mbewe',            dept:'CPJS', role:'GENERAL_USER' },
  { id:'CPJS007',email:'promise.mupfigo@zccinzim.org',    password:'Mercy27!',            first:'Promise',     last:'Mupfigo',          dept:'CPJS', role:'GENERAL_USER' },
  { id:'CPJS008',email:'caroline.mutsago@zccinzim.org',   password:'Hope26#?',            first:'Caroline',    last:'Mutsago',          dept:'CPJS', role:'GENERAL_USER' },
  // Finance and Organization Sustainability
  { id:'FOS001', email:'tafadzwa.chakuzira@zccinzim.org', password:'Zcc#HolyPath24',     first:'Tafadzwa',    last:'Chakuzira',        dept:'FOS',  role:'HEAD_OF_PROGRAMS' },
  { id:'FOS002', email:'bryne.nhendere@zccinzim.org',     password:'Zion_Trust#Zcc',     first:'Bryne',       last:'Nhendere',         dept:'FOS',  role:'PROGRAM_LEAD' },
  { id:'FOS003', email:'abraham.zvinoitavamwe@zccinzim.org',password:'Faith4ZCC*Rise',   first:'Abraham',     last:'Zvinoitavamwe',    dept:'FOS',  role:'PROGRAM_LEAD' },
  { id:'FOS004', email:'bridget.guraukama@zccinzim.org',  password:'Pr@iseZCC_0425',     first:'Bridget',     last:'Guraukama',        dept:'FOS',  role:'FINANCE_CLERK' },
  { id:'FOS005', email:'sean.mkosana@zccinzim.org',       password:'ZccSecure!0525',     first:'Sean',        last:'Mkosana',          dept:'FOS',  role:'FINANCE_CLERK' },
  { id:'FOS006', email:'tatenda.muchena@zccinzim.org',    password:'Glory!Zcc#2025',     first:'Tatenda',     last:'Muchena',          dept:'FOS',  role:'FINANCE_CLERK' },
  { id:'FOS007', email:'nyasha.shonhiwa@zccinzim.org',    password:'Church7!',            first:'Nyasha',      last:'Shonhiwa',         dept:'FOS',  role:'FINANCE_CLERK' },
  // Humanitarian Services and Diakonia
  { id:'HSD001', email:'wellington.makunura@zccinzim.org',password:'Glory2Zcc#2025',     first:'Wellington',  last:'Makunura',         dept:'HSD',  role:'PROCUREMENT_COMMITTEE' },
  { id:'HSD002', email:'maria.dendere@zccinzim.org',      password:'Zion2Zcc#2025',      first:'Maria',       last:'Dendere',          dept:'HSD',  role:'HEAD_OF_PROGRAMS' },
  { id:'HSD003', email:'kuitakwashe.nhongo@zccinzim.org', password:'@Praise237!',         first:'Kuitakwashe', last:'Nhongo',           dept:'HSD',  role:'PROGRAM_LEAD' },
  { id:'HSD004', email:'pafunge.chindondo@zccinzim.org',  password:'Praise7!',            first:'Pafunge',     last:'Chindondo',        dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD005', email:'elizabeth.danga@zccinzim.org',    password:'Zcc$RiseUp@365',     first:'Elizabeth',   last:'Danga',            dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD006', email:'victor.govo@zccinzim.org',        password:'?Safety%1964',        first:'Victor',      last:'Govo',             dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD007', email:'tanatswa.hove@zccinzim.org',      password:'Zcc#HolyPath25!',    first:'Tanatswa',    last:'Hove',             dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD008', email:'godrey.hungwe@zccinzim.org',      password:'Glory23#',            first:'Godfrey',     last:'Hungwe',           dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD009', email:'shalom.machengete@zccinzim.org',  password:'Peace25!',            first:'Shalom',      last:'Machengete',       dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD010', email:'tsitsi.mafarachisi@zccinzim.org', password:'BlessedZCC#22!',     first:'Tsitsi',      last:'Mafarachisi',      dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD011', email:'audrey.moyo@zccinzim.org',        password:'Zcc@StandFirm99',    first:'Audrey',      last:'Moyo',             dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD012', email:'tonderai.munamati@zccinzim.org',  password:'Str0ngBelief_Zcc',   first:'Tonderai',    last:'Munamati',         dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD013', email:'taitus.mutare@zccinzim.org',      password:'Faith4Zcc_Rise1_',   first:'Taitus',      last:'Mutare',           dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD014', email:'lewis.mutungura@zccinzim.org',    password:'ZccFaith#Now77',     first:'Lewis',       last:'Mutungura',        dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD015', email:'lesley.ncube@zccinzim.org',       password:'Zcc@2025Secure!',    first:'Lesley',      last:'Ncube',            dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD016', email:'miriam.nkambule@zccinzim.org',    password:'TrustZcc#2026',      first:'Miriam',      last:'Nkambule',         dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD017', email:'varaidzo.sosa@zccinzim.org',      password:'W0rsh1p&UnityZCC',   first:'Varaidzo',    last:'Sosa',             dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD018', email:'justice.tapatapa@zccinzim.org',   password:'2025_ZccHope!',      first:'Justice',     last:'Tapatapa',         dept:'HSD',  role:'GENERAL_USER' },
  { id:'HSD019', email:'tariro.zhou@zccinzim.org',        password:'Zcc@Unity&Power1',   first:'Tariro',      last:'Zhou',             dept:'HSD',  role:'GENERAL_USER' },
];

async function run() {
  console.log('\n🚀 ZCC EPR — Production Setup Script\n' + '='.repeat(50));

  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'finance_erp',
    multipleStatements: true,
  });

  try {
    // ── STEP 1: Disable FK checks and clear all operational data ──────────────
    console.log('\n[1/5] Clearing all operational data...');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    const tables = [
      'reconciliation_items','reconciliations',
      'approval_logs','attachments',
      'per_diem_claims',
      'budget_transactions',
      'request_items','requests',
      'budget_lines','projects',
    ];
    for (const t of tables) {
      try { await connection.execute(`DELETE FROM \`${t}\``); console.log(`  ✓ Cleared ${t}`); }
      catch (e) { console.log(`  ⚠  Skipped ${t} (table may not exist)`); }
    }

    // Clear notifications
    try { await connection.execute('DELETE FROM notifications'); } catch {}
    // Clear leave tables if they exist
    try { await connection.execute('DELETE FROM leave_approvals'); } catch {}
    try { await connection.execute('DELETE FROM leave_requests'); } catch {}

    // Clear all donors EXCEPT the ADMIN-INT one
    await connection.execute(`DELETE FROM donors WHERE donor_code != 'ADMIN-INT'`);
    // Reset the admin donor to zero
    await connection.execute(`
      UPDATE donors
      SET total_committed = 0, total_spent = 0, total_allocated = 0, updated_at = NOW()
      WHERE donor_code = 'ADMIN-INT'
    `);
    console.log('  ✓ Cleared donors (kept ADMIN-INT, reset to 0)');

    // Clear all users except the superadmin accounts
    await connection.execute(`DELETE FROM users WHERE email NOT IN ('sysadmin@zccinzim.org', 'admin@zccinzim.org')`);
    console.log('  ✓ Cleared users (kept superadmin accounts)');

    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Data cleared\n');

    // ── STEP 2: Ensure the 4 departments exist ────────────────────────────────
    console.log('[2/5] Creating departments...');
    for (const d of DEPARTMENTS) {
      await connection.execute(
        `INSERT INTO departments (department_name, department_code, description, updated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE department_name = VALUES(department_name), description = VALUES(description), updated_at = NOW()`,
        [d.name, d.code, d.desc]
      );
      console.log(`  ✓ ${d.code} — ${d.name}`);
    }
    console.log('✅ Departments ready\n');

    // ── STEP 3: Fetch dept IDs and role IDs ───────────────────────────────────
    console.log('[3/5] Resolving IDs...');
    const deptMap = {};
    for (const d of DEPARTMENTS) {
      const [rows] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', [d.code]);
      if (!rows.length) throw new Error(`Department not found: ${d.code}`);
      deptMap[d.code] = rows[0].id;
    }

    const roleNames = ['GENERAL_USER','PROGRAM_LEAD','HEAD_OF_PROGRAMS','FINANCE_CLERK','PROCUREMENT_OFFICER','PROCUREMENT_COMMITTEE','ADMIN'];
    const roleMap = {};
    for (const r of roleNames) {
      const [rows] = await connection.execute('SELECT id FROM roles WHERE role_name = ?', [r]);
      if (rows.length) roleMap[r] = rows[0].id;
    }
    console.log('✅ IDs resolved\n');

    // ── STEP 4: Insert all 38 users ───────────────────────────────────────────
    console.log('[4/5] Creating users...');
    let created = 0, updated = 0;
    for (const u of USERS) {
      const dept_id = deptMap[u.dept];
      const role_id = roleMap[u.role];
      if (!dept_id) { console.error(`  ✗ Unknown dept "${u.dept}" for ${u.email}`); continue; }
      if (!role_id) { console.error(`  ✗ Unknown role "${u.role}" for ${u.email}`); continue; }

      const hash = await bcrypt.hash(u.password, 12);

      const [existing] = await connection.execute('SELECT id FROM users WHERE email = ?', [u.email]);
      if (existing.length) {
        await connection.execute(
          `UPDATE users SET employee_id=?, password_hash=?, first_name=?, last_name=?, department_id=?, role_id=?, is_active=TRUE, updated_at=NOW() WHERE email=?`,
          [u.id, hash, u.first, u.last, dept_id, role_id, u.email]
        );
        console.log(`  ↺ Updated  ${u.email}`);
        updated++;
      } else {
        await connection.execute(
          `INSERT INTO users (employee_id, email, password_hash, first_name, last_name, department_id, role_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
          [u.id, u.email, hash, u.first, u.last, dept_id, role_id]
        );
        console.log(`  ✓ Created  ${u.email}`);
        created++;
      }
    }
    console.log(`\n✅ Users done — ${created} created, ${updated} updated\n`);

    // ── STEP 5: Summary ───────────────────────────────────────────────────────
    console.log('[5/5] Summary');
    const [userCount]   = await connection.execute('SELECT COUNT(*) AS c FROM users');
    const [donorCount]  = await connection.execute('SELECT COUNT(*) AS c FROM donors');
    const [projCount]   = await connection.execute('SELECT COUNT(*) AS c FROM projects');
    console.log(`  Users in DB   : ${userCount[0].c}`);
    console.log(`  Donors in DB  : ${donorCount[0].c}`);
    console.log(`  Projects in DB: ${projCount[0].c}`);
    console.log('\n🎉 Production setup complete!\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

run();
