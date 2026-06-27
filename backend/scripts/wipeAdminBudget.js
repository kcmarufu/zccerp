require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });

  // Find the Admin project
  const [projects] = await c.execute(
    'SELECT id, project_code, project_name FROM projects WHERE project_code = ?',
    ['ADMIN']
  );

  if (projects.length === 0) {
    console.log('No ADMIN project found. Nothing to delete.');
    await c.end(); return;
  }

  const projectId = projects[0].id;
  console.log('Found project:', projects[0].project_name, '(id=' + projectId + ')');

  // Delete budget lines first
  const [blResult] = await c.execute(
    'DELETE FROM budget_lines WHERE project_id = ?', [projectId]
  );
  console.log('✓ Deleted', blResult.affectedRows, 'budget lines');

  // Delete the project
  const [pResult] = await c.execute(
    'DELETE FROM projects WHERE id = ?', [projectId]
  );
  console.log('✓ Deleted project ADMIN (id=' + projectId + ')');

  // Verify grand total is back to pre-Admin state
  const [[grand]] = await c.execute('SELECT SUM(allocated_amount) as total FROM budget_lines');
  console.log('\nGrand total of all budget_lines: $' + Number(grand.total).toFixed(2));
  console.log('(should be $2,139,298.55)');

  await c.end();
}
run().catch(e => console.error('ERROR:', e.message));
