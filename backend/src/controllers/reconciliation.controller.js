/**
 * Reconciliation Controller
 * Handles HTTP requests for the reconciliation workflow
 * 
 * Flow: After dispatch → requester submits reconciliation → Finance reviews
 */

const { ROLES } = require('../config/roles');
const reconciliationService = require('../services/reconciliation.service');

class ReconciliationController {

  /**
   * Submit a reconciliation for a dispatched request
   * POST /api/reconciliations/:requestId/submit
   */
  async submitReconciliation(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user.id;
      const ipAddress = req.ip;
      const { items, notes, totalSpent, totalReturned, actualStartDate, actualEndDate } = req.body;

      const result = await reconciliationService.submitReconciliation(
        requestId, userId, { items, notes, totalSpent, totalReturned, actualStartDate, actualEndDate }, ipAddress
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Reconciliation submit error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to submit reconciliation'
      });
    }
  }

  /**
   * Finance approves a reconciliation
   * POST /api/reconciliations/:requestId/approve
   */
  async approveReconciliation(req, res) {
    try {
      const { requestId } = req.params;
      const approverId = req.user.id;
      const approverRole = req.user.role;
      const { comments } = req.body;
      const ipAddress = req.ip;

      const result = await reconciliationService.approveReconciliation(
        requestId, approverId, approverRole, comments, ipAddress
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Reconciliation approve error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to approve reconciliation'
      });
    }
  }

  /**
   * Finance rejects a reconciliation
   * POST /api/reconciliations/:requestId/reject
   */
  async rejectReconciliation(req, res) {
    try {
      const { requestId } = req.params;
      const approverId = req.user.id;
      const approverRole = req.user.role;
      const { comments } = req.body;
      const ipAddress = req.ip;

      const result = await reconciliationService.rejectReconciliation(
        requestId, approverId, approverRole, comments, ipAddress
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Reconciliation reject error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to reject reconciliation'
      });
    }
  }

  /**
   * Get reconciliation details for a request
   * GET /api/reconciliations/:requestId
   */
  async getReconciliation(req, res) {
    try {
      const { requestId } = req.params;
      const reconciliation = await reconciliationService.getReconciliation(requestId);

      res.json({
        success: true,
        data: reconciliation
      });
    } catch (error) {
      console.error('Error fetching reconciliation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch reconciliation details'
      });
    }
  }

  /**
   * Get dispatched requests for current user (to reconcile)
   * GET /api/reconciliations/my-dispatched
   */
  async getMyDispatchedRequests(req, res) {
    try {
      const userId = req.user.id;
      const requests = await reconciliationService.getMyDispatchedRequests(userId);

      res.json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error fetching dispatched requests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch dispatched requests'
      });
    }
  }

  /**
   * Get all pending reconciliations (for Finance review)
   * GET /api/reconciliations/pending
   */
  async getPendingReconciliations(req, res) {
    try {
      const requests = await reconciliationService.getPendingReconciliations(req.user.role);

      res.json({
        success: true,
        data: requests
      });
    } catch (error) {
      console.error('Error fetching pending reconciliations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pending reconciliations'
      });
    }
  }

  /**
   * Get current user's reconciliations (all statuses)
   * GET /api/reconciliations/my-reconciliations
   */
  async getMyReconciliations(req, res) {
    try {
      const userId = req.user.id;
      const reconciliations = await reconciliationService.getMyReconciliations(userId);

      res.json({
        success: true,
        data: reconciliations
      });
    } catch (error) {
      console.error('Error fetching my reconciliations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch your reconciliations'
      });
    }
  }

  /**
   * Get reconciliation history
   * GET /api/reconciliations/history
   */
  async getReconciliationHistory(req, res) {
    try {
      const history = await reconciliationService.getReconciliationHistory();

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error fetching reconciliation history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch reconciliation history'
      });
    }
  }

  /**
   * Program Lead / HOP approves a reconciliation
   * POST /api/reconciliations/:requestId/lead-approve
   */
  async approveReconciliationAsLead(req, res) {
    try {
      const { requestId } = req.params;
      const approverId = req.user.id;
      const approverRole = req.user.role;
      const approverDeptCode = req.user.department_code;
      const { comments } = req.body;
      const ipAddress = req.ip;

      const result = await reconciliationService.approveReconciliationAsLead(
        requestId, approverId, approverRole, comments, ipAddress, approverDeptCode
      );

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Reconciliation lead approve error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to approve reconciliation'
      });
    }
  }

  /**
   * Program Lead / HOP rejects a reconciliation
   * POST /api/reconciliations/:requestId/lead-reject
   */
  async rejectReconciliationAsLead(req, res) {
    try {
      const { requestId } = req.params;
      const approverId = req.user.id;
      const approverRole = req.user.role;
      const approverDeptCode = req.user.department_code;
      const { comments } = req.body;
      const ipAddress = req.ip;

      const result = await reconciliationService.rejectReconciliationAsLead(
        requestId, approverId, approverRole, comments, ipAddress, approverDeptCode
      );

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Reconciliation lead reject error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to reject reconciliation'
      });
    }
  }

  /**
   * Get pending reconciliations for lead/HOP review
   * GET /api/reconciliations/pending-lead
   */
  async getPendingLeadReconciliations(req, res) {
    try {
      const approverId = req.user.id;
      const approverRole = req.user.role;
      const departmentId = req.user.department_id;
      const departmentCode = req.user.department_code;

      const requests = await reconciliationService.getPendingLeadReconciliations(
        approverId, approverRole, departmentId, departmentCode
      );

      res.json({ success: true, data: requests });
    } catch (error) {
      console.error('Error fetching pending lead reconciliations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pending reconciliations'
      });
    }
  }

  /**
   * Get reconciliations already approved by this lead (audit trail)
   * GET /api/reconciliations/lead-approved
   */
  async getLeadApprovedReconciliations(req, res) {
    try {
      const approverId = req.user.id;
      const approverRole = req.user.role;
      const departmentId = req.user.department_id;

      const requests = await reconciliationService.getLeadApprovedReconciliations(
        approverId, approverRole, departmentId
      );

      res.json({ success: true, data: requests });
    } catch (error) {
      console.error('Error fetching lead approved reconciliations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch approved reconciliations'
      });
    }
  }

  /**
   * Check if current user has 2+ overdue unsubmitted reconciliations
   * GET /api/reconciliations/overdue-check
   */
  async getOverdueCheck(req, res) {
    try {
      const userId = req.user.id;
      const count = await reconciliationService.getOverdueCount(userId);
      res.json({
        success: true,
        data: {
          overdueCount: count,
          isBlocked: count >= 2
        }
      });
    } catch (error) {
      console.error('Error checking overdue reconciliations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check overdue reconciliations'
      });
    }
  }

  /**
   * Update an existing reconciliation (requester edits before final approval)
   * PUT /api/reconciliations/:requestId
   */
  async updateReconciliation(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user.id;
      const ipAddress = req.ip;
      const { items, notes, overspendNotes, totalSpent, totalReturned, actualStartDate, actualEndDate } = req.body;

      const result = await reconciliationService.updateReconciliation(
        requestId, userId, { items, notes, overspendNotes, totalSpent, totalReturned, actualStartDate, actualEndDate }, ipAddress
      );

      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Reconciliation update error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to update reconciliation'
      });
    }
  }
}

module.exports = new ReconciliationController();
