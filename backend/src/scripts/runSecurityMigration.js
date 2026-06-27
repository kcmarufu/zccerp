/**
 * Security & Performance Migration
 * Adds account lockout columns and performance indexes
 * Run: node src/scripts/runSecurityMigration.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const INDEXES = [
  ['users',              'idx_users_locked_until',           'locked_until'],
  ['requests',           'idx_requests_status',              'status'],
  ['requests',           'idx_requests_requester_id',        'requester_id'],
  ['requests',           'idx_requests_department_id',       'department_id'],
  ['requests',           'idx_requests_donor_id',            'donor_id'],
  ['requests',           'idx_requests_created_at',          'created_at'],
  ['requests',           'idx_requests_dept_status',         'department_id, status'],
  ['requests',           'idx_requests_status_date',         'status, created_at'],
  ['budget_lines',       'idx_budget_lines_donor_id',        'donor_id'],
  ['budget_lines',       'idx_budget_lines_project_id',      'project_id'],
  ['budget_lines',       'idx_budget_lines_department_id',   'department_id'],
  ['budget_transactions','idx_budget_txn_budget_line_id',    'budget_line_id'],
  ['budget_transactions','idx_budget_txn_created_at',        'created_at'],
  ['approval_logs',      'idx_approval_logs_request_id',     'request_id'],
  ['approval_logs',      'idx_approval_logs_approver_id',    'approver_id'],
  ['approval_logs',      'idx_approval_logs_action',         'action'],
  ['reconciliations',    'idx_recon_request_id',             'request_id'],
  ['reconciliations',    'idx_recon_submitted_by',           'submitted_by'],
  ['reconciliations',    'idx_recon_status',                 'status'],
  ['projects',           'idx_projects_donor_id',            'donor_id'],
  ['projects',           'idx_projects_is_active',           'is_active'],
  ['notifications',      'idx_notifications_user_id',        'user_id'],
  ['notifications',      'idx_notifications_is_read',        'is_read'],
  ['notifications',      'idx_notifications_created_at',     'created_at'],
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  return rows[0].c > 0;
}

async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [table, index]
  );
  return rows[0].c > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  return rows[0].c > 0;
}

async function run() {
  console.log('\n🔐 Security & Performance Migration\n' + '='.repeat(45));

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'finance_erp',
  });

  try {
    // ── 1. Add lockout columns ──────────────────────────────────────────────
    console.log('\n[1/2] Account lockout columns...');

    if (!(await columnExists(conn, 'users', 'failed_login_attempts'))) {
      await conn.query('ALTER TABLE users ADD COLUMN failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0');
      console.log('  ✓ Added: failed_login_attempts');
    } else {
      console.log('  ✓ Already exists: failed_login_attempts');
    }

    if (!(await columnExists(conn, 'users', 'locked_until'))) {
      await conn.query('ALTER TABLE users ADD COLUMN locked_until DATETIME NULL DEFAULT NULL');
      console.log('  ✓ Added: locked_until');
    } else {
      console.log('  ✓ Already exists: locked_until');
    }

    // ── 2. Create performance indexes ───────────────────────────────────────
    console.log('\n[2/2] Performance indexes...');
    let created = 0, skipped = 0, missing = 0;

    for (const [tbl, idx, col] of INDEXES) {
      if (!(await tableExists(conn, tbl))) {
        console.log(`  ⚠  Table missing, skipping: ${tbl}`);
        missing++;
        continue;
      }
      if (await indexExists(conn, tbl, idx)) {
        skipped++;
        continue;
      }
      try {
        await conn.query('CREATE INDEX `' + idx + '` ON `' + tbl + '` (' + col + ')');
        console.log('  ✓ Created: ' + idx + ' on ' + tbl);
        created++;
      } catch (e) {
        console.log('  ✗ Failed ' + idx + ': ' + e.message);
      }
    }
    console.log(`\n  Indexes: ${created} created, ${skipped} already existed, ${missing} tables missing`);

    console.log('\n🎉 Migration complete!\n');
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
