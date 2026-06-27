/**
 * Run activity request fields migration
 * Adds is_activity_request, activity_start_date, activity_end_date to requests table
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'finance_erp',
    multipleStatements: true
  });

  try {
    console.log('Running activity request fields migration...');

    // Helper: add a column only if it does not already exist
    const addColumnIfMissing = async (column, definition) => {
      const [cols] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'requests'
           AND COLUMN_NAME = ?`,
        [column]
      );
      if (cols.length > 0) {
        console.log(`  (column ${column} already exists — skipped)`);
        return;
      }
      await conn.query(`ALTER TABLE requests ADD COLUMN ${definition}`);
      console.log(`✓ Added ${column} column`);
    };

    await addColumnIfMissing(
      'is_activity_request',
      "is_activity_request TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = this float is for a scheduled activity'"
    );

    await addColumnIfMissing(
      'activity_start_date',
      "activity_start_date DATE NULL DEFAULT NULL COMMENT 'Activity start date (required when is_activity_request = 1)'"
    );

    await addColumnIfMissing(
      'activity_end_date',
      "activity_end_date DATE NULL DEFAULT NULL COMMENT 'Activity end date (drives reconciliation due date)'"
    );

    // Add index (ignore error if already exists)
    try {
      await conn.query(`
        CREATE INDEX idx_requests_is_activity ON requests (is_activity_request)
      `);
      console.log('✓ Created index idx_requests_is_activity');
    } catch (idxErr) {
      if (idxErr.code === 'ER_DUP_KEYNAME') {
        console.log('  (index idx_requests_is_activity already exists — skipped)');
      } else {
        throw idxErr;
      }
    }

    // Verify columns
    const [rows] = await conn.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'requests'
        AND COLUMN_NAME IN ('is_activity_request','activity_start_date','activity_end_date')
      ORDER BY COLUMN_NAME
    `);
    console.log('\nVerified columns on requests table:');
    rows.forEach(r =>
      console.log(`  - ${r.COLUMN_NAME} | ${r.COLUMN_TYPE} | nullable: ${r.IS_NULLABLE} | default: ${r.COLUMN_DEFAULT}`)
    );

    console.log('\n✅ Activity request migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
