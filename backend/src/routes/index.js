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
const hrExportController = require('../controllers/hrExport.controller');
const perDiemController = require('../controllers/perdiem.controller');
const projectController = require('../controllers/project.controller');
const procurementController = require('../controllers/procurement.controller');
const notificationService = require('../services/notification.service');

// Middleware
const { authenticateToken, requireRole, requirePermission, requireSameDepartment, requireFinanceManager, requireDispatchAccess } = require('../middleware/auth.middleware');
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

router.post('/requests', authenticateToken, requirePermission(PERMISSIONS.CREATE_REQUEST), createRequestValidator, requestController.createRequest.bind(requestController));
router.get('/requests', authenticateToken, paginationValidator, filterValidator, requestController.getRequests.bind(requestController));
router.get('/requests/:requestId', authenticateToken, requireSameDepartment, requestController.getRequestById.bind(requestController));
router.put('/requests/:requestId', authenticateToken, requirePermission(PERMISSIONS.EDIT_REQUEST), updateRequestValidator, requestController.updateRequest.bind(requestController));
router.delete('/requests/:requestId', authenticateToken, requestController.deleteRequest.bind(requestController));
router.post('/requests/:requestId/submit', authenticateToken, requirePermission(PERMISSIONS.SUBMIT_REQUEST), requestController.submitRequest.bind(requestController));
router.get('/requests/:requestId/budget-impact', authenticateToken, requestController.getBudgetImpact.bind(requestController));

// ============================================================================
// APPROVAL ROUTES
// ============================================================================

router.get('/approvals/pending', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), approvalController.getPendingApprovals.bind(approvalController));
router.post('/approvals/:requestId/approve', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), requireSameDepartment, approvalValidator, approvalController.approveRequest.bind(approvalController));
router.post('/approvals/:requestId/reject', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), requireSameDepartment, approvalValidator, approvalController.rejectRequest.bind(approvalController));
router.get('/approvals/:requestId/trail', authenticateToken, approvalController.getApprovalTrail.bind(approvalController));
router.get('/approvals/:requestId/budget-impact', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), approvalController.getBudgetImpact.bind(approvalController));
router.post('/approvals/:requestId/reverse', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), approvalController.reverseApproval.bind(approvalController));
router.get('/approvals/:requestId/can-reverse', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), approvalController.canReverseApproval.bind(approvalController));
// Finance Lead/HOP (FOS dept) carry finance authority alongside the Finance Clerk, and the UI
// offers them this action. Admit those roles here; the controller then narrows it to finance
// managers so a non-finance department Lead still cannot force-reject.
router.post('/approvals/:requestId/finance-force-reject', authenticateToken, requireRole(ROLES.FINANCE_CLERK, ROLES.ADMIN, ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS), approvalController.financeForceReject.bind(approvalController));
router.get('/approvals/history', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), approvalController.getApprovalHistory.bind(approvalController));
router.get('/approvals/approved', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), approvalController.getApprovedRequests.bind(approvalController));
router.get('/approvals/rejected', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), approvalController.getRejectedRequests.bind(approvalController));
router.get('/approvals/stats', authenticateToken, requireRole(ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.FINANCE_CLERK, ROLES.ADMIN), approvalController.getApproverStats.bind(approvalController));

// ============================================================================
// BUDGET ROUTES
// ============================================================================

router.get('/budgets', authenticateToken, requirePermission(PERMISSIONS.VIEW_BUDGET_LINES), budgetController.getBudgetLines.bind(budgetController));
router.get('/budgets/summary', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD, ROLES.FINANCE_CLERK), budgetController.getBudgetSummary.bind(budgetController));
router.get('/budgets/reports', authenticateToken, requirePermission(PERMISSIONS.VIEW_REPORTS), budgetController.getFinancialReports.bind(budgetController));
router.get('/budgets/:budgetLineId', authenticateToken, requirePermission(PERMISSIONS.VIEW_BUDGET_LINES), budgetController.getBudgetLineById.bind(budgetController));
router.get('/budgets/:budgetLineId/details', authenticateToken, requirePermission(PERMISSIONS.VIEW_BUDGET_LINES), budgetController.getBudgetLineDetails.bind(budgetController));
router.get('/budgets/:budgetLineId/requests', authenticateToken, requirePermission(PERMISSIONS.VIEW_BUDGET_LINES), budgetController.getBudgetLineRequests.bind(budgetController));
router.post('/budgets', authenticateToken, requireFinanceManager, budgetLineValidator, budgetController.createBudgetLine.bind(budgetController));
router.put('/budgets/:budgetLineId', authenticateToken, requireFinanceManager, budgetLineValidator, budgetController.updateBudgetLine.bind(budgetController));
router.post('/budgets/:budgetLineId/topup', authenticateToken, requireFinanceManager, topUpBudgetValidator, budgetController.topUpBudget.bind(budgetController));
router.delete('/budgets/:budgetLineId', authenticateToken, requireFinanceManager, budgetController.deleteBudgetLine.bind(budgetController));

// ============================================================================
// EXPORT ROUTES
// ============================================================================

router.get('/export/dispatch/:requestId/pdf', authenticateToken, requirePermission(PERMISSIONS.EXPORT_DATA), exportController.generateDispatchPDF.bind(exportController));
router.get('/export/reconciliation/:requestId/pdf', authenticateToken, exportController.generateReconciliationPDF.bind(exportController));
router.get('/export/dispatch/:requestId/excel', authenticateToken, requirePermission(PERMISSIONS.EXPORT_DATA), exportController.generateDispatchExcel.bind(exportController));
router.post('/export/bulk', authenticateToken, requirePermission(PERMISSIONS.EXPORT_DATA), exportController.generateBulkExport.bind(exportController));
router.post('/export/dispatch/:requestId/mark-dispatched', authenticateToken, requireDispatchAccess, exportController.markAsDispatched.bind(exportController));
router.post('/export/dispatch/:requestId/reverse-dispatch', authenticateToken, requireDispatchAccess, exportController.reverseDispatch.bind(exportController));

// ============================================================================
// DONOR ROUTES
// ============================================================================

router.get('/donors/next-code', authenticateToken, donorController.getNextDonorCode.bind(donorController));
router.get('/donors', authenticateToken, donorController.getAllDonors.bind(donorController));
router.get('/donors/:donorId/projects', authenticateToken, projectController.getProjectsByDonor.bind(projectController));
router.post('/donors/:donorId/projects', authenticateToken, requireFinanceManager, projectController.createProject.bind(projectController));
router.get('/donors/:id/stats', authenticateToken, donorController.getDonorStats.bind(donorController));
router.get('/donors/:id/transactions', authenticateToken, donorController.getDonorTransactions.bind(donorController));
router.get('/donors/:id/budget-lines', authenticateToken, donorController.getDonorBudgetLines.bind(donorController));
router.get('/donors/:id', authenticateToken, donorController.getDonorById.bind(donorController));
router.post('/donors', authenticateToken, requireFinanceManager, donorController.createDonor.bind(donorController));
router.put('/donors/:id', authenticateToken, requireFinanceManager, donorController.updateDonor.bind(donorController));
router.patch('/donors/:id/activate', authenticateToken, requireFinanceManager, donorController.activateDonor.bind(donorController));
router.patch('/donors/:id/deactivate', authenticateToken, requireFinanceManager, donorController.deactivateDonor.bind(donorController));
router.post('/donors/:id/add-funds', authenticateToken, requireFinanceManager, donorController.addFunds.bind(donorController));
router.post('/donors/:id/remove-funds', authenticateToken, requireFinanceManager, donorController.removeFunds.bind(donorController));
router.delete('/donors/:id', authenticateToken, requireRole(ROLES.ADMIN), donorController.deleteDonor.bind(donorController));

// ============================================================================
// PROJECT ROUTES
// ============================================================================

router.get('/projects', authenticateToken, projectController.getAllProjects.bind(projectController));
router.get('/projects/:id/budget-lines', authenticateToken, projectController.getProjectBudgetLines.bind(projectController));
router.get('/projects/:id/activity', authenticateToken, projectController.getProjectActivity.bind(projectController));
router.get('/projects/:id', authenticateToken, projectController.getProjectById.bind(projectController));
router.post('/projects', authenticateToken, requireFinanceManager, projectController.createProject.bind(projectController));
router.put('/projects/:id', authenticateToken, requireFinanceManager, projectController.updateProject.bind(projectController));
router.post('/projects/:id/add-funds', authenticateToken, requireFinanceManager, projectController.addProjectFunds.bind(projectController));
router.post('/projects/:id/deduct-funds', authenticateToken, requireFinanceManager, projectController.deductProjectFunds.bind(projectController));
router.delete('/projects/:id', authenticateToken, requireRole(ROLES.ADMIN), projectController.deleteProject.bind(projectController));

// ============================================================================
// RECONCILIATION ROUTES
// ============================================================================

router.get('/reconciliations/my-dispatched', authenticateToken, reconciliationController.getMyDispatchedRequests.bind(reconciliationController));
router.get('/reconciliations/my-reconciliations', authenticateToken, reconciliationController.getMyReconciliations.bind(reconciliationController));
router.get('/reconciliations/pending', authenticateToken, reconciliationController.getPendingReconciliations.bind(reconciliationController));
router.get('/reconciliations/pending-lead', authenticateToken, reconciliationController.getPendingLeadReconciliations.bind(reconciliationController));
router.get('/reconciliations/lead-approved', authenticateToken, reconciliationController.getLeadApprovedReconciliations.bind(reconciliationController));
router.get('/reconciliations/history', authenticateToken, reconciliationController.getReconciliationHistory.bind(reconciliationController));
router.get('/reconciliations/finance-review-history', authenticateToken, reconciliationController.getFinanceReviewHistory.bind(reconciliationController));
router.get('/reconciliations/overdue-check', authenticateToken, reconciliationController.getOverdueCheck.bind(reconciliationController));
router.get('/reconciliations/:requestId', authenticateToken, reconciliationController.getReconciliation.bind(reconciliationController));
router.post('/reconciliations', authenticateToken, reconciliationController.submitReconciliation.bind(reconciliationController));
router.put('/reconciliations/:requestId', authenticateToken, reconciliationController.updateReconciliation.bind(reconciliationController));
router.post('/reconciliations/:requestId/submit', authenticateToken, reconciliationController.submitReconciliation.bind(reconciliationController));
router.post('/reconciliations/:requestId/approve', authenticateToken, reconciliationController.approveReconciliation.bind(reconciliationController));
router.post('/reconciliations/:requestId/reject', authenticateToken, reconciliationController.rejectReconciliation.bind(reconciliationController));
router.post('/reconciliations/:requestId/lead-approve', authenticateToken, reconciliationController.approveReconciliationAsLead.bind(reconciliationController));
router.post('/reconciliations/:requestId/lead-reject', authenticateToken, reconciliationController.rejectReconciliationAsLead.bind(reconciliationController));

// ============================================================================
// ATTACHMENT ROUTES
// ============================================================================

router.post('/attachments/upload', authenticateToken, uploadSingle, handleUploadError, attachmentController.uploadAttachment);
router.post('/attachments/upload-multiple', authenticateToken, uploadMultiple, handleUploadError, attachmentController.uploadMultipleAttachments);
router.get('/attachments/dl/:token', attachmentController.downloadByToken);
router.get('/attachments/:id/download-token', authenticateToken, attachmentController.generateDownloadToken);
router.get('/attachments/:id/download', authenticateToken, attachmentController.downloadAttachment);
router.get('/attachments/:id', authenticateToken, attachmentController.getAttachmentById);
router.get('/attachments', authenticateToken, attachmentController.getEntityAttachments);
router.delete('/attachments/:id/permanent', authenticateToken, attachmentController.permanentlyDeleteAttachment);
router.delete('/attachments/:id', authenticateToken, attachmentController.deleteAttachment);

// ============================================================================
// PROCUREMENT ROUTES
// ============================================================================

router.get('/procurement/dashboard', authenticateToken, procurementController.getDashboardStats.bind(procurementController));
router.get('/procurement/requests', authenticateToken, procurementController.getPurchaseRequests.bind(procurementController));
router.post('/procurement/requests', authenticateToken, procurementController.createPurchaseRequest.bind(procurementController));
router.get('/procurement/requests/:id', authenticateToken, procurementController.getPurchaseRequestById.bind(procurementController));
router.put('/procurement/requests/:id', authenticateToken, procurementController.updatePurchaseRequest.bind(procurementController));
router.delete('/procurement/requests/:id', authenticateToken, procurementController.deletePurchaseRequest.bind(procurementController));
router.post('/procurement/requests/:id/submit', authenticateToken, procurementController.submitPurchaseRequest.bind(procurementController));
router.post('/procurement/requests/:id/approve', authenticateToken, procurementController.approveDeptLevel.bind(procurementController));
// Backward-compatibility alias for cached browsers that call the old approve-dept endpoint
router.post('/procurement/requests/:id/approve-dept', authenticateToken, procurementController.approveDeptLevel.bind(procurementController));
router.post('/procurement/requests/:id/reject', authenticateToken, procurementController.rejectRequest.bind(procurementController));
router.post('/procurement/requests/:id/reverse-dept-approval', authenticateToken, procurementController.reverseDeptApproval.bind(procurementController));
router.post('/procurement/requests/:id/finance-approve', authenticateToken, procurementController.approveFinanceLevel.bind(procurementController));
router.post('/procurement/requests/:id/submit-committee', authenticateToken, procurementController.submitToCommittee.bind(procurementController));
router.post('/procurement/requests/:id/resubmit-committee', authenticateToken, procurementController.resubmitToCommittee.bind(procurementController));
router.post('/procurement/requests/:id/committee-decision', authenticateToken, procurementController.committeeDecision.bind(procurementController));
// High-value requests (selected quotation >= USD 5,000) need the Super Admin and
// the owning department's Lead/HOP to approve, independently, before Finance.
router.post('/procurement/requests/:id/high-value-decision', authenticateToken, procurementController.highValueDecision.bind(procurementController));
router.get('/procurement/requests/:id/high-value-approvals', authenticateToken, procurementController.getHighValueApprovals.bind(procurementController));
// Payments are often settled in batches, so final approval accepts several POP
// documents at once and further batches can be attached afterwards.
router.post('/procurement/requests/:id/final-approve', authenticateToken, uploadMultiple, handleUploadError, procurementController.finalFinanceApproval.bind(procurementController));
router.get('/procurement/requests/:id/pops', authenticateToken, procurementController.getProofOfPayments.bind(procurementController));
router.post('/procurement/requests/:id/pops', authenticateToken, uploadMultiple, handleUploadError, procurementController.addProofOfPayment.bind(procurementController));
router.get('/procurement/requests/:id/pops/:popId/download', authenticateToken, procurementController.downloadProofOfPayment.bind(procurementController));
router.delete('/procurement/requests/:id/pops/:popId', authenticateToken, procurementController.deleteProofOfPayment.bind(procurementController));
router.post('/procurement/requests/:id/reverse-final-approval', authenticateToken, procurementController.reverseFinalApproval.bind(procurementController));
router.get('/procurement/requests/:id/approval-trail', authenticateToken, procurementController.getApprovalTrail.bind(procurementController));
router.get('/procurement/requests/:id/committee-votes', authenticateToken, procurementController.getCommitteeVotes.bind(procurementController));
router.get('/procurement/requests/:id/committee-reviews', authenticateToken, procurementController.getCommitteeReviews.bind(procurementController));
router.get('/procurement/requests/:id/attachments', authenticateToken, procurementController.getRequestAttachments.bind(procurementController));
router.post('/procurement/requests/:id/attachments', authenticateToken, uploadSingle, handleUploadError, procurementController.uploadRequestAttachment.bind(procurementController));
router.delete('/procurement/requests/:id/attachments/:attachmentId', authenticateToken, procurementController.deleteRequestAttachment.bind(procurementController));
router.get('/procurement/requests/:id/attachments/:attachmentId/download', authenticateToken, procurementController.downloadRequestAttachment.bind(procurementController));
// Alias used by frontend procurementService.downloadRequestAttachment (no requestId in URL)
router.get('/procurement/attachments/:attachmentId/download', authenticateToken, procurementController.downloadRequestAttachment.bind(procurementController));
router.get('/procurement/requests/:id/quotations', authenticateToken, procurementController.getQuotations.bind(procurementController));
router.post('/procurement/requests/:id/quotations', authenticateToken, uploadSingle, handleUploadError, procurementController.uploadQuotation.bind(procurementController));
router.put('/procurement/requests/:id/quotations/:quotationId', authenticateToken, uploadSingle, handleUploadError, procurementController.updateQuotation.bind(procurementController));
router.delete('/procurement/requests/:id/quotations/:quotationId', authenticateToken, procurementController.deleteQuotation.bind(procurementController));
router.get('/procurement/requests/:id/quotations/:quotationId/download', authenticateToken, procurementController.downloadQuotation.bind(procurementController));
router.get('/procurement/requests/:id/pop/download', authenticateToken, procurementController.downloadPOP.bind(procurementController));
router.get('/procurement/vendors', authenticateToken, procurementController.getVendors.bind(procurementController));
router.get('/procurement/vendors/:id', authenticateToken, procurementController.getVendorById.bind(procurementController));
router.post('/procurement/vendors', authenticateToken, procurementController.createVendor.bind(procurementController));
router.put('/procurement/vendors/:id', authenticateToken, procurementController.updateVendor.bind(procurementController));
router.delete('/procurement/vendors/:id', authenticateToken, procurementController.deleteVendor.bind(procurementController));

// ============================================================================
// PER DIEM ROUTES
// ============================================================================

router.get('/per-diem/rates', authenticateToken, perDiemController.getRates.bind(perDiemController));
router.get('/requests/:requestId/per-diem', authenticateToken, perDiemController.getClaim.bind(perDiemController));
router.post('/requests/:requestId/per-diem', authenticateToken, perDiemController.upsertClaim.bind(perDiemController));
router.put('/requests/:requestId/per-diem', authenticateToken, perDiemController.upsertClaim.bind(perDiemController));
router.delete('/requests/:requestId/per-diem', authenticateToken, perDiemController.deleteClaim.bind(perDiemController));

// ============================================================================
// NOTIFICATION ROUTES
// ============================================================================

router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await notificationService.getForUser(req.user.id);
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

router.get('/notifications/count', authenticateToken, async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch notification count' });
  }
});

router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await notificationService.markRead(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
});

router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await notificationService.markAllRead(req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to mark all notifications as read' });
  }
});

// ============================================================================
// ADMIN ROUTES
// ============================================================================

router.get('/admin/overview', authenticateToken, requireRole(ROLES.ADMIN), adminController.getOverallOverview.bind(adminController));
router.get('/admin/users', authenticateToken, requireRole(ROLES.ADMIN), adminController.getAllUsers.bind(adminController));
router.post('/admin/users', authenticateToken, requireRole(ROLES.ADMIN), adminController.createUser.bind(adminController));
router.get('/admin/users/:id', authenticateToken, requireRole(ROLES.ADMIN), adminController.getUserById.bind(adminController));
router.put('/admin/users/:id', authenticateToken, requireRole(ROLES.ADMIN), adminController.updateUser.bind(adminController));
router.delete('/admin/users/:id', authenticateToken, requireRole(ROLES.ADMIN), adminController.deleteUser.bind(adminController));
router.post('/admin/users/:id/reset-password', authenticateToken, requireRole(ROLES.ADMIN), adminController.resetPassword.bind(adminController));
router.patch('/admin/users/:id/toggle-active', authenticateToken, requireRole(ROLES.ADMIN), adminController.toggleActive.bind(adminController));
router.get('/admin/users/:id/login-history', authenticateToken, requireRole(ROLES.ADMIN), adminController.getLoginHistory.bind(adminController));
router.get('/admin/departments', authenticateToken, requireRole(ROLES.ADMIN), adminController.getDepartments.bind(adminController));
router.post('/admin/departments', authenticateToken, requireRole(ROLES.ADMIN), adminController.createDepartment.bind(adminController));
router.put('/admin/departments/:id', authenticateToken, requireRole(ROLES.ADMIN), adminController.updateDepartment.bind(adminController));
router.delete('/admin/departments/:id', authenticateToken, requireRole(ROLES.ADMIN), adminController.deleteDepartment.bind(adminController));

const path = require('path');
const fs = require('fs');
const SETTINGS_PATH = path.join(__dirname, '../../settings.json');

router.get('/admin/settings', authenticateToken, requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load settings' });
  }
});

router.put('/admin/settings', authenticateToken, requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const current = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const updated = { ...current, ...req.body };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(updated, null, 2));
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

// ============================================================================
// HR MODULE ROUTES
// ----------------------------------------------------------------------------
// Record-level scoping (own / department / organisation) is enforced inside
// hr.controller.js, because it depends on the caller's employee record rather
// than on the role alone. The guards here are the coarse role gate only.
// ============================================================================

// --- Dashboard --------------------------------------------------------------
router.get('/hr/dashboard', authenticateToken, hrController.getDashboardStats.bind(hrController));

// --- Employees --------------------------------------------------------------
router.get('/hr/employees', authenticateToken, hrController.getEmployees.bind(hrController));
router.post('/hr/employees', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.createEmployee.bind(hrController));
router.get('/hr/employees/:id', authenticateToken, hrController.getEmployeeById.bind(hrController));
router.put('/hr/employees/:id', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.updateEmployee.bind(hrController));

// --- Contracts --------------------------------------------------------------
router.get('/hr/employees/:employeeId/contracts', authenticateToken, hrController.getContracts.bind(hrController));
router.post('/hr/contracts', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.createContract.bind(hrController));
router.post('/hr/contracts/:contractId/renew', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.renewContract.bind(hrController));

// --- Leave types ------------------------------------------------------------
// Deductibility and the monthly accrual target are configured here, so only
// Super Admin may change them.
router.get('/hr/leave-types', authenticateToken, hrController.getLeaveTypes.bind(hrController));
router.put('/hr/leave-types/:id', authenticateToken, requireRole(ROLES.ADMIN), hrController.updateLeaveType.bind(hrController));

// --- Leave requests ---------------------------------------------------------
// NOTE: the literal '/hr/leave-requests/analytics'-style paths must not collide
// with ':leaveId'; analytics lives under its own /hr/leave-analytics path.
router.get('/hr/leave-requests', authenticateToken, hrController.getLeaveRequests.bind(hrController));
router.post('/hr/leave-requests', authenticateToken, uploadMultiple, handleUploadError, hrController.createLeaveRequest.bind(hrController));
router.get('/hr/leave-requests/:leaveId', authenticateToken, hrController.getLeaveRequestById.bind(hrController));
router.get('/hr/leave-requests/:leaveId/audit', authenticateToken, hrController.getLeaveAuditTrail.bind(hrController));
// Edit a pending request, or resubmit a rejected one (owner, or HR Office).
router.put('/hr/leave-requests/:leaveId', authenticateToken, uploadMultiple, handleUploadError, hrController.updateLeaveRequest.bind(hrController));
// PROGRAM_LEAD is allowed through the role gate because the Admin & HR Lead is
// part of the HR Office; leaveApproval.service enforces the real routing.
router.put('/hr/leave-requests/:leaveId/approve', authenticateToken, requireRole(ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD, ROLES.ADMIN), hrController.approveLeaveRequest.bind(hrController));

// --- Leave balances & accrual ----------------------------------------------
router.get('/hr/employees/:employeeId/leave-balances', authenticateToken, hrController.getLeaveBalances.bind(hrController));
router.post('/hr/leave-accrual/run', authenticateToken, requireRole(ROLES.ADMIN), hrController.runLeaveAccrual.bind(hrController));

// --- Leave analytics (HR Office / Super Admin; HOP sees own department) -----
router.get('/hr/leave-analytics', authenticateToken, hrController.getLeaveAnalytics.bind(hrController));

// --- Accrual history (own, or an individual you can already see) -----------
router.get('/hr/my-accruals', authenticateToken, hrController.getMyAccrualHistory.bind(hrController));
router.get('/hr/employees/:employeeId/accruals', authenticateToken, hrController.getEmployeeAccrualHistory.bind(hrController));
// Who accrues, and how fast — HR Office / Super Admin only.
router.put('/hr/employees/:employeeId/accrual-settings', authenticateToken, hrController.updateAccrualSettings.bind(hrController));

// --- Leave supporting documents --------------------------------------------
router.get('/hr/leave-requests/:leaveId/attachments', authenticateToken, hrController.getLeaveAttachments.bind(hrController));
router.post('/hr/leave-requests/:leaveId/attachments', authenticateToken, uploadSingle, handleUploadError, hrController.uploadLeaveAttachment.bind(hrController));
router.get('/hr/leave-attachments/:attachmentId/download', authenticateToken, hrController.downloadLeaveAttachment.bind(hrController));
router.delete('/hr/leave-attachments/:attachmentId', authenticateToken, hrController.deleteLeaveAttachment.bind(hrController));

// --- Manual balance adjustments (HR / Admin / HOP / Lead) -------------------
router.post('/hr/leave-adjustments', authenticateToken, hrController.adjustLeaveBalance.bind(hrController));
router.get('/hr/leave-adjustments', authenticateToken, hrController.getLeaveAdjustments.bind(hrController));

// --- Leave register & accrual reporting ------------------------------------
router.get('/hr/leave-register', authenticateToken, hrController.getLeaveRegister.bind(hrController));
router.get('/hr/reports/accruals', authenticateToken, hrController.getAccrualReport.bind(hrController));

// --- Leave exports ----------------------------------------------------------
router.get('/hr/leave-requests/:leaveId/export/pdf', authenticateToken, hrExportController.generateLeaveRequestPDF.bind(hrExportController));
router.get('/hr/exports/leave-register/pdf', authenticateToken, hrExportController.generateLeaveRegisterPDF.bind(hrExportController));
router.get('/hr/exports/leave-report/excel', authenticateToken, hrExportController.generateLeaveExcel.bind(hrExportController));

// --- Timesheets -------------------------------------------------------------
router.get('/hr/timesheets', authenticateToken, hrController.getTimesheets.bind(hrController));
router.post('/hr/timesheets', authenticateToken, hrController.createTimesheet.bind(hrController));
router.get('/hr/timesheets/:id', authenticateToken, hrController.getTimesheetById.bind(hrController));
router.put('/hr/timesheets/:id/submit', authenticateToken, hrController.submitTimesheet.bind(hrController));
router.put('/hr/timesheets/:id/approve', authenticateToken, requireRole(ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD, ROLES.ADMIN), hrController.approveTimesheet.bind(hrController));

// --- Payroll ----------------------------------------------------------------
router.get('/hr/payroll-periods', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), hrController.getPayrollPeriods.bind(hrController));
router.get('/hr/payroll-periods/:periodId/records', authenticateToken, requireRole(ROLES.ADMIN, ROLES.FINANCE_CLERK), hrController.getPayrollRecords.bind(hrController));

// --- Performance reviews ----------------------------------------------------
router.get('/hr/performance-reviews', authenticateToken, hrController.getPerformanceReviews.bind(hrController));
router.post('/hr/performance-reviews', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD), hrController.createPerformanceReview.bind(hrController));
router.put('/hr/performance-reviews/:id', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD), hrController.updatePerformanceReview.bind(hrController));

// --- Training ---------------------------------------------------------------
router.get('/hr/training-records', authenticateToken, hrController.getTrainingRecords.bind(hrController));
router.post('/hr/training-records', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.createTrainingRecord.bind(hrController));

// --- Disciplinary (restricted) ---------------------------------------------
router.get('/hr/disciplinary-records', authenticateToken, hrController.getDisciplinaryRecords.bind(hrController));
router.post('/hr/disciplinary-records', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.createDisciplinaryRecord.bind(hrController));

// --- Exit clearance ---------------------------------------------------------
router.get('/hr/exit-clearances', authenticateToken, hrController.getExitClearances.bind(hrController));
router.post('/hr/exit-clearances', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD), hrController.initiateExitClearance.bind(hrController));
router.put('/hr/exit-clearances/:id', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD), hrController.updateExitClearance.bind(hrController));
router.get('/hr/exit-clearances/:id/attachments', authenticateToken, hrController.getExitAttachments.bind(hrController));
router.post('/hr/exit-clearances/:id/attachments', authenticateToken, uploadSingle, handleUploadError, hrController.uploadExitAttachment.bind(hrController));

// --- Employee documents -----------------------------------------------------
router.get('/hr/employees/:employeeId/documents', authenticateToken, hrController.getDocuments.bind(hrController));
router.post('/hr/documents', authenticateToken, uploadSingle, handleUploadError, hrController.createDocument.bind(hrController));
router.get('/hr/documents/:documentId/download', authenticateToken, hrController.downloadEmployeeDocument.bind(hrController));
router.delete('/hr/documents/:documentId', authenticateToken, requireRole(ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS), hrController.deleteDocument.bind(hrController));


// ============================================================================
// LOOKUP ROUTES
// ============================================================================

const { query: lookupQuery } = require('../config/database');

router.get('/users/list', authenticateToken, async (req, res) => {
  try {
    const users = await lookupQuery('SELECT id, first_name, last_name, email FROM users WHERE is_active = TRUE ORDER BY first_name, last_name');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

router.get('/departments', authenticateToken, async (req, res) => {
  try {
    const departments = await lookupQuery('SELECT id, department_name, department_code FROM departments WHERE is_active = TRUE ORDER BY department_name');
    res.json({ success: true, data: departments });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch departments' });
  }
});

router.get('/roles', authenticateToken, async (req, res) => {
  try {
    const roles = await lookupQuery('SELECT id, role_name, role_description FROM roles');
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch roles' });
  }
});

module.exports = router;
