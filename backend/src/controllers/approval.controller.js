/**
 * Approval Controller
 * Handles HTTP requests for the approval workflow
 */

const { validationResult } = require('express-validator');
<<<<<<< HEAD
const { ROLES, REQUEST_STATUS } = require('../config/roles');
const { query } = require('../config/database');
=======
const { ROLES } = require('../config/roles');
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
const approvalService = require('../services/approval.service');

class ApprovalController {

  /**
   * Approve request (role-specific)
   * POST /api/approvals/:requestId/approve
   */
  async approveRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { requestId } = req.params;
      const { comments, version } = req.body;
      const approverId = req.user.id;
      const approverRole = req.user.role;
      const ipAddress = req.ip;

<<<<<<< HEAD
      // Peek at the request's current status so HOP/Lead can be routed to Finance approval
      // when the request is already at the Finance stage.
      const reqRows = await query('SELECT status FROM requests WHERE id = ?', [requestId]);
      const currentStatus = reqRows[0]?.status;

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      let result;

      switch (approverRole) {
        case ROLES.PROGRAM_LEAD:
<<<<<<< HEAD
          // Finance HOP/Lead: if request is at Finance stage, act as Finance approver
          if (currentStatus === REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
            result = await approvalService.approveAsFinance(
              requestId, approverId, comments, version, ipAddress
            );
          } else {
            result = await approvalService.approveAsLead(
              requestId, approverId, comments, version, ipAddress
            );
          }
          break;

        case ROLES.HEAD_OF_PROGRAMS:
          // Finance HOP/Lead: if request is at Finance stage, act as Finance approver
          if (currentStatus === REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
            result = await approvalService.approveAsFinance(
              requestId, approverId, comments, version, ipAddress
            );
          } else {
            result = await approvalService.approveAsHOP(
              requestId, approverId, comments, version, ipAddress
            );
          }
          break;

        case ROLES.FINANCE_CLERK:
          result = await approvalService.approveAsFinance(
=======
          result = await approvalService.approveAsLead(
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            requestId, approverId, comments, version, ipAddress
          );
          break;

<<<<<<< HEAD
        case ROLES.ADMIN:
          result = await approvalService.approveAsAdmin(
=======
        case ROLES.HEAD_OF_PROGRAMS:
          result = await approvalService.approveAsHOP(
            requestId, approverId, comments, version, ipAddress
          );
          break;

        case ROLES.FINANCE_CLERK:
          result = await approvalService.approveAsFinance(
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            requestId, approverId, comments, version, ipAddress
          );
          break;

        default:
          return res.status(403).json({
            success: false,
            error: 'You do not have approval permissions'
          });
      }

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Approval error:', error);
      
      // Handle specific error types
      if (error.message.includes('modified')) {
        return res.status(409).json({
          success: false,
          error: error.message,
          code: 'VERSION_CONFLICT'
        });
      }
      
      if (error.message.includes('Insufficient budget')) {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'INSUFFICIENT_BUDGET'
        });
      }

      res.status(400).json({
        success: false,
        error: error.message || 'Failed to approve request'
      });
    }
  }

  /**
   * Reject request
   * POST /api/approvals/:requestId/reject
   */
  async rejectRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { requestId } = req.params;
      const { comments, version } = req.body;
      const approverId = req.user.id;
      const approverRole = req.user.role;
      const ipAddress = req.ip;

      const result = await approvalService.rejectRequest(
        requestId, approverId, approverRole, comments, version, ipAddress
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Rejection error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to reject request'
      });
    }
  }

  /**
   * Get pending approvals for current user
   * GET /api/approvals/pending
   */
  async getPendingApprovals(req, res) {
    try {
      const { departmentId } = req.query;
      const userRole = req.user.role;
      const userId = req.user.id;
      const userDepartmentId = req.user.department_id;

      const requests = await approvalService.getPendingApprovals(
        userRole, 
        userId, 
        userDepartmentId,
        { departmentId }
      );

      res.json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pending approvals'
      });
    }
  }

  /**
   * Get approval trail for a request
   * GET /api/approvals/:requestId/trail
   */
  async getApprovalTrail(req, res) {
    try {
      const { requestId } = req.params;

      const trail = await approvalService.getApprovalTrail(requestId);

      res.json({
        success: true,
        data: trail
      });
    } catch (error) {
      console.error('Error fetching approval trail:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch approval trail'
      });
    }
  }

  /**
   * Get budget impact preview
   * GET /api/approvals/:requestId/budget-impact
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

  /**
   * Reverse an approval within 5 hours
   * POST /api/approvals/:requestId/reverse
   */
  async reverseApproval(req, res) {
    try {
      const { requestId } = req.params;
      const { comments } = req.body;
      const approverId = req.user.id;
      const approverRole = req.user.role;
      const ipAddress = req.ip;

      const result = await approvalService.reverseApproval(
        requestId, approverId, approverRole, comments, ipAddress
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Reversal error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to reverse approval'
      });
    }
  }

  /**
   * Check if approval can be reversed
   * GET /api/approvals/:requestId/can-reverse
   */
  async canReverseApproval(req, res) {
    try {
      const { requestId } = req.params;
      const approverId = req.user.id;
      const approverRole = req.user.role;

      const result = await approvalService.canReverseApproval(
        requestId, approverId, approverRole
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error checking reversal eligibility:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check reversal eligibility'
      });
    }
  }

  /**
   * Get approval history for current user
   * GET /api/approvals/history
   */
  async getApprovalHistory(req, res) {
    try {
      const { departmentId } = req.query;
      const userRole = req.user.role;
      const userId = req.user.id;
      const userDepartmentId = req.user.department_id;

      const requests = await approvalService.getApprovalHistory(
        userRole,
        userId,
        userDepartmentId,
        { departmentId }
      );

      res.json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error fetching approval history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch approval history'
      });
    }
  }

  /**
   * Get all approved requests (for approver view)
   * GET /api/approvals/approved
   */
  async getApprovedRequests(req, res) {
    try {
      const { departmentId } = req.query;
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;

      const requests = await approvalService.getApprovedRequests(
        userRole,
        userDepartmentId,
        { departmentId }
      );

      res.json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error fetching approved requests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch approved requests'
      });
    }
  }

  /**
   * Get all rejected requests (for approver view)
   * GET /api/approvals/rejected
   */
  async getRejectedRequests(req, res) {
    try {
      const { departmentId } = req.query;
      const userRole = req.user.role;
      const userDepartmentId = req.user.department_id;

      const requests = await approvalService.getRejectedRequests(
        userRole,
        userDepartmentId,
        { departmentId }
      );

      res.json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error fetching rejected requests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rejected requests'
      });
    }
  }

  /**
   * Get dashboard statistics for approver
   * GET /api/approvals/stats
   */
  async getApproverStats(req, res) {
    try {
      const userRole = req.user.role;
      const userId = req.user.id;
      const userDepartmentId = req.user.department_id;

      const stats = await approvalService.getApproverStats(
        userRole,
        userId,
        userDepartmentId
      );

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching approver stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch approver stats'
      });
    }
  }
}

module.exports = new ApprovalController();
