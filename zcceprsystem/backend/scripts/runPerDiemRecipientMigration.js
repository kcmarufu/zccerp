/**
 * Migration: Add recipient_user_id, recipient_name, and return_date to per_diem_trip_items
 * Safe to run multiple times — checks for column existence before altering.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  console.log('Connected to database.\n');

  try {
    // Check existing columns
    const [cols] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'per_diem_trip_items'`
    );
    const existingCols = cols.map(c => c.COLUMN_NAME.toLowerCase());

    // Add recipient_user_id
    if (!existingCols.includes('recipient_user_id')) {
      console.log('Adding recipient_user_id...');
      await connection.execute(
        `ALTER TABLE per_diem_trip_items ADD COLUMN recipient_user_id INT NULL AFTER claim_id`
      );
      // Add FK separately so a failure here doesn't block the others
      try {
        await connection.execute(
          `ALTER TABLE per_diem_trip_items
           ADD CONSTRAINT fk_pdti_recipient FOREIGN KEY (recipient_user_id)
             REFERENCES users (id) ON DELETE SET NULL`
        );
      } catch (fkErr) {
        console.warn('FK constraint skipped (may already exist):', fkErr.message);
      }
      console.log('  -> recipient_user_id added.');
    } else {
      console.log('  -> recipient_user_id already exists, skipping.');
    }

    // Add recipient_name
    if (!existingCols.includes('recipient_name')) {
      console.log('Adding recipient_name...');
      await connection.execute(
        `ALTER TABLE per_diem_trip_items ADD COLUMN recipient_name VARCHAR(255) NULL AFTER recipient_user_id`
      );
      console.log('  -> recipient_name added.');
    } else {
      console.log('  -> recipient_name already exists, skipping.');
    }

    // Add return_date
    if (!existingCols.includes('return_date')) {
      console.log('Adding return_date...');
      await connection.execute(
        `ALTER TABLE per_diem_trip_items ADD COLUMN return_date DATE NULL AFTER trip_date`
      );
      console.log('  -> return_date added.');
    } else {
      console.log('  -> return_date already exists, skipping.');
    }

    // Add accommodation column if missing (required by controller INSERT)
    if (!existingCols.includes('accommodation')) {
      console.log('Adding accommodation flag...');
      await connection.execute(
        `ALTER TABLE per_diem_trip_items ADD COLUMN accommodation TINYINT(1) NOT NULL DEFAULT 0 AFTER overnight_stay`
      );
      console.log('  -> accommodation added.');
    } else {
      console.log('  -> accommodation already exists, skipping.');
    }

    // Add rate_accommodation column if missing
    if (!existingCols.includes('rate_accommodation')) {
      console.log('Adding rate_accommodation...');
      await connection.execute(
        `ALTER TABLE per_diem_trip_items ADD COLUMN rate_accommodation DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER rate_overnight`
      );
      console.log('  -> rate_accommodation added.');
    } else {
      console.log('  -> rate_accommodation already exists, skipping.');
    }

    // Create index if not exists
    try {
      await connection.execute(
        `CREATE INDEX idx_pdti_recipient ON per_diem_trip_items (recipient_user_id)`
      );
      console.log('Index idx_pdti_recipient created.');
    } catch (idxErr) {
      console.log('Index idx_pdti_recipient already exists, skipping.');
    }

    console.log('\n✅ Per diem recipient migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

run();
