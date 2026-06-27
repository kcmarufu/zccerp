/**
 * Seed Script - Create/Update Users with Proper Password Hashes
 * Run: node src/scripts/seedUsers.js
 */

const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config();

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'password123';

async function seedUsers() {
  let connection;
  
  try {
    // Create database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'finance_erp'
    });

    console.log('Connected to database');

    // Generate password hash
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    console.log('Generated password hash for:', DEFAULT_PASSWORD);

    // Sample users data
    const users = [
      { employee_id: 'EMP001', email: 'john.doe@company.com', first_name: 'John', last_name: 'Doe', department_id: 1, role_id: 1 },
      { employee_id: 'EMP002', email: 'jane.smith@company.com', first_name: 'Jane', last_name: 'Smith', department_id: 1, role_id: 2 },
      { employee_id: 'EMP003', email: 'bob.wilson@company.com', first_name: 'Bob', last_name: 'Wilson', department_id: 3, role_id: 3 },
      { employee_id: 'EMP004', email: 'alice.finance@company.com', first_name: 'Alice', last_name: 'Finance', department_id: 3, role_id: 4 },
      { employee_id: 'EMP005', email: 'charlie.ops@company.com', first_name: 'Charlie', last_name: 'Operations', department_id: 4, role_id: 1 }
    ];

    // Update or insert each user
    for (const user of users) {
      try {
        // Check if user exists
        const [existing] = await connection.execute(
          'SELECT id FROM users WHERE email = ?',
          [user.email]
        );

        if (existing.length > 0) {
          // Update existing user's password
          await connection.execute(
<<<<<<< HEAD
            'UPDATE users SET password_hash = ?, is_active = TRUE, updated_at = NOW() WHERE email = ?',
=======
            'UPDATE users SET password_hash = ?, is_active = TRUE WHERE email = ?',
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            [passwordHash, user.email]
          );
          console.log(`Updated password for: ${user.email}`);
        } else {
          // Insert new user
          await connection.execute(
<<<<<<< HEAD
            `INSERT INTO users (employee_id, email, password_hash, first_name, last_name, department_id, role_id, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
=======
            `INSERT INTO users (employee_id, email, password_hash, first_name, last_name, department_id, role_id, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            [user.employee_id, user.email, passwordHash, user.first_name, user.last_name, user.department_id, user.role_id]
          );
          console.log(`Created new user: ${user.email}`);
        }
      } catch (err) {
        console.error(`Error processing user ${user.email}:`, err.message);
      }
    }

    console.log('\n✅ User seeding completed successfully!');
    console.log('\nYou can now login with:');
    console.log('  Email: john.doe@company.com (General User)');
    console.log('  Email: jane.smith@company.com (Program Lead)');
    console.log('  Email: bob.wilson@company.com (Head of Programs)');
    console.log('  Email: alice.finance@company.com (Finance Clerk)');
    console.log('  Password: password123');

  } catch (error) {
    console.error('Database error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\nDatabase connection closed');
    }
  }
}

seedUsers();
