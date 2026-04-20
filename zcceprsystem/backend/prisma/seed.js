/**
 * Database Seed Script
 * Creates initial data for the Finance Module ERP System using raw mysql2
 * Consistent with the rest of the application architecture
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Test user credentials - FOR DEVELOPMENT ONLY
const TEST_USERS = [
  {
    employee_id: 'EMP001',
    email: 'user@zccinzim.org',
    password: 'User@2026!',
    first_name: 'John',
    last_name: 'Requester',
    department_code: 'IT',
    role_name: 'GENERAL_USER'
  },
  {
    employee_id: 'EMP002',
    email: 'lead@zccinzim.org',
    password: 'Lead@2026!',
    first_name: 'Jane',
    last_name: 'Supervisor',
    department_code: 'IT',
    role_name: 'PROGRAM_LEAD'
  },
  {
    employee_id: 'EMP003',
    email: 'hop@zccinzim.org',
    password: 'Hop@2026!',
    first_name: 'Robert',
    last_name: 'Director',
    department_code: 'OPS',
    role_name: 'HEAD_OF_PROGRAMS'
  },
  {
    employee_id: 'EMP004',
    email: 'finance@zccinzim.org',
    password: 'Finance@2026!',
    first_name: 'Alice',
    last_name: 'Accountant',
    department_code: 'FIN',
    role_name: 'FINANCE_CLERK'
  },
  // Additional users for testing
  {
    employee_id: 'EMP005',
    email: 'user2@zccinzim.org',
    password: 'User2@2026!',
    first_name: 'Charlie',
    last_name: 'Staff',
    department_code: 'HR',
    role_name: 'GENERAL_USER'
  },
  {
    employee_id: 'EMP006',
    email: 'lead2@zccinzim.org',
    password: 'Lead2@2026!',
    first_name: 'Diana',
    last_name: 'Manager',
    department_code: 'HR',
    role_name: 'PROGRAM_LEAD'
  }
];

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Create database connection
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    // 1. Create Roles
    console.log('Creating roles...');
    const roles = [
      { role_name: 'GENERAL_USER', role_description: 'Can create and submit procurement requests' },
      { role_name: 'PROGRAM_LEAD', role_description: 'Supervisor - First level approval for department requests' },
      { role_name: 'HEAD_OF_PROGRAMS', role_description: 'Secondary approval authority' },
      { role_name: 'FINANCE_CLERK', role_description: 'Final approval authority and budget management' }
    ];

    for (const role of roles) {
      await connection.execute(
        `INSERT INTO roles (role_name, role_description) VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE role_description = VALUES(role_description)`,
        [role.role_name, role.role_description]
      );
    }
    console.log('✅ Roles created\n');

    // 2. Create Request Statuses
    console.log('Creating request statuses...');
    const statuses = [
      { status_name: 'DRAFT', status_description: 'Request saved but not submitted' },
      { status_name: 'PENDING_LEAD_APPROVAL', status_description: 'Awaiting Program Lead approval' },
      { status_name: 'PENDING_HOP_APPROVAL', status_description: 'Awaiting Head of Programs approval' },
      { status_name: 'PENDING_FINANCE_APPROVAL', status_description: 'Awaiting Finance Clerk final approval' },
      { status_name: 'APPROVED', status_description: 'Fully approved - Budget deducted' },
      { status_name: 'REJECTED', status_description: 'Request rejected at any stage' },
      { status_name: 'CANCELLED', status_description: 'Request cancelled by requester' },
      { status_name: 'DISPATCHED', status_description: 'Items have been dispatched' }
    ];

    for (const status of statuses) {
      await connection.execute(
        `INSERT INTO request_statuses (status_name, status_description) VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE status_description = VALUES(status_description)`,
        [status.status_name, status.status_description]
      );
    }
    console.log('✅ Request statuses created\n');

    // 3. Create Departments
    console.log('Creating departments...');
    const departments = [
      { department_name: 'Information Technology', department_code: 'IT', description: 'Technology and systems department' },
      { department_name: 'Human Resources', department_code: 'HR', description: 'Personnel management' },
      { department_name: 'Finance', department_code: 'FIN', description: 'Financial operations' },
      { department_name: 'Operations', department_code: 'OPS', description: 'Daily operations management' },
      { department_name: 'Marketing', department_code: 'MKT', description: 'Marketing and communications' },
      { department_name: 'Programs', department_code: 'PRG', description: 'Program management and delivery' }
    ];

    for (const dept of departments) {
      await connection.execute(
        `INSERT INTO departments (department_name, department_code, description, updated_at) 
         VALUES (?, ?, ?, NOW()) 
         ON DUPLICATE KEY UPDATE description = VALUES(description), updated_at = NOW()`,
        [dept.department_name, dept.department_code, dept.description]
      );
    }
    console.log('✅ Departments created\n');

    // 4. Create Test Users
    console.log('Creating test users...');
    console.log('─'.repeat(60));
    console.log('| EMAIL                      | PASSWORD       | ROLE            |');
    console.log('─'.repeat(60));

    for (const userData of TEST_USERS) {
      // Get department ID
      const [deptRows] = await connection.execute(
        'SELECT id FROM departments WHERE department_code = ?',
        [userData.department_code]
      );

      // Get role ID
      const [roleRows] = await connection.execute(
        'SELECT id FROM roles WHERE role_name = ?',
        [userData.role_name]
      );

      if (deptRows.length === 0 || roleRows.length === 0) {
        console.error(`Missing department or role for ${userData.email}`);
        continue;
      }

      const department_id = deptRows[0].id;
      const role_id = roleRows[0].id;
      const password_hash = await bcrypt.hash(userData.password, 10);

      await connection.execute(
        `INSERT INTO users (employee_id, email, password_hash, first_name, last_name, department_id, role_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           password_hash = VALUES(password_hash),
           first_name = VALUES(first_name),
           last_name = VALUES(last_name),
           department_id = VALUES(department_id),
           role_id = VALUES(role_id),
           updated_at = NOW()`,
        [userData.employee_id, userData.email, password_hash, userData.first_name, userData.last_name, department_id, role_id]
      );

      const paddedEmail = userData.email.padEnd(26);
      const paddedPassword = userData.password.padEnd(14);
      const paddedRole = userData.role_name.padEnd(15);
      console.log(`| ${paddedEmail} | ${paddedPassword} | ${paddedRole} |`);
    }
    console.log('─'.repeat(60));
    console.log('✅ Test users created\n');

    // 5. Create Donors
    console.log('Creating donors...');
    
    // Get finance clerk for created_by field
    const [financeClerkRows] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      ['finance@zccinzim.org']
    );
    const financeClerkId = financeClerkRows[0]?.id || null;
    
    const donors = [
      { 
        donor_code: 'USAID-2026', 
        donor_name: 'United States Agency for International Development (USAID)', 
        donor_type: 'GOVERNMENT',
        contact_person: 'John Smith',
        email: 'john.smith@usaid.gov',
        total_committed: 500000.00,
        currency_code: 'USD',
        fiscal_year: 2026,
        agreement_reference: 'USAID-ZIM-2026-001',
        country: 'United States'
      },
      { 
        donor_code: 'UKAID-2026', 
        donor_name: 'UK Aid - Foreign Commonwealth Development Office', 
        donor_type: 'GOVERNMENT',
        contact_person: 'Sarah Johnson',
        email: 'sarah.johnson@fcdo.gov.uk',
        total_committed: 350000.00,
        currency_code: 'GBP',
        fiscal_year: 2026,
        agreement_reference: 'FCDO-ZW-2026-078',
        country: 'United Kingdom'
      },
      { 
        donor_code: 'GFUND-2026', 
        donor_name: 'Global Health Fund', 
        donor_type: 'FOUNDATION',
        contact_person: 'Dr. Michael Chen',
        email: 'mchen@globalhealthfund.org',
        total_committed: 250000.00,
        currency_code: 'USD',
        fiscal_year: 2026,
        agreement_reference: 'GHF-2026-ZIM-45',
        country: 'Switzerland'
      },
      { 
        donor_code: 'BMGF-2026', 
        donor_name: 'Bill & Melinda Gates Foundation', 
        donor_type: 'FOUNDATION',
        contact_person: 'Emily Rodriguez',
        email: 'emily.r@gatesfoundation.org',
        total_committed: 400000.00,
        currency_code: 'USD',
        fiscal_year: 2026,
        agreement_reference: 'BMGF-INV-2026-1234',
        country: 'United States'
      },
      { 
        donor_code: 'EURED-2026', 
        donor_name: 'European Union - EuropeAid', 
        donor_type: 'GOVERNMENT',
        contact_person: 'Hans Mueller',
        email: 'hans.mueller@ec.europa.eu',
        total_committed: 300000.00,
        currency_code: 'EUR',
        fiscal_year: 2026,
        agreement_reference: 'EU-DEVCO-2026-Zimbabwe-89',
        country: 'Belgium'
      }
    ];

    const createdDonors = {};
    for (const donorData of donors) {
      await connection.execute(
        `INSERT INTO donors (
          donor_code, donor_name, donor_type, contact_person, email, 
          total_committed, currency_code, fiscal_year, agreement_reference, 
          country, created_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          total_committed = VALUES(total_committed),
          updated_at = NOW()`,
        [
          donorData.donor_code, donorData.donor_name, donorData.donor_type,
          donorData.contact_person, donorData.email, donorData.total_committed,
          donorData.currency_code, donorData.fiscal_year, donorData.agreement_reference,
          donorData.country, financeClerkId
        ]
      );

      const [donorRows] = await connection.execute(
        'SELECT id FROM donors WHERE donor_code = ?',
        [donorData.donor_code]
      );
      createdDonors[donorData.donor_code] = donorRows[0];
    }
    console.log('✅ Donors created\n');

    // 6. Create Budget Lines (linked to donors)
    console.log('Creating budget lines linked to donors...');

    // Get department IDs
    const [itDept] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['IT']);
    const [hrDept] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['HR']);
    const [opsDept] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['OPS']);
    const [finDept] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['FIN']);
    const [prgDept] = await connection.execute('SELECT id FROM departments WHERE department_code = ?', ['PRG']);

    const budgetLines = [
      // USAID Budget Lines (Total: $500,000)
      { budget_code: 'USAID-2026-OPS', budget_name: 'USAID - Operations & Programs', donor_code: 'USAID-2026', department_id: prgDept[0].id, category: 'Operations', allocated_amount: 200000.00 },
      { budget_code: 'USAID-2026-EQP', budget_name: 'USAID - Equipment & Infrastructure', donor_code: 'USAID-2026', department_id: opsDept[0].id, category: 'Equipment', allocated_amount: 150000.00 },
      { budget_code: 'USAID-2026-CAP', budget_name: 'USAID - Capacity Building', donor_code: 'USAID-2026', department_id: hrDept[0].id, category: 'Training', allocated_amount: 100000.00 },
      { budget_code: 'USAID-2026-ADM', budget_name: 'USAID - Admin & Overheads', donor_code: 'USAID-2026', department_id: finDept[0].id, category: 'Administration', allocated_amount: 50000.00 },
      
      // UK Aid Budget Lines (Total: £350,000)
      { budget_code: 'UKAID-2026-HLT', budget_name: 'UK Aid - Health Programs', donor_code: 'UKAID-2026', department_id: prgDept[0].id, category: 'Healthcare', allocated_amount: 150000.00 },
      { budget_code: 'UKAID-2026-EDU', budget_name: 'UK Aid - Education Initiatives', donor_code: 'UKAID-2026', department_id: prgDept[0].id, category: 'Education', allocated_amount: 120000.00 },
      { budget_code: 'UKAID-2026-SUP', budget_name: 'UK Aid - Supplies & Logistics', donor_code: 'UKAID-2026', department_id: opsDept[0].id, category: 'Supplies', allocated_amount: 80000.00 },
      
      // Global Health Fund Budget Lines (Total: $250,000)
      { budget_code: 'GFUND-2026-MED', budget_name: 'GHF - Medical Supplies', donor_code: 'GFUND-2026', department_id: opsDept[0].id, category: 'Medical', allocated_amount: 150000.00 },
      { budget_code: 'GFUND-2026-TRN', budget_name: 'GHF - Healthcare Training', donor_code: 'GFUND-2026', department_id: hrDept[0].id, category: 'Training', allocated_amount: 70000.00 },
      { budget_code: 'GFUND-2026-RES', budget_name: 'GHF - Research & M&E', donor_code: 'GFUND-2026', department_id: prgDept[0].id, category: 'Research', allocated_amount: 30000.00 },
      
      // Gates Foundation Budget Lines (Total: $400,000)
      { budget_code: 'BMGF-2026-WAT', budget_name: 'Gates - Water & Sanitation', donor_code: 'BMGF-2026', department_id: prgDept[0].id, category: 'Infrastructure', allocated_amount: 250000.00 },
      { budget_code: 'BMGF-2026-AGR', budget_name: 'Gates - Agriculture Development', donor_code: 'BMGF-2026', department_id: prgDept[0].id, category: 'Agriculture', allocated_amount: 100000.00 },
      { budget_code: 'BMGF-2026-TEC', budget_name: 'Gates - Technology & Innovation', donor_code: 'BMGF-2026', department_id: itDept[0].id, category: 'Technology', allocated_amount: 50000.00 },
      
      // EU Budget Lines (Total: €300,000)
      { budget_code: 'EURED-2026-GOV', budget_name: 'EU - Governance & Rights', donor_code: 'EURED-2026', department_id: prgDept[0].id, category: 'Governance', allocated_amount: 120000.00 },
      { budget_code: 'EURED-2026-ECO', budget_name: 'EU - Economic Development', donor_code: 'EURED-2026', department_id: prgDept[0].id, category: 'Economic', allocated_amount: 100000.00 },
      { budget_code: 'EURED-2026-ENV', budget_name: 'EU - Environmental Protection', donor_code: 'EURED-2026', department_id: opsDept[0].id, category: 'Environment', allocated_amount: 80000.00 }
    ];

    for (const budget of budgetLines) {
      const donor = createdDonors[budget.donor_code];
      
      await connection.execute(
        `INSERT INTO budget_lines (
          budget_code, budget_name, donor_id, department_id, category, 
          fiscal_year, allocated_amount, created_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          allocated_amount = VALUES(allocated_amount),
          updated_at = NOW()`,
        [
          budget.budget_code, budget.budget_name, donor.id, budget.department_id,
          budget.category, 2026, budget.allocated_amount, financeClerkId
        ]
      );
    }
    
    // Update donor total_allocated
    for (const [donorCode, donor] of Object.entries(createdDonors)) {
      const totalAllocated = budgetLines
        .filter(b => b.donor_code === donorCode)
        .reduce((sum, b) => sum + b.allocated_amount, 0);
      
      await connection.execute(
        'UPDATE donors SET total_allocated = ?, updated_at = NOW() WHERE id = ?',
        [totalAllocated, donor.id]
      );
    }
    
    console.log('✅ Budget lines created\n');

    console.log('🎉 Database seeding completed successfully!\n');
    
    // Print summary
    const [userCount] = await connection.execute('SELECT COUNT(*) as count FROM users');
    const [deptCount] = await connection.execute('SELECT COUNT(*) as count FROM departments');
    const [donorCount] = await connection.execute('SELECT COUNT(*) as count FROM donors');
    const [budgetCount] = await connection.execute('SELECT COUNT(*) as count FROM budget_lines');
    
    console.log('Summary:');
    console.log(`  - Users: ${userCount[0].count}`);
    console.log(`  - Departments: ${deptCount[0].count}`);
    console.log(`  - Donors: ${donorCount[0].count}`);
    console.log(`  - Budget Lines: ${budgetCount[0].count}`);

  } finally {
    await connection.end();
  }
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  });
