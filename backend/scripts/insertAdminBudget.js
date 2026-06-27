/**
 * Insert Admin Project + Budget Lines
 * Donor: Administration (Internal) — id 44, code ADMIN-INT
 * Project: Administrative & General Expenses, code ADMIN
 * Fiscal Year: 2026, Total: $13,463.00
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DONOR_ID = 44;
const FISCAL_YEAR = 2026;
const PROJECT_CODE = 'ADMIN';
const PROJECT_NAME = 'Administrative & General Expenses';
const TOTAL_BUDGET = 13463.00;

const BUDGET_LINES = [
  {
    code: '7100', name: 'Staff and Personnel Costs', amount: 787.00,
    notes: 'Salaries and wages; Allowances; Staff welfare; Training and development; Recruitment costs; Medical aid contributions'
  },
  {
    code: '7200', name: 'Office and Administration Expenses', amount: 3740.00,
    notes: 'Stationery and printing; Postage and courier services; Bank charges; Subscriptions and memberships; Licences and permits; Meeting and board expenses'
  },
  {
    code: '7300', name: 'Utilities and Communication', amount: 3379.00,
    notes: 'Electricity; Water; Internet; Telephone and mobile costs; Data bundles'
  },
  {
    code: '7400', name: 'Property and Facilities Expenses', amount: 2247.00,
    notes: 'Rent and rates; Cleaning services; Security services; Repairs and maintenance; Insurance; Garden and grounds maintenance'
  },
  {
    code: '7500', name: 'Transport, Travel and Other Operating Expenses', amount: 3310.00,
    notes: 'Fuel; Vehicle maintenance; Local travel; Accommodation and per diems; Hospitality and refreshments; Miscellaneous operational expenses'
  },
];

async function run() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });

  // ── Verify donor ──────────────────────────────────────────────────────────
  const [[donor]] = await c.execute('SELECT id, donor_name, donor_code FROM donors WHERE id = ?', [DONOR_ID]);
  if (!donor) { console.error('Donor id 44 not found!'); await c.end(); return; }
  console.log('Donor OK:', donor.donor_name, '(' + donor.donor_code + ')');

  // ── Guard: abort if project already exists ────────────────────────────────
  const [existing] = await c.execute('SELECT id FROM projects WHERE project_code = ?', [PROJECT_CODE]);
  if (existing.length > 0) {
    // Project was created in a previous run — just insert any missing budget lines
    console.log('Project ADMIN already exists (id=' + existing[0].id + '). Checking budget lines...');
    const [bls] = await c.execute('SELECT budget_code FROM budget_lines WHERE project_id = ?', [existing[0].id]);
    if (bls.length > 0) {
      console.log('Budget lines already present:', bls.map(b => b.budget_code).join(', '));
      console.log('Nothing to do.');
      await c.end(); return;
    }
    // Fall through with the existing project id so we can insert budget lines
    console.log('No budget lines found — will insert them now.');
    // Re-use the existing project id
    const existingProjectId = existing[0].id;
    const [blCols2] = await c.execute('SHOW COLUMNS FROM budget_lines');
    const blc2 = blCols2.map(r => r.Field);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    for (const bl of BUDGET_LINES) {
      let blFields = ['budget_code','budget_name','donor_id','project_id','allocated_amount','spent_amount','fiscal_year','is_active','created_at','updated_at'];
      let blVals   = [bl.code, bl.name, DONOR_ID, existingProjectId, bl.amount, 0, FISCAL_YEAR, 1, now, now];
      if (blc2.includes('department_id')) { blFields.push('department_id'); blVals.push(17); }
      if (blc2.includes('category'))      { blFields.push('category');      blVals.push('Administrative Expenses'); }
      if (blc2.includes('description'))   { blFields.push('description');   blVals.push(bl.notes); }
      const blSQL2 = 'INSERT INTO budget_lines (' + blFields.join(',') + ') VALUES (' + blFields.map(() => '?').join(',') + ')';
      await c.execute(blSQL2, blVals);
      console.log('  ✓', bl.code, bl.name, '— $' + bl.amount.toFixed(2));
    }
    const [[totals2]] = await c.execute('SELECT COUNT(*) as cnt, SUM(allocated_amount) as total FROM budget_lines WHERE project_id = ?', [existingProjectId]);
    const [[grand2]] = await c.execute('SELECT SUM(allocated_amount) as grand FROM budget_lines');
    console.log('\n══════════════════════════════════════════════');
    console.log('  Lines inserted  :', totals2.cnt);
    console.log('  Admin total     : $' + Number(totals2.total).toFixed(2), '(expected $13,463.00)');
    console.log('  Grand total ALL : $' + Number(grand2.grand).toFixed(2), '(expected $2,261,124.12)');
    console.log('══════════════════════════════════════════════');
    await c.end(); return;
  }

  // ── Inspect columns ───────────────────────────────────────────────────────
  const [pCols] = await c.execute('SHOW COLUMNS FROM projects');
  const pc = pCols.map(r => r.Field);
  console.log('project columns:', pc.join(', '));

  const [blCols] = await c.execute('SHOW COLUMNS FROM budget_lines');
  const blc = blCols.map(r => r.Field);
  console.log('budget_line columns:', blc.join(', '));

  // ── Get Admin/HR department ───────────────────────────────────────────────
  const [depts] = await c.execute('SELECT id, department_name, department_code FROM departments');
  const adminDept = depts.find(d =>
    d.department_code === 'AHR' ||
    d.department_code === 'ADM' ||
    d.department_name.toLowerCase().includes('admin') ||
    d.department_name.toLowerCase().includes('human resource')
  );
  if (!adminDept) {
    console.log('Available departments:', JSON.stringify(depts));
    console.error('Cannot find Admin/HR department. Review list above.');
    await c.end(); return;
  }
  console.log('Department:', adminDept.department_name, '(id=' + adminDept.id + ')');

  // ── Insert project ────────────────────────────────────────────────────────
  // projects schema: project_code, project_name, donor_id, department_id,
  //   description, start_date, end_date, total_budget, is_active
  let projCols = ['project_code', 'project_name', 'donor_id', 'department_id', 'is_active'];
  let projVals = [PROJECT_CODE, PROJECT_NAME, DONOR_ID, adminDept.id, 1];

  if (pc.includes('total_budget'))  { projCols.push('total_budget');  projVals.push(TOTAL_BUDGET); }
  if (pc.includes('budget_amount')) { projCols.push('budget_amount'); projVals.push(TOTAL_BUDGET); }
  if (pc.includes('start_date'))    { projCols.push('start_date');    projVals.push('2026-01-01'); }
  if (pc.includes('end_date'))      { projCols.push('end_date');      projVals.push('2026-12-31'); }
  if (pc.includes('description'))   { projCols.push('description');   projVals.push('Administrative & General Expenses — Internal administration costs for fiscal year ' + FISCAL_YEAR); }

  const pSQL = 'INSERT INTO projects (' + projCols.join(',') + ') VALUES (' + projCols.map(() => '?').join(',') + ')';
  const [projResult] = await c.execute(pSQL, projVals);
  const projectId = projResult.insertId;
  console.log('✓ Created project ADMIN, id=' + projectId);

  // ── Insert budget lines ───────────────────────────────────────────────────
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let lineTotal = 0;
  for (const bl of BUDGET_LINES) {
    let blFields = ['budget_code', 'budget_name', 'donor_id', 'project_id', 'allocated_amount', 'spent_amount', 'fiscal_year', 'is_active', 'created_at', 'updated_at'];
    let blVals   = [bl.code, bl.name, DONOR_ID, projectId, bl.amount, 0, FISCAL_YEAR, 1, now, now];

    if (blc.includes('department_id')) { blFields.push('department_id'); blVals.push(adminDept.id); }
    if (blc.includes('category'))      { blFields.push('category');      blVals.push('Administrative Expenses'); }
    if (blc.includes('description'))   { blFields.push('description');   blVals.push(bl.notes); }
    if (blc.includes('notes'))         { blFields.push('notes');         blVals.push(bl.notes); }

    const blSQL = 'INSERT INTO budget_lines (' + blFields.join(',') + ') VALUES (' + blFields.map(() => '?').join(',') + ')';
    await c.execute(blSQL, blVals);
    lineTotal += bl.amount;
    console.log('  ✓', bl.code, bl.name, '— $' + bl.amount.toFixed(2));
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  const [[totals]] = await c.execute(
    'SELECT COUNT(*) as cnt, SUM(allocated_amount) as total FROM budget_lines WHERE project_id = ?',
    [projectId]
  );
  const [[grandTotal]] = await c.execute('SELECT SUM(allocated_amount) as grand FROM budget_lines');

  console.log('\n══════════════════════════════════════════════');
  console.log('  Lines inserted  :', totals.cnt);
  console.log('  Admin total     : $' + Number(totals.total).toFixed(2), '(expected $13,463.00)');
  console.log('  Grand total ALL : $' + Number(grandTotal.grand).toFixed(2), '(expected $2,261,124.12)');
  console.log('══════════════════════════════════════════════');

  await c.end();
}
run().catch(e => console.error('ERROR:', e.message));
