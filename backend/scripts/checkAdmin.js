require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });

  const [projects] = await c.execute(
    'SELECT id, project_code, project_name, donor_id FROM projects WHERE project_code LIKE ? OR project_name LIKE ?',
    ['%ADMIN%', '%dmin%']
  );
  console.log('PROJECTS:', JSON.stringify(projects, null, 2));

  const [donors] = await c.execute(
    'SELECT id, donor_name, donor_code FROM donors WHERE donor_code LIKE ? OR donor_name LIKE ?',
    ['%ADMIN%', '%dmin%']
  );
  console.log('DONORS:', JSON.stringify(donors, null, 2));

  const [existingBL] = await c.execute(
    'SELECT id, budget_code, budget_name, project_id, donor_id, allocated_amount FROM budget_lines WHERE budget_code LIKE ? LIMIT 10',
    ['7%']
  );
  console.log('EXISTING 7xxx BUDGET LINES:', JSON.stringify(existingBL, null, 2));

  await c.end();
}
run().catch(e => console.error(e.message));
