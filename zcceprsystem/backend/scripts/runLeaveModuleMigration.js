/**
 * One-shot script: apply the leave module migration
 * Run from backend/ folder: node scripts/runLeaveModuleMigration.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const path  = require('path');
const fs    = require('fs');

const MIGRATION_FILE = path.join(__dirname, '../../database/migration_leave_module.sql');

(async () => {
  const conn = await mysql.createConnection({
    host:               process.env.DB_HOST     || 'localhost',
    port:               Number(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'finance_erp',
    multipleStatements: true,
  });

  console.log(`Connected to: ${process.env.DB_NAME || 'finance_erp'}`);

  // Check MySQL version
  const [vRows] = await conn.query('SELECT VERSION() AS v');
  const version = vRows[0].v;
  console.log(`MySQL version: ${version}`);

  // Check which columns already exist on hr_leave_types
  const [existingCols] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hr_leave_types'`,
    [process.env.DB_NAME || 'finance_erp']
  );
  const cols = new Set(existingCols.map(r => r.COLUMN_NAME));
  console.log('Existing hr_leave_types columns:', [...cols].join(', '));

  // Add missing columns (safe regardless of version)
  const toAdd = [
    { name: 'is_deductible',        sql: 'TINYINT(1) NOT NULL DEFAULT 1 AFTER `is_active`'           },
    { name: 'is_accrual_target',     sql: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_deductible`'      },
    { name: 'monthly_accrual_days',  sql: 'DECIMAL(5,1) NOT NULL DEFAULT 0.0 AFTER `is_accrual_target`' },
  ];

  for (const col of toAdd) {
    if (cols.has(col.name)) {
      console.log(`  [skip] Column ${col.name} already exists`);
    } else {
      await conn.query(`ALTER TABLE \`hr_leave_types\` ADD COLUMN \`${col.name}\` ${col.sql}`);
      console.log(`  [done] Added column: ${col.name}`);
    }
  }

  // Update leave type flags
  const [aRes] = await conn.query(
    `UPDATE hr_leave_types SET is_accrual_target = 1, monthly_accrual_days = 2.5 WHERE leave_code = 'ANNUAL'`
  );
  console.log(`  [done] Set ANNUAL as accrual target (${aRes.affectedRows} row(s) updated)`);

  const [uRes] = await conn.query(
    `UPDATE hr_leave_types SET is_deductible = 0 WHERE leave_code = 'UNPAID'`
  );
  console.log(`  [done] Set UNPAID as non-deductible (${uRes.affectedRows} row(s) updated)`);

  // Check if hr_leave_accrual_log table exists
  const [tbls] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'hr_leave_accrual_log'`,
    [process.env.DB_NAME || 'finance_erp']
  );

  if (tbls.length > 0) {
    console.log('  [skip] Table hr_leave_accrual_log already exists');
  } else {
    await conn.query(`
      CREATE TABLE \`hr_leave_accrual_log\` (
        \`id\`              INT           NOT NULL AUTO_INCREMENT,
        \`employee_id\`     INT           NOT NULL,
        \`leave_type_id\`   INT           NOT NULL,
        \`fiscal_year\`     INT           NOT NULL,
        \`accrual_month\`   INT           NOT NULL COMMENT '1-12',
        \`days_added\`      DECIMAL(5,1)  NOT NULL DEFAULT 0.0,
        \`triggered_by\`    INT           NULL DEFAULT NULL,
        \`created_at\`      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`hr_leave_accrual_log_unique\` (\`employee_id\`, \`leave_type_id\`, \`fiscal_year\`, \`accrual_month\`),
        INDEX \`hr_leave_accrual_log_type_idx\`   (\`leave_type_id\`),
        INDEX \`hr_leave_accrual_log_period_idx\` (\`fiscal_year\`, \`accrual_month\`),
        CONSTRAINT \`fk_accrual_log_employee\`  FOREIGN KEY (\`employee_id\`)   REFERENCES \`hr_employees\`  (\`id\`) ON DELETE CASCADE  ON UPDATE CASCADE,
        CONSTRAINT \`fk_accrual_log_type\`      FOREIGN KEY (\`leave_type_id\`) REFERENCES \`hr_leave_types\` (\`id\`) ON DELETE CASCADE  ON UPDATE CASCADE,
        CONSTRAINT \`fk_accrual_log_triggered\` FOREIGN KEY (\`triggered_by\`)  REFERENCES \`users\`         (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic
    `);
    console.log('  [done] Created table: hr_leave_accrual_log');
  }

  console.log('\nMigration completed successfully.');
  await conn.end();
})().catch(err => {
  console.error('\nMigration FAILED:', err.message);
  process.exit(1);
});
