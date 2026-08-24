/**
 * Apply a .sql migration file, statement by statement, against the configured DB.
 * Splits on ';' at end-of-line so the PREPARE/EXECUTE guard blocks survive.
 */
require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');

const file = process.argv[2];
if (!file) {
  console.error('usage: node run_migration.js <path-to.sql>');
  process.exit(1);
}

(async () => {
  const sql = fs.readFileSync(file, 'utf8');

  // Strip full-line comments, then split on semicolons at line ends.
  const cleaned = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  const statements = cleaned
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  let ok = 0;
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
      ok += 1;
    } catch (err) {
      console.error('\nFAILED statement:\n', stmt.slice(0, 300));
      console.error('ERROR:', err.code, err.sqlMessage || err.message);
      await conn.end();
      process.exit(1);
    }
  }

  console.log(`Applied ${ok}/${statements.length} statements from ${file}`);
  await conn.end();
})();
