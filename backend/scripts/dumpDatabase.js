/**
 * Dumps the full finance_erp database to a .sql file.
 * Reads credentials from .env — never prints them to screen.
 */
require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const host     = process.env.DB_HOST     || 'localhost';
const port     = process.env.DB_PORT     || '3306';
const user     = process.env.DB_USER     || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME     || 'finance_erp';

const outDir  = path.join('C:\\Users\\SystemAdminstrator\\Downloads');
const outFile = path.join(outDir, `${database}_latest_${new Date().toISOString().slice(0,10)}.sql`);

console.log('Database :', database);
console.log('Output   :', outFile);
console.log('Dumping  ...');

try {
  // Use MYSQL_PWD env var so the password never appears in the process argument list
  const mysqldump = `"C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe"`;
  execSync(
    `${mysqldump} --host=${host} --port=${port} --user=${user} ` +
    `--single-transaction --routines --triggers --add-drop-table ` +
    `--default-character-set=utf8mb4 ${database} > "${outFile}"`,
    {
      env: { ...process.env, MYSQL_PWD: password },
      stdio: ['ignore', 'inherit', 'inherit']
    }
  );

  const size = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`\n✓ Done!  File size: ${size} KB`);
  console.log(`  Saved to: ${outFile}`);
  console.log('\n  Import on the server with:');
  console.log(`  mysql -u <user> -p ${database} < ${path.basename(outFile)}`);
} catch (e) {
  console.error('mysqldump failed:', e.message);
  process.exit(1);
}
