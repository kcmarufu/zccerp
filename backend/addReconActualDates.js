require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'finance_erp'
  });

  const [cols] = await c.query('SHOW COLUMNS FROM reconciliations');
  const colNames = cols.map(col => col.Field);

  if (!colNames.includes('actual_start_date')) {
    await c.query('ALTER TABLE reconciliations ADD COLUMN actual_start_date DATE NULL AFTER working_days_taken');
    console.log('✓ Added actual_start_date');
  } else {
    console.log('↷ actual_start_date already exists');
  }

  if (!colNames.includes('actual_end_date')) {
    await c.query('ALTER TABLE reconciliations ADD COLUMN actual_end_date DATE NULL AFTER actual_start_date');
    console.log('✓ Added actual_end_date');
  } else {
    console.log('↷ actual_end_date already exists');
  }

  const [updatedCols] = await c.query('SHOW COLUMNS FROM reconciliations');
  console.log('Current columns:', updatedCols.map(col => col.Field).join(', '));
  await c.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
