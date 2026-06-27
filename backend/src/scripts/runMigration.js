/**
 * Run reconciliation migration
 * Usage: node src/scripts/runMigration.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

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
    console.log('Running reconciliation migration...');

    // Add new statuses
    await conn.query(`
      INSERT IGNORE INTO request_statuses (status_name, status_description) VALUES
        ('PENDING_RECONCILIATION', 'Dispatched - awaiting reconciliation from requester'),
        ('RECONCILED', 'Reconciliation submitted and approved by Finance')
    `);
    console.log('✓ Added request statuses');

    // Create reconciliations table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS reconciliations (
        id INT NOT NULL AUTO_INCREMENT,
        request_id INT NOT NULL,
        reconciled_by INT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
        total_spent DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        total_returned DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        notes TEXT NULL,
        finance_reviewer_id INT NULL,
        finance_comments TEXT NULL,
        reviewed_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        INDEX idx_recon_request (request_id),
        INDEX idx_recon_user (reconciled_by),
        INDEX idx_recon_status (status),
        CONSTRAINT fk_recon_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_recon_user FOREIGN KEY (reconciled_by) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_recon_reviewer FOREIGN KEY (finance_reviewer_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ Created reconciliations table');

    // Create reconciliation_items table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_items (
        id INT NOT NULL AUTO_INCREMENT,
        reconciliation_id INT NOT NULL,
        request_item_id INT NULL,
        description VARCHAR(500) NOT NULL,
        budgeted_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        actual_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        variance DECIMAL(15, 2) GENERATED ALWAYS AS (budgeted_amount - actual_amount) STORED,
        notes TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        INDEX idx_recon_item_recon (reconciliation_id),
        CONSTRAINT fk_recon_item_recon FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
        CONSTRAINT fk_recon_item_req_item FOREIGN KEY (request_item_id) REFERENCES request_items(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✓ Created reconciliation_items table');

    console.log('\n✅ Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
