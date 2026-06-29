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
const donorController = require('../controllers/donor.controller');
const attachmentController = require('../controllers/attachment.controller');
const reconciliationController = require('../controllers/reconciliation.controller');
const adminController = require('../controllers/admin.controller');
const assetController = require('../controllers/asset.controller');
const hrController = require('../controllers/hr.controller');
const perDiemController = require('../controllers/perdiem.controller');
const notificationService = require('../services/notification.service');

// Middleware
const { authenticateToken, requireRole, requirePermission, requireSameDepartment, requireFinanceManager } = require('../middleware/auth.middleware');
const { uploadSingle, uploadMultiple, handleUploadError } = require('../middleware/upload.middleware');
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
  requirePermission(PERMISSIONS.EDIT_REQUEST),
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
  requirePermission(PERMISSIONS.SUBMIT_REQUEST),
  requestController.submitRequest.bind(requestController)
);

// Get budget impact preview
router.get('/requests/:requestId/budget-impact',
  authenticateToken,
  requestController.getBudgetImpact.bind(requestController)
);

// ============================================================================
// PER DIEM / TRAVEL CLAIM ROUTES
// =====================================================================// APPROVAL ROUTES
// ============================================================================

// Get pending approvals for current user's role
router.get('/approvals/pending',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
  approvalController.getPendingApprovals.bind(approvalController)
);

// Approve request
router.post('/approvals/:requestId/approve',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
  requireSameDepartment,
  approvalValidator,
  approvalController.approveRequest.bind(approvalController)
);

// Reject request
router.post('/approvals/:requestId/reject',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
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
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
  approvalController.getBudgetImpact.bind(approvalController)
);

// Reverse approval (within 12 hours)
router.post('/approvals/:requestId/reverse',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
  approvalController.reverseApproval.bind(approvalController)
);

// Check if approval can be reversed
router.get('/approvals/:requestId/can-reverse',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
  approvalController.canReverseApproval.bind(approvalController)
);

// Get approval history for current user
router.get('/approvals/history',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
  approvalController.getApprovalHistory.bind(approvalController)
);

// Get all approved requests
router.get('/approvals/approved',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
  approvalController.getApprovedRequests.bind(approvalController)
);

// Get all rejected requests
router.get('/approvals/rejected',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
  approvalController.getRejectedRequests.bind(approvalController)
);

// Get approver dashboard stats
router.get('/approvals/stats',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
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
  requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD, ROLES.FINANCE_CLERK),
  budgetController.getBudgetSummary.bind(budgetController)
);

// Get financial reports (variance, donor summary, trends)
router.get('/budgets/reports',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_REPORTS),
  budgetController.getFinancialReports.bind(budgetController)
);

// Get single budget line with history
router.get('/budgets/:budgetLineId',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_BUDGET_LINES),
  budgetController.getBudgetLineById.bind(budgetController)
);

// Get budget line details with donor info
router.get('/budgets/:budgetLineId/details',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_BUDGET_LINES),
  budgetController.getBudgetLineDetails.bind(budgetController)
);

// Get requests linked to a budget line
router.get('/budgets/:budgetLineId/requests',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_BUDGET_LINES),
  budgetController.getBudgetLineRequests.bind(budgetController)
);

// Create budget line (Finance Manager: Finance HOP/Lead in AF dept, or Admin)
router.post('/budgets',
  authenticateToken,
  requireFinanceManager,
  budgetLineValidator,
  budgetController.createBudgetLine.bind(budgetController)
);

// Update budget line (Finance Manager only)
router.put('/budgets/:budgetLineId',
  authenticateToken,
  requireFinanceManager,
  budgetLineValidator,
  budgetController.updateBudgetLine.bind(budgetController)
);

// Top up budget (Finance Manager only)
router.post('/budgets/:budgetLineId/topup',
  authenticateToken,
  requireFinanceManager,
  topUpBudgetValidator,
  budgetController.topUpBudget.bind(budgetController)
);

// Delete budget line (Finance Manager only)
router.delete('/budgets/:budgetLineId',
  authenticateToken,
  requireFinanceManager,
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

// Generate PDF reconciliation document
router.get('/export/reconciliation/:requestId/pdf',
  authenticateToken,
  exportController.generateReconciliationPDF.bind(exportController)
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

// Mark request as dispatched
router.post('/export/dispatch/:requestId/mark-dispatched',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK, ROLES.ADMIN),
  exportController.markAsDispatched.bind(exportController)
);

// Reverse a dispatch (Finance / Admin only)
router.post('/export/dispatch/:requestId/reverse-dispatch',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK, ROLES.ADMIN),
  exportController.reverseDispatch.bind(exportController)
);

// =====================================================================// ============================================================================
// LOOKUP ROUTES
// ============================================================================

const { query: lookupQuery } = require('../config/database');

// Get all users (names only, for dropdowns)
router.get('/users/list', authenticateToken, async (req, res) => {
  try {
    const users = await lookupQuery(
      'SELECT id, first_name, last_name, email FROM users WHERE is_active = TRUE ORDER BY first_name, last_name'
    );
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// Get all departments
router.get('/departments', authenticateToken, async (req, res) => {
  try {
    const departments = await lookupQuery(
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
    const roles = await lookupQuery('SELECT id, role_name, role_description FROM roles');
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch roles' });
  }
});

// =====================================================================module.exports = router;
