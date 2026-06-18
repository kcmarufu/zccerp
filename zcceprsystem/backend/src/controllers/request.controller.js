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

      const { justification, items, donor_id, category, projectCode } = req.body;
      const userId = req.user.id;
      const departmentId = req.user.department_id;

      const result = await transaction(async (connection) => {
        // Generate structured reference number:
        //   With donor+project: DONORCODE-PROJECTCODE-0000001
        //   Fallback:           REQ-YYYY-000001
        let requestNumber;
        let validDonorId = null;
        let validProjectId = null;

        const normalizeSegment = (value, fallback) => {
          const cleaned = String(value || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
          return cleaned || fallback;
        };
        
        // Validate donor exists
        if (donor_id) {
          const [donorCheck] = await connection.execute(
            'SELECT id FROM donors WHERE id = ?',
            [donor_id]
          );
          if (donorCheck.length > 0) {
            validDonorId = donor_id;
          }
        }

        // Validate project exists and belongs to the donor
        const requestedProjectId = req.body.project_id || null;
        if (requestedProjectId && validDonorId) {
          const [projCheck] = await connection.execute(
            'SELECT id FROM projects WHERE id = ? AND donor_id = ?',
            [requestedProjectId, validDonorId]
          );
          if (projCheck.length > 0) {
            validProjectId = requestedProjectId;
          }
        }
        
        if (validDonorId && validProjectId && items.length > 0) {
          // Get donor code and project code
          const [donorResult] = await connection.execute(
            'SELECT donor_code FROM donors WHERE id = ?',
            [validDonorId]
          );
          const [projectResult] = await connection.execute(
            'SELECT project_code, last_request_seq FROM projects WHERE id = ?',
            [validProjectId]
          );

          if (donorResult.length > 0 && projectResult.length > 0) {
            const donorCode = normalizeSegment(donorResult[0].donor_code, 'DON');
            const projCode = normalizeSegment(projectResult[0].project_code, 'PRJ');

            // Atomically increment the per-project sequence counter
            await connection.execute(
              'UPDATE projects SET last_request_seq = last_request_seq + 1 WHERE id = ?',
              [validProjectId]
            );
            const [seqRow] = await connection.execute(
              'SELECT last_request_seq FROM projects WHERE id = ?',
              [validProjectId]
            );
            const seq = String(seqRow[0].last_request_seq).padStart(7, '0');

            // Format: DONORCODE-PROJECTCODE-0000001
            requestNumber = `${donorCode}-${projCode}-${seq}`;
          } else {
            // Fallback to standard format
            const year = new Date().getFullYear();
            const [countResult] = await connection.execute(
              `SELECT COUNT(*) + 1 as seq FROM requests WHERE YEAR(created_at) = ?`,
              [year]
            );
            requestNumber = `REQ-${year}-${String(countResult[0].seq).padStart(6, '0')}`;
          }
        } else {
          // Fallback to standard format when no donor/project is selected
          const year = new Date().getFullYear();
          const [countResult] = await connection.execute(
            `SELECT COUNT(*) + 1 as seq FROM requests WHERE YEAR(created_at) = ?`,
            [year]
          );
          requestNumber = `REQ-${year}-${String(countResult[0].seq).padStart(6, '0')}`;
        }

        // Calculate total amount from items
        const totalAmount = items.reduce((sum, item) => {
          const itemTotal = (item.quantity || 1) * (item.unitPrice || 0);
          return sum + itemTotal;
        }, 0);

        // Check cross-department routing: if the selected project belongs to a different
        // department, store that department's ID so approvals are routed there.
        // Skip for Admin-donor requests — they use a shared approval queue without cross-dept routing.
        let routingDepartmentId = null;
        if (validProjectId && validDonorId) {
          // Check if this is an admin donor
          const [donorTypeRows] = await connection.execute(
            'SELECT donor_type FROM donors WHERE id = ?', [validDonorId]
          );
          const isAdminDonor = donorTypeRows.length > 0 && donorTypeRows[0].donor_type === 'ADMIN';

          if (!isAdminDonor && validProjectId) {
            // Use project's own department_id; if NULL (older projects), fall back to
            // the department on the first budget line in this request's items.
            const firstBudgetLineId = items && items.length > 0 ? (items[0].budgetLineId || 0) : 0;
            const [projRows] = await connection.execute(
              `SELECT COALESCE(
                 p.department_id,
                 (SELECT bl.department_id FROM budget_lines bl
                  WHERE bl.id = ? AND bl.department_id IS NOT NULL LIMIT 1)
               ) AS effective_dept_id
               FROM projects p WHERE p.id = ?`,
              [firstBudgetLineId, validProjectId]
            );
            const effectiveDeptId = projRows[0]?.effective_dept_id;
            if (effectiveDeptId && effectiveDeptId !== departmentId) {
              routingDepartmentId = effectiveDeptId;
            }
          }
        } else if (validProjectId) {
          const firstBudgetLineId = items && items.length > 0 ? (items[0].budgetLineId || 0) : 0;
          const [projRows] = await connection.execute(
            `SELECT COALESCE(
               p.department_id,
               (SELECT bl.department_id FROM budget_lines bl
                WHERE bl.id = ? AND bl.department_id IS NOT NULL LIMIT 1)
             ) AS effective_dept_id
             FROM projects p WHERE p.id = ?`,
            [firstBudgetLineId, validProjectId]
          );
          const effectiveDeptId = projRows[0]?.effective_dept_id;
          if (effectiveDeptId && effectiveDeptId !== departmentId) {
            routingDepartmentId = effectiveDeptId;
          }
        }

        // Insert request with validated donor_id and project_id
        const [requestResult] = await connection.execute(
          `INSERT INTO requests (request_code, requester_id, department_id, donor_id, project_id, routing_department_id, status, justification, priority, total_amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [requestNumber, userId, departmentId, validDonorId, validProjectId, routingDepartmentId, REQUEST_STATUS.DRAFT, justification, 'MEDIUM', totalAmount]
        );

        const requestId = requestResult.insertId;

        // Insert items with category
        for (const item of items) {
          await connection.execute(
            `INSERT INTO request_items (request_id, item_description, category, quantity, unit_of_measure, unit_price, budget_line_id, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [requestId, item.itemDescription, item.category || category || 'PROCUREMENT', item.quantity, item.unitOfMeasure || 'EACH', 
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
                d.department_code,
                dn.donor_name,
                dn.donor_code,
                p.project_name,
                p.project_code,
                rd.department_name as routing_department_name,
                rd.department_code as routing_department_code
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         LEFT JOIN donors dn ON r.donor_id = dn.id
         LEFT JOIN projects p ON r.project_id = p.id
         LEFT JOIN departments rd ON r.routing_department_id = rd.id
         WHERE r.id = ?`,
        [requestId]
      );

      if (requests.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Request not found'
        });
      }

      const request = requests[0];
      const isOwner = Number(request.requester_id) === Number(req.user.id);

      // Only general users are restricted to their own requests
      if (req.user.role === ROLES.GENERAL_USER && !isOwner) {
        return res.status(403).json({
          success: false,
          error: 'You can only access your own requests'
        });
      }

      // Get items with budget line info
      const items = await query(
        `SELECT ri.*, 
                bl.budget_code,
                bl.budget_name,
                (bl.allocated_amount - bl.spent_amount) as budget_balance
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
          ...request,
          has_per_diem_claim: Boolean(request.has_per_diem_claim),
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
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
      const offset = Math.max(0, (pageNum - 1) * limitNum);
      const userRole = req.user.role;
      const userId = req.user.id;
      const departmentId = req.user.department_id;

      let whereClause = '1=1';
      const params = [];

      // Role-based filtering
      if (userRole === ROLES.GENERAL_USER) {
        whereClause += ' AND r.requester_id = ?';
        params.push(userId);
      }
      // HEAD_OF_PROGRAMS, PROGRAM_LEAD, FINANCE_CLERK and ADMIN can all see all requests.

      // Status filter
      if (status) {
        whereClause += ' AND r.status = ?';
        params.push(status);
      }

      // Get total count
      const countResult = await query(
        `SELECT COUNT(*) as total FROM requests r WHERE ${whereClause}`,
        params
      );

      // Validate sort order
      const validSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
      const validSortBy = ['created_at', 'updated_at', 'submitted_at', 'total_amount', 'status', 'request_code'].includes(sortBy) ? sortBy : 'created_at';

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
         LIMIT ${limitNum} OFFSET ${offset}`,
        params
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

        const canEditStatuses = [REQUEST_STATUS.DRAFT, REQUEST_STATUS.REJECTED];
        if (!canEditStatuses.includes(requests[0].status)) {
          throw new Error('Can only edit requests in DRAFT or REJECTED status');
        }

        const previousStatus = requests[0].status;

        // Update request
        await connection.execute(
          'UPDATE requests SET justification = ?, priority = ?, updated_at = NOW() WHERE id = ?',
          [justification || requests[0].justification, priority || requests[0].priority, requestId]
        );

        // Update items if provided
        if (items && items.length > 0) {
          // Delete existing items
          await connection.execute('DELETE FROM request_items WHERE request_id = ?', [requestId]);

          // Insert new items with category
          for (const item of items) {
            await connection.execute(
              `INSERT INTO request_items (request_id, item_description, category, quantity, unit_of_measure, unit_price, budget_line_id, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [requestId, item.itemDescription, item.category || 'PROCUREMENT', item.quantity, item.unitOfMeasure || 'EACH',
               item.unitPrice, item.budgetLineId, item.notes || null]
            );
          }
        }

        if (previousStatus === REQUEST_STATUS.REJECTED) {
          await connection.execute(
            `INSERT INTO approval_logs
             (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
             VALUES (?, ?, ?, 'EDITED_AFTER_REJECTION', ?, ?, ?, ?)`,
            [requestId, userId, req.user.role || ROLES.GENERAL_USER, REQUEST_STATUS.REJECTED, REQUEST_STATUS.REJECTED, 'Requester updated rejected request', req.ip]
          );
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
