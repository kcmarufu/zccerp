/**
 * Reconciliation Service
 * Handles API calls for the reconciliation workflow
 */

import api from './api';
import { ApiResponse, Reconciliation, ReconciliationSubmitPayload, Request } from '../types';

/** One reconciliation that has gone stale on a Lead/HOP review desk. */
export interface StaleLeadReconciliation {
  request_id: number;
  request_code: string;
  total_amount: number | string;
  department_code: string;
  requester_name: string;
  reconciliation_submitted_at: string;
  working_days_on_desk: number;
}

/** Shape of GET /reconciliations/lead-desk-backlog. */
export interface LeadDeskBacklog {
  items: StaleLeadReconciliation[];
  staleCount: number;
  /** How many stale reconciliations trigger the approval block. */
  limit: number;
  /** Working days on the desk before a reconciliation counts as stale. */
  workingDays: number;
  isBlocked: boolean;
}

export const reconciliationService = {
  /**
   * Get dispatched requests for current user (to reconcile)
   */
  async getMyDispatchedRequests(): Promise<ApiResponse<Request[]>> {
    const response = await api.get('/reconciliations/my-dispatched');
    return response.data;
  },

  /**
   * Get pending reconciliations (Finance review)
   */
  async getPendingReconciliations(): Promise<ApiResponse<any[]>> {
    const response = await api.get('/reconciliations/pending');
    return response.data;
  },

  /**
   * Get current user's reconciliations (all statuses)
   */
  async getMyReconciliations(): Promise<ApiResponse<any[]>> {
    const response = await api.get('/reconciliations/my-reconciliations');
    return response.data;
  },

  /**
   * Get reconciliation history
   */
  async getReconciliationHistory(): Promise<ApiResponse<any[]>> {
    const response = await api.get('/reconciliations/history');
    return response.data;
  },

  /**
   * Get reconciliation details for a request
   */
  async getReconciliation(requestId: number): Promise<ApiResponse<Reconciliation>> {
    const response = await api.get(`/reconciliations/${requestId}`);
    return response.data;
  },

  /**
   * Submit a reconciliation
   */
  async submitReconciliation(requestId: number, data: ReconciliationSubmitPayload): Promise<ApiResponse<any>> {
    const response = await api.post(`/reconciliations/${requestId}/submit`, data);
    return response.data;
  },

  /**
   * Finance approves a reconciliation
   */
  async approveReconciliation(requestId: number, comments?: string): Promise<ApiResponse<any>> {
    const response = await api.post(`/reconciliations/${requestId}/approve`, { comments });
    return response.data;
  },

  /**
   * Finance rejects a reconciliation
   */
  async rejectReconciliation(requestId: number, comments: string): Promise<ApiResponse<any>> {
    const response = await api.post(`/reconciliations/${requestId}/reject`, { comments });
    return response.data;
  },

  /**
   * Lead/HOP approves a reconciliation
   */
  async approveReconciliationAsLead(requestId: number, comments?: string): Promise<ApiResponse<any>> {
    const response = await api.post(`/reconciliations/${requestId}/lead-approve`, { comments });
    return response.data;
  },

  /**
   * Lead/HOP rejects a reconciliation
   */
  async rejectReconciliationAsLead(requestId: number, comments: string): Promise<ApiResponse<any>> {
    const response = await api.post(`/reconciliations/${requestId}/lead-reject`, { comments });
    return response.data;
  },

  /**
   * Undo a reconciliation approval made in error. The server works out which
   * stage is being undone from the request's current status: RECON_PENDING_
   * FINANCE goes back to the Lead/HOP, RECONCILED goes back to Finance with
   * its budget effects reversed.
   */
  async reverseReconciliation(requestId: number, comments?: string): Promise<ApiResponse<any>> {
    const response = await api.post(`/reconciliations/${requestId}/reverse`, { comments });
    return response.data;
  },

  /**
   * Whether the signed-in user may undo this reconciliation's approval.
   */
  async canReverseReconciliation(requestId: number): Promise<ApiResponse<{
    canReverse: boolean; stage?: 'LEAD' | 'FINANCE'; revertsTo?: string; reason?: string | null;
  }>> {
    const response = await api.get(`/reconciliations/${requestId}/can-reverse`);
    return response.data;
  },

  /**
   * Get pending reconciliations for lead/HOP review
   */
  async getPendingLeadReconciliations(): Promise<ApiResponse<any[]>> {
    const response = await api.get('/reconciliations/pending-lead');
    return response.data;
  },

  /**
   * Get reconciliations already approved by this lead (audit trail)
   */
  async getLeadApprovedReconciliations(): Promise<ApiResponse<any[]>> {
    const response = await api.get('/reconciliations/lead-approved');
    return response.data;
  },

  /**
   * Update an existing reconciliation (requester edits before final approval)
   */
  async updateReconciliation(requestId: number, data: ReconciliationSubmitPayload): Promise<ApiResponse<any>> {
    const response = await api.put(`/reconciliations/${requestId}`, data);
    return response.data;
  },

  /**
   * Mark a request as dispatched (Finance only)
   */
  async markAsDispatched(requestId: number): Promise<ApiResponse<any>> {
    const response = await api.post(`/export/dispatch/${requestId}/mark-dispatched`);
    return response.data;
  },

  /**
   * Reverse a dispatch — moves request from DISPATCHED back to APPROVED.
   * Finance Clerk / Admin only.
   */
  async reverseDispatch(requestId: number, reason?: string): Promise<ApiResponse<any>> {
    const response = await api.post(`/export/dispatch/${requestId}/reverse-dispatch`, { reason });
    return response.data;
  },

  /**
   * Get reconciliations reviewed by the current Finance Clerk
   */
  async getFinanceReviewHistory(): Promise<any> {
    const response = await api.get('/reconciliations/finance-review-history');
    return response.data;
  },

  /**
   * Check if the current user has 2+ overdue unsubmitted reconciliations.
   * Returns { overdueCount, isBlocked }
   */
  async getOverdueCheck(): Promise<{ overdueCount: number; isBlocked: boolean }> {
    const response = await api.get('/reconciliations/overdue-check');
    return response.data.data;
  },

  /**
   * The current user's stale lead-review backlog: reconciliations that have been
   * waiting on their desk for `workingDays` working days or more.
   *
   * `isBlocked` is true once `staleCount` reaches `limit`, at which point the
   * server refuses their float approvals until the backlog is cleared. Users who
   * hold no lead-review desk — and Super Admin — always come back clear.
   */
  async getLeadDeskBacklog(): Promise<LeadDeskBacklog> {
    const response = await api.get('/reconciliations/lead-desk-backlog');
    return response.data.data;
  },

  /**
   * Download a text-based PDF for a Float Requisition via the backend.
   */
  async downloadFloatPDF(requestId: number, requestCode: string): Promise<void> {
    const response = await api.get(`/export/dispatch/${requestId}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `float-requisition-${requestCode}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * Download a text-based PDF for a Reconciliation via the backend.
   */
  async downloadReconciliationPDF(requestId: number, requestCode: string): Promise<void> {
    const response = await api.get(`/export/reconciliation/${requestId}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `reconciliation-${requestCode}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};
