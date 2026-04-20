/**
 * Database Reset & Reseed Script
 * Clears all request/approval data, updates departments, creates proper users
 * Run: node src/scripts/resetAndReseed.js
 */
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function resetAndReseed() {
  console.log('🔄 Starting database reset and reseed...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'finance_erp'
  });

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Clear all requests, approvals, and related data
    // ═══════════════════════════════════════════════════════════════
    console.log('🗑️  Clearing all request and approval data...');
    
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    
    // Clear in order of dependencies
    await connection.execute('DELETE FROM reconciliation_items');
    await connection.execute('DELETE FROM reconciliations');
    await connection.execute('DELETE FROM approval_logs');
    await connection.execute('DELETE FROM attachments');
    await connection.execute('DELETE FROM budget_transactions');
    await connection.execute('DELETE FROM request_items');
    await connection.execute('DELETE FROM requests');
    
    // Reset budget spent amounts back to 0
    await connection.execute('UPDATE budget_lines SET spent_amount = 0, updated_at = NOW()');
    await connection.execute('UPDATE donors SET total_spent = 0, updated_at = NOW()');
    
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('✅ All requests, approvals, and transactions cleared\n');

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Update departments to CPJS, HSD, Admin and Finance
    // ═══════════════════════════════════════════════════════════════
    console.log('🏢 Updating departments...');
    
    // First, remove old departments (IT, HR, OPS, MKT, PRG) 
    // But need to handle foreign key refs — update budget_lines and users first
    
    // Create the 3 correct departments
    const departments = [
      { 
        department_name: 'Church Peace and Just Societies', 
        department_code: 'CPJS', 
        description: 'Church Peace and Just Societies department' 
      },
      { 
        department_name: 'Humanitarian Services and Diakonia', 
        department_code: 'HSD', 
        description: 'Humanitarian Services and Diakonia department' 
      },
      { 
        department_name: 'Admin and Finance', 
        department_code: 'AF', 
        description: 'Administration and Finance department (includes IT)' 
      }
    ];

    // Insert new departments
    for (const dept of departments) {
      await connection.execute(
        `INSERT INTO departments (department_name, department_code, description, updated_at) 
         VALUES (?, ?, ?, NOW()) 
         ON DUPLICATE KEY UPDATE department_name = VALUES(department_name), description = VALUES(description), updated_at = NOW()`,
        [dept.department_name, dept.department_code, dept.description]
      );
    }

    // Get department IDs
    const [cpjsDept] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['CPJS']);
    const [hsdDept] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['HSD']);
    const [afDept] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['AF']);

    const cpjsId = cpjsDept[0].id;
    const hsdId = hsdDept[0].id;
    const afId = afDept[0].id;

    // Reassign budget lines from old departments to appropriate new ones
    // IT → Admin and Finance
    const [itDeptRow] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['IT']);
    if (itDeptRow.length > 0) {
      await connection.execute('UPDATE budget_lines SET department_id = ? WHERE department_id = ?', [afId, itDeptRow[0].id]);
      await connection.execute('UPDATE users SET department_id = ? WHERE department_id = ?', [afId, itDeptRow[0].id]);
    }
    
    // Finance → Admin and Finance
    const [finDeptRow] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['FIN']);
    if (finDeptRow.length > 0) {
      await connection.execute('UPDATE budget_lines SET department_id = ? WHERE department_id = ?', [afId, finDeptRow[0].id]);
      await connection.execute('UPDATE users SET department_id = ? WHERE department_id = ?', [afId, finDeptRow[0].id]);
    }

    // HR → Admin and Finance
    const [hrDeptRow] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['HR']);
    if (hrDeptRow.length > 0) {
      await connection.execute('UPDATE budget_lines SET department_id = ? WHERE department_id = ?', [afId, hrDeptRow[0].id]);
      await connection.execute('UPDATE users SET department_id = ? WHERE department_id = ?', [afId, hrDeptRow[0].id]);
    }

    // Operations → HSD
    const [opsDeptRow] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['OPS']);
    if (opsDeptRow.length > 0) {
      await connection.execute('UPDATE budget_lines SET department_id = ? WHERE department_id = ?', [hsdId, opsDeptRow[0].id]);
      await connection.execute('UPDATE users SET department_id = ? WHERE department_id = ?', [hsdId, opsDeptRow[0].id]);
    }

    // Programs → CPJS
    const [prgDeptRow] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['PRG']);
    if (prgDeptRow.length > 0) {
      await connection.execute('UPDATE budget_lines SET department_id = ? WHERE department_id = ?', [cpjsId, prgDeptRow[0].id]);
      await connection.execute('UPDATE users SET department_id = ? WHERE department_id = ?', [cpjsId, prgDeptRow[0].id]);
    }

    // Marketing → CPJS
    const [mktDeptRow] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['MKT']);
    if (mktDeptRow.length > 0) {
      await connection.execute('UPDATE budget_lines SET department_id = ? WHERE department_id = ?', [cpjsId, mktDeptRow[0].id]);
      await connection.execute('UPDATE users SET department_id = ? WHERE department_id = ?', [cpjsId, mktDeptRow[0].id]);
    }

    // Now delete old departments
    for (const code of ['IT', 'HR', 'FIN', 'OPS', 'MKT', 'PRG']) {
      await connection.execute('DELETE FROM departments WHERE department_code = ? AND department_code NOT IN (?, ?, ?)', 
        [code, 'CPJS', 'HSD', 'AF']);
    }

    console.log('✅ Departments updated: CPJS, HSD, Admin and Finance\n');

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Ensure roles exist
    // ═══════════════════════════════════════════════════════════════
    console.log('👥 Ensuring roles exist...');
    const roles = [
      { role_name: 'ADMIN', role_description: 'System administrator with full access' },
      { role_name: 'GENERAL_USER', role_description: 'Can create and submit procurement requests' },
      { role_name: 'PROGRAM_LEAD', role_description: 'First level approval for department requests' },
      { role_name: 'HEAD_OF_PROGRAMS', role_description: 'Alternative first level approval (cross-department)' },
      { role_name: 'FINANCE_CLERK', role_description: 'Final approval and budget management' }
    ];

    for (const role of roles) {
      await connection.execute(
        `INSERT INTO roles (role_name, role_description) VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE role_description = VALUES(role_description)`,
        [role.role_name, role.role_description]
      );
    }
    console.log('✅ Roles verified\n');

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Create users for each department
    // ═══════════════════════════════════════════════════════════════
    console.log('👤 Creating users...');

    // Get role IDs
    const getRoleId = async (roleName) => {
      const [rows] = await connection.execute('SELECT id FROM roles WHERE role_name = ?', [roleName]);
      return rows[0]?.id;
    };

    const generalUserId = await getRoleId('GENERAL_USER');
    const programLeadId = await getRoleId('PROGRAM_LEAD');
    const hopId = await getRoleId('HEAD_OF_PROGRAMS');
    const financeClerkId = await getRoleId('FINANCE_CLERK');
    const adminRoleId = await getRoleId('ADMIN');

    const users = [
      // CPJS Department Users
      {
        employee_id: 'CPJS001',
        email: 'cpjs.user@zccinzim.org',
        password: 'Cpjs@2026!',
        first_name: 'Tendai',
        last_name: 'Moyo',
        department_id: cpjsId,
        role_id: generalUserId
      },
      {
        employee_id: 'CPJS002',
        email: 'cpjs.lead@zccinzim.org',
        password: 'CpjsLead@2026!',
        first_name: 'Rumbidzai',
        last_name: 'Chirwa',
        department_id: cpjsId,
        role_id: programLeadId
      },

      // HSD Department Users
      {
        employee_id: 'HSD001',
        email: 'hsd.user@zccinzim.org',
        password: 'Hsd@2026!',
        first_name: 'Blessing',
        last_name: 'Ncube',
        department_id: hsdId,
        role_id: generalUserId
      },
      {
        employee_id: 'HSD002',
        email: 'hsd.lead@zccinzim.org',
        password: 'HsdLead@2026!',
        first_name: 'Farai',
        last_name: 'Mutasa',
        department_id: hsdId,
        role_id: programLeadId
      },

      // Admin and Finance Department Users
      {
        employee_id: 'AF001',
        email: 'admin.user@zccinzim.org',
        password: 'Admin@2026!',
        first_name: 'Tatenda',
        last_name: 'Makoni',
        department_id: afId,
        role_id: generalUserId
      },
      {
        employee_id: 'AF002',
        email: 'finance@zccinzim.org',
        password: 'Finance@2026!',
        first_name: 'Alice',
        last_name: 'Accountant',
        department_id: afId,
        role_id: financeClerkId
      },

      // Cross-department roles
      {
        employee_id: 'HOP001',
        email: 'hop@zccinzim.org',
        password: 'Hop@2026!',
        first_name: 'Robert',
        last_name: 'Director',
        department_id: afId,
        role_id: hopId
      },

      // System Admin
      {
        employee_id: 'SYS001',
        email: 'sysadmin@zccinzim.org',
        password: 'SysAdmin@2026!',
        first_name: 'System',
        last_name: 'Administrator',
        department_id: afId,
        role_id: adminRoleId
      }
    ];

    // Delete old users that don't match new emails
    const newEmails = users.map(u => u.email);
    const [existingUsers] = await connection.execute('SELECT id, email FROM users');
    for (const eu of existingUsers) {
      if (!newEmails.includes(eu.email)) {
        await connection.execute('DELETE FROM users WHERE id = ?', [eu.id]);
      }
    }

    console.log('─'.repeat(70));
    console.log('| EMAIL                           | PASSWORD         | ROLE            | DEPT  |');
    console.log('─'.repeat(70));

    for (const userData of users) {
      const password_hash = await bcrypt.hash(userData.password, 10);

      await connection.execute(
        `INSERT INTO users (employee_id, email, password_hash, first_name, last_name, department_id, role_id, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW())
         ON DUPLICATE KEY UPDATE 
           password_hash = VALUES(password_hash),
           first_name = VALUES(first_name),
           last_name = VALUES(last_name),
           department_id = VALUES(department_id),
           role_id = VALUES(role_id),
           employee_id = VALUES(employee_id),
           is_active = TRUE,
           updated_at = NOW()`,
        [userData.employee_id, userData.email, password_hash, userData.first_name, userData.last_name, userData.department_id, userData.role_id]
      );

      // Get department code for display
      const [deptRow] = await connection.execute('SELECT department_code FROM departments WHERE id = ?', [userData.department_id]);
      const [roleRow] = await connection.execute('SELECT role_name FROM roles WHERE id = ?', [userData.role_id]);
      
      const paddedEmail = userData.email.padEnd(31);
      const paddedPassword = userData.password.padEnd(16);
      const paddedRole = (roleRow[0]?.role_name || '').padEnd(15);
      const deptCode = deptRow[0]?.department_code || '';
      console.log(`| ${paddedEmail} | ${paddedPassword} | ${paddedRole} | ${deptCode.padEnd(5)} |`);
    }
    console.log('─'.repeat(70));
    console.log('✅ Users created\n');

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Reassign budget line created_by to finance user
    // ═══════════════════════════════════════════════════════════════
    const [finUser] = await connection.execute('SELECT id FROM users WHERE email = ?', ['finance@zccinzim.org']);
    if (finUser.length > 0) {
      await connection.execute('UPDATE budget_lines SET created_by = ? WHERE created_by IS NULL OR created_by NOT IN (SELECT id FROM users)', 
        [finUser[0].id]);
      await connection.execute('UPDATE donors SET created_by = ? WHERE created_by IS NULL OR created_by NOT IN (SELECT id FROM users)',
        [finUser[0].id]);
    }

    // ═══════════════════════════════════════════════════════════════
    // Print summary
    // ═══════════════════════════════════════════════════════════════
    const [userCount] = await connection.execute('SELECT COUNT(*) as count FROM users');
    const [deptCount] = await connection.execute('SELECT COUNT(*) as count FROM departments');
    const [donorCount] = await connection.execute('SELECT COUNT(*) as count FROM donors');
    const [budgetCount] = await connection.execute('SELECT COUNT(*) as count FROM budget_lines');
    const [reqCount] = await connection.execute('SELECT COUNT(*) as count FROM requests');

    console.log('\n📊 Summary:');
    console.log(`  - Users: ${userCount[0].count}`);
    console.log(`  - Departments: ${deptCount[0].count}`);
    console.log(`  - Donors: ${donorCount[0].count}`);
    console.log(`  - Budget Lines: ${budgetCount[0].count}`);
    console.log(`  - Requests: ${reqCount[0].count} (should be 0)`);
    console.log('\n🎉 Database reset and reseed completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

resetAndReseed();
