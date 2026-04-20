/**
 * Request Controller
 * Handles HTTP requests for procurement requests
 */

const { validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { REQUEST_STATUS, ROLES } = require('../config/roles');
const approvalService = require('../services/approval.service');

class RequestController {

  /**
   * Create a new procurement request
   * POST /api/requests
   */
  async createRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { justification, priority, items } = req.body;
      const userId = req.user.id;
      const departmentId = req.user.department_id;

      const result = await transaction(async (connection) => {
        // Generate request number
        const year = new Date().getFullYear();
        const [countResult] = await connection.execute(
          `SELECT COUNT(*) + 1 as seq FROM requests WHERE YEAR(created_at) = ?`,
          [year]
        );
        const requestNumber = `REQ-${year}-${String(countResult[0].seq).padStart(6, '0')}`;

        // Calculate total amount from items
        const totalAmount = items.reduce((sum, item) => {
          const itemTotal = (item.quantity || 1) * (item.unitPrice || 0);
          return sum + itemTotal;
        }, 0);

        // Insert request
        const [requestResult] = await connection.execute(
          `INSERT INTO requests (request_number, requester_id, department_id, status, justification, priority, total_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [requestNumber, userId, departmentId, REQUEST_STATUS.DRAFT, justification, priority || 'MEDIUM', totalAmount]
        );

        const requestId = requestResult.insertId;

        // Insert items
        for (const item of items) {
          await connection.execute(
            `INSERT INTO request_items (request_id, item_description, quantity, unit_of_measure, unit_price, budget_line_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [requestId, item.itemDescription, item.quantity, item.unitOfMeasure || 'EACH', 
             item.unitPrice, item.budgetLineId, item.notes || null]
          );
        }

        return { requestId, requestNumber };
      });

      res.status(201).json({
        success: true,
        message: 'Request created successfully',
        data: result
      });
    } catch (error) {
      console.error('Error creating request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create request'
      });
    }
  }

  /**
   * Get request by ID with items and approval trail
   * GET /api/requests/:requestId
   */
  async getRequestById(req, res) {
    try {
      const { requestId } = req.params;

      // Get request details
      const requests = await query(
        `SELECT r.*, 
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                u.email as requester_email,
                d.department_name,
                d.department_code
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         WHERE r.id = ?`,
        [requestId]
      );

      if (requests.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Request not found'
        });
      }

      // Get items with budget line info
      const items = await query(
        `SELECT ri.*, 
                bl.budget_code,
                bl.budget_name,
                bl.balance as budget_balance
         FROM request_items ri
         JOIN budget_lines bl ON ri.budget_line_id = bl.id
         WHERE ri.request_id = ?`,
        [requestId]
      );

      // Get approval trail
      const approvalTrail = await approvalService.getApprovalTrail(requestId);

      res.json({
        success: true,
        data: {
          ...requests[0],
          items,
          approvalTrail
        }
      });
    } catch (error) {
      console.error('Error fetching request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch request'
      });
    }
  }

  /**
   * Get requests for current user (based on role)
   * GET /api/requests
   */
  async getRequests(req, res) {
    try {
      const { status, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const offset = (pageNum - 1) * limitNum;
      const userRole = req.user.role;
      const userId = req.user.id;
      const departmentId = req.user.department_id;

      let whereClause = '1=1';
      const params = [];

      // Role-based filtering
      if (userRole === ROLES.GENERAL_USER) {
        whereClause += ' AND r.requester_id = ?';
        params.push(userId);
      } else if (userRole === ROLES.PROGRAM_LEAD) {
        whereClause += ' AND r.department_id = ?';
        params.push(departmentId);
      }
      // HOP and Finance can see all

      // Status filter
      if (status) {
        whereClause += ' AND r.status = ?';
        params.push(status);
      }

      // Get total count
      const [countResult] = await query(
        `SELECT COUNT(*) as total FROM requests r WHERE ${whereClause}`,
        params
      );

      // Validate sort order
      const validSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
      const validSortBy = ['created_at', 'updated_at', 'submitted_at', 'total_amount', 'status', 'request_number'].includes(sortBy) ? sortBy : 'created_at';

      // Get paginated results
      const requests = await query(
        `SELECT r.*,
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                d.department_name,
                d.department_code
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         WHERE ${whereClause}
         ORDER BY r.${validSortBy} ${validSortOrder}
         LIMIT ? OFFSET ?`,
        [...params, limitNum, offset]
      );

      res.json({
        success: true,
        data: {
          requests,
          pagination: {
            total: countResult[0].total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(countResult[0].total / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('Error fetching requests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch requests'
      });
    }
  }

  /**
   * Update request (only DRAFT status)
   * PUT /api/requests/:requestId
   */
  async updateRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { requestId } = req.params;
      const { justification, priority, items } = req.body;
      const userId = req.user.id;

      await transaction(async (connection) => {
        // Lock and validate
        const [requests] = await connection.execute(
          'SELECT * FROM requests WHERE id = ? FOR UPDATE',
          [requestId]
        );

        if (requests.length === 0) {
          throw new Error('Request not found');
        }

        if (requests[0].requester_id !== userId) {
          throw new Error('You can only edit your own requests');
        }

        if (requests[0].status !== REQUEST_STATUS.DRAFT) {
          throw new Error('Can only edit requests in DRAFT status');
        }

        // Update request
        await connection.execute(
          'UPDATE requests SET justification = ?, priority = ? WHERE id = ?',
          [justification || requests[0].justification, priority || requests[0].priority, requestId]
        );

        // Update items if provided
        if (items && items.length > 0) {
          // Delete existing items
          await connection.execute('DELETE FROM request_items WHERE request_id = ?', [requestId]);

          // Insert new items
          for (const item of items) {
            await connection.execute(
              `INSERT INTO request_items (request_id, item_description, quantity, unit_of_measure, unit_price, budget_line_id, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [requestId, item.itemDescription, item.quantity, item.unitOfMeasure || 'EACH',
               item.unitPrice, item.budgetLineId, item.notes || null]
            );
          }
        }
      });

      res.json({
        success: true,
        message: 'Request updated successfully'
      });
    } catch (error) {
      console.error('Error updating request:', error);
      res.status(error.message.includes('not found') ? 404 : 400).json({
        success: false,
        error: error.message || 'Failed to update request'
      });
    }
  }

  /**
   * Submit request for approval
   * POST /api/requests/:requestId/submit
   */
  async submitRequest(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user.id;
      const ipAddress = req.ip;

      const result = await approvalService.submitRequest(requestId, userId, ipAddress);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error submitting request:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to submit request'
      });
    }
  }

  /**
   * Delete request (only DRAFT status)
   * DELETE /api/requests/:requestId
   */
  async deleteRequest(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user.id;

      await transaction(async (connection) => {
        const [requests] = await connection.execute(
          'SELECT * FROM requests WHERE id = ? FOR UPDATE',
          [requestId]
        );

        if (requests.length === 0) {
          throw new Error('Request not found');
        }

        if (requests[0].requester_id !== userId) {
          throw new Error('You can only delete your own requests');
        }

        if (requests[0].status !== REQUEST_STATUS.DRAFT) {
          throw new Error('Can only delete requests in DRAFT status');
        }

        await connection.execute('DELETE FROM request_items WHERE request_id = ?', [requestId]);
        await connection.execute('DELETE FROM requests WHERE id = ?', [requestId]);
      });

      res.json({
        success: true,
        message: 'Request deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting request:', error);
      res.status(error.message.includes('not found') ? 404 : 400).json({
        success: false,
        error: error.message || 'Failed to delete request'
      });
    }
  }

  /**
   * Get budget impact preview before approval
   * GET /api/requests/:requestId/budget-impact
   */
  async getBudgetImpact(req, res) {
    try {
      const { requestId } = req.params;

      const impact = await approvalService.getBudgetImpactPreview(requestId);

      res.json({
        success: true,
        data: impact
      });
    } catch (error) {
      console.error('Error fetching budget impact:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch budget impact'
      });
    }
  }
}

module.exports = new RequestController();
