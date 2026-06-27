/**
 * Safe Database Migration Runner
 * ================================
 * - Tracks applied migrations in a `schema_migrations` table
 * - Only runs NEW .sql files — never re-runs completed ones
 * - Never drops tables or truncates data (blocked by safety check)
 * - Reads from: zcceprsystem/database/*.sql  (sorted alphabetically)
 *
 * Usage:
 *   node scripts/migrate.js              # apply pending migrations
 *   node scripts/migrate.js --check      # dry-run: list pending only
 *   node scripts/migrate.js --mark-all   # mark ALL files applied (use after manual DB import)
 */

'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database');
const DANGER_PATTERN = /\b(DROP\s+TABLE(?!\s+IF\s+EXISTS\s+`?schema_migrations)|TRUNCATE\s+TABLE)\b/i;

const isDryRun   = process.argv.includes('--check');
const markAll    = process.argv.includes('--mark-all');

async function getConn() {
  return mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'finance_erp',
    multipleStatements: true,
  });
}

async function ensureMigrationsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL UNIQUE,
      applied_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum    VARCHAR(64)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function getApplied(conn) {
  const [rows] = await conn.execute('SELECT filename FROM schema_migrations');
  return new Set(rows.map(r => r.filename));
}

function getMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

async function markApplied(conn, filename) {
  await conn.execute(
    'INSERT IGNORE INTO schema_migrations (filename) VALUES (?)',
    [filename]
  );
}

async function runMigration(conn, filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, 'utf8');

  if (DANGER_PATTERN.test(sql)) {
    console.warn(`  ⚠  SKIPPED ${filename} — contains DROP TABLE or TRUNCATE (blocked for data safety)`);
    return false;
  }

  console.log(`  ▶  Applying: ${filename}`);
  try {
    await conn.beginTransaction();
    await conn.query(sql);
    await markApplied(conn, filename);
    await conn.commit();
    console.log(`  ✓  Done:     ${filename}`);
    return true;
  } catch (err) {
    await conn.rollback();
    console.error(`  ✗  FAILED:   ${filename}\n     ${err.message}`);
    throw err;
  }
}

async function main() {
  const conn = await getConn();
  try {
    await ensureMigrationsTable(conn);
    const applied  = await getApplied(conn);
    const allFiles = getMigrationFiles();
    const pending  = allFiles.filter(f => !applied.has(f));

    console.log(`\n═══ ZCC ERP Migration Runner ════════════════════════`);
    console.log(`  Migration files : ${allFiles.length}`);
    console.log(`  Already applied : ${applied.size}`);
    console.log(`  Pending         : ${pending.length}`);
    console.log(`  Mode            : ${isDryRun ? 'DRY-RUN (--check)' : markAll ? 'MARK-ALL' : 'APPLY'}`);
    console.log(`─────────────────────────────────────────────────────\n`);

    if (pending.length === 0) {
      console.log('  ✓ Database is up to date. Nothing to apply.\n');
      return;
    }

    for (const file of pending) {
      if (isDryRun) {
        console.log(`  [PENDING] ${file}`);
      } else if (markAll) {
        await markApplied(conn, file);
        console.log(`  [MARKED]  ${file}`);
      } else {
        await runMigration(conn, file);
      }
    }

    if (!isDryRun) {
      console.log(`\n  ✓ Migration complete. ${pending.length} file(s) processed.\n`);
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('\n✗ Migration runner failed:', err.message);
  process.exit(1);
});
