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
const projectController = require('../controllers/project.controller');
const procurementController = require('../controllers/procurement.controller');
const notificationService = require('../services/notification.service');

// Middleware
const { authenticateToken, requireRole, requirePermission, requireSameDepartment, requireFinanceManager, requirePartnerManager } = require('../middleware/auth.middleware');
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
router.post('/export/dispatch/:requestId/mark-dispatched', authenticateToken, requireRole(ROLES.FINANCE_CLERK, ROLES.ADMIN), exportController.markAsDispatched.bind(exportController));
router.post('/export/dispatch/:requestId/reverse-dispatch', authenticateToken, requireRole(ROLES.FINANCE_CLERK, ROLES.ADMIN), exportController.reverseDispatch.bind(exportController));

// ============================================================================
// DONOR ROUTES
// ============================================================================

router.get('/donors/next-code', authenticateToken, donorController.getNextDonorCode.bind(donorController));
router.get('/donors', authenticateToken, donorController.getAllDonors.bind(donorController));
router.get('/donors/:donorId/projects', authenticateToken, projectController.getProjectsByDonor.bind(projectController));
router.post('/donors/:donorId/projects', authenticateToken, requirePartnerManager, projectController.createProject.bind(projectController));
router.get('/donors/:id/stats', authenticateToken, donorController.getDonorStats.bind(donorController));
router.get('/donors/:id/transactions', authenticateToken, donorController.getDonorTransactions.bind(donorController));
router.get('/donors/:id/budget-lines', authenticateToken, donorController.getDonorBudgetLines.bind(donorController));
router.get('/donors/:id', authenticateToken, donorController.getDonorById.bind(donorController));
router.post('/donors', authenticateToken, requirePartnerManager, donorController.createDonor.bind(donorController));
router.put('/donors/:id', authenticateToken, requirePartnerManager, donorController.updateDonor.bind(donorController));
router.patch('/donors/:id/activate', authenticateToken, requirePartnerManager, donorController.activateDonor.bind(donorController));
router.patch('/donors/:id/deactivate', authenticateToken, requirePartnerManager, donorController.deactivateDonor.bind(donorController));
router.post('/donors/:id/add-funds', authenticateToken, requirePartnerManager, donorController.addFunds.bind(donorController));
router.post('/donors/:id/remove-funds', authenticateToken, requirePartnerManager, donorController.removeFunds.bind(donorController));
router.delete('/donors/:id', authenticateToken, requireRole(ROLES.ADMIN), donorController.deleteDonor.bind(donorController));

// ============================================================================
// PROJECT ROUTES
// ============================================================================

router.get('/projects', authenticateToken, projectController.getAllProjects.bind(projectController));
router.get('/projects/:id/budget-lines', authenticateToken, projectController.getProjectBudgetLines.bind(projectController));
router.get('/projects/:id/activity', authenticateToken, projectController.getProjectActivity.bind(projectController));
router.get('/projects/:id', authenticateToken, projectController.getProjectById.bind(projectController));
router.post('/projects', authenticateToken, requirePartnerManager, projectController.createProject.bind(projectController));
router.put('/projects/:id', authenticateToken, requirePartnerManager, projectController.updateProject.bind(projectController));
router.post('/projects/:id/add-funds', authenticateToken, requirePartnerManager, projectController.addProjectFunds.bind(projectController));
router.post('/projects/:id/deduct-funds', authenticateToken, requirePartnerManager, projectController.deductProjectFunds.bind(projectController));
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
router.post('/procurement/requests/:id/reject', authenticateToken, procurementController.rejectRequest.bind(procurementController));
router.post('/procurement/requests/:id/reverse-dept-approval', authenticateToken, procurementController.reverseDeptApproval.bind(procurementController));
router.post('/procurement/requests/:id/finance-approve', authenticateToken, procurementController.approveFinanceLevel.bind(procurementController));
router.post('/procurement/requests/:id/submit-committee', authenticateToken, procurementController.submitToCommittee.bind(procurementController));
router.post('/procurement/requests/:id/committee-decision', authenticateToken, procurementController.committeeDecision.bind(procurementController));
router.post('/procurement/requests/:id/final-approve', authenticateToken, uploadSingle, handleUploadError, procurementController.finalFinanceApproval.bind(procurementController));
router.post('/procurement/requests/:id/reverse-final-approval', authenticateToken, procurementController.reverseFinalApproval.bind(procurementController));
router.get('/procurement/requests/:id/approval-trail', authenticateToken, procurementController.getApprovalTrail.bind(procurementController));
router.get('/procurement/requests/:id/committee-votes', authenticateToken, procurementController.getCommitteeVotes.bind(procurementController));
router.get('/procurement/requests/:id/committee-reviews', authenticateToken, procurementController.getCommitteeReviews.bind(procurementController));
router.get('/procurement/requests/:id/attachments', authenticateToken, procurementController.getRequestAttachments.bind(procurementController));
router.post('/procurement/requests/:id/attachments', authenticateToken, uploadSingle, handleUploadError, procurementController.uploadRequestAttachment.bind(procurementController));
router.delete('/procurement/requests/:id/attachments/:attachmentId', authenticateToken, procurementController.deleteRequestAttachment.bind(procurementController));
router.get('/procurement/requests/:id/attachments/:attachmentId/download', authenticateToken, procurementController.downloadRequestAttachment.bind(procurementController));
router.get('/procurement/requests/:id/quotations', authenticateToken, procurementController.getQuotations.bind(procurementController));
router.post('/procurement/requests/:id/quotations', authenticateToken, uploadSingle, handleUploadError, procurementController.uploadQuotation.bind(procurementController));
router.put('/procurement/requests/:id/quotations/:quotationId', authenticateToken, procurementController.updateQuotation.bind(procurementController));
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
router.put('/admin/users/:id', authenticateToken, requireRole(ROLES.ADMIN), adminController.updateUser.bind(adminController));
router.delete('/admin/users/:id', authenticateToken, requireRole(ROLES.ADMIN), adminController.deleteUser.bind(adminController));
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
