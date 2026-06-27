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
<<<<<<< HEAD
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
=======

// Middleware
const { authenticateToken, requireRole, requirePermission, requireSameDepartment } = require('../middleware/auth.middleware');
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
  requirePermission(PERMISSIONS.EDIT_REQUEST),
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
  requirePermission(PERMISSIONS.SUBMIT_REQUEST),
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  requestController.submitRequest.bind(requestController)
);

// Get budget impact preview
router.get('/requests/:requestId/budget-impact',
  authenticateToken,
  requestController.getBudgetImpact.bind(requestController)
);

// ============================================================================
<<<<<<< HEAD
// PER DIEM / TRAVEL CLAIM ROUTES
// ============================================================================

// Get default meal/overnight rates (all authenticated users)
router.get('/per-diem/rates',
  authenticateToken,
  perDiemController.getRates.bind(perDiemController)
);

// Get the claim for a specific request
router.get('/requests/:requestId/per-diem',
  authenticateToken,
  perDiemController.getClaim.bind(perDiemController)
);

// Create or fully replace the claim (owner only, DRAFT/REJECTED)
router.put('/requests/:requestId/per-diem',
  authenticateToken,
  requirePermission(PERMISSIONS.EDIT_REQUEST),
  perDiemController.upsertClaim.bind(perDiemController)
);

// Remove the claim (owner only, DRAFT/REJECTED)
router.delete('/requests/:requestId/per-diem',
  authenticateToken,
  requirePermission(PERMISSIONS.EDIT_REQUEST),
  perDiemController.deleteClaim.bind(perDiemController)
);

// ============================================================================
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
// APPROVAL ROUTES
// ============================================================================

// Get pending approvals for current user's role
router.get('/approvals/pending',
  authenticateToken,
<<<<<<< HEAD
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
=======
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  approvalController.getPendingApprovals.bind(approvalController)
);

// Approve request
router.post('/approvals/:requestId/approve',
  authenticateToken,
<<<<<<< HEAD
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
=======
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  requireSameDepartment,
  approvalValidator,
  approvalController.approveRequest.bind(approvalController)
);

// Reject request
router.post('/approvals/:requestId/reject',
  authenticateToken,
<<<<<<< HEAD
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
=======
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
  approvalController.getBudgetImpact.bind(approvalController)
);

// Reverse approval (within 12 hours)
router.post('/approvals/:requestId/reverse',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
=======
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  approvalController.getBudgetImpact.bind(approvalController)
);

// Reverse approval (within 5 hours)
router.post('/approvals/:requestId/reverse',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  approvalController.reverseApproval.bind(approvalController)
);

// Check if approval can be reversed
router.get('/approvals/:requestId/can-reverse',
  authenticateToken,
<<<<<<< HEAD
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
=======
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  approvalController.canReverseApproval.bind(approvalController)
);

// Get approval history for current user
router.get('/approvals/history',
  authenticateToken,
<<<<<<< HEAD
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
=======
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  approvalController.getApprovalHistory.bind(approvalController)
);

// Get all approved requests
router.get('/approvals/approved',
  authenticateToken,
<<<<<<< HEAD
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
=======
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  approvalController.getApprovedRequests.bind(approvalController)
);

// Get all rejected requests
router.get('/approvals/rejected',
  authenticateToken,
<<<<<<< HEAD
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
=======
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  approvalController.getRejectedRequests.bind(approvalController)
);

// Get approver dashboard stats
router.get('/approvals/stats',
  authenticateToken,
<<<<<<< HEAD
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN),
=======
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
  requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD, ROLES.FINANCE_CLERK),
  budgetController.getBudgetSummary.bind(budgetController)
);

// Get financial reports (variance, donor summary, trends)
router.get('/budgets/reports',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_REPORTS),
  budgetController.getFinancialReports.bind(budgetController)
);

=======
  requireRole(ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK),
  budgetController.getBudgetSummary.bind(budgetController)
);

>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
// Get single budget line with history
router.get('/budgets/:budgetLineId',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_BUDGET_LINES),
  budgetController.getBudgetLineById.bind(budgetController)
);

<<<<<<< HEAD
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
=======
// Create budget line (Finance only)
router.post('/budgets',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  budgetLineValidator,
  budgetController.createBudgetLine.bind(budgetController)
);

<<<<<<< HEAD
// Update budget line (Finance Manager only)
router.put('/budgets/:budgetLineId',
  authenticateToken,
  requireFinanceManager,
=======
// Update budget line (Finance only)
router.put('/budgets/:budgetLineId',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  budgetLineValidator,
  budgetController.updateBudgetLine.bind(budgetController)
);

<<<<<<< HEAD
// Top up budget (Finance Manager only)
router.post('/budgets/:budgetLineId/topup',
  authenticateToken,
  requireFinanceManager,
=======
// Top up budget (Finance only)
router.post('/budgets/:budgetLineId/topup',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  topUpBudgetValidator,
  budgetController.topUpBudget.bind(budgetController)
);

<<<<<<< HEAD
// Delete budget line (Finance Manager only)
router.delete('/budgets/:budgetLineId',
  authenticateToken,
  requireFinanceManager,
=======
// Delete budget line (Finance only)
router.delete('/budgets/:budgetLineId',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
// Generate PDF reconciliation document
router.get('/export/reconciliation/:requestId/pdf',
  authenticateToken,
  exportController.generateReconciliationPDF.bind(exportController)
);

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
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

// ============================================================================
// DONOR ROUTES
// ============================================================================

// Get next auto-generated donor code (Finance Manager only)
router.get('/donors/next-code',
  authenticateToken,
  requireFinanceManager,
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

// Create donor (Finance Manager only)
router.post('/donors',
  authenticateToken,
  requireFinanceManager,
  donorController.createDonor
);

// Update donor (Finance Manager only)
router.put('/donors/:id',
  authenticateToken,
  requireFinanceManager,
  donorController.updateDonor
);

// Deactivate donor (Finance Manager only)
router.patch('/donors/:id/deactivate',
  authenticateToken,
  requireFinanceManager,
  donorController.deactivateDonor
);

// Activate donor (Finance Manager only)
router.patch('/donors/:id/activate',
  authenticateToken,
  requireFinanceManager,
  donorController.activateDonor
);

// Delete donor permanently (Finance Manager only)
router.delete('/donors/:id',
  authenticateToken,
  requireFinanceManager,
  donorController.deleteDonor
);

// Add committed funds to donor (Finance Manager only)
router.post('/donors/:id/add-funds',
  authenticateToken,
  requireFinanceManager,
  donorController.addFunds
);

// Remove committed funds from donor (Finance Manager only)
router.post('/donors/:id/remove-funds',
  authenticateToken,
  requireFinanceManager,
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

// Get budget lines by project (for request form - project hierarchy)
router.get('/budgets/project/:projectId',
  authenticateToken,
  budgetController.getBudgetLinesByProject.bind(budgetController)
);

// ============================================================================
// PROJECT ROUTES
// Hierarchy: Donor → Projects → Budget Lines
// ============================================================================

const projectController = require('../controllers/project.controller');

// Get all projects (optionally filter by donor_id, is_active)
router.get('/projects',
  authenticateToken,
  projectController.getAllProjects
);

// Get single project with budget lines
router.get('/projects/:id',
  authenticateToken,
  projectController.getProjectById
);

// Get budget lines for a project
router.get('/projects/:id/budget-lines',
  authenticateToken,
  projectController.getProjectBudgetLines
);

// Get all activity (transactions, requests) for a project
router.get('/projects/:id/activity',
  authenticateToken,
  projectController.getProjectActivity
);

// Update project (Finance Manager only)
router.put('/projects/:id',
  authenticateToken,
  requireFinanceManager,
  projectController.updateProject
);

// Delete project (Finance Manager only)
router.delete('/projects/:id',
  authenticateToken,
  requireFinanceManager,
  projectController.deleteProject
);

// Add funds to a project (Finance Manager only)
router.post('/projects/:id/add-funds',
  authenticateToken,
  requireFinanceManager,
  projectController.addProjectFunds
);

// Deduct funds from a project (Finance Manager only)
router.post('/projects/:id/deduct-funds',
  authenticateToken,
  requireFinanceManager,
  projectController.deductProjectFunds
);

// Get all projects for a specific donor
router.get('/donors/:donorId/projects',
  authenticateToken,
  projectController.getProjectsByDonor
);

// Create a new project under a donor (Finance Manager only)
router.post('/donors/:donorId/projects',
  authenticateToken,
  requireFinanceManager,
  projectController.createProject
);

// ============================================================================
// RECONCILIATION ROUTES
// ============================================================================

// Check if current user has overdue unsubmitted reconciliations
router.get('/reconciliations/overdue-check',
  authenticateToken,
  reconciliationController.getOverdueCheck.bind(reconciliationController)
);

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

// Get pending reconciliations (Finance team + Admin)
router.get('/reconciliations/pending',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK, ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD),
  reconciliationController.getPendingReconciliations.bind(reconciliationController)
);

// Get pending reconciliations for lead/HOP/Admin review
router.get('/reconciliations/pending-lead',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN),
  reconciliationController.getPendingLeadReconciliations.bind(reconciliationController)
);

// Get reconciliations already approved by lead (audit trail)
router.get('/reconciliations/lead-approved',
  authenticateToken,
  requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN),
  reconciliationController.getLeadApprovedReconciliations.bind(reconciliationController)
);

// Get reconciliation history (all finance team + Admin)
router.get('/reconciliations/history',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK, ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD),
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

// Update an existing reconciliation before final approval (requester only)
router.put('/reconciliations/:requestId',
  authenticateToken,
  reconciliationController.updateReconciliation.bind(reconciliationController)
);

// Finance/Admin/HOP approves reconciliation directly to RECONCILED
router.post('/reconciliations/:requestId/approve',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK, ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS),
  reconciliationController.approveReconciliation.bind(reconciliationController)
);

// Finance/Admin/HOP rejects reconciliation
router.post('/reconciliations/:requestId/reject',
  authenticateToken,
  requireRole(ROLES.FINANCE_CLERK, ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS),
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

// Generate a one-time download token (authenticated)
router.get('/attachments/:id/download-token',
  authenticateToken,
  attachmentController.generateDownloadToken
);

// Serve file via one-time token (no auth middleware — token IS the credential)
router.get('/attachments/dl/:token',
  attachmentController.downloadByToken
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

// Overall super-admin overview
router.get('/admin/overview',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.getOverallOverview.bind(adminController)
);

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

// Delete user (Admin only - with safeguards)
router.delete('/admin/users/:userId',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.deleteUser.bind(adminController)
);

// ============================================================================
// ADMIN DEPARTMENT MANAGEMENT ROUTES
// ============================================================================

// Get all departments with user counts (admin view)
router.get('/admin/departments',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.getDepartments.bind(adminController)
);

// Create department
router.post('/admin/departments',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.createDepartment.bind(adminController)
);

// Update department
router.put('/admin/departments/:id',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.updateDepartment.bind(adminController)
);

// Delete / deactivate department
router.delete('/admin/departments/:id',
  authenticateToken,
  requireRole(ROLES.ADMIN),
  adminController.deleteDepartment.bind(adminController)
);

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
// ============================================================================
// LOOKUP ROUTES
// ============================================================================

<<<<<<< HEAD
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
=======
const { query } = require('../config/database');
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

// Get all departments
router.get('/departments', authenticateToken, async (req, res) => {
  try {
<<<<<<< HEAD
    const departments = await lookupQuery(
=======
    const departments = await query(
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
    const roles = await lookupQuery('SELECT id, role_name, role_description FROM roles');
=======
    const roles = await query('SELECT id, role_name, role_description FROM roles');
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch roles' });
  }
});

<<<<<<< HEAD
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
router.put('/hr/leave-types/:id', authenticateToken, requireRole(ROLES.ADMIN), hrController.updateLeaveType.bind(hrController));
router.get('/hr/leave-requests', authenticateToken, hrController.getLeaveRequests.bind(hrController));
router.post('/hr/leave-requests', authenticateToken, hrController.createLeaveRequest.bind(hrController));
router.put('/hr/leave-requests/:leaveId/approve', authenticateToken, requireRole(ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN), hrController.approveLeaveRequest.bind(hrController));
router.post('/hr/leave/run-accrual', authenticateToken, requireRole(ROLES.ADMIN), hrController.runLeaveAccrual.bind(hrController));
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

// ============================================================================
// PROCUREMENT MODULE ROUTES
// ============================================================================

const procurementController = require('../controllers/procurement.controller');

// Dashboard stats
router.get('/procurement/dashboard',
  authenticateToken,
  procurementController.getDashboardStats.bind(procurementController)
);

// ---- Purchase Requests ----
router.get('/procurement/requests',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.getPurchaseRequests.bind(procurementController)
);

router.post('/procurement/requests',
  authenticateToken,
  requirePermission(PERMISSIONS.CREATE_PURCHASE_REQUEST),
  procurementController.createPurchaseRequest.bind(procurementController)
);

router.get('/procurement/requests/:id',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.getPurchaseRequestById.bind(procurementController)
);

router.put('/procurement/requests/:id',
  authenticateToken,
  requirePermission(PERMISSIONS.CREATE_PURCHASE_REQUEST),
  procurementController.updatePurchaseRequest.bind(procurementController)
);

router.delete('/procurement/requests/:id',
  authenticateToken,
  procurementController.deletePurchaseRequest.bind(procurementController)
);

router.post('/procurement/requests/:id/submit',
  authenticateToken,
  requirePermission(PERMISSIONS.CREATE_PURCHASE_REQUEST),
  procurementController.submitPurchaseRequest.bind(procurementController)
);

// ---- Approval Actions ----
router.post('/procurement/requests/:id/approve-dept',
  authenticateToken,
  requirePermission(PERMISSIONS.APPROVE_PURCHASE_REQUEST),
  procurementController.approveDeptLevel.bind(procurementController)
);

router.post('/procurement/requests/:id/reverse-dept-approval',
  authenticateToken,
  requirePermission(PERMISSIONS.APPROVE_PURCHASE_REQUEST),
  procurementController.reverseDeptApproval.bind(procurementController)
);

router.post('/procurement/requests/:id/approve-finance',
  authenticateToken,
  requirePermission(PERMISSIONS.PROC_FINANCE_APPROVE),
  procurementController.approveFinanceLevel.bind(procurementController)
);

router.post('/procurement/requests/:id/reject',
  authenticateToken,
  procurementController.rejectRequest.bind(procurementController)
);

router.post('/procurement/requests/:id/submit-committee',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  procurementController.submitToCommittee.bind(procurementController)
);

router.post('/procurement/requests/:id/committee-decision',
  authenticateToken,
  requirePermission(PERMISSIONS.COMMITTEE_REVIEW),
  procurementController.committeeDecision.bind(procurementController)
);

router.post('/procurement/requests/:id/final-approve',
  authenticateToken,
  requirePermission(PERMISSIONS.PROC_FINANCE_APPROVE),
  uploadSingle,
  handleUploadError,
  procurementController.finalFinanceApproval.bind(procurementController)
);

router.post('/procurement/requests/:id/reverse-final-approval',
  authenticateToken,
  requirePermission(PERMISSIONS.PROC_FINANCE_APPROVE),
  procurementController.reverseFinalApproval.bind(procurementController)
);

// ---- Approval Trail ----
router.get('/procurement/requests/:id/trail',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.getApprovalTrail.bind(procurementController)
);

// ---- Quotations ----
router.get('/procurement/requests/:id/quotations',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.getQuotations.bind(procurementController)
);

router.post('/procurement/requests/:id/quotations',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  uploadSingle,
  handleUploadError,
  procurementController.uploadQuotation.bind(procurementController)
);

router.delete('/procurement/requests/:id/quotations/:quotationId',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  procurementController.deleteQuotation.bind(procurementController)
);

router.put('/procurement/requests/:id/quotations/:quotationId',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  procurementController.updateQuotation.bind(procurementController)
);

router.get('/procurement/requests/:id/quotations/:quotationId/download',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.downloadQuotation.bind(procurementController)
);

// ---- Committee Reviews ----
router.get('/procurement/requests/:id/committee-votes',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.getCommitteeVotes.bind(procurementController)
);

router.get('/procurement/requests/:id/committee-reviews',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.getCommitteeReviews.bind(procurementController)
);

// ---- Vendors ----
router.get('/procurement/vendors',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.getVendors.bind(procurementController)
);

router.post('/procurement/vendors',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_VENDORS),
  procurementController.createVendor.bind(procurementController)
);

router.get('/procurement/vendors/:vendorId',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.getVendorById.bind(procurementController)
);

router.put('/procurement/vendors/:vendorId',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_VENDORS),
  procurementController.updateVendor.bind(procurementController)
);

router.delete('/procurement/vendors/:vendorId',
  authenticateToken,
  requirePermission(PERMISSIONS.MANAGE_VENDORS),
  procurementController.deleteVendor.bind(procurementController)
);

router.get('/procurement/requests/:id/pop/download',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.downloadPOP.bind(procurementController)
);

// ---- Request Attachments ----
router.get('/procurement/requests/:id/attachments',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.getRequestAttachments.bind(procurementController)
);

router.post('/procurement/requests/:id/attachments',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  uploadSingle,
  handleUploadError,
  procurementController.uploadRequestAttachment.bind(procurementController)
);

router.delete('/procurement/requests/:id/attachments/:attachmentId',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.deleteRequestAttachment.bind(procurementController)
);

router.get('/procurement/attachments/:attachmentId/download',
  authenticateToken,
  requirePermission(PERMISSIONS.VIEW_PURCHASE_REQUESTS),
  procurementController.downloadRequestAttachment.bind(procurementController)
);

// (Notification routes are registered below, after settings — they use notificationService)

// Get notifications for current user (legacy dynamic route — replaced below by notificationService)
router.get('/notifications_legacy_unused', authenticateToken, async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const notifications = [];

    if (role === 'PROGRAM_LEAD') {
      const pending = await lookupQuery(
        `SELECT r.id, r.request_number, r.purpose, r.created_at, u.first_name, u.last_name
         FROM requests r JOIN users u ON r.requester_id = u.id
         WHERE r.status = 'LEAD_APPROVAL' ORDER BY r.created_at DESC LIMIT 10`
      );
      pending.forEach(r => notifications.push({
        id: `req-lead-${r.id}`, type: 'approval_pending',
        title: 'Request Awaiting Your Approval',
        message: `${r.first_name} ${r.last_name} \u2014 ${r.purpose}`,
        link: '/finance/approvals', created_at: r.created_at
      }));
    }

    if (role === 'HEAD_OF_PROGRAMS') {
      const pending = await lookupQuery(
        `SELECT r.id, r.request_number, r.purpose, r.created_at, u.first_name, u.last_name
         FROM requests r JOIN users u ON r.requester_id = u.id
         WHERE r.status = 'HOP_APPROVAL' ORDER BY r.created_at DESC LIMIT 10`
      );
      pending.forEach(r => notifications.push({
        id: `req-hop-${r.id}`, type: 'approval_pending',
        title: 'Request Awaiting HOP Approval',
        message: `${r.first_name} ${r.last_name} \u2014 ${r.purpose}`,
        link: '/finance/approvals', created_at: r.created_at
      }));
      const pendingRecon = await lookupQuery(
        `SELECT r2.id, r2.request_number, u.first_name, u.last_name, rc.submitted_at
         FROM reconciliations rc JOIN requests r2 ON rc.request_id = r2.id
         JOIN users u ON r2.requester_id = u.id
         WHERE rc.lead_status = 'PENDING' ORDER BY rc.submitted_at DESC LIMIT 5`
      );
      pendingRecon.forEach(r => notifications.push({
        id: `recon-hop-${r.id}`, type: 'reconciliation_pending',
        title: 'Reconciliation Awaiting Review',
        message: `${r.first_name} ${r.last_name} \u2014 ${r.request_number}`,
        link: '/reconciliation', created_at: r.submitted_at
      }));
    }

    if (role === 'FINANCE_CLERK') {
      const pending = await lookupQuery(
        `SELECT r.id, r.request_number, r.purpose, r.created_at, u.first_name, u.last_name
         FROM requests r JOIN users u ON r.requester_id = u.id
         WHERE r.status = 'FINANCE_APPROVAL' ORDER BY r.created_at DESC LIMIT 10`
      );
      pending.forEach(r => notifications.push({
        id: `req-finance-${r.id}`, type: 'approval_pending',
        title: 'Request Awaiting Finance Approval',
        message: `${r.first_name} ${r.last_name} \u2014 ${r.purpose}`,
        link: '/finance/approvals', created_at: r.created_at
      }));
      const pendingRecon = await lookupQuery(
        `SELECT r2.id, r2.request_number, u.first_name, u.last_name, rc.submitted_at
         FROM reconciliations rc JOIN requests r2 ON rc.request_id = r2.id
         JOIN users u ON r2.requester_id = u.id
         WHERE rc.status = 'PENDING' ORDER BY rc.submitted_at DESC LIMIT 5`
      );
      pendingRecon.forEach(r => notifications.push({
        id: `recon-fc-${r.id}`, type: 'reconciliation_pending',
        title: 'Reconciliation Pending Finance Review',
        message: `${r.first_name} ${r.last_name} \u2014 ${r.request_number}`,
        link: '/reconciliation', created_at: r.submitted_at
      }));
    }

    if (role === 'PROCUREMENT_OFFICER') {
      const pending = await lookupQuery(
        `SELECT pr.id, pr.request_number, pr.created_at, u.first_name, u.last_name
         FROM procurement_requests pr JOIN users u ON pr.requester_id = u.id
         WHERE pr.status = 'DEPT_APPROVAL' ORDER BY pr.created_at DESC LIMIT 10`
      );
      pending.forEach(r => notifications.push({
        id: `proc-${r.id}`, type: 'approval_pending',
        title: 'Purchase Request Awaiting Approval',
        message: `${r.first_name} ${r.last_name} \u2014 ${r.request_number}`,
        link: '/procurement/approvals', created_at: r.created_at
      }));
    }

    if (role === 'PROCUREMENT_COMMITTEE') {
      const pending = await lookupQuery(
        `SELECT pr.id, pr.request_number, pr.created_at, u.first_name, u.last_name
         FROM procurement_requests pr JOIN users u ON pr.requester_id = u.id
         WHERE pr.status = 'COMMITTEE_EVALUATION' ORDER BY pr.created_at DESC LIMIT 10`
      );
      pending.forEach(r => notifications.push({
        id: `proc-comm-${r.id}`, type: 'approval_pending',
        title: 'Purchase Request Pending Evaluation',
        message: `${r.first_name} ${r.last_name} \u2014 ${r.request_number}`,
        link: '/procurement/approvals', created_at: r.created_at
      }));
    }

    if (role === 'ADMIN') {
      const counts = await lookupQuery(
        `SELECT
           (SELECT COUNT(*) FROM requests WHERE status NOT IN ('APPROVED','REJECTED','DRAFT','DISPATCHED')) as pending_requests,
           (SELECT COUNT(*) FROM reconciliations WHERE status = 'PENDING') as pending_recon`
      );
      if (parseInt(counts[0]?.pending_requests || 0) > 0) {
        notifications.push({ id: 'admin-pending-req', type: 'info',
          title: `${counts[0].pending_requests} Requests In Progress`,
          message: 'View all pending requests across the system',
          link: '/finance/approvals', created_at: new Date() });
      }
      if (parseInt(counts[0]?.pending_recon || 0) > 0) {
        notifications.push({ id: 'admin-pending-recon', type: 'info',
          title: `${counts[0].pending_recon} Pending Reconciliations`,
          message: 'View reconciliations awaiting review',
          link: '/reconciliation', created_at: new Date() });
      }
    }

    // Own request status changes (last 7 days)
    const myRecentChanges = await lookupQuery(
      `SELECT al.request_id, al.action, al.new_status, al.created_at,
              r.request_number, r.purpose
       FROM approval_logs al JOIN requests r ON al.request_id = r.id
       WHERE r.requester_id = ? AND al.action IN ('APPROVED','REJECTED','DISPATCHED')
         AND al.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY al.created_at DESC LIMIT 5`,
      [userId]
    );
    myRecentChanges.forEach(c => notifications.push({
      id: `own-${c.request_id}-${c.action}`,
      type: c.action === 'APPROVED' ? 'success' : c.action === 'REJECTED' ? 'error' : 'info',
      title: `Your Request Was ${c.action}`,
      message: `${c.request_number} \u2014 ${c.purpose}`,
      link: `/finance/requests/${c.request_id}`,
      created_at: c.created_at
    }));

    notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ success: true, data: notifications.slice(0, 20) });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// (end of legacy unused route)

// Get notification count (legacy unused — replaced below)
router.get('/notifications_count_legacy_unused', authenticateToken, async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    let count = 0;
    if (role === 'PROGRAM_LEAD') {
      const r = await lookupQuery("SELECT COUNT(*) as c FROM requests WHERE status = 'LEAD_APPROVAL'");
      count += parseInt(r[0]?.c || 0);
    }
    if (role === 'HEAD_OF_PROGRAMS') {
      const r = await lookupQuery("SELECT COUNT(*) as c FROM requests WHERE status = 'HOP_APPROVAL'");
      count += parseInt(r[0]?.c || 0);
      const r2 = await lookupQuery("SELECT COUNT(*) as c FROM reconciliations WHERE lead_status = 'PENDING'");
      count += parseInt(r2[0]?.c || 0);
    }
    if (role === 'FINANCE_CLERK') {
      const r = await lookupQuery("SELECT COUNT(*) as c FROM requests WHERE status = 'FINANCE_APPROVAL'");
      count += parseInt(r[0]?.c || 0);
      const r2 = await lookupQuery("SELECT COUNT(*) as c FROM reconciliations WHERE status = 'PENDING'");
      count += parseInt(r2[0]?.c || 0);
    }
    if (role === 'PROCUREMENT_OFFICER') {
      const r = await lookupQuery("SELECT COUNT(*) as c FROM procurement_requests WHERE status = 'DEPT_APPROVAL'");
      count += parseInt(r[0]?.c || 0);
    }
    if (role === 'PROCUREMENT_COMMITTEE') {
      const r = await lookupQuery("SELECT COUNT(*) as c FROM procurement_requests WHERE status = 'COMMITTEE_EVALUATION'");
      count += parseInt(r[0]?.c || 0);
    }
    if (role === 'ADMIN') {
      const r = await lookupQuery(
        `SELECT (SELECT COUNT(*) FROM requests WHERE status NOT IN ('APPROVED','REJECTED','DRAFT','DISPATCHED'))
              + (SELECT COUNT(*) FROM reconciliations WHERE status = 'PENDING') as c`
      );
      count = parseInt(r[0]?.c || 0);
    }
    res.json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({ success: false, data: { count: 0 } });
  }
});

// ============================================================================
// SYSTEM SETTINGS ROUTES (Admin only)
// ============================================================================

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../../settings.json');

const getSettingsFromFile = () => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return {
    org_name: 'ERP Connect',
    org_short_name: 'ERP',
    org_address: '',
    org_email: '',
    org_phone: '',
    currency: 'USD',
    currency_symbol: '$',
    fiscal_year_start: '01-01',
    timezone: 'Africa/Harare',
    date_format: 'DD/MM/YYYY',
    low_budget_threshold: 20,
    require_dept_approval: true,
    allow_override: false,
    session_timeout_hours: 8,
    max_login_attempts: 5
  };
};

router.get('/admin/settings', authenticateToken, requireRole(ROLES.ADMIN), (req, res) => {
  res.json({ success: true, data: getSettingsFromFile() });
});

router.put('/admin/settings', authenticateToken, requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const current = getSettingsFromFile();
    const updated = { ...current, ...req.body };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
    res.json({ success: true, message: 'Settings saved successfully', data: updated });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

// ============================================================================
// NOTIFICATION ROUTES
// ============================================================================

// NOTE: /notifications/read-all must come BEFORE /notifications/:id/read to avoid route conflict

router.get('/notifications/count', authenticateToken, async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: { count } });
  } catch (e) {
    res.status(500).json({ success: true, data: { count: 0 } });
  }
});

router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await notificationService.markAllRead(req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const items = await notificationService.getForUser(req.user.id);
    res.json({ success: true, data: items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await notificationService.markRead(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
module.exports = router;
