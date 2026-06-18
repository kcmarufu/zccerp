/**
 * Reconciliation Service
 * Handles API calls for the reconciliation workflow
 */

import api from './api';
import { ApiResponse, Reconciliation, ReconciliationSubmitPayload, Request } from '../types';

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
   * Check if the current user has 2+ overdue unsubmitted reconciliations.
   * Returns { overdueCount, isBlocked }
   */
  async getOverdueCheck(): Promise<{ overdueCount: number; isBlocked: boolean }> {
    const response = await api.get('/reconciliations/overdue-check');
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
