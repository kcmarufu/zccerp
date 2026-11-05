/**
 * One-off: give every procurement item that has no category one inferred from
 * its description (see src/config/procItemCategories.js).
 *
 *   node scripts/backfillProcItemCategories.js --check   # report only
 *   node scripts/backfillProcItemCategories.js           # write
 *
 * Only rows whose category is NULL or empty are touched, so a category a
 * requester picked is never overwritten and re-running is a no-op.
 */
'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const { inferProcItemCategory } = require('../src/config/procItemCategories');

const isDryRun = process.argv.includes('--check');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [rows] = await conn.query(
      `SELECT pri.id, pri.item_description, pri.specifications, pr.title
         FROM proc_request_items pri
         JOIN proc_requests pr ON pr.id = pri.request_id
        WHERE pri.category IS NULL OR pri.category = ''`
    );
    const counts = {};
    for (const row of rows) {
      const category = inferProcItemCategory(row.item_description, row.specifications, row.title);
      counts[category] = (counts[category] || 0) + 1;
      if (!isDryRun) {
        await conn.execute(
          `UPDATE proc_request_items SET category = ?
            WHERE id = ? AND (category IS NULL OR category = '')`,
          [category, row.id]
        );
      }
    }
    console.log(`${isDryRun ? '[DRY-RUN] would categorise' : 'Categorised'} ${rows.length} item(s) in ${process.env.DB_NAME}`);
    Object.entries(counts).sort((a, b) => b[1] - a[1])
      .forEach(([c, n]) => console.log(`  ${String(n).padStart(4)}  ${c}`));
  } finally {
    await conn.end();
  }
})().catch((err) => { console.error(err); process.exit(1); });
