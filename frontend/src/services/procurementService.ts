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
  ApiResponse,
  PopObligations
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
// REPORTS & ANALYTICS
// ============================================================================

export interface ProcReportFilters {
  dateFrom?: string;
  dateTo?: string;
  donorId?: number;
  projectId?: number;
  departmentId?: number;
  status?: string;
}

/**
 * `scope` describes what the server decided this reader may see, so the page can
 * label the figures honestly rather than implying they are organisation-wide.
 */
export interface ProcReportScope {
  orgWide: boolean;
  ownRequestsOnly: boolean;
  departmentId: number | null;
}

export const getProcurementReports = async (filters: ProcReportFilters = {}): Promise<any> => {
  const res = await api.get<ApiResponse<any>>(`${BASE}/reports`, { params: filters });
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
  await api.post(`${BASE}/requests/${id}/approve`, { comments });
};

export const approveFinanceLevel = async (id: number | string, comments?: string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/finance-approve`, { comments });
};

/**
 * Who amends a request sent back after the Committee (workflow v2). Once
 * resubmitted it returns to the stage that sent it back.
 */
export type ReturnTo = 'PROCUREMENT' | 'REQUESTER';

export const rejectProcurementRequest = async (
  id: number | string, comments: string, returnTo?: ReturnTo | null
): Promise<{ status?: string; message?: string }> => {
  const res = await api.post(`${BASE}/requests/${id}/reject`, { comments, return_to: returnTo || undefined });
  return res.data.data || {};
};

// ── Workflow v2: purchase request → float requisition ───────────────────────

/** Stages after the Committee where a rejection asks who amends the request. */
export const POST_COMMITTEE_STAGES = ['PENDING_HIGH_VALUE_APPROVAL', 'PENDING_DEPT_CONFIRMATION', 'PENDING_FINAL_FINANCE'];

export const isWorkflowV2 = (r?: { workflow_version?: number } | null) => Number(r?.workflow_version) === 2;

/** The department confirms the Committee's award and sends it to Finance. */
export const confirmDepartment = async (id: number | string, comments?: string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/confirm-dept`, { comments });
};

/** Procurement sends an amended request back to the stage that returned it. */
export const resubmitFromProcurement = async (
  id: number | string, selectedQuotationId: number | null, comments?: string, awards?: ItemAward[] | null
): Promise<{ status: string; message: string }> => {
  const res = await api.post(`${BASE}/requests/${id}/resubmit-from-procurement`, {
    selected_quotation_id: selectedQuotationId, comments, awards: awards || undefined
  });
  return res.data.data;
};

/** Record a further payment batch, with its proof of payment. */
/** The signed-in Finance user's proof-of-payment deadlines (5 working days after approving). */
export const getPopObligations = async (): Promise<PopObligations> => {
  const res = await api.get(`${BASE}/pop-obligations`);
  return res.data.data;
};

export const recordPaymentBatch = async (id: number | string, formData: FormData) => {
  const res = await api.post(`${BASE}/requests/${id}/payments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return res.data as { data: { outstanding_amount: number; completed: boolean }; message: string };
};

/** Finance reverses one payment batch; its amount goes back to the budget. */
export const reversePaymentBatch = async (id: number | string, batchId: number, reason: string) => {
  const res = await api.post(`${BASE}/requests/${id}/payments/${batchId}/reverse`, { reason });
  return res.data as { message: string };
};

/** The current user's open purchase requests on a project — for the float form. */
export const getOpenPurchaseRequestsForProject = async (projectId: number | string) => {
  const res = await api.get(`${BASE}/requests/open-for-project`, { params: { project_id: projectId } });
  return (res.data.data || []) as { id: number; request_code: string; title: string; status: string }[];
};

/**
 * One requested item and the quotation it is awarded to — a split award sends
 * one of these per item. quotation_id null: no supplier can provide it.
 */
export interface ItemAward {
  request_item_id: number;
  quotation_id: number | null;
}

export const submitToCommittee = async (
  id: number | string,
  selected_quotation_id?: number | null,
  comments?: string,
  awards?: ItemAward[] | null
): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/submit-committee`, { selected_quotation_id, comments, awards });
};

export const resubmitToCommittee = async (
  id: number | string,
  selected_quotation_id?: number | null,
  comments?: string,
  awards?: ItemAward[] | null
): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/resubmit-committee`, { selected_quotation_id, comments, awards });
};

/** Take a request back from the Committee / Finance to amend the quotations or award. */
export const recallToProcurement = async (id: number | string, reason: string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/recall`, { reason });
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

/**
 * Finance approval. On a v2 request the form also carries payment_mode
 * (FULL | BATCH), amount, payment_date and payment_reference, and the reply
 * names the float requisition generated from it.
 */
export const finalFinanceApproval = async (id: number | string, formData: FormData): Promise<{ message?: string; data?: any }> => {
  const res = await api.post(`${BASE}/requests/${id}/final-approve`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return res.data || {};
};

export const getApprovalTrail = async (id: number | string) => {
  const res = await api.get(`${BASE}/requests/${id}/approval-trail`);
  return res.data.data || [];
};

// ── High-value approval (selected quotation >= USD 5,000) ───────────────────
// The committee recommends; the Super Admin and the Lead/HOP of the department
// that owns the selected project must then both approve before Finance.

export interface HighValueApproval {
  id: number;
  request_id: number;
  seat: 'SUPER_ADMIN' | 'FINANCE';
  approver_id: number;
  approver_role: string;
  decision: 'APPROVED' | 'REJECTED';
  comments?: string | null;
  first_name?: string;
  last_name?: string;
  department_code?: string | null;
  created_at: string;
}

export const getHighValueApprovals = async (id: number | string): Promise<HighValueApproval[]> => {
  const res = await api.get(`${BASE}/requests/${id}/high-value-approvals`);
  return res.data.data || [];
};

export const highValueDecision = async (
  id: number | string,
  decision: 'APPROVED' | 'REJECTED',
  comments?: string,
  returnTo?: ReturnTo | null
): Promise<{ status: string; message: string }> => {
  const res = await api.post(`${BASE}/requests/${id}/high-value-decision`, { decision, comments, return_to: returnTo || undefined });
  return res.data.data || res.data;
};

// ── Proof of Payment ────────────────────────────────────────────────────────
// A request may carry several POP documents: payments are frequently settled in
// batches rather than as a single transfer.

export interface ProofOfPayment {
  id: number;
  request_id: number;
  file_name: string;
  file_size?: number;
  note?: string | null;
  uploaded_by: number;
  first_name?: string;
  last_name?: string;
  created_at: string;
  /** Workflow v2: the payment batch this document proves. */
  batch_id?: number | null;
}

export const getProofOfPayments = async (requestId: number | string): Promise<ProofOfPayment[]> => {
  const res = await api.get(`${BASE}/requests/${requestId}/pops`);
  return res.data.data || [];
};

export const addProofOfPayments = async (
  requestId: number | string, files: File[], note?: string, batchId?: number
): Promise<void> => {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  if (note) formData.append('note', note);
  // Workflow v2: a further document for a payment batch already recorded.
  if (batchId) formData.append('batch_id', String(batchId));
  await api.post(`${BASE}/requests/${requestId}/pops`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

export const deleteProofOfPayment = async (
  requestId: number | string, popId: number | string
): Promise<void> => {
  await api.delete(`${BASE}/requests/${requestId}/pops/${popId}`);
};

export const downloadProofOfPayment = async (
  requestId: number | string, popId: number | string, fileName?: string
): Promise<void> => {
  const res = await api.get(`${BASE}/requests/${requestId}/pops/${popId}/download`, { responseType: 'blob' });
  const contentType = (res.headers['content-type'] as string | undefined) || '';

  // Server-side JSON errors arrive as blobs; surface their message.
  if (contentType.includes('application/json')) {
    const text = await (res.data as Blob).text();
    let msg = 'Failed to download proof of payment';
    try { msg = JSON.parse(text)?.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const url = window.URL.createObjectURL(
    new Blob([res.data], { type: contentType || 'application/octet-stream' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName || 'proof-of-payment');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
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

export const updateQuotation = async (requestId: number | string, quotationId: number, data: FormData | Partial<ProcQuotation>): Promise<void> => {
  if (data instanceof FormData) {
    await api.put(`${BASE}/requests/${requestId}/quotations/${quotationId}`, data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  } else {
    await api.put(`${BASE}/requests/${requestId}/quotations/${quotationId}`, data);
  }
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
  antiterror?: string;
  search?: string;
  category?: string;
  is_prequalified?: string;
  /** good (4–5 stars), average (2.5–3.5), poor (below 2.5) or unrated. */
  rating?: string;
  sort?: 'rating';
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
  const contentType = (res.headers['content-type'] as string | undefined) || 'application/octet-stream';
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

// ============================================================================
// VIEW IN BROWSER
// ============================================================================

/** File types a browser tab renders itself; anything else is downloaded. */
export const isViewableInBrowser = (typeOrName?: string | null): boolean => {
  const t = (typeOrName || '').toLowerCase();
  return t.includes('pdf') || t.startsWith('text/plain') ||
    (t.startsWith('image/') && !t.includes('svg')) ||
    /\.(pdf|png|jpe?g|gif|webp|bmp|txt)$/.test(t);
};

/**
 * Open a procurement document in a new tab so a reviewer can read it without
 * saving it. The procurement file endpoints need the user's token, so the file
 * is fetched here and handed to the tab as a blob. The tab is opened before the
 * request so the browser treats it as part of the click and does not block it.
 */
const viewInNewTab = async (path: string, fileName?: string): Promise<void> => {
  const tab = window.open('', '_blank');
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const contentType = (res.headers['content-type'] as string | undefined) || 'application/octet-stream';
    if (contentType.includes('application/json')) {
      const text = await (res.data as Blob).text();
      let msg = 'Failed to open document';
      try { msg = JSON.parse(text)?.error || msg; } catch { /* not JSON */ }
      throw new Error(msg);
    }
    const url = window.URL.createObjectURL(new Blob([res.data], { type: contentType }));
    if (tab) {
      tab.location.href = url;
    } else {
      // Popup blocked — download instead so the click still does something.
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName || 'document');
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    // Long enough for the tab to load it; then free the memory.
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch (err) {
    tab?.close();
    throw err;
  }
};

export const viewRequestAttachment = (attachmentId: number, fileName?: string) =>
  viewInNewTab(`${BASE}/attachments/${attachmentId}/download`, fileName);

export const viewQuotationFile = (requestId: number | string, quotationId: number, fileName?: string) =>
  viewInNewTab(`${BASE}/requests/${requestId}/quotations/${quotationId}/download`, fileName);

export const viewProofOfPayment = (requestId: number | string, popId: number | string, fileName?: string) =>
  viewInNewTab(`${BASE}/requests/${requestId}/pops/${popId}/download`, fileName);

export const reverseFinalApproval = async (id: number | string, reason?: string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/reverse-final-approval`, { reason: reason || '' });
};

export const reverseDeptApproval = async (id: number | string): Promise<void> => {
  await api.post(`${BASE}/requests/${id}/reverse-dept-approval`);
};

export const downloadPOP = async (requestId: number | string, fileName?: string): Promise<void> => {
  const res = await api.get(`${BASE}/requests/${requestId}/pop/download`, { responseType: 'blob' });

  const contentType = (res.headers['content-type'] as string | undefined) || '';

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
  PENDING_GS_APPROVAL: 'Pending General Secretary Approval',
  PENDING_FINANCE_APPROVAL: 'Pending Finance Approval',
  PENDING_PROCUREMENT: 'In Procurement',
  PENDING_COMMITTEE: 'Pending Committee',
  PENDING_HIGH_VALUE_APPROVAL: 'Pending Super Admin & Finance HOD Approval',
  PENDING_DEPT_CONFIRMATION: 'Pending Dept. Confirmation',
  PENDING_FINAL_FINANCE: 'Pending Final Approval',
  RETURNED_TO_PROCUREMENT: 'Returned to Procurement',
  PENDING_PAYMENT: 'Approved — Awaiting Payment',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled'
};

export const PROC_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  PENDING_DEPT_APPROVAL: 'warning',
  PENDING_GS_APPROVAL: 'warning',
  PENDING_FINANCE_APPROVAL: 'warning',
  PENDING_PROCUREMENT: 'info',
  PENDING_COMMITTEE: 'secondary',
  PENDING_HIGH_VALUE_APPROVAL: 'secondary',
  PENDING_DEPT_CONFIRMATION: 'warning',
  PENDING_FINAL_FINANCE: 'warning',
  RETURNED_TO_PROCUREMENT: 'error',
  PENDING_PAYMENT: 'info',
  COMPLETED: 'success',
  REJECTED: 'error',
  CANCELLED: 'error'
};

export const PROC_WORKFLOW_STEPS = [
  { label: 'Submit Request', status: 'DRAFT' },
  { label: 'Dept. Approval', status: 'PENDING_DEPT_APPROVAL' },
  { label: 'Procurement', status: 'PENDING_PROCUREMENT' },
  { label: 'Committee', status: 'PENDING_COMMITTEE' },
  { label: 'Super Admin + Finance HOD', status: 'PENDING_HIGH_VALUE_APPROVAL' },
  { label: 'Final Finance', status: 'PENDING_FINAL_FINANCE' },
  { label: 'Completed', status: 'COMPLETED' }
];

/**
 * Workflow v2: the department confirms the award before Finance, and Finance's
 * approval generates the float requisition and pays it in one or more batches.
 */
export const PROC_WORKFLOW_STEPS_V2 = [
  { label: 'Submit Request', status: 'DRAFT' },
  { label: 'Supervisor Approval', status: 'PENDING_DEPT_APPROVAL' },
  { label: 'Procurement', status: 'PENDING_PROCUREMENT' },
  { label: 'Committee', status: 'PENDING_COMMITTEE' },
  { label: 'Super Admin + Finance HOD', status: 'PENDING_HIGH_VALUE_APPROVAL' },
  { label: 'Department Confirmation', status: 'PENDING_DEPT_CONFIRMATION' },
  { label: 'Finance Approval', status: 'PENDING_FINAL_FINANCE' },
  { label: 'Payment', status: 'PENDING_PAYMENT' },
  { label: 'Completed', status: 'COMPLETED' }
];

// ============================================================================
// SUPPLIER RATINGS
// ============================================================================
export interface SupplierRatingEntry {
  vendor_id?: number;
  rated_by?: number;
  rater_type: 'REQUESTER' | 'PROCUREMENT';
  quality_rating: number;
  delivery_rating: number;
  comment?: string | null;
  updated_at: string;
  rated_by_name: string;
  request_id?: number;
  request_code?: string;
  request_title?: string;
}

export interface RequestSupplierRatings {
  open: boolean;
  can_rate: boolean;
  rater_type: 'REQUESTER' | 'PROCUREMENT' | null;
  suppliers: Array<{
    vendor_id: number;
    company_name: string;
    overall_rating: number | string | null;
    rating_count: number;
    ratings: SupplierRatingEntry[];
    my_rating: SupplierRatingEntry | null;
  }>;
}

export const getSupplierRatings = async (requestId: number | string): Promise<RequestSupplierRatings> => {
  const res = await api.get<ApiResponse<RequestSupplierRatings>>(`${BASE}/requests/${requestId}/supplier-ratings`);
  return res.data.data!;
};

export const rateSupplier = async (
  requestId: number | string,
  vendorId: number,
  payload: { quality_rating: number; delivery_rating: number; comment?: string }
): Promise<RequestSupplierRatings> => {
  const res = await api.post<ApiResponse<RequestSupplierRatings>>(
    `${BASE}/requests/${requestId}/supplier-ratings/${vendorId}`, payload
  );
  return res.data.data!;
};
