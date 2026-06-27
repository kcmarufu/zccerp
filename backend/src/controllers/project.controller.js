/**
 * Project Controller
 * Manages the Donor → Project hierarchy
 * Each donor can have multiple projects; each project contains budget lines.
 */

const { query, transaction } = require('../config/database');
const { ROLES, isFinanceManager } = require('../config/roles');

/**
 * Helper: auto-generate a project sequence code under a donor
 * e.g. if donor_code is "USAID" → first project code is "USAID-PRJ-001"
 */
async function generateProjectCode(donorCode) {
  const prefix = `${donorCode.toUpperCase()}-PRJ-`;
  const existing = await query(
    `SELECT project_code FROM projects WHERE project_code LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let nextNum = 1;
  if (existing.length > 0) {
    const match = existing[0].project_code.match(/-PRJ-(\d+)$/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

/**
 * GET /api/projects
 * Get all projects, optionally filtered by donor_id, is_active
 */
exports.getAllProjects = async (req, res) => {
  try {
    const { donor_id, is_active, department_id } = req.query;
    let where = '1=1';
    const params = [];

    // Non-Finance HOPs/Leads: only show projects owned by their department.
    const needsScope = [ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD].includes(req.user.role)
      && !isFinanceManager(req.user);
    if (needsScope) {
      where += ' AND p.department_id = ?';
      params.push(req.user.department_id);
    }

    if (donor_id) {
      where += ' AND p.donor_id = ?';
      params.push(parseInt(donor_id));
    }
    if (is_active !== undefined) {
      where += ' AND p.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    if (department_id) {
      where += ' AND p.department_id = ?';
      params.push(parseInt(department_id));
    }

    const projects = await query(
      `SELECT p.*,
              d.donor_name,
              d.donor_code,
              d.currency_code,
              dep.department_name,
              dep.department_code,
              u.first_name AS creator_first_name,
              u.last_name AS creator_last_name,
              (SELECT COUNT(*) FROM budget_lines WHERE project_id = p.id) AS budget_lines_count,
              (SELECT COALESCE(SUM(allocated_amount), 0) FROM budget_lines WHERE project_id = p.id) AS total_allocated,
              (SELECT COALESCE(SUM(spent_amount), 0) FROM budget_lines WHERE project_id = p.id) AS total_spent
       FROM projects p
       JOIN donors d ON p.donor_id = d.id
       LEFT JOIN departments dep ON p.department_id = dep.id
       LEFT JOIN users u ON p.created_by = u.id
       WHERE ${where}
       ORDER BY d.donor_name, p.project_code`,
      params
    );

    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
};

/**
 * GET /api/donors/:donorId/projects
 * Get all projects for a specific donor
 */
exports.getProjectsByDonor = async (req, res) => {
  try {
    const { donorId } = req.params;
    const { is_active } = req.query;

    let where = 'p.donor_id = ?';
    const params = [parseInt(donorId)];

    // Non-Finance HOPs/Leads: only show projects owned by their department
    const needsScope = [ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD].includes(req.user.role)
      && !isFinanceManager(req.user);
    if (needsScope) {
      where += ' AND p.department_id = ?';
      params.push(req.user.department_id);
    }

    if (is_active !== undefined) {
      where += ' AND p.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    const projects = await query(
      `SELECT p.*,
              d.donor_name,
              d.donor_code,
              d.currency_code,
              dep.department_name,
              dep.department_code,
              (SELECT COUNT(*) FROM budget_lines WHERE project_id = p.id) AS budget_lines_count,
              (SELECT COALESCE(SUM(allocated_amount), 0) FROM budget_lines WHERE project_id = p.id) AS total_allocated,
              (SELECT COALESCE(SUM(spent_amount), 0) FROM budget_lines WHERE project_id = p.id) AS total_spent
       FROM projects p
       JOIN donors d ON p.donor_id = d.id
       LEFT JOIN departments dep ON p.department_id = dep.id
       WHERE ${where}
       ORDER BY p.project_code`,
      params
    );

    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('Error fetching projects by donor:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
};

/**
 * GET /api/projects/:id
 * Get single project with budget lines
 */
exports.getProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const projects = await query(
      `SELECT p.*,
              d.donor_name,
              d.donor_code,
              d.currency_code,
              dep.department_name,
              dep.department_code,
              u.first_name AS creator_first_name,
              u.last_name AS creator_last_name
       FROM projects p
       JOIN donors d ON p.donor_id = d.id
       LEFT JOIN departments dep ON p.department_id = dep.id
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = ?`,
      [parseInt(id)]
    );

    if (!projects.length) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const project = projects[0];

    // Get budget lines for this project
    const budgetLines = await query(
      `SELECT bl.*,
              (bl.allocated_amount - bl.spent_amount) AS balance,
              dep.department_name,
              dep.department_code
       FROM budget_lines bl
       LEFT JOIN departments dep ON bl.department_id = dep.id
       WHERE bl.project_id = ?
       ORDER BY bl.budget_code`,
      [parseInt(id)]
    );

    project.budget_lines = budgetLines;

    res.json({ success: true, data: project });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch project' });
  }
};

/**
 * POST /api/donors/:donorId/projects
 * Create a new project under a donor
 */
exports.createProject = async (req, res) => {
  try {
    const { donorId } = req.params;
    const {
      project_name,
      project_code: customCode,
      department_id,
      description,
      start_date,
      end_date,
      total_budget
    } = req.body;

    if (!project_name) {
      return res.status(400).json({ success: false, error: 'project_name is required' });
    }

    // Verify donor exists and is active
    const donorRows = await query(
      'SELECT id, donor_code, is_active FROM donors WHERE id = ?',
      [parseInt(donorId)]
    );
    if (!donorRows.length) {
      return res.status(404).json({ success: false, error: 'Donor not found' });
    }
    if (!donorRows[0].is_active) {
      return res.status(400).json({ success: false, error: 'Cannot create project under an inactive donor' });
    }

    // Determine project code
    let project_code = customCode;
    if (!project_code) {
      project_code = await generateProjectCode(donorRows[0].donor_code);
    } else {
      // Check uniqueness of custom code
      const codeCheck = await query('SELECT id FROM projects WHERE project_code = ?', [project_code]);
      if (codeCheck.length > 0) {
        return res.status(400).json({ success: false, error: 'Project code already exists' });
      }
    }

    // --- Hierarchy validation: project total_budget cannot exceed donor's available committed funds ---
    if (total_budget && parseFloat(total_budget) > 0) {
      const [donorFundRows] = await query(
        'SELECT total_committed FROM donors WHERE id = ?',
        [parseInt(donorId)]
      );
      const donorCommitted = parseFloat(donorFundRows.total_committed || 0);

      const [otherRows] = await query(
        'SELECT COALESCE(SUM(total_budget), 0) AS other_total FROM projects WHERE donor_id = ?',
        [parseInt(donorId)]
      );
      const otherTotal = parseFloat(otherRows.other_total || 0);
      const maxAllowed = donorCommitted - otherTotal;

      if (parseFloat(total_budget) > maxAllowed) {
        return res.status(400).json({
          success: false,
          error: `Project budget (${total_budget}) exceeds the donor's available committed funds. ` +
                 `Donor committed: ${donorCommitted}, already allocated to other projects: ${otherTotal}, ` +
                 `available: ${maxAllowed}.`
        });
      }
    }

    const result = await query(
      `INSERT INTO projects
        (project_code, project_name, donor_id, department_id, description, start_date, end_date,
         total_budget, is_active, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())`,
      [
        project_code,
        project_name,
        parseInt(donorId),
        department_id || null,
        description || null,
        start_date || null,
        end_date || null,
        total_budget || 0,
        req.user.id
      ]
    );

    const newProject = await query(
      `SELECT p.*,
              d.donor_name, d.donor_code, d.currency_code,
              dep.department_name, dep.department_code
       FROM projects p
       JOIN donors d ON p.donor_id = d.id
       LEFT JOIN departments dep ON p.department_id = dep.id
       WHERE p.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, data: newProject[0], message: 'Project created successfully' });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
};

/**
 * PUT /api/projects/:id
 * Update a project
 */
exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      project_name,
      project_code,
      department_id,
      description,
      start_date,
      end_date,
      total_budget,
      is_active
    } = req.body;

    const existing = await query('SELECT * FROM projects WHERE id = ?', [parseInt(id)]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // If changing project_code, check uniqueness
    if (project_code && project_code !== existing[0].project_code) {
      const codeCheck = await query('SELECT id FROM projects WHERE project_code = ? AND id != ?', [project_code, parseInt(id)]);
      if (codeCheck.length > 0) {
        return res.status(400).json({ success: false, error: 'Project code already exists' });
      }
    }

    // --- Hierarchy validation when total_budget is being changed ---
    if (total_budget !== undefined) {
      const newBudget = parseFloat(total_budget);

      // Cannot drop below total budget lines allocated under this project
      const [blRows] = await query(
        'SELECT COALESCE(SUM(allocated_amount), 0) AS total_allocated FROM budget_lines WHERE project_id = ?',
        [parseInt(id)]
      );
      const totalAllocated = parseFloat(blRows.total_allocated || 0);
      if (newBudget < totalAllocated) {
        return res.status(400).json({
          success: false,
          error: `Cannot set project budget to ${newBudget}: budget lines already allocate ${totalAllocated}. ` +
                 `Reduce budget lines first.`
        });
      }

      // Cannot exceed donor's available committed funds (excluding this project)
      const [donorFundRows] = await query(
        'SELECT total_committed FROM donors WHERE id = ?',
        [existing[0].donor_id]
      );
      const donorCommitted = parseFloat(donorFundRows.total_committed || 0);

      const [otherRows] = await query(
        'SELECT COALESCE(SUM(total_budget), 0) AS other_total FROM projects WHERE donor_id = ? AND id != ?',
        [existing[0].donor_id, parseInt(id)]
      );
      const otherTotal = parseFloat(otherRows.other_total || 0);
      const maxAllowed = donorCommitted - otherTotal;

      if (newBudget > maxAllowed) {
        return res.status(400).json({
          success: false,
          error: `Project budget (${newBudget}) exceeds the donor's available committed funds. ` +
                 `Donor committed: ${donorCommitted}, allocated to other projects: ${otherTotal}, ` +
                 `available: ${maxAllowed}.`
        });
      }
    }

    const updateFields = [];
    const params = [];

    if (project_name !== undefined) { updateFields.push('project_name = ?'); params.push(project_name); }
    if (project_code !== undefined) { updateFields.push('project_code = ?'); params.push(project_code); }
    if (department_id !== undefined) { updateFields.push('department_id = ?'); params.push(department_id || null); }
    if (description !== undefined) { updateFields.push('description = ?'); params.push(description || null); }
    if (start_date !== undefined) { updateFields.push('start_date = ?'); params.push(start_date || null); }
    if (end_date !== undefined) { updateFields.push('end_date = ?'); params.push(end_date || null); }
    if (total_budget !== undefined) { updateFields.push('total_budget = ?'); params.push(total_budget); }
    if (is_active !== undefined) { updateFields.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (!updateFields.length) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(parseInt(id));
    await query(`UPDATE projects SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`, params);

    const updated = await query(
      `SELECT p.*,
              d.donor_name, d.donor_code, d.currency_code,
              dep.department_name, dep.department_code
       FROM projects p
       JOIN donors d ON p.donor_id = d.id
       LEFT JOIN departments dep ON p.department_id = dep.id
       WHERE p.id = ?`,
      [parseInt(id)]
    );

    res.json({ success: true, data: updated[0], message: 'Project updated successfully' });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
};

/**
 * GET /api/projects/:id/budget-lines
 * Get all budget lines for a specific project
 */
exports.getProjectBudgetLines = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.query;

    let where = 'bl.project_id = ?';
    const params = [parseInt(id)];

    if (is_active !== undefined) {
      where += ' AND bl.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    const budgetLines = await query(
      `SELECT bl.*,
              (bl.allocated_amount - bl.spent_amount) AS balance,
              ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) AS utilization_percentage,
              dep.department_name,
              dep.department_code,
              d.donor_name,
              d.donor_code,
              d.currency_code,
              p.project_name,
              p.project_code
       FROM budget_lines bl
       LEFT JOIN departments dep ON bl.department_id = dep.id
       JOIN donors d ON bl.donor_id = d.id
       JOIN projects p ON bl.project_id = p.id
       WHERE ${where}
       ORDER BY bl.budget_code`,
      params
    );

    res.json({ success: true, data: budgetLines });
  } catch (error) {
    console.error('Error fetching project budget lines:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch budget lines' });
  }
};

/**
 * DELETE /api/projects/:id
 * Delete a project — only allowed when the project has no active budget lines and no spent amount.
 */
exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id);

    const existing = await query('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Soft delete (archive): preserve all transaction history and FK references.
    // Also archive any budget lines under this project so they no longer show as active.
    await query('UPDATE projects SET is_active = 0, updated_at = NOW() WHERE id = ?', [projectId]);
    await query('UPDATE budget_lines SET is_active = 0, updated_at = NOW() WHERE project_id = ?', [projectId]);

    res.json({ success: true, message: 'Project archived successfully. All transaction history has been preserved.' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ success: false, error: 'Failed to archive project' });
  }
};

/**
 * POST /api/projects/:id/add-funds
 * Add funds to a project's total_budget.
 * Validates that the new total does not exceed the donor's committed funds
 * minus what is already allocated to other projects under the same donor.
 */
exports.addProjectFunds = async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id);
    const amount = parseFloat(req.body.amount);
    const { notes } = req.body;

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be a positive number' });
    }

    const projectRows = await query(
      'SELECT p.*, d.total_committed FROM projects p JOIN donors d ON p.donor_id = d.id WHERE p.id = ?',
      [projectId]
    );
    if (!projectRows.length) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const project = projectRows[0];
    const donorCommitted = parseFloat(project.total_committed || 0);

    // Sum total_budget of all other projects under the same donor
    const [otherRows] = await query(
      'SELECT COALESCE(SUM(total_budget), 0) AS other_total FROM projects WHERE donor_id = ? AND id != ?',
      [project.donor_id, projectId]
    );
    const otherTotal = parseFloat(otherRows.other_total || 0);
    const maxAllowed = donorCommitted - otherTotal;
    const newTotal = parseFloat(project.total_budget || 0) + amount;

    if (newTotal > maxAllowed) {
      return res.status(400).json({
        success: false,
        error: `Adding ${amount} would exceed the donor's available committed funds. ` +
               `Donor committed: ${donorCommitted}, allocated to other projects: ${otherTotal}, ` +
               `max this project can hold: ${maxAllowed}, requested new total: ${newTotal}.`
      });
    }

    await query(
      'UPDATE projects SET total_budget = total_budget + ?, updated_at = NOW() WHERE id = ?',
      [amount, projectId]
    );

    const [updated] = await query('SELECT total_budget FROM projects WHERE id = ?', [projectId]);

    res.json({
      success: true,
      message: `Successfully added ${amount} to project budget.`,
      data: { new_total_budget: parseFloat(updated.total_budget) }
    });
  } catch (error) {
    console.error('Error adding project funds:', error);
    res.status(500).json({ success: false, error: 'Failed to add project funds' });
  }
};

/**
 * POST /api/projects/:id/deduct-funds
 * Deduct funds from a project's total_budget.
 * Validates that the deduction does not drop below the sum of allocated budget lines.
 */
exports.deductProjectFunds = async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id);
    const amount = parseFloat(req.body.amount);

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be a positive number' });
    }

    const projectRows = await query('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!projectRows.length) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const project = projectRows[0];
    const currentBudget = parseFloat(project.total_budget || 0);

    // Sum allocated_amount of all budget lines under this project
    const [blRows] = await query(
      'SELECT COALESCE(SUM(allocated_amount), 0) AS total_allocated FROM budget_lines WHERE project_id = ?',
      [projectId]
    );
    const totalAllocated = parseFloat(blRows.total_allocated || 0);
    const newTotal = currentBudget - amount;

    if (newTotal < totalAllocated) {
      return res.status(400).json({
        success: false,
        error: `Cannot deduct ${amount}: project would have ${newTotal} but budget lines already allocate ${totalAllocated}. ` +
               `Reduce budget lines first before deducting project funds.`
      });
    }

    if (newTotal < 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot deduct ${amount}: project budget would become negative.`
      });
    }

    await query(
      'UPDATE projects SET total_budget = total_budget - ?, updated_at = NOW() WHERE id = ?',
      [amount, projectId]
    );

    const [updated] = await query('SELECT total_budget FROM projects WHERE id = ?', [projectId]);

    res.json({
      success: true,
      message: `Successfully deducted ${amount} from project budget.`,
      data: { new_total_budget: parseFloat(updated.total_budget) }
    });
  } catch (error) {
    console.error('Error deducting project funds:', error);
    res.status(500).json({ success: false, error: 'Failed to deduct project funds' });
  }
};

/**
 * GET /api/projects/:id/activity
 * Return all transactions and activity for a project:
 *  - budget_transactions for every budget line under this project
 *  - requests linked to this project (or to any budget line under it)
 *  - approval logs for those requests
 */
exports.getProjectActivity = async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);

    const existing = await query('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Budget transactions for all budget lines under this project
    const budgetTransactions = await query(
      `SELECT bt.*,
              bl.budget_code,
              bl.budget_name,
              u.first_name AS performed_by_first,
              u.last_name  AS performed_by_last,
              r.request_code
       FROM budget_transactions bt
       JOIN budget_lines bl ON bt.budget_line_id = bl.id
       LEFT JOIN users u ON bt.performed_by = u.id
       LEFT JOIN requests r ON bt.request_id = r.id
       WHERE bl.project_id = ?
       ORDER BY bt.created_at DESC
       LIMIT 200`,
      [projectId]
    );

    // Requests linked directly to this project OR via budget lines
    const requests = await query(
      `SELECT DISTINCT
              r.id, r.request_code, r.status, r.total_amount, r.created_at, r.updated_at,
              u.first_name AS requester_first, u.last_name AS requester_last,
              u.email AS requester_email,
              dep.department_name
       FROM requests r
       LEFT JOIN users u ON r.requester_id = u.id
       LEFT JOIN departments dep ON r.department_id = dep.id
       WHERE r.project_id = ?
          OR r.id IN (
               SELECT DISTINCT ri.request_id
               FROM request_items ri
               JOIN budget_lines bl ON ri.budget_line_id = bl.id
               WHERE bl.project_id = ?
             )
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [projectId, projectId]
    );

    // Budget lines summary
    const budgetLines = await query(
      `SELECT bl.id, bl.budget_code, bl.budget_name, bl.allocated_amount, bl.spent_amount,
              (bl.allocated_amount - bl.spent_amount) AS balance,
              bl.is_active, bl.created_at,
              dep.department_name
       FROM budget_lines bl
       LEFT JOIN departments dep ON bl.department_id = dep.id
       WHERE bl.project_id = ?
       ORDER BY bl.budget_code`,
      [projectId]
    );

    res.json({
      success: true,
      data: {
        budget_lines: budgetLines,
        budget_transactions: budgetTransactions,
        requests
      }
    });
  } catch (error) {
    console.error('Error fetching project activity:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch project activity' });
  }
};
