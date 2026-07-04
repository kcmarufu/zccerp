/**
 * Budget Controller
 * Handles budget line management for Finance Clerks
 */

const { validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { ROLES, isFinanceManager, isAdminHrManager } = require('../config/roles');

// Finance managers (FOS HOP/Lead or Admin), Finance Clerks, and Admin/HR managers
// see every budget line across all departments. All other roles are scoped to their own department.
const canViewAllBudgetLines = (user) =>
  isFinanceManager(user) || user.role === ROLES.FINANCE_CLERK || isAdminHrManager(user);

class BudgetController {

  /**
   * Get all budget lines
   * GET /api/budgets
   */
  async getBudgetLines(req, res) {
    try {
      const { departmentId, donorId, fiscalYear, isActive } = req.query;
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;
      
      let whereClause = '1=1';
      const params = [];

      // Department scope: Finance Managers and Finance Clerks see all lines.
      // All other roles (including non-Finance HOPs/Leads) see only their own department.
      if (!canViewAllBudgetLines(req.user)) {
        whereClause += ' AND (bl.department_id = ? OR bl.department_id IS NULL)';
        params.push(userDepartmentId);
      }

      if (departmentId) {
        if (!canViewAllBudgetLines(req.user) && Number(departmentId) !== Number(userDepartmentId)) {
          return res.json({ success: true, data: [] });
        }
        // Include lines matching the department OR lines with no department assigned
        whereClause += ' AND (bl.department_id = ? OR bl.department_id IS NULL)';
        params.push(departmentId);
      }

      if (donorId) {
        whereClause += ' AND bl.donor_id = ?';
        params.push(donorId);
      }

      const { projectId } = req.query;
      if (projectId) {
        whereClause += ' AND bl.project_id = ?';
        params.push(projectId);
      }

      if (fiscalYear) {
        whereClause += ' AND bl.fiscal_year = ?';
        params.push(fiscalYear);
      }

      if (isActive !== undefined) {
        whereClause += ' AND bl.is_active = ?';
        params.push(isActive === 'true');
      }

      const budgetLines = await query(
        `SELECT bl.*, 
                COALESCE(d.department_name, 'N/A') as department_name,
                COALESCE(d.department_code, 'N/A') as department_code,
                COALESCE(don.donor_name, 'Unassigned') as donor_name,
                COALESCE(don.donor_code, 'N/A') as donor_code,
                COALESCE(p.project_code, NULLIF(bl.category, ''), 'UNASSIGNED') as project_code,
                COALESCE(p.project_name, '') as project_name,
                COALESCE(don.currency_code, 'USD') as currency_code,
                (bl.allocated_amount - bl.spent_amount) as balance,
                ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) as utilization_percentage
         FROM budget_lines bl
         LEFT JOIN departments d ON bl.department_id = d.id
         LEFT JOIN donors don ON bl.donor_id = don.id
         LEFT JOIN projects p ON bl.project_id = p.id
         WHERE ${whereClause}
         ORDER BY don.donor_name, p.project_code, bl.budget_name`,
        params
      );

      res.json({
        success: true,
        data: budgetLines
      });
    } catch (error) {
      console.error('Error fetching budget lines:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch budget lines'
      });
    }
  }

  /**
   * Get budget line by ID with transaction history
   * GET /api/budgets/:budgetLineId
   */
  async getBudgetLineById(req, res) {
    try {
      const { budgetLineId } = req.params;
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;

      const budgetLines = await query(
        `SELECT bl.*, 
                COALESCE(d.department_name, 'N/A') as department_name,
                COALESCE(d.department_code, 'N/A') as department_code
         FROM budget_lines bl
         LEFT JOIN departments d ON bl.department_id = d.id
         WHERE bl.id = ?`,
        [budgetLineId]
      );

      if (budgetLines.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Budget line not found'
        });
      }

      if (!canViewAllBudgetLines(req.user) && Number(budgetLines[0].department_id) !== Number(userDepartmentId)) {
        return res.status(403).json({
          success: false,
          error: 'You can only access budget lines from your department'
        });
      }

      // Get recent transactions
      const transactions = await query(
        `SELECT bt.*, 
                u.first_name,
                u.last_name,
                r.request_code
         FROM budget_transactions bt
         JOIN users u ON bt.performed_by = u.id
         LEFT JOIN requests r ON bt.request_id = r.id
         WHERE bt.budget_line_id = ?
         ORDER BY bt.created_at DESC
         LIMIT 50`,
        [budgetLineId]
      );

      res.json({
        success: true,
        data: {
          ...budgetLines[0],
          transactions
        }
      });
    } catch (error) {
      console.error('Error fetching budget line:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch budget line'
      });
    }
  }

  /**
   * Create new budget line (Finance Clerk only)
   * POST /api/budgets
   */
  async createBudgetLine(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { budgetCode, budgetName, departmentId, donorId, projectId, category, projectCode, fiscalYear, allocatedAmount, description } = req.body;
      const createdBy = req.user.id;
      // project_code stored in category for backward compat; project_id is the proper FK
      const normalizedProjectCode = (projectCode || category || null);

      const result = await transaction(async (connection) => {
        const normalizeSegment = (value, fallback) => {
          const cleaned = String(value || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
          return cleaned || fallback;
        };

        // Validate donor exists if provided
        let donorCode = 'DONOR';
        if (donorId) {
          const [donorCheck] = await connection.execute(
            'SELECT id, donor_code FROM donors WHERE id = ? AND is_active = TRUE',
            [donorId]
          );
          if (donorCheck.length === 0) {
            throw new Error('Selected donor not found or inactive');
          }
          donorCode = donorCheck[0].donor_code || donorCode;
        }

        // Validate project belongs to donor
        let resolvedProjectId = projectId || null;
        let resolvedProjectCode = normalizedProjectCode;
        if (projectId && donorId) {
          const [projCheck] = await connection.execute(
            'SELECT id, project_code FROM projects WHERE id = ? AND donor_id = ?',
            [projectId, donorId]
          );
          if (projCheck.length === 0) {
            throw new Error('Selected project does not belong to the chosen donor');
          }
          resolvedProjectCode = projCheck[0].project_code;
        } else if (projectId) {
          const [projCheck] = await connection.execute(
            'SELECT id, project_code, donor_id FROM projects WHERE id = ?',
            [projectId]
          );
          if (projCheck.length > 0) {
            resolvedProjectCode = projCheck[0].project_code;
            // If no donorId supplied, derive from project
            if (!donorId) {
              const [dCheck] = await connection.execute('SELECT donor_code FROM donors WHERE id = ?', [projCheck[0].donor_id]);
              if (dCheck.length > 0) donorCode = dCheck[0].donor_code;
            }
          }
        }

        let finalBudgetCode = (budgetCode || '').trim();

        if (!finalBudgetCode) {
          const projectSegment = normalizeSegment(resolvedProjectCode, 'PROJECT');
          const donorSegment = normalizeSegment(donorCode, 'DONOR');
          const prefix = `${donorSegment}-${projectSegment}-`;

          const [seqRows] = await connection.execute(
            'SELECT COUNT(*) + 1 AS seq FROM budget_lines WHERE budget_code LIKE ?',
            [`${prefix}%`]
          );

          finalBudgetCode = `${prefix}${String(seqRows[0].seq).padStart(4, '0')}`;
        }

        // Check for duplicate budget code
        const [existing] = await connection.execute(
          'SELECT id FROM budget_lines WHERE budget_code = ?',
          [finalBudgetCode]
        );

        if (existing.length > 0) {
          throw new Error('Budget code already exists');
        }

        // --- Hierarchy validation: budget line cannot exceed project available budget ---
        if (resolvedProjectId) {
          const [projRows] = await connection.execute(
            'SELECT total_budget FROM projects WHERE id = ?',
            [resolvedProjectId]
          );
          if (projRows.length > 0) {
            const projectBudget = parseFloat(projRows[0].total_budget || 0);
            const [otherLines] = await connection.execute(
              'SELECT COALESCE(SUM(allocated_amount), 0) AS other_total FROM budget_lines WHERE project_id = ?',
              [resolvedProjectId]
            );
            const otherTotal = parseFloat(otherLines[0].other_total || 0);
            const available = projectBudget - otherTotal;
            if (parseFloat(allocatedAmount) > available) {
              throw new Error(
                `Budget line allocation (${allocatedAmount}) exceeds the project's available budget. ` +
                `Project total: ${projectBudget}, already allocated to other lines: ${otherTotal}, ` +
                `available: ${available}.`
              );
            }
          }
        }

        // Insert budget line with donor_id, project_id, and category (for backward compat)
        const [insertResult] = await connection.execute(
          `INSERT INTO budget_lines (budget_code, budget_name, donor_id, project_id, department_id, category, fiscal_year, allocated_amount, description, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [finalBudgetCode, budgetName, donorId || null, resolvedProjectId, departmentId || null, resolvedProjectCode, fiscalYear, allocatedAmount, description, createdBy]
        );

        // Log the initial allocation
        await connection.execute(
          `INSERT INTO budget_transactions 
           (budget_line_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
           VALUES (?, 'ALLOCATION', ?, 0, ?, 'Initial budget allocation', ?)`,
          [insertResult.insertId, allocatedAmount, allocatedAmount, createdBy]
        );

        // Update donor total_allocated if donor is set
        if (donorId) {
          await connection.execute(
            `UPDATE donors SET total_allocated = total_allocated + ?, updated_at = NOW() WHERE id = ?`,
            [allocatedAmount, donorId]
          );
        }

        return insertResult.insertId;
      });

      res.status(201).json({
        success: true,
        message: 'Budget line created successfully',
        data: { id: result }
      });
    } catch (error) {
      console.error('Error creating budget line:', error);
      res.status(error.message.includes('already exists') ? 400 : 500).json({
        success: false,
        error: error.message || 'Failed to create budget line'
      });
    }
  }

  /**
   * Top up budget line (Finance Clerk only)
   * POST /api/budgets/:budgetLineId/topup
   */
  async topUpBudget(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { budgetLineId } = req.params;
      const { amount, description } = req.body;
      const performedBy = req.user.id;

      const result = await transaction(async (connection) => {
        // Lock and get current budget line
        const [budgetLines] = await connection.execute(
          'SELECT * FROM budget_lines WHERE id = ? FOR UPDATE',
          [budgetLineId]
        );

        if (budgetLines.length === 0) {
          throw new Error('Budget line not found');
        }

        const currentBalance = parseFloat(budgetLines[0].allocated_amount) - parseFloat(budgetLines[0].spent_amount);
        const currentAllocated = parseFloat(budgetLines[0].allocated_amount);
        const parsedAmount = parseFloat(amount);
        const newAllocated = currentAllocated + parsedAmount;
        const newBalance = currentBalance + parsedAmount;

        // For deductions, ensure we don't go below spent amount
        if (parsedAmount < 0 && newBalance < 0) {
          throw new Error('Deduction would result in negative balance');
        }

        // --- Hierarchy validation: top-up cannot push budget line above project available budget ---
        if (parsedAmount > 0 && budgetLines[0].project_id) {
          const [projRows] = await connection.execute(
            'SELECT total_budget FROM projects WHERE id = ?',
            [budgetLines[0].project_id]
          );
          if (projRows.length > 0) {
            const projectBudget = parseFloat(projRows[0].total_budget || 0);
            const [otherLines] = await connection.execute(
              'SELECT COALESCE(SUM(allocated_amount), 0) AS other_total FROM budget_lines WHERE project_id = ? AND id != ?',
              [budgetLines[0].project_id, budgetLineId]
            );
            const otherTotal = parseFloat(otherLines[0].other_total || 0);
            const maxAllowed = projectBudget - otherTotal;
            if (newAllocated > maxAllowed) {
              throw new Error(
                `Top-up would push budget line to ${newAllocated}, exceeding the project's available budget. ` +
                `Project total: ${projectBudget}, other lines allocated: ${otherTotal}, ` +
                `max this line can hold: ${maxAllowed}.`
              );
            }
          }
        }

        // Update allocated amount
        await connection.execute(
          'UPDATE budget_lines SET allocated_amount = ?, updated_at = NOW() WHERE id = ?',
          [newAllocated, budgetLineId]
        );

        const transactionType = parsedAmount >= 0 ? 'TOP_UP' : 'DEDUCTION';
        const defaultDesc = parsedAmount >= 0 ? 'Budget top-up' : 'Manual deduction';

        // Log the transaction
        await connection.execute(
          `INSERT INTO budget_transactions 
           (budget_line_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [budgetLineId, transactionType, Math.abs(parsedAmount), currentBalance, newBalance, description || defaultDesc, performedBy]
        );

        // Update donor total_allocated if budget line has a donor
        const donorId = budgetLines[0].donor_id;
        if (donorId) {
          await connection.execute(
            'UPDATE donors SET total_allocated = total_allocated + ?, updated_at = NOW() WHERE id = ?',
            [parsedAmount, donorId]
          );
        }

        return { currentBalance, newBalance, newAllocated };
      });

      res.json({
        success: true,
        message: `Budget topped up by $${parseFloat(amount).toFixed(2)}`,
        data: result
      });
    } catch (error) {
      console.error('Error topping up budget:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to top up budget'
      });
    }
  }

  /**
   * Update budget line (Finance Clerk only)
   * PUT /api/budgets/:budgetLineId
   */
  async updateBudgetLine(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { budgetLineId } = req.params;
      const { budgetCode, budgetName, description, isActive } = req.body;

      const result = await query(
        `UPDATE budget_lines 
         SET budget_code = COALESCE(?, budget_code),
             budget_name = COALESCE(?, budget_name),
             description = COALESCE(?, description),
             is_active = COALESCE(?, is_active),
             updated_at = NOW()
         WHERE id = ?`,
        [budgetCode ?? null, budgetName ?? null, description ?? null, isActive ?? null, budgetLineId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Budget line not found'
        });
      }

      res.json({
        success: true,
        message: 'Budget line updated successfully'
      });
    } catch (error) {
      console.error('Error updating budget line:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update budget line'
      });
    }
  }

  /**
   * Archive (soft-delete) a budget line.
   * Sets is_active = 0. All transaction history, request items, requests, approval logs,
   * and attachments are preserved exactly as-is. FK references remain intact.
   * DELETE /api/budgets/:budgetLineId
   */
  async deleteBudgetLine(req, res) {
    try {
      const { budgetLineId } = req.params;

      // Check if budget line exists
      const budgetLines = await query(
        'SELECT * FROM budget_lines WHERE id = ?',
        [budgetLineId]
      );

      if (budgetLines.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Budget line not found'
        });
      }

      // Soft delete: archive the budget line. All history (request_items, budget_transactions,
      // approval_logs, attachments, requests) remains in the database untouched.
      await query(
        'UPDATE budget_lines SET is_active = 0, updated_at = NOW() WHERE id = ?',
        [budgetLineId]
      );

      res.json({
        success: true,
        message: 'Budget line archived successfully. All transaction history has been preserved.'
      });
    } catch (error) {
      console.error('Error deleting budget line:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to archive budget line'
      });
    }
  }

  /**
   * Get budget summary by department
   * GET /api/budgets/summary
   */
  async getBudgetSummary(req, res) {
    try {
      const { fiscalYear } = req.query;
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;
      const yearFilter = fiscalYear ? 'AND bl.fiscal_year = ?' : '';
      const departmentScope = !canViewAllBudgetLines(req.user) ? 'WHERE d.id = ?' : '';
      const params = [];

      if (!canViewAllBudgetLines(req.user)) {
        params.push(userDepartmentId);
      }
      if (fiscalYear) {
        params.push(fiscalYear);
      }

      const summary = await query(
        `SELECT
          d.id as department_id,
          d.department_name,
          d.department_code,
          COUNT(bl.id) as budget_line_count,
          SUM(bl.allocated_amount) as total_allocated,
          SUM(bl.spent_amount) as total_spent,
          SUM(bl.allocated_amount - bl.spent_amount) as total_balance,
          ROUND(AVG((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100), 2) as avg_utilization
         FROM departments d
         LEFT JOIN budget_lines bl ON d.id = bl.department_id AND bl.is_active = TRUE ${yearFilter}
         ${departmentScope}
         GROUP BY d.id, d.department_name, d.department_code
         ORDER BY d.department_name`,
        params
      );

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error fetching budget summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch budget summary'
      });
    }
  }

  /**
   * Get budget lines by donor ID
   * GET /api/budgets/donor/:donorId
   */
  async getBudgetLinesByDonor(req, res) {
    try {
      const { donorId } = req.params;
      const { isActive } = req.query;
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;
      
      let whereClause = 'bl.donor_id = ?';
      const params = [donorId];

      if (!canViewAllBudgetLines(req.user)) {
        whereClause += ' AND (bl.department_id = ? OR bl.department_id IS NULL)';
        params.push(userDepartmentId);
      }

      if (isActive !== undefined) {
        whereClause += ' AND bl.is_active = ?';
        params.push(isActive === 'true');
      }

      const budgetLines = await query(
        `SELECT bl.*, 
                d.department_name,
                d.department_code,
                don.donor_name,
                don.donor_code,
          COALESCE(p.project_code, NULLIF(bl.category, ''), 'UNASSIGNED') as project_code,
                COALESCE(p.project_name, '') as project_name,
                don.currency_code,
                (bl.allocated_amount - bl.spent_amount) as balance,
                ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) as utilization_percentage
         FROM budget_lines bl
         LEFT JOIN departments d ON bl.department_id = d.id
         JOIN donors don ON bl.donor_id = don.id
         LEFT JOIN projects p ON bl.project_id = p.id
         WHERE ${whereClause}
         ORDER BY p.project_code, bl.budget_name`,
        params
      );

      res.json({
        success: true,
        data: budgetLines
      });
    } catch (error) {
      console.error('Error fetching budget lines by donor:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch budget lines'
      });
    }
  }

  /**
   * Get budget lines by project
   * GET /api/budgets/project/:projectId
   */
  async getBudgetLinesByProject(req, res) {
    try {
      const { projectId } = req.params;
      const { isActive } = req.query;
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;

      let whereClause = 'bl.project_id = ?';
      const params = [projectId];

      if (!canViewAllBudgetLines(req.user)) {
        whereClause += ' AND (bl.department_id = ? OR bl.department_id IS NULL)';
        params.push(userDepartmentId);
      }

      if (isActive !== undefined) {
        whereClause += ' AND bl.is_active = ?';
        params.push(isActive === 'true');
      }

      const budgetLines = await query(
        `SELECT bl.*,
                d.department_name,
                d.department_code,
                don.donor_name,
                don.donor_code,
                p.project_code,
                p.project_name,
                don.currency_code,
                (bl.allocated_amount - bl.spent_amount) as balance,
                ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) as utilization_percentage
         FROM budget_lines bl
         LEFT JOIN departments d ON bl.department_id = d.id
         JOIN donors don ON bl.donor_id = don.id
         JOIN projects p ON bl.project_id = p.id
         WHERE ${whereClause}
         ORDER BY bl.budget_code`,
        params
      );

      res.json({ success: true, data: budgetLines });
    } catch (error) {
      console.error('Error fetching budget lines by project:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch budget lines' });
    }
  }

  /**
   * Get requests linked to a budget line
   * GET /api/budgets/:budgetLineId/requests
   */
  async getBudgetLineRequests(req, res) {
    try {
      const budgetLineId = parseInt(req.params.budgetLineId);
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;
      
      // Validate budgetLineId
      if (isNaN(budgetLineId) || budgetLineId < 1) {
        return res.status(400).json({
          success: false,
          error: 'Invalid budget line ID'
        });
      }

      const { limit } = req.query;

      if (!canViewAllBudgetLines(req.user)) {
        const [budgetLine] = await query(
          'SELECT department_id FROM budget_lines WHERE id = ?',
          [budgetLineId]
        );

        if (!budgetLine || Number(budgetLine.department_id) !== Number(userDepartmentId)) {
          return res.status(403).json({
            success: false,
            error: 'You can only access budget lines from your department'
          });
        }
      }

      // Safely parse and validate limit
      let limitValue = parseInt(limit);
      if (isNaN(limitValue) || limitValue < 1) {
        limitValue = 50;
      }
      if (limitValue > 1000) {
        limitValue = 1000;
      }

      // Get ALL requests that have items from this budget line
      const requests = await query(
        `SELECT DISTINCT
                r.id,
                r.request_code,
                r.status,
                r.total_amount,
                r.justification,
                r.priority,
                r.created_at,
                r.submitted_at,
                r.completed_at,
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                d.department_name,
                d.department_code,
                (SELECT COALESCE(SUM(ri2.quantity * ri2.unit_price), 0)
                 FROM request_items ri2 
                 WHERE ri2.request_id = r.id AND ri2.budget_line_id = ?) as amount_from_budget
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         WHERE EXISTS (
           SELECT 1
           FROM request_items ri
           WHERE ri.request_id = r.id AND ri.budget_line_id = ?
         )
         ORDER BY r.created_at DESC
         LIMIT ?`,
        [budgetLineId, budgetLineId, limitValue]
      );

      // Get summary counts for requests that have items from this budget line
      const summary = await query(
        `SELECT 
           COUNT(DISTINCT r.id) as total_requests,
           SUM(CASE WHEN r.status = 'APPROVED' THEN ri.quantity * ri.unit_price ELSE 0 END) as total_approved_amount,
           SUM(CASE WHEN r.status IN ('PENDING_LEAD_APPROVAL', 'PENDING_HOP_APPROVAL', 'PENDING_FINANCE_APPROVAL') 
               THEN ri.quantity * ri.unit_price ELSE 0 END) as total_pending_amount
         FROM requests r
         JOIN request_items ri ON r.id = ri.request_id
         WHERE ri.budget_line_id = ?`,
        [budgetLineId]
      );

      res.json({
        success: true,
        data: {
          requests,
          summary: summary[0]
        }
      });
    } catch (error) {
      console.error('Error fetching budget line requests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch requests'
      });
    }
  }

  /**
   * Get detailed budget line info with donor
   * GET /api/budgets/:budgetLineId/details
   */
  async getBudgetLineDetails(req, res) {
    try {
      const { budgetLineId } = req.params;
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;

      const budgetLines = await query(
        `SELECT bl.*, 
                d.department_name,
                d.department_code,
                don.id as donor_id,
                don.donor_name,
                don.donor_code,
                don.donor_type,
                don.contact_person,
                don.email as donor_email,
                don.currency_code,
                don.fiscal_year as donor_fiscal_year,
                don.total_committed as donor_total_committed,
                don.total_allocated as donor_total_allocated,
                don.total_spent as donor_total_spent,
                (bl.allocated_amount - bl.spent_amount) as balance,
                ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) as utilization_percentage,
                u.first_name as created_by_first,
                u.last_name as created_by_last
         FROM budget_lines bl
         LEFT JOIN departments d ON bl.department_id = d.id
         LEFT JOIN donors don ON bl.donor_id = don.id
         LEFT JOIN users u ON bl.created_by = u.id
         WHERE bl.id = ?`,
        [budgetLineId]
      );

      if (budgetLines.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Budget line not found'
        });
      }

      if (!canViewAllBudgetLines(req.user) && Number(budgetLines[0].department_id) !== Number(userDepartmentId)) {
        return res.status(403).json({
          success: false,
          error: 'You can only access budget lines from your department'
        });
      }

      // Get recent transactions
      const transactions = await query(
        `SELECT bt.*, 
                u.first_name,
                u.last_name,
                r.request_code
         FROM budget_transactions bt
         JOIN users u ON bt.performed_by = u.id
         LEFT JOIN requests r ON bt.request_id = r.id
         WHERE bt.budget_line_id = ?
         ORDER BY bt.created_at DESC
         LIMIT 20`,
        [budgetLineId]
      );

      // Get request summary
      const requestSummary = await query(
        `SELECT 
           r.status,
           COUNT(DISTINCT r.id) as count,
           SUM(ri.quantity * ri.unit_price) as total_amount
         FROM requests r
         JOIN request_items ri ON r.id = ri.request_id
         WHERE ri.budget_line_id = ?
         GROUP BY r.status`,
        [budgetLineId]
      );

      res.json({
        success: true,
        data: {
          ...budgetLines[0],
          transactions,
          requestSummary
        }
      });
    } catch (error) {
      console.error('Error fetching budget line details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch budget line details'
      });
    }
  }

  /**
   * Get financial reports data
   * GET /api/budgets/reports
   * Returns: budget variance, donor summary, spending trends
   */
  async getFinancialReports(req, res) {
    try {
      const { fiscalYear, donorId, projectId, dateFrom, dateTo } = req.query;
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;
      const scoped = !canViewAllBudgetLines(req.user);
      const yearFilter = fiscalYear ? 'AND bl.fiscal_year = ?' : '';
      const yearParam = fiscalYear ? [parseInt(fiscalYear)] : [];
      const donorFilter = donorId ? 'AND bl.donor_id = ?' : '';
      const donorParam = donorId ? [parseInt(donorId)] : [];
      const projectFilter = projectId ? 'AND bl.project_id = ?' : '';
      const projectParam = projectId ? [parseInt(projectId)] : [];

      const scopedYearFilter = scoped
        ? `AND (bl.department_id = ? OR bl.department_id IS NULL) ${yearFilter} ${donorFilter} ${projectFilter}`
        : `${yearFilter} ${donorFilter} ${projectFilter}`;

      const scopedYearParam = scoped
        ? [userDepartmentId, ...yearParam, ...donorParam, ...projectParam]
        : [...yearParam, ...donorParam, ...projectParam];

      // Dept filter used in JOIN conditions (for donor/project summary queries)
      const deptJoinFilter = scoped ? 'AND (bl.department_id = ? OR bl.department_id IS NULL)' : '';
      const deptJoinParam = scoped ? [userDepartmentId] : [];

      // 1. Budget Variance by budget line
      const variance = await query(
        `SELECT 
          bl.id,
          bl.budget_code,
          bl.budget_name,
          bl.category,
          bl.allocated_amount,
          bl.spent_amount,
          (bl.allocated_amount - bl.spent_amount) as remaining,
          ROUND(COALESCE((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 0), 2) as utilization_pct,
          (bl.allocated_amount - bl.spent_amount) as variance_amount,
          CASE 
            WHEN bl.spent_amount > bl.allocated_amount THEN 'OVER_BUDGET'
            WHEN COALESCE((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 0) >= 90 THEN 'CRITICAL'
            WHEN COALESCE((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 0) >= 75 THEN 'WARNING'
            ELSE 'ON_TRACK'
          END as variance_status,
          d.department_name,
          d.department_code,
          don.donor_name,
          don.donor_code,
          don.currency_code,
          p.project_code,
          p.project_name
        FROM budget_lines bl
        LEFT JOIN departments d ON bl.department_id = d.id
        LEFT JOIN donors don ON bl.donor_id = don.id
        LEFT JOIN projects p ON bl.project_id = p.id
        WHERE bl.is_active = TRUE ${scopedYearFilter}
        ORDER BY utilization_pct DESC`,
        scopedYearParam
      );

      // 2. Donor financial summary (scoped to department when not a Finance Manager)
      const donorSummary = await query(
        `SELECT
          don.id as donor_id,
          don.donor_code,
          don.donor_name,
          don.currency_code,
          don.total_committed,
          COALESCE(SUM(bl.allocated_amount), 0) as total_allocated,
          COALESCE(SUM(bl.spent_amount), 0) as total_spent,
          COALESCE(SUM(bl.allocated_amount - bl.spent_amount), 0) as total_remaining,
          don.total_committed - COALESCE(SUM(bl.allocated_amount), 0) as unallocated,
          COUNT(bl.id) as budget_line_count,
          ROUND(COALESCE(AVG(COALESCE((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 0)), 0), 2) as avg_utilization
        FROM donors don
        LEFT JOIN budget_lines bl ON don.id = bl.donor_id AND bl.is_active = TRUE ${deptJoinFilter} ${yearFilter} ${projectFilter}
        WHERE don.is_active = TRUE ${donorId ? 'AND don.id = ?' : ''}
        GROUP BY don.id, don.donor_code, don.donor_name, don.currency_code, don.total_committed
        HAVING COUNT(bl.id) > 0
        ORDER BY don.donor_name`,
        [...deptJoinParam, ...yearParam, ...projectParam, ...donorParam]
      );

      // 2b. Project financial summary (scoped to department when not a Finance Manager)
      const projectSummary = await query(
        `SELECT
          p.id as project_id,
          p.project_code,
          p.project_name,
          p.donor_id,
          don.donor_code,
          don.donor_name,
          don.currency_code,
          p.total_budget,
          COALESCE(SUM(bl.allocated_amount), 0) as total_allocated,
          COALESCE(SUM(bl.spent_amount), 0) as total_spent,
          COALESCE(SUM(bl.allocated_amount - bl.spent_amount), 0) as total_remaining,
          COUNT(bl.id) as budget_line_count,
          ROUND(COALESCE(AVG(COALESCE((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 0)), 0), 2) as avg_utilization
        FROM projects p
        LEFT JOIN donors don ON p.donor_id = don.id
        LEFT JOIN budget_lines bl ON bl.project_id = p.id AND bl.is_active = TRUE ${deptJoinFilter} ${yearFilter}
        WHERE p.is_active = TRUE ${donorId ? 'AND p.donor_id = ?' : ''} ${projectId ? 'AND p.id = ?' : ''}
        GROUP BY p.id, p.project_code, p.project_name, p.donor_id, don.donor_code, don.donor_name, don.currency_code, p.total_budget
        HAVING COUNT(bl.id) > 0
        ORDER BY don.donor_name, p.project_name`,
        [...deptJoinParam, ...yearParam, ...donorParam, ...projectParam]
      );

      // 3. Department spending summary
      const departmentSummary = await query(
        `SELECT 
          d.id as department_id,
          d.department_name,
          d.department_code,
          COUNT(bl.id) as budget_line_count,
          COALESCE(SUM(bl.allocated_amount), 0) as total_allocated,
          COALESCE(SUM(bl.spent_amount), 0) as total_spent,
          COALESCE(SUM(bl.allocated_amount - bl.spent_amount), 0) as total_remaining,
          ROUND(COALESCE(AVG(COALESCE((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 0)), 0), 2) as avg_utilization
        FROM departments d
        LEFT JOIN budget_lines bl ON d.id = bl.department_id AND bl.is_active = TRUE ${scopedYearFilter}
        GROUP BY d.id, d.department_name, d.department_code
        HAVING COUNT(bl.id) > 0
        ORDER BY total_spent DESC`,
        scopedYearParam
      );

      // 4. Spending by category
      const categorySummary = await query(
        `SELECT 
          COALESCE(bl.category, 'Uncategorized') as category,
          COUNT(bl.id) as budget_line_count,
          COALESCE(SUM(bl.allocated_amount), 0) as total_allocated,
          COALESCE(SUM(bl.spent_amount), 0) as total_spent,
          COALESCE(SUM(bl.allocated_amount - bl.spent_amount), 0) as total_remaining,
          ROUND(COALESCE(AVG(COALESCE((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 0)), 0), 2) as avg_utilization
        FROM budget_lines bl
        WHERE bl.is_active = TRUE ${scopedYearFilter}
        GROUP BY bl.category
        ORDER BY total_spent DESC`,
        scopedYearParam
      );

      // 5. Request status summary
      const requestSummary = await query(
        `SELECT 
          r.status,
          COUNT(*) as count,
          COALESCE(SUM(r.total_amount), 0) as total_amount
        FROM requests r
        WHERE 1=1 ${scoped ? 'AND r.department_id = ?' : ''} ${fiscalYear ? 'AND YEAR(r.created_at) = ?' : ''}
        GROUP BY r.status
        ORDER BY count DESC`,
        scoped ? [userDepartmentId, ...yearParam] : yearParam
      );

      // 6. Spending trend queries
      //    Two sources are UNION-ed to guarantee accurate data regardless of how spending was recorded.
      //    If dateFrom/dateTo are provided they override the default rolling-window intervals.

      // Validate and sanitise custom date range
      const customFrom = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : null;
      const customTo   = dateTo   && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)   ? dateTo   : null;
      const useCustomRange = customFrom && customTo;

      // Time-window clause builders
      // When using a preset interval (not custom range) the interval is embedded
      // directly in the SQL string — no placeholder needed, so params = [].
      const btWindow = (interval) =>
        useCustomRange
          ? `bt.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`
          : `bt.created_at >= DATE_SUB(CURDATE(), INTERVAL ${interval})`;
      const btWindowParams = () =>
        useCustomRange ? [customFrom, customTo] : [];

      const alWindow = (interval) =>
        useCustomRange
          ? `al.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`
          : `al.created_at >= DATE_SUB(CURDATE(), INTERVAL ${interval})`;
      const alWindowParams = () =>
        useCustomRange ? [customFrom, customTo] : [];

      // Scope/donor/project filter for Source A (budget_transactions JOIN budget_lines)
      const trendBtFilter = scoped
        ? `AND (bl.department_id = ? OR bl.department_id IS NULL) ${donorFilter} ${projectFilter}`
        : `${donorFilter} ${projectFilter}`;
      const trendBtParams = scoped
        ? [userDepartmentId, ...donorParam, ...projectParam]
        : [...donorParam, ...projectParam];

      // Scope/donor/project filter for Source B (requests table)
      const trendReqFilter = scoped
        ? `AND r.department_id = ? ${donorId ? 'AND r.donor_id = ?' : ''} ${projectId ? 'AND r.project_id = ?' : ''}`
        : `${donorId ? 'AND r.donor_id = ?' : ''} ${projectId ? 'AND r.project_id = ?' : ''}`;
      const trendReqParams = scoped
        ? [userDepartmentId, ...donorParam, ...projectParam]
        : [...donorParam, ...projectParam];

      // Helper to build the full params array for a single trend query.
      // btWindowParams / alWindowParams return [] when the interval is embedded
      // directly in the SQL (no custom range), so params align with placeholders.
      const trendParams = () => [
        ...btWindowParams(),   // Source A time window (2 params if custom, 0 otherwise)
        ...trendBtParams,      // Source A scope
        ...alWindowParams(),   // Source B time window (2 params if custom, 0 otherwise)
        ...trendReqParams      // Source B scope
      ];

      // 6a. Weekly spending
      const spendingWeekly = await query(
        `SELECT
          period, sort_key,
          SUM(spent_amount)     as total_spent,
          SUM(allocated_amount) as total_allocated,
          SUM(topup_amount)     as total_topup,
          SUM(reversal_amount)  as total_reversals,
          SUM(tx_count)         as transaction_count
        FROM (
          SELECT
            CONCAT(YEAR(bt.created_at), '-W', LPAD(WEEK(bt.created_at, 1), 2, '0')) as period,
            YEARWEEK(bt.created_at, 1) as sort_key,
            CASE WHEN bt.transaction_type = 'DEDUCTION'  THEN bt.amount ELSE 0 END as spent_amount,
            CASE WHEN bt.transaction_type = 'ALLOCATION' THEN bt.amount ELSE 0 END as allocated_amount,
            CASE WHEN bt.transaction_type = 'TOP_UP'     THEN bt.amount ELSE 0 END as topup_amount,
            CASE WHEN bt.transaction_type = 'REVERSAL'   THEN bt.amount ELSE 0 END as reversal_amount,
            1 as tx_count
          FROM budget_transactions bt
          JOIN budget_lines bl ON bt.budget_line_id = bl.id
          WHERE ${btWindow('8 WEEK')} ${trendBtFilter}
          UNION ALL
          SELECT
            CONCAT(YEAR(al.created_at), '-W', LPAD(WEEK(al.created_at, 1), 2, '0')) as period,
            YEARWEEK(al.created_at, 1) as sort_key,
            (ri.quantity * ri.unit_price) as spent_amount,
            0, 0, 0, 1
          FROM requests r
          JOIN request_items ri ON ri.request_id = r.id
          JOIN budget_lines bl ON ri.budget_line_id = bl.id
          JOIN (SELECT request_id, MIN(created_at) as created_at FROM approval_logs WHERE action = 'DISPATCHED' GROUP BY request_id) al ON al.request_id = r.id
          LEFT JOIN budget_transactions bt_chk ON bt_chk.request_id = r.id AND bt_chk.transaction_type = 'DEDUCTION'
          WHERE bt_chk.id IS NULL
            AND ${alWindow('8 WEEK')}
            AND r.status IN ('DISPATCHED','PENDING_RECONCILIATION','RECONCILED','RECON_PENDING_LEAD','RECON_PENDING_FINANCE')
            ${trendReqFilter}
        ) s
        GROUP BY period, sort_key
        ORDER BY sort_key ASC`,
        trendParams()
      );

      // 6b. Monthly spending
      const spendingMonthly = await query(
        `SELECT
          period, sort_key,
          SUM(spent_amount)     as total_spent,
          SUM(allocated_amount) as total_allocated,
          SUM(topup_amount)     as total_topup,
          SUM(reversal_amount)  as total_reversals,
          SUM(tx_count)         as transaction_count
        FROM (
          SELECT
            DATE_FORMAT(bt.created_at, '%b %Y') as period,
            DATE_FORMAT(bt.created_at, '%Y-%m')  as sort_key,
            CASE WHEN bt.transaction_type = 'DEDUCTION'  THEN bt.amount ELSE 0 END as spent_amount,
            CASE WHEN bt.transaction_type = 'ALLOCATION' THEN bt.amount ELSE 0 END as allocated_amount,
            CASE WHEN bt.transaction_type = 'TOP_UP'     THEN bt.amount ELSE 0 END as topup_amount,
            CASE WHEN bt.transaction_type = 'REVERSAL'   THEN bt.amount ELSE 0 END as reversal_amount,
            1 as tx_count
          FROM budget_transactions bt
          JOIN budget_lines bl ON bt.budget_line_id = bl.id
          WHERE ${btWindow('12 MONTH')} ${trendBtFilter}
          UNION ALL
          SELECT
            DATE_FORMAT(al.created_at, '%b %Y') as period,
            DATE_FORMAT(al.created_at, '%Y-%m')  as sort_key,
            (ri.quantity * ri.unit_price) as spent_amount,
            0, 0, 0, 1
          FROM requests r
          JOIN request_items ri ON ri.request_id = r.id
          JOIN budget_lines bl ON ri.budget_line_id = bl.id
          JOIN (SELECT request_id, MIN(created_at) as created_at FROM approval_logs WHERE action = 'DISPATCHED' GROUP BY request_id) al ON al.request_id = r.id
          LEFT JOIN budget_transactions bt_chk ON bt_chk.request_id = r.id AND bt_chk.transaction_type = 'DEDUCTION'
          WHERE bt_chk.id IS NULL
            AND ${alWindow('12 MONTH')}
            AND r.status IN ('DISPATCHED','PENDING_RECONCILIATION','RECONCILED','RECON_PENDING_LEAD','RECON_PENDING_FINANCE')
            ${trendReqFilter}
        ) s
        GROUP BY period, sort_key
        ORDER BY sort_key ASC`,
        trendParams()
      );

      // 6c. Quarterly spending
      const spendingQuarterly = await query(
        `SELECT
          period, sort_key,
          SUM(spent_amount)     as total_spent,
          SUM(allocated_amount) as total_allocated,
          SUM(topup_amount)     as total_topup,
          SUM(reversal_amount)  as total_reversals,
          SUM(tx_count)         as transaction_count
        FROM (
          SELECT
            CONCAT(YEAR(bt.created_at), ' Q', QUARTER(bt.created_at)) as period,
            YEAR(bt.created_at) * 10 + QUARTER(bt.created_at) as sort_key,
            CASE WHEN bt.transaction_type = 'DEDUCTION'  THEN bt.amount ELSE 0 END as spent_amount,
            CASE WHEN bt.transaction_type = 'ALLOCATION' THEN bt.amount ELSE 0 END as allocated_amount,
            CASE WHEN bt.transaction_type = 'TOP_UP'     THEN bt.amount ELSE 0 END as topup_amount,
            CASE WHEN bt.transaction_type = 'REVERSAL'   THEN bt.amount ELSE 0 END as reversal_amount,
            1 as tx_count
          FROM budget_transactions bt
          JOIN budget_lines bl ON bt.budget_line_id = bl.id
          WHERE ${btWindow('2 YEAR')} ${trendBtFilter}
          UNION ALL
          SELECT
            CONCAT(YEAR(al.created_at), ' Q', QUARTER(al.created_at)) as period,
            YEAR(al.created_at) * 10 + QUARTER(al.created_at) as sort_key,
            (ri.quantity * ri.unit_price) as spent_amount,
            0, 0, 0, 1
          FROM requests r
          JOIN request_items ri ON ri.request_id = r.id
          JOIN budget_lines bl ON ri.budget_line_id = bl.id
          JOIN (SELECT request_id, MIN(created_at) as created_at FROM approval_logs WHERE action = 'DISPATCHED' GROUP BY request_id) al ON al.request_id = r.id
          LEFT JOIN budget_transactions bt_chk ON bt_chk.request_id = r.id AND bt_chk.transaction_type = 'DEDUCTION'
          WHERE bt_chk.id IS NULL
            AND ${alWindow('2 YEAR')}
            AND r.status IN ('DISPATCHED','PENDING_RECONCILIATION','RECONCILED','RECON_PENDING_LEAD','RECON_PENDING_FINANCE')
            ${trendReqFilter}
        ) s
        GROUP BY period, sort_key
        ORDER BY sort_key ASC`,
        trendParams()
      );

      // 6d. Yearly spending
      const spendingYearly = await query(
        `SELECT
          period, sort_key,
          SUM(spent_amount)     as total_spent,
          SUM(allocated_amount) as total_allocated,
          SUM(topup_amount)     as total_topup,
          SUM(reversal_amount)  as total_reversals,
          SUM(tx_count)         as transaction_count
        FROM (
          SELECT
            CAST(YEAR(bt.created_at) AS CHAR) as period,
            YEAR(bt.created_at) as sort_key,
            CASE WHEN bt.transaction_type = 'DEDUCTION'  THEN bt.amount ELSE 0 END as spent_amount,
            CASE WHEN bt.transaction_type = 'ALLOCATION' THEN bt.amount ELSE 0 END as allocated_amount,
            CASE WHEN bt.transaction_type = 'TOP_UP'     THEN bt.amount ELSE 0 END as topup_amount,
            CASE WHEN bt.transaction_type = 'REVERSAL'   THEN bt.amount ELSE 0 END as reversal_amount,
            1 as tx_count
          FROM budget_transactions bt
          JOIN budget_lines bl ON bt.budget_line_id = bl.id
          WHERE ${btWindow('5 YEAR')} ${trendBtFilter}
          UNION ALL
          SELECT
            CAST(YEAR(al.created_at) AS CHAR) as period,
            YEAR(al.created_at) as sort_key,
            (ri.quantity * ri.unit_price) as spent_amount,
            0, 0, 0, 1
          FROM requests r
          JOIN request_items ri ON ri.request_id = r.id
          JOIN budget_lines bl ON ri.budget_line_id = bl.id
          JOIN (SELECT request_id, MIN(created_at) as created_at FROM approval_logs WHERE action = 'DISPATCHED' GROUP BY request_id) al ON al.request_id = r.id
          LEFT JOIN budget_transactions bt_chk ON bt_chk.request_id = r.id AND bt_chk.transaction_type = 'DEDUCTION'
          WHERE bt_chk.id IS NULL
            AND ${alWindow('5 YEAR')}
            AND r.status IN ('DISPATCHED','PENDING_RECONCILIATION','RECONCILED','RECON_PENDING_LEAD','RECON_PENDING_FINANCE')
            ${trendReqFilter}
        ) s
        GROUP BY period, sort_key
        ORDER BY sort_key ASC`,
        trendParams()
      );

      // 7. Reconciliation summary
      const reconciliationSummary = await query(
        `SELECT 
          rec.status,
          COUNT(*) as count,
          COALESCE(SUM(rec.total_spent), 0) as total_spent,
          COALESCE(SUM(rec.total_returned), 0) as total_returned
        FROM reconciliations rec
        JOIN requests r ON r.id = rec.request_id
        WHERE 1=1 ${scoped ? 'AND r.department_id = ?' : ''} ${fiscalYear ? 'AND YEAR(rec.created_at) = ?' : ''}
        GROUP BY rec.status`,
        scoped ? [userDepartmentId, ...yearParam] : yearParam
      );

      // 8. Overall totals
      const totals = await query(
        `SELECT 
          COALESCE(SUM(bl.allocated_amount), 0) as grand_total_allocated,
          COALESCE(SUM(bl.spent_amount), 0) as grand_total_spent,
          COALESCE(SUM(bl.allocated_amount - bl.spent_amount), 0) as grand_total_remaining,
          COUNT(bl.id) as total_budget_lines,
          ROUND(COALESCE(AVG(COALESCE((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 0)), 0), 2) as overall_utilization
        FROM budget_lines bl
        WHERE bl.is_active = TRUE ${scopedYearFilter}`,
        scopedYearParam
      );

      res.json({
        success: true,
        data: {
          totals: totals[0],
          variance,
          donorSummary,
          departmentSummary,
          categorySummary,
          requestSummary,
          spendingWeekly,
          spendingMonthly,
          spendingQuarterly,
          spendingYearly,
          reconciliationSummary,
          projectSummary
        }
      });
    } catch (error) {
      console.error('Error fetching financial reports:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch financial reports'
      });
    }
  }
}

module.exports = new BudgetController();
