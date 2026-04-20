/**
 * API Routes
 * Defines all API endpoints with authentication and authorization
 */

const express = require('express');
const router = express.Router();

// Controllers
const authController = require('../controllers/auth.controller');
const requestController = require('../controllers/request.controller');
const approvalController = require('../controllers/approval.controller');
const budgetController = require('../controllers/budget.controller');
const exportController = require('../controllers/export.controller');

// Middleware
const { authenticateToken, requireRole, requirePermission, requireSameDepartment } = require('../middleware/auth.middleware');
const { 
  createRequestValidator, 
  updateRequestValidator, 
  approvalValidator,
  budgetLineValidator,
  topUpBudgetValidator,
  paginationValidator,
  filterValidator
} = require('../middleware/validators');

// Role imports
const { ROLES, PERMISSIONS } = require('../config/roles');

// ============================================================================
// AUTH ROUTES (Public)
// ============================================================================

router.post('/auth/login', authController.login.bind(authController));
router.post('/auth/refresh', authController.refreshToken.bind(authController));

// Auth routes (Protected)
router.get('/auth/me', authenticateToken, authController.getCurrentUser.bind(authController));
router.post('/auth/change-password', authenticateToken, authController.changePassword.bind(authController));

// ============================================================================
// REQUEST ROUTES
// ============================================================================

// Create request (General User and Program Lead)
router.post('/requests',
  authenticateToken,
  requirePermission(PERMISSIONS.CREATE_REQUEST),
  createRequestValidator,
  requestController.createRequest.bind(requestController)
);

// Get all requests (role-filtered)
router.get('/requests',
  authenticateToken,
  paginationValidator,
  filterValidator,
  requestController.getRequests.bind(requestController)
);

// Get single request
router.get('/requests/:requestId',
  authenticateToken,
  requireSameDepartment,
  requestController.getRequestById.bind(requestController)
);

// Update request (Draft only)
router.put('/requests/:requestId',
  authenticateToken,
  updateRequestValidator,
  requestController.updateRequest.bind(requestController)
);

// Delete request (Draft only)
router.delete('/requests/:requestId',
  authenticateToken,
  requestController.deleteRequest.bind(requestController)
);

// Submit request for approval
router.post('/requests/:requestId/submit',
  authenticateToken,
  requestController.submitRequest.bind(requestController)
);

// Get budget impact preview
router.get('/requests/:requestId/budget-impact',
  authenticateToken,
  requestController.getBudgetImpact.bind(requestController)
);

// ============================================================================
// APPROVAL ROUTES
// ============================================================================

// Get pending approvals for current user's role
router.get('/approvals/pending',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  approvalController.getPendingApprovals.bind(approvalController)
);

// Approve request
router.post('/approvals/:requestId/approve',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  requireSameDepartment,
  approvalValidator,
  approvalController.approveRequest.bind(approvalController)
);

// Reject request
router.post('/approvals/:requestId/reject',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  requireSameDepartment,
  approvalValidator,
  approvalController.rejectRequest.bind(approvalController)
);

// Get approval trail
router.get('/approvals/:requestId/trail',
  authenticateToken,
  approvalController.getApprovalTrail.bind(approvalController)
);

// Get budget impact before approval
router.get('/approvals/:requestId/budget-impact',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  approvalController.getBudgetImpact.bind(approvalController)
);

// Reverse approval (within 5 hours)
router.post('/approvals/:requestId/reverse',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  approvalController.reverseApproval.bind(approvalController)
);

// Check if approval can be reversed
router.get('/approvals/:requestId/can-reverse',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  approvalController.canReverseApproval.bind(approvalController)
);

// Get approval history for current user
router.get('/approvals/history',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  approvalController.getApprovalHistory.bind(approvalController)
);

// Get all approved requests
router.get('/approvals/approved',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  approvalController.getApprovedRequests.bind(approvalController)
);

// Get all rejected requests
router.get('/approvals/rejected',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  approvalController.getRejectedRequests.bind(approvalController)
);

// Get approver dashboard stats
router.get('/approvals/stats',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  approvalController.getApproverStats.bind(approvalController)
);

// ============================================================================
// BUDGET ROUTES
// ============================================================================

// Get all budget lines
router.get('/budgets',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_BUDGET_LINES),
  budgetController.getBudgetLines.bind(budgetController)
);

// Get budget summary by department
router.get('/budgets/summary',
  authenticateToken,
  requireRole(ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  budgetController.getBudgetSummary.bind(budgetController)
);

// Get single budget line with history
router.get('/budgets/:budgetLineId',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_BUDGET_LINES),
  budgetController.getBudgetLineById.bind(budgetController)
);

// Create budget line (Finance only)
router.post('/budgets',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  budgetLineValidator,
  budgetController.createBudgetLine.bind(budgetController)
);

// Update budget line (Finance only)
router.put('/budgets/:budgetLineId',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  budgetLineValidator,
  budgetController.updateBudgetLine.bind(budgetController)
);

// Top up budget (Finance only)
router.post('/budgets/:budgetLineId/topup',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  topUpBudgetValidator,
  budgetController.topUpBudget.bind(budgetController)
);

// Delete budget line (Finance only)
router.delete('/budgets/:budgetLineId',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  budgetController.deleteBudgetLine.bind(budgetController)
);

// ============================================================================
// EXPORT ROUTES
// ============================================================================

// Generate PDF dispatch document
router.get('/export/dispatch/:requestId/pdf',
  authenticateToken,
  requirePermission(PERMISSIONS.EXPORT_DATA),
  exportController.generateDispatchPDF.bind(exportController)
);

// Generate Excel dispatch document
router.get('/export/dispatch/:requestId/excel',
  authenticateToken,
  requirePermission(PERMISSIONS.EXPORT_DATA),
  exportController.generateDispatchExcel.bind(exportController)
);

// Bulk export
router.post('/export/bulk',
  authenticateToken,
  requirePermission(PERMISSIONS.EXPORT_DATA),
  exportController.generateBulkExport.bind(exportController)
);

// ============================================================================
// LOOKUP ROUTES
// ============================================================================

const { query } = require('../config/database');

// Get all departments
router.get('/departments', authenticateToken, async (req, res) => {
  try {
    const departments = await query(
      'SELECT id, department_name, department_code FROM departments WHERE is_active = TRUE ORDER BY department_name'
    );
    res.json({ success: true, data: departments });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch departments' });
  }
});

// Get all roles
router.get('/roles', authenticateToken, async (req, res) => {
  try {
    const roles = await query('SELECT id, role_name, role_description FROM roles');
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch roles' });
  }
});

module.exports = router;
