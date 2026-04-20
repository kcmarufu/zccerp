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

// Middleware
const { authenticateToken, requireRole, requirePermission, requireSameDepartment } = require('../middleware/auth.middleware');
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

// Mark request as dispatched
router.post('/export/dispatch/:requestId/mark-dispatched',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  exportController.markAsDispatched.bind(exportController)
);

// ============================================================================
// DONOR ROUTES
// ============================================================================

// Get next auto-generated donor code
router.get('/donors/next-code',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  donorController.getNextDonorCode
);

// Get all donors (all authenticated users can view for dropdown selection)
router.get('/donors',
  authenticateToken,
  donorController.getAllDonors
);

// Get donor by ID
router.get('/donors/:id',
  authenticateToken,
  donorController.getDonorById
);

// Create donor
router.post('/donors',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  donorController.createDonor
);

// Update donor
router.put('/donors/:id',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  donorController.updateDonor
);

// Deactivate donor
router.patch('/donors/:id/deactivate',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  donorController.deactivateDonor
);

// Delete donor permanently (only if no linked budget lines/requests)
router.delete('/donors/:id',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  donorController.deleteDonor
);

// Add committed funds to donor
router.post('/donors/:id/add-funds',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  donorController.addFunds
);

// Remove committed funds from donor
router.post('/donors/:id/remove-funds',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  donorController.removeFunds
);

// Get donor fund transaction history
router.get('/donors/:id/transactions',
  authenticateToken,
  donorController.getDonorTransactions
);

// Get donor budget lines
router.get('/donors/:id/budget-lines',
  authenticateToken,
  donorController.getDonorBudgetLines
);

// Get donor statistics
router.get('/donors/:id/stats',
  authenticateToken,
  donorController.getDonorStats
);

// Get budget lines by donor (for request form)
router.get('/budgets/donor/:donorId',
  authenticateToken,
  budgetController.getBudgetLinesByDonor.bind(budgetController)
);

// ============================================================================
// RECONCILIATION ROUTES
// ============================================================================

// Get dispatched requests for current user (to reconcile)
router.get('/reconciliations/my-dispatched',
  authenticateToken,
  reconciliationController.getMyDispatchedRequests.bind(reconciliationController)
);

// Get current user's reconciliations (all statuses)
router.get('/reconciliations/my-reconciliations',
  authenticateToken,
  reconciliationController.getMyReconciliations.bind(reconciliationController)
);

// Get pending reconciliations (Finance only)
router.get('/reconciliations/pending',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  reconciliationController.getPendingReconciliations.bind(reconciliationController)
);

// Get pending reconciliations for lead/HOP review
router.get('/reconciliations/pending-lead',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS),
  reconciliationController.getPendingLeadReconciliations.bind(reconciliationController)
);

// Get reconciliation history
router.get('/reconciliations/history',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  reconciliationController.getReconciliationHistory.bind(reconciliationController)
);

// Get reconciliation details for a request
router.get('/reconciliations/:requestId',
  authenticateToken,
  reconciliationController.getReconciliation.bind(reconciliationController)
);

// Submit reconciliation (requester only)
router.post('/reconciliations/:requestId/submit',
  authenticateToken,
  reconciliationController.submitReconciliation.bind(reconciliationController)
);

// Finance approves reconciliation
router.post('/reconciliations/:requestId/approve',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  reconciliationController.approveReconciliation.bind(reconciliationController)
);

// Finance rejects reconciliation
router.post('/reconciliations/:requestId/reject',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  reconciliationController.rejectReconciliation.bind(reconciliationController)
);

// Lead/HOP approves reconciliation
router.post('/reconciliations/:requestId/lead-approve',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS),
  reconciliationController.approveReconciliationAsLead.bind(reconciliationController)
);

// Lead/HOP rejects reconciliation
router.post('/reconciliations/:requestId/lead-reject',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS),
  reconciliationController.rejectReconciliationAsLead.bind(reconciliationController)
);

// ============================================================================
// ATTACHMENT/FILE UPLOAD ROUTES
// ============================================================================

// Upload single attachment
router.post('/attachments/upload',
  authenticateToken,
  uploadSingle,
  handleUploadError,
  attachmentController.uploadAttachment
);

// Upload multiple attachments
router.post('/attachments/upload-multiple',
  authenticateToken,
  uploadMultiple,
  handleUploadError,
  attachmentController.uploadMultipleAttachments
);

// Get attachment by ID
router.get('/attachments/:id',
  authenticateToken,
  attachmentController.getAttachmentById
);

// Download attachment
router.get('/attachments/:id/download',
  authenticateToken,
  attachmentController.downloadAttachment
);

// Get attachments for an entity
router.get('/attachments',
  authenticateToken,
  attachmentController.getEntityAttachments
);

// Delete attachment (soft delete)
router.delete('/attachments/:id',
  authenticateToken,
  attachmentController.deleteAttachment
);

// Permanently delete attachment (Finance Clerk only)
router.delete('/attachments/:id/permanent',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
  attachmentController.permanentlyDeleteAttachment
);

// ============================================================================
// ADMIN / USER MANAGEMENT ROUTES
// ============================================================================

// Get all users (Admin only)
router.get('/admin/users',
  authenticateToken,
  requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK),
  adminController.getAllUsers.bind(adminController)
);

// Get single user
router.get('/admin/users/:userId',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.getUserById.bind(adminController)
);

// Create new user
router.post('/admin/users',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.createUser.bind(adminController)
);

// Update user
router.put('/admin/users/:userId',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.updateUser.bind(adminController)
);

// Reset user password
router.post('/admin/users/:userId/reset-password',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.resetPassword.bind(adminController)
);

// Toggle user active status
router.patch('/admin/users/:userId/toggle-active',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.toggleActive.bind(adminController)
);

// Get user login history
router.get('/admin/users/:userId/login-history',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.getLoginHistory.bind(adminController)
);

// ============================================================================
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

// ============================================================================
// ASSET MANAGEMENT ROUTES
// ============================================================================

// Dashboard stats
router.get('/assets/dashboard', authenticateToken, assetController.getDashboardStats.bind(assetController));

// Asset Categories
router.get('/assets/categories', authenticateToken, assetController.getCategories.bind(assetController));
router.post('/assets/categories', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), assetController.createCategory.bind(assetController));

// Asset Locations
router.get('/assets/locations', authenticateToken, assetController.getLocations.bind(assetController));
router.post('/assets/locations', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), assetController.createLocation.bind(assetController));

// Asset Suppliers
router.get('/assets/suppliers', authenticateToken, assetController.getSuppliers.bind(assetController));
router.post('/assets/suppliers', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), assetController.createSupplier.bind(assetController));

// Assets CRUD
router.get('/assets', authenticateToken, assetController.getAssets.bind(assetController));
router.post('/assets', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), assetController.createAsset.bind(assetController));
router.get('/assets/:id', authenticateToken, assetController.getAssetById.bind(assetController));
router.put('/assets/:id', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), assetController.updateAsset.bind(assetController));
router.delete('/assets/:id', authenticateToken, requireRole(ROLES.ADMIN), assetController.deleteAsset.bind(assetController));

// Asset Status History & Audit
router.get('/assets/:assetId/status-history', authenticateToken, assetController.getStatusHistory.bind(assetController));
router.get('/assets/:assetId/audit-log', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), assetController.getAuditLog.bind(assetController));

// Asset Assignments (Check-in / Check-out)
router.get('/assets/:assetId/assignments', authenticateToken, assetController.getAssignments.bind(assetController));
router.post('/assets/assignments/checkout', authenticateToken, assetController.checkoutAsset.bind(assetController));
router.put('/assets/assignments/:assignmentId/checkin', authenticateToken, assetController.checkinAsset.bind(assetController));

// Asset Transfers
router.get('/assets/transfers/list', authenticateToken, assetController.getTransfers.bind(assetController));
router.post('/assets/transfers', authenticateToken, assetController.createTransfer.bind(assetController));
router.put('/assets/transfers/:transferId/approve', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK), assetController.approveTransfer.bind(assetController));

// Asset Maintenance
router.get('/assets/maintenance/list', authenticateToken, assetController.getMaintenanceRecords.bind(assetController));
router.post('/assets/maintenance', authenticateToken, assetController.createMaintenance.bind(assetController));
router.put('/assets/maintenance/:id', authenticateToken, assetController.updateMaintenance.bind(assetController));

// Asset Disposals
router.get('/assets/disposals/list', authenticateToken, assetController.getDisposals.bind(assetController));
router.post('/assets/disposals', authenticateToken, assetController.createDisposal.bind(assetController));
router.put('/assets/disposals/:disposalId/approve', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK), assetController.approveDisposal.bind(assetController));

// Asset Incidents
router.get('/assets/incidents/list', authenticateToken, assetController.getIncidents.bind(assetController));
router.post('/assets/incidents', authenticateToken, assetController.createIncident.bind(assetController));
router.put('/assets/incidents/:id', authenticateToken, assetController.updateIncident.bind(assetController));

// ============================================================================
// HR MODULE ROUTES
// ============================================================================

// HR Dashboard
router.get('/hr/dashboard', authenticateToken, hrController.getDashboardStats.bind(hrController));

// Employees
router.get('/hr/employees', authenticateToken, hrController.getEmployees.bind(hrController));
router.post('/hr/employees', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.createEmployee.bind(hrController));
router.get('/hr/employees/:id', authenticateToken, hrController.getEmployeeById.bind(hrController));
router.put('/hr/employees/:id', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.updateEmployee.bind(hrController));

// Contracts
router.get('/hr/employees/:employeeId/contracts', authenticateToken, hrController.getContracts.bind(hrController));
router.post('/hr/contracts', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.createContract.bind(hrController));
router.post('/hr/contracts/:contractId/renew', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.renewContract.bind(hrController));

// Leave Management
router.get('/hr/leave-types', authenticateToken, hrController.getLeaveTypes.bind(hrController));
router.get('/hr/leave-requests', authenticateToken, hrController.getLeaveRequests.bind(hrController));
router.post('/hr/leave-requests', authenticateToken, hrController.createLeaveRequest.bind(hrController));
router.put('/hr/leave-requests/:leaveId/approve', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN), hrController.approveLeaveRequest.bind(hrController));
router.get('/hr/employees/:employeeId/leave-balances', authenticateToken, hrController.getLeaveBalances.bind(hrController));

// Timesheets
router.get('/hr/timesheets', authenticateToken, hrController.getTimesheets.bind(hrController));
router.get('/hr/timesheets/:id', authenticateToken, hrController.getTimesheetById.bind(hrController));
router.post('/hr/timesheets', authenticateToken, hrController.createTimesheet.bind(hrController));
router.put('/hr/timesheets/:id/submit', authenticateToken, hrController.submitTimesheet.bind(hrController));
router.put('/hr/timesheets/:id/approve', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN), hrController.approveTimesheet.bind(hrController));

// Payroll
router.get('/hr/payroll-periods', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), hrController.getPayrollPeriods.bind(hrController));
router.get('/hr/payroll-periods/:periodId/records', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), hrController.getPayrollRecords.bind(hrController));

// Performance Reviews
router.get('/hr/performance-reviews', authenticateToken, hrController.getPerformanceReviews.bind(hrController));
router.post('/hr/performance-reviews', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN), hrController.createPerformanceReview.bind(hrController));
router.put('/hr/performance-reviews/:id', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN), hrController.updatePerformanceReview.bind(hrController));

// Training Records
router.get('/hr/training-records', authenticateToken, hrController.getTrainingRecords.bind(hrController));
router.post('/hr/training-records', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD), hrController.createTrainingRecord.bind(hrController));

// Disciplinary Records
router.get('/hr/disciplinary-records', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.getDisciplinaryRecords.bind(hrController));
router.post('/hr/disciplinary-records', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.createDisciplinaryRecord.bind(hrController));

// Exit / Clearance
router.get('/hr/exit-clearances', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK), hrController.getExitClearances.bind(hrController));
router.post('/hr/exit-clearances', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.initiateExitClearance.bind(hrController));
router.put('/hr/exit-clearances/:id', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK), hrController.updateExitClearance.bind(hrController));

// HR Documents
router.get('/hr/employees/:employeeId/documents', authenticateToken, hrController.getDocuments.bind(hrController));
router.post('/hr/documents', authenticateToken, uploadSingle, handleUploadError, hrController.createDocument.bind(hrController));
router.delete('/hr/documents/:documentId', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.deleteDocument.bind(hrController));

module.exports = router;
