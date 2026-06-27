/**
 * Seed Committee Members Script
 * Creates 3 PROCUREMENT_COMMITTEE accounts with distinct committee seats:
 *   - HSD         → hsd.committee@zccinzim.org       / Committee@2026!
 *   - CPJS        → cpjs.committee@zccinzim.org      / Committee@2026!
 *   - FINANCE_ADMIN → finadmin.committee@zccinzim.org / Committee@2026!
 *
 * Usage: cd backend && node src/scripts/seedCommitteeMembers.js
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

const COMMITTEE_MEMBERS = [
  {
    employee_id: 'CMT-001',
    first_name: 'HSD',
    last_name: 'Representative',
    email: 'hsd.committee@zccinzim.org',
    password: 'Committee@2026!',
    committee_seat: 'HSD',
    department_code: 'HSD'
  },
  {
    employee_id: 'CMT-002',
    first_name: 'CPJS',
    last_name: 'Representative',
    email: 'cpjs.committee@zccinzim.org',
    password: 'Committee@2026!',
    committee_seat: 'CPJS',
    department_code: 'CPJS'
  },
  {
    employee_id: 'CMT-003',
    first_name: 'Finance Admin',
    last_name: 'Representative',
    email: 'finadmin.committee@zccinzim.org',
    password: 'Committee@2026!',
    committee_seat: 'FINANCE_ADMIN',
    department_code: 'AF'
  }
];

async function seedCommitteeMembers() {
  console.log('🌱 Seeding procurement committee members...\n');

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'finance_erp'
    });

    // Ensure committee_seat column exists (MySQL 8.0 compatible)
    const [cols] = await connection.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'committee_seat'`
    );
    if (cols.length === 0) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN committee_seat ENUM('HSD', 'CPJS', 'FINANCE_ADMIN') NULL DEFAULT NULL`
      );
      console.log('✓ committee_seat column added');
    } else {
      console.log('✓ committee_seat column already exists');
    }

    // Ensure proc_committee_votes table exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS proc_committee_votes (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        request_id      INT NOT NULL,
        voter_id        INT NOT NULL,
        committee_seat  ENUM('HSD', 'CPJS', 'FINANCE_ADMIN') NOT NULL,
        vote            ENUM('APPROVED', 'REJECTED') NOT NULL,
        justification   TEXT,
        voted_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_voter_request  (request_id, voter_id),
        UNIQUE KEY uq_seat_request   (request_id, committee_seat),
        FOREIGN KEY (request_id) REFERENCES proc_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (voter_id)   REFERENCES users(id),
        INDEX idx_votes_request (request_id)
      )
    `);
    console.log('✓ proc_committee_votes table ensured\n');

    for (const member of COMMITTEE_MEMBERS) {
      // Check if user already exists
      const [existing] = await connection.execute(
        'SELECT id FROM users WHERE email = ?',
        [member.email]
      );

      if (existing.length > 0) {
        // Update committee_seat if user already exists
        const [updRoleRows] = await connection.execute(
          "SELECT id FROM roles WHERE role_name = 'PROCUREMENT_COMMITTEE'"
        );
        const updRoleId = updRoleRows.length > 0 ? updRoleRows[0].id : 18;
        await connection.execute(
          'UPDATE users SET committee_seat = ?, role_id = ? WHERE email = ?',
          [member.committee_seat, updRoleId, member.email]
        );
        console.log(`↻ Updated existing user: ${member.email} (seat: ${member.committee_seat})`);
        continue;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(member.password, 10);

      // Find or create department
      const [deptRows] = await connection.execute(
        'SELECT id FROM departments WHERE department_code = ?',
        [member.department_code]
      );
      const deptId = deptRows.length > 0 ? deptRows[0].id : null;

      // Find role_id
      const [roleRows] = await connection.execute(
        "SELECT id FROM roles WHERE role_name = 'PROCUREMENT_COMMITTEE'"
      );
      const roleId = roleRows.length > 0 ? roleRows[0].id : null;

      // Insert user
      await connection.execute(
        `INSERT INTO users 
          (employee_id, first_name, last_name, email, password_hash, role_id, department_id, committee_seat, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [
          member.employee_id,
          member.first_name,
          member.last_name,
          member.email,
          passwordHash,
          roleId || 18,
          deptId || 15,
          member.committee_seat
        ]
      );
      console.log(`✓ Created: ${member.email} | Seat: ${member.committee_seat} | Password: ${member.password}`);
    }

    console.log('\n✅ Committee member seeding complete!');
    console.log('   Login credentials:');
    COMMITTEE_MEMBERS.forEach(m => {
      console.log(`   ${m.committee_seat.padEnd(14)} → ${m.email} / ${m.password}`);
    });
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

seedCommitteeMembers();
