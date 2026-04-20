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
      const { departmentId, fiscalYear, isActive } = req.query;
      
      let whereClause = '1=1';
      const params = [];

      if (departmentId) {
        whereClause += ' AND bl.department_id = ?';
        params.push(departmentId);
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
                d.department_name,
                d.department_code,
                ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) as utilization_percentage
         FROM budget_lines bl
         JOIN departments d ON bl.department_id = d.id
         WHERE ${whereClause}
         ORDER BY d.department_name, bl.budget_name`,
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
                r.request_number
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

      const { budgetCode, budgetName, departmentId, fiscalYear, allocatedAmount, description } = req.body;
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

        // Insert budget line
        const [insertResult] = await connection.execute(
          `INSERT INTO budget_lines (budget_code, budget_name, department_id, fiscal_year, allocated_amount, description, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [budgetCode, budgetName, departmentId, fiscalYear, allocatedAmount, description, createdBy]
        );

        // Log the initial allocation
        await connection.execute(
          `INSERT INTO budget_transactions 
           (budget_line_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
           VALUES (?, 'ALLOCATION', ?, 0, ?, 'Initial budget allocation', ?)`,
          [insertResult.insertId, allocatedAmount, allocatedAmount, createdBy]
        );

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

        const currentBalance = parseFloat(budgetLines[0].balance);
        const currentAllocated = parseFloat(budgetLines[0].allocated_amount);
        const newBalance = currentBalance + parseFloat(amount);
        const newAllocated = currentAllocated + parseFloat(amount);

        // Update allocated amount
        await connection.execute(
          'UPDATE budget_lines SET allocated_amount = ? WHERE id = ?',
          [newAllocated, budgetLineId]
        );

        // Log the transaction
        await connection.execute(
          `INSERT INTO budget_transactions 
           (budget_line_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
           VALUES (?, 'TOP_UP', ?, ?, ?, ?, ?)`,
          [budgetLineId, amount, currentBalance, newBalance, description || 'Budget top-up', performedBy]
        );

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
             is_active = COALESCE(?, is_active)
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

      // Check if there are any request items linked to this budget line
      const linkedItems = await query(
        'SELECT COUNT(*) as count FROM request_items WHERE budget_line_id = ?',
        [budgetLineId]
      );

      if (linkedItems[0].count > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete budget line that is linked to requests. Consider deactivating it instead.'
        });
      }

      // Safe to delete - no transactions or linked items
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
          SUM(bl.balance) as total_balance,
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
}

module.exports = new BudgetController();
