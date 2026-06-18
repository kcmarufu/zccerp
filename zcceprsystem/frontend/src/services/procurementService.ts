/**
 * Procurement API Service
 * All API calls for the Procurement Module
 */

import api from './api';
import {
  ProcRequest,
  ProcQuotation,
  ProcVendor,
  ProcDashboardStats,
  ProcCommitteeReview,
  CreateProcRequestPayload,
  ApiResponse
} from '../types';

const BASE = '/procurement';

// ============================================================================
// DASHBOARD
// ============================================================================
export const getProcurementDashboard = async (): Promise<ProcDashboardStats> => {
  const res = await api.get<ApiResponse<ProcDashboardStats>>(`${BASE}/dashboard`);
  return res.data.data!;
};

// ============================================================================
// PURCHASE REQUESTS
// ============================================================================
export const getPurchaseRequests = async (params?: {
  status?: string;
  priority?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ProcRequest[]> => {
  const res = await api.get<ApiResponse<ProcRequest[]>>(`${BASE}/requests`, { params });
  return res.data.data || [];
};

export const getPurchaseRequestById = async (id: number | string): Promise<ProcRequest> => {
  const res = await api.get<ApiResponse<ProcRequest>>(`${BASE}/requests/${id}`);
  return res.data.data!;
};

export const createPurchaseRequest = async (payload: CreateProcRequestPayload): Promise<{ requestId: number; requestCode: string }> => {
  const res = await api.post<ApiResponse<{ requestId: number; requestCode: string }>>(`${BASE}/requests`, payload);
  return res.data.data!;
};

export const updatePurchaseRequest = async (id: number | string, payload: Partial<CreateProcRequestPayload>): Promise<void> => {
  await api.put(`${BASE}/requests/${id}`, payload);
};

export const submitPurchaseRequest = async (id: number | string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/submit`);
};

export const deletePurchaseRequest = async (id: number | string): Promise<void> => {
  await api.delete(`${BASE}/requests/${id}`);
};

// ============================================================================
// APPROVALS
// ============================================================================
export const approveDeptLevel = async (id: number | string, comments?: string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/approve-dept`, { comments });
};

export const approveFinanceLevel = async (id: number | string, comments?: string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/approve-finance`, { comments });
};

export const rejectProcurementRequest = async (id: number | string, comments: string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/reject`, { comments });
};

export const submitToCommittee = async (
  id: number | string,
  selected_quotation_id?: number | null,
  comments?: string
): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/submit-committee`, { selected_quotation_id, comments });
};

export const committeeDecision = async (
  id: number | string,
  decision: 'APPROVED' | 'REJECTED',
  selected_quotation_id?: number | null,
  justification?: string
): Promise<{ status: string; message: string; votedCount?: number; totalRequired?: number; remaining?: string[] }> => {
  const res = await api.post(`${BASE}/requests/${id}/committee-decision`, { decision, selected_quotation_id, justification });
  return res.data.data || res.data;
};

export const getCommitteeVotes = async (requestId: number | string) => {
  const res = await api.get(`${BASE}/requests/${requestId}/committee-votes`);
  return res.data.data || [];
};

export const finalFinanceApproval = async (id: number | string, formData: FormData): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/final-approve`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

export const getApprovalTrail = async (id: number | string) => {
  const res = await api.get(`${BASE}/requests/${id}/trail`);
  return res.data.data || [];
};

// ============================================================================
// QUOTATIONS
// ============================================================================
export const getQuotations = async (requestId: number | string): Promise<ProcQuotation[]> => {
  const res = await api.get<ApiResponse<ProcQuotation[]>>(`${BASE}/requests/${requestId}/quotations`);
  return res.data.data || [];
};

export const uploadQuotation = async (requestId: number | string, formData: FormData): Promise<{ quotationId: number }> => {
  const res = await api.post<ApiResponse<{ quotationId: number }>>(
    `${BASE}/requests/${requestId}/quotations`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return res.data.data!;
};

export const deleteQuotation = async (requestId: number | string, quotationId: number): Promise<void> => {
  await api.delete(`${BASE}/requests/${requestId}/quotations/${quotationId}`);
};

export const updateQuotation = async (requestId: number | string, quotationId: number, data: Partial<ProcQuotation>): Promise<void> => {
  await api.put(`${BASE}/requests/${requestId}/quotations/${quotationId}`, data);
};

export const downloadQuotationFile = async (requestId: number | string, quotationId: number, fileName?: string): Promise<void> => {
  const res = await api.get(`${BASE}/requests/${requestId}/quotations/${quotationId}/download`, {
    responseType: 'blob'
  });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName || `quotation-${quotationId}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/** @deprecated use downloadQuotationFile instead */
export const getQuotationDownloadUrl = (requestId: number | string, quotationId: number): string => {
  return `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/procurement/requests/${requestId}/quotations/${quotationId}/download`;
};

// ============================================================================
// COMMITTEE REVIEWS
// ============================================================================
export const getCommitteeReviews = async (requestId: number | string): Promise<ProcCommitteeReview[]> => {
  const res = await api.get<ApiResponse<ProcCommitteeReview[]>>(`${BASE}/requests/${requestId}/committee-reviews`);
  return res.data.data || [];
};

// ============================================================================
// VENDORS
// ============================================================================
export const getVendors = async (params?: {
  search?: string;
  category?: string;
  is_prequalified?: string;
}): Promise<ProcVendor[]> => {
  const res = await api.get<ApiResponse<ProcVendor[]>>(`${BASE}/vendors`, { params });
  return res.data.data || [];
};

export const getVendorById = async (vendorId: number | string): Promise<ProcVendor> => {
  const res = await api.get<ApiResponse<ProcVendor>>(`${BASE}/vendors/${vendorId}`);
  return res.data.data!;
};

export const createVendor = async (payload: Partial<ProcVendor>): Promise<{ vendorId: number; vendorCode: string }> => {
  const res = await api.post<ApiResponse<{ vendorId: number; vendorCode: string }>>(`${BASE}/vendors`, payload);
  return res.data.data!;
};

export const updateVendor = async (vendorId: number | string, payload: Partial<ProcVendor>): Promise<void> => {
  await api.put(`${BASE}/vendors/${vendorId}`, payload);
};

export const deleteVendor = async (vendorId: number | string): Promise<void> => {
  await api.delete(`${BASE}/vendors/${vendorId}`);
};

// ============================================================================
// REQUEST ATTACHMENTS
// ============================================================================
export const getRequestAttachments = async (requestId: number | string) => {
  const res = await api.get(`${BASE}/requests/${requestId}/attachments`);
  return res.data.data || [];
};

export const downloadRequestAttachment = async (attachmentId: number, fileName?: string): Promise<void> => {
  const res = await api.get(`${BASE}/attachments/${attachmentId}/download`, { responseType: 'blob' });
  const contentType = res.headers['content-type'] || 'application/octet-stream';
  let url: string | null = null;
  try {
    url = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName || `attachment-${attachmentId}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    if (url) window.URL.revokeObjectURL(url);
  }
};

export const reverseFinalApproval = async (id: number | string, reason?: string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/reverse-final-approval`, { reason: reason || '' });
};

export const reverseDeptApproval = async (id: number | string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/reverse-dept-approval`);
};

export const downloadPOP = async (requestId: number | string, fileName?: string): Promise<void> => {
  const res = await api.get(`${BASE}/requests/${requestId}/pop/download`, { responseType: 'blob' });

  const contentType = res.headers['content-type'] || '';

  // Surface server-side JSON errors that arrive as blobs
  if (contentType.includes('application/json')) {
    const text = await (res.data as Blob).text();
    let msg = 'Failed to download POP document';
    try { msg = JSON.parse(text)?.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const safeType = contentType || 'application/octet-stream';
  let url: string | null = null;
  try {
    url = window.URL.createObjectURL(new Blob([res.data], { type: safeType }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName || `proof-of-payment-${requestId}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    if (url) window.URL.revokeObjectURL(url);
  }
};

// ============================================================================
// STATUS HELPERS
// ============================================================================
export const PROC_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_DEPT_APPROVAL: 'Pending Dept. Approval',
  PENDING_FINANCE_APPROVAL: 'Pending Finance Approval',
  PENDING_PROCUREMENT: 'In Procurement',
  PENDING_COMMITTEE: 'Pending Committee',
  PENDING_FINAL_FINANCE: 'Pending Final Approval',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled'
};

export const PROC_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  PENDING_DEPT_APPROVAL: 'warning',
  PENDING_FINANCE_APPROVAL: 'warning',
  PENDING_PROCUREMENT: 'info',
  PENDING_COMMITTEE: 'secondary',
  PENDING_FINAL_FINANCE: 'warning',
  COMPLETED: 'success',
  REJECTED: 'error',
  CANCELLED: 'error'
};

export const PROC_WORKFLOW_STEPS = [
  { label: 'Submit Request', status: 'DRAFT' },
  { label: 'Dept. Approval', status: 'PENDING_DEPT_APPROVAL' },
  { label: 'Procurement', status: 'PENDING_PROCUREMENT' },
  { label: 'Committee', status: 'PENDING_COMMITTEE' },
  { label: 'Final Finance', status: 'PENDING_FINAL_FINANCE' },
  { label: 'Completed', status: 'COMPLETED' }
];
