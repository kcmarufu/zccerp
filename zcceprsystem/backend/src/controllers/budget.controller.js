/**
 * Budget Controller
 * Handles budget line management for Finance Clerks
 */

const { validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');

class BudgetController {

  /**
   * Get all budget lines
   * GET /api/budgets
   */
  async getBudgetLines(req, res) {
    try {
      const { departmentId, donorId, fiscalYear, isActive } = req.query;
      
      let whereClause = '1=1';
      const params = [];

      if (departmentId) {
        whereClause += ' AND bl.department_id = ?';
        params.push(departmentId);
      }

      if (donorId) {
        whereClause += ' AND bl.donor_id = ?';
        params.push(donorId);
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
                COALESCE(don.currency_code, 'USD') as currency_code,
                (bl.allocated_amount - bl.spent_amount) as balance,
                ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) as utilization_percentage
         FROM budget_lines bl
         LEFT JOIN departments d ON bl.department_id = d.id
         LEFT JOIN donors don ON bl.donor_id = don.id
         WHERE ${whereClause}
         ORDER BY don.donor_name, bl.category, bl.budget_name`,
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

      const budgetLines = await query(
        `SELECT bl.*, 
                d.department_name,
                d.department_code
         FROM budget_lines bl
         JOIN departments d ON bl.department_id = d.id
         WHERE bl.id = ?`,
        [budgetLineId]
      );

      if (budgetLines.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Budget line not found'
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

      const { budgetCode, budgetName, departmentId, donorId, category, fiscalYear, allocatedAmount, description } = req.body;
      const createdBy = req.user.id;

      const result = await transaction(async (connection) => {
        // Check for duplicate budget code
        const [existing] = await connection.execute(
          'SELECT id FROM budget_lines WHERE budget_code = ?',
          [budgetCode]
        );

        if (existing.length > 0) {
          throw new Error('Budget code already exists');
        }

        // Validate donor exists if provided
        if (donorId) {
          const [donorCheck] = await connection.execute(
            'SELECT id FROM donors WHERE id = ? AND is_active = TRUE',
            [donorId]
          );
          if (donorCheck.length === 0) {
            throw new Error('Selected donor not found or inactive');
          }
        }

        // Insert budget line with donor_id and category
        const [insertResult] = await connection.execute(
          `INSERT INTO budget_lines (budget_code, budget_name, donor_id, department_id, category, fiscal_year, allocated_amount, description, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [budgetCode, budgetName, donorId || null, departmentId || null, category || null, fiscalYear, allocatedAmount, description, createdBy]
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
      const { budgetName, description, isActive } = req.body;

      const result = await query(
        `UPDATE budget_lines 
         SET budget_name = COALESCE(?, budget_name),
             description = COALESCE(?, description),
             is_active = COALESCE(?, is_active),
             updated_at = NOW()
         WHERE id = ?`,
        [budgetName, description, isActive, budgetLineId]
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
   * Delete budget line (Finance Clerk only)
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

      const budgetLine = budgetLines[0];

      // Check if budget line has been used (spent_amount > 0)
      if (parseFloat(budgetLine.spent_amount) > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete budget line that has been used. Consider deactivating it instead.'
        });
      }

      // Delete any request items linked to this budget line
      // First find requests that ONLY have items from this budget line so we can clean them up
      const linkedItems = await query(
        'SELECT ri.id, ri.request_id FROM request_items WHERE budget_line_id = ?',
        [budgetLineId]
      );

      if (linkedItems.length > 0) {
        const requestIds = [...new Set(linkedItems.map(i => i.request_id))];

        // Delete request items linked to this budget line
        await query('DELETE FROM request_items WHERE budget_line_id = ?', [budgetLineId]);

        // For each affected request, check if it still has items - if not, delete the request too
        for (const requestId of requestIds) {
          const remaining = await query(
            'SELECT COUNT(*) as count FROM request_items WHERE request_id = ?',
            [requestId]
          );
          if (remaining[0].count === 0) {
            // Delete orphaned request (no items left)
            await query('DELETE FROM approvals WHERE request_id = ?', [requestId]);
            await query('DELETE FROM attachments WHERE request_id = ?', [requestId]);
            await query('DELETE FROM requests WHERE id = ?', [requestId]);
          }
        }
      }

      // Safe to delete - no transactions or linked items
      // Decrement donor total_allocated if budget line has a donor
      if (budgetLine.donor_id) {
        await query(
          'UPDATE donors SET total_allocated = GREATEST(total_allocated - ?, 0), updated_at = NOW() WHERE id = ?',
          [parseFloat(budgetLine.allocated_amount), budgetLine.donor_id]
        );
      }

      await query('DELETE FROM budget_transactions WHERE budget_line_id = ?', [budgetLineId]);
      await query('DELETE FROM budget_lines WHERE id = ?', [budgetLineId]);

      res.json({
        success: true,
        message: 'Budget line deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting budget line:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete budget line'
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
      const yearFilter = fiscalYear ? 'AND bl.fiscal_year = ?' : '';
      const params = fiscalYear ? [fiscalYear] : [];

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
      
      let whereClause = 'bl.donor_id = ?';
      const params = [donorId];

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
                don.currency_code,
                (bl.allocated_amount - bl.spent_amount) as balance,
                ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) as utilization_percentage
         FROM budget_lines bl
         LEFT JOIN departments d ON bl.department_id = d.id
         JOIN donors don ON bl.donor_id = don.id
         WHERE ${whereClause}
         ORDER BY bl.category, bl.budget_name`,
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
   * Get requests linked to a budget line
   * GET /api/budgets/:budgetLineId/requests
   */
  async getBudgetLineRequests(req, res) {
    try {
      const budgetLineId = parseInt(req.params.budgetLineId);
      
      // Validate budgetLineId
      if (isNaN(budgetLineId) || budgetLineId < 1) {
        return res.status(400).json({
          success: false,
          error: 'Invalid budget line ID'
        });
      }

      const { status, limit } = req.query;

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
      const { fiscalYear } = req.query;
      const yearFilter = fiscalYear ? 'AND bl.fiscal_year = ?' : '';
      const yearParam = fiscalYear ? [parseInt(fiscalYear)] : [];

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
          don.currency_code
        FROM budget_lines bl
        LEFT JOIN departments d ON bl.department_id = d.id
        LEFT JOIN donors don ON bl.donor_id = don.id
        WHERE bl.is_active = TRUE ${yearFilter}
        ORDER BY utilization_pct DESC`,
        yearParam
      );

      // 2. Donor financial summary
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
        LEFT JOIN budget_lines bl ON don.id = bl.donor_id AND bl.is_active = TRUE ${yearFilter}
        WHERE don.is_active = TRUE
        GROUP BY don.id, don.donor_code, don.donor_name, don.currency_code, don.total_committed
        ORDER BY don.donor_name`,
        yearParam
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
        LEFT JOIN budget_lines bl ON d.id = bl.department_id AND bl.is_active = TRUE ${yearFilter}
        GROUP BY d.id, d.department_name, d.department_code
        HAVING COUNT(bl.id) > 0
        ORDER BY total_spent DESC`,
        yearParam
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
        WHERE bl.is_active = TRUE ${yearFilter}
        GROUP BY bl.category
        ORDER BY total_spent DESC`,
        yearParam
      );

      // 5. Request status summary
      const requestSummary = await query(
        `SELECT 
          r.status,
          COUNT(*) as count,
          COALESCE(SUM(r.total_amount), 0) as total_amount
        FROM requests r
        WHERE 1=1 ${fiscalYear ? 'AND YEAR(r.created_at) = ?' : ''}
        GROUP BY r.status
        ORDER BY count DESC`,
        yearParam
      );

      // 6. Monthly spending trend (last 12 months)
      const spendingTrend = await query(
        `SELECT 
          DATE_FORMAT(bt.created_at, '%Y-%m') as month,
          SUM(CASE WHEN bt.transaction_type = 'DEDUCTION' THEN bt.amount ELSE 0 END) as total_spent,
          SUM(CASE WHEN bt.transaction_type = 'ALLOCATION' THEN bt.amount ELSE 0 END) as total_allocated,
          SUM(CASE WHEN bt.transaction_type = 'TOP_UP' THEN bt.amount ELSE 0 END) as total_topup,
          SUM(CASE WHEN bt.transaction_type = 'REVERSAL' THEN bt.amount ELSE 0 END) as total_reversals,
          COUNT(*) as transaction_count
        FROM budget_transactions bt
        WHERE bt.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(bt.created_at, '%Y-%m')
        ORDER BY month ASC`
      );

      // 7. Reconciliation summary
      const reconciliationSummary = await query(
        `SELECT 
          rec.status,
          COUNT(*) as count,
          COALESCE(SUM(rec.total_spent), 0) as total_spent,
          COALESCE(SUM(rec.total_returned), 0) as total_returned
        FROM reconciliations rec
        WHERE 1=1 ${fiscalYear ? 'AND YEAR(rec.created_at) = ?' : ''}
        GROUP BY rec.status`,
        yearParam
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
        WHERE bl.is_active = TRUE ${yearFilter}`,
        yearParam
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
          spendingTrend,
          reconciliationSummary
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
