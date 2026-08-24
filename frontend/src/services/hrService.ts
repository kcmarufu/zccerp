/**
 * HR Service
 * API calls for Human Resources module
 */

import api from './api';
import {
  HREmployee,
  HRContract,
  HRLeaveType,
  HRLeaveRequest,
  HRLeaveBalance,
  HRLeaveAuditEntry,
  HRLeaveAnalytics,
  HRLeaveAttachment,
  HRLeaveAdjustment,
  HRLeaveRegisterRow,
  HRAccrualReport,
  HRAccrualHistory,
  HRTimesheet,
  HRPerformanceReview,
  HRTrainingRecord,
  HRDisciplinaryRecord,
  HRExitClearance,
  HRDocument,
  HRDashboardStats
} from '../types';

// ============================================================================
// DASHBOARD
// ============================================================================

export const getHRDashboardStats = async (departmentId?: number): Promise<HRDashboardStats> => {
  const params = departmentId ? { departmentId } : {};
  const response = await api.get('/hr/dashboard', { params });
  return response.data.data;
};

// ============================================================================
// EMPLOYEES
// ============================================================================

export const getEmployees = async (filters: {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: number;
  status?: string;
  contractType?: string;
} = {}): Promise<{ data: HREmployee[]; pagination: any }> => {
  const response = await api.get('/hr/employees', { params: filters });
  return { data: response.data.data, pagination: response.data.pagination };
};

export const getEmployee = async (id: number): Promise<HREmployee> => {
  const response = await api.get(`/hr/employees/${id}`);
  return response.data.data;
};

export const createEmployee = async (data: Partial<HREmployee> & { contract_start_date?: string; contract_end_date?: string; salary_amount?: number; terms_summary?: string }): Promise<any> => {
  const response = await api.post('/hr/employees', data);
  return response.data.data;
};

export const updateEmployee = async (id: number, data: Partial<HREmployee>): Promise<HREmployee> => {
  const response = await api.put(`/hr/employees/${id}`, data);
  return response.data.data;
};

// ============================================================================
// CONTRACTS
// ============================================================================

export const getContracts = async (employeeId: number): Promise<HRContract[]> => {
  const response = await api.get(`/hr/employees/${employeeId}/contracts`);
  return response.data.data;
};

export const createContract = async (data: Partial<HRContract>): Promise<any> => {
  const response = await api.post('/hr/contracts', data);
  return response.data.data;
};

export const renewContract = async (contractId: number, data: Partial<HRContract>): Promise<any> => {
  const response = await api.post(`/hr/contracts/${contractId}/renew`, data);
  return response.data.data;
};

// ============================================================================
// LEAVE MANAGEMENT
// ============================================================================

export const getLeaveTypes = async (): Promise<HRLeaveType[]> => {
  const response = await api.get('/hr/leave-types');
  return response.data.data;
};

export const getLeaveRequests = async (filters: {
  page?: number;
  limit?: number;
  employeeId?: number;
  departmentId?: number;
  status?: string;
  year?: number;
  /**
   * 'mine'         - only the caller's own requests
   * 'pending-mine' - only requests the caller is the designated approver for
   * omitted        - default visibility (Admin: all, HOP: department, else: own)
   */
  scope?: 'mine' | 'pending-mine' | 'pending-all';
  /** Convenience alias for scope='pending-mine' (the approval queue). */
  pendingOnly?: boolean;
  /** Narrow by leave type. */
  leaveTypeId?: number;
  /** Free text over employee name, employee number and reason. */
  search?: string;
  /** Start-date window. */
  startFrom?: string;
  startTo?: string;
} = {}): Promise<{ data: HRLeaveRequest[]; pagination: any }> => {
  const { pendingOnly, scope, ...rest } = filters;
  const params: Record<string, any> = { ...rest };
  const resolvedScope = scope || (pendingOnly ? 'pending-mine' : undefined);
  if (resolvedScope) params.scope = resolvedScope;

  const response = await api.get('/hr/leave-requests', { params });
  return { data: response.data.data, pagination: response.data.pagination };
};

/** One leave request, including balance_before / balance_after. */
export const getLeaveRequestById = async (leaveId: number): Promise<HRLeaveRequest> => {
  const response = await api.get(`/hr/leave-requests/${leaveId}`);
  return response.data.data;
};

/** Immutable audit trail for one leave request. */
export const getLeaveAuditTrail = async (leaveId: number): Promise<HRLeaveAuditEntry[]> => {
  const response = await api.get(`/hr/leave-requests/${leaveId}/audit`);
  return response.data.data;
};

export const createLeaveRequest = async (data: {
  employee_id?: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  reason?: string;
  /** Supporting documents — mandatory for types flagged requires_document. */
  attachments?: File[];
}): Promise<any> => {
  const { attachments, ...fields } = data;

  // Without files, send plain JSON so existing behaviour is unchanged.
  if (!attachments || attachments.length === 0) {
    const response = await api.post('/hr/leave-requests', fields);
    return response.data.data;
  }

  const form = new FormData();
  // multer reads attachment_type when choosing the destination folder, so every
  // text field must be appended BEFORE the files.
  form.append('attachment_type', 'LEAVE');
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) form.append(k, String(v));
  });
  attachments.forEach((f) => form.append('files', f));

  const response = await api.post('/hr/leave-requests', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data;
};

// ============================================================================
// LEAVE SUPPORTING DOCUMENTS
// ============================================================================

export const getLeaveAttachments = async (leaveId: number): Promise<HRLeaveAttachment[]> => {
  const response = await api.get(`/hr/leave-requests/${leaveId}/attachments`);
  return response.data.data;
};

export const uploadLeaveAttachment = async (
  leaveId: number, file: File, description?: string
): Promise<{ id: number }> => {
  const form = new FormData();
  form.append('attachment_type', 'LEAVE');
  if (description) form.append('description', description);
  form.append('file', file);
  const response = await api.post(`/hr/leave-requests/${leaveId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data;
};

export const deleteLeaveAttachment = async (attachmentId: number): Promise<void> => {
  await api.delete(`/hr/leave-attachments/${attachmentId}`);
};

/** Open a document in a new tab where the type allows; otherwise downloads. */
export const viewLeaveAttachment = async (att: HRLeaveAttachment): Promise<void> => {
  const res = await api.get(`/hr/leave-attachments/${att.id}/download`, {
    params: { inline: true }, responseType: 'blob',
  });
  const type = (res.headers['content-type'] as string) || 'application/octet-stream';
  const url = window.URL.createObjectURL(new Blob([res.data], { type }));
  const win = window.open(url, '_blank');
  // Popup blocked, or a type the browser cannot render — fall back to saving.
  if (!win) {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', att.file_name);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
};

export const downloadLeaveAttachment = async (att: HRLeaveAttachment): Promise<void> => {
  const res = await api.get(`/hr/leave-attachments/${att.id}/download`, { responseType: 'blob' });
  const type = (res.headers['content-type'] as string) || 'application/octet-stream';
  const url = window.URL.createObjectURL(new Blob([res.data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', att.file_name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// ============================================================================
// MANUAL BALANCE ADJUSTMENTS
// ============================================================================

/** Positive days credit the balance, negative days deduct. Reason required. */
export const adjustLeaveBalance = async (data: {
  employee_id: number;
  leave_type_id: number;
  adjustment_days: number;
  reason: string;
  fiscal_year?: number;
}): Promise<any> => {
  const response = await api.post('/hr/leave-adjustments', data);
  return response.data.data;
};

export const getLeaveAdjustments = async (params: {
  employeeId?: number;
  departmentId?: number;
  year?: number;
} = {}): Promise<HRLeaveAdjustment[]> => {
  const response = await api.get('/hr/leave-adjustments', { params });
  return response.data.data;
};

// ============================================================================
// LEAVE REGISTER & ACCRUAL REPORTING
// ============================================================================

/** One row per employee: accrued, taken and remaining days. */
export const getLeaveRegister = async (params: {
  year?: number;
  departmentId?: number;
  search?: string;
} = {}): Promise<HRLeaveRegisterRow[]> => {
  const response = await api.get('/hr/leave-register', { params });
  return response.data.data;
};

/** Accruals per department and per month, plus manual adjustment totals. */
export const getAccrualReport = async (params: {
  year?: number;
  departmentId?: number;
} = {}): Promise<HRAccrualReport> => {
  const response = await api.get('/hr/reports/accruals', { params });
  return response.data.data;
};

/**
 * Edit a pending request, or resubmit a rejected one — same endpoint either way.
 * Any attachments are appended to those already held.
 */
export const updateLeaveRequest = async (
  leaveId: number,
  data: {
    leave_type_id?: number;
    start_date?: string;
    end_date?: string;
    reason?: string;
    change_note?: string;
    attachments?: File[];
  }
): Promise<any> => {
  const { attachments, ...fields } = data;

  if (!attachments || attachments.length === 0) {
    const response = await api.put(`/hr/leave-requests/${leaveId}`, fields);
    return response.data.data;
  }

  const form = new FormData();
  form.append('attachment_type', 'LEAVE');
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) form.append(k, String(v));
  });
  attachments.forEach((f) => form.append('files', f));

  const response = await api.put(`/hr/leave-requests/${leaveId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data;
};

export const approveLeaveRequest = async (
  leaveId: number,
  data: { approved: boolean; comments?: string }
): Promise<any> => {
  const response = await api.put(`/hr/leave-requests/${leaveId}/approve`, data);
  return response.data.data;
};

export const getLeaveBalances = async (employeeId: number, year?: number): Promise<HRLeaveBalance[]> => {
  const params = year ? { year } : {};
  const response = await api.get(`/hr/employees/${employeeId}/leave-balances`, { params });
  return response.data.data;
};

/**
 * Turn monthly accrual on or off for one employee, and set their rate.
 * Leave `monthly_accrual_days` null to fall back to the standard rate.
 * HR Office / Super Admin only.
 */
export const updateAccrualSettings = async (
  employeeId: number,
  data: {
    accrual_enabled?: boolean;
    monthly_accrual_days?: number | null;
    accrual_note?: string | null;
  }
): Promise<any> => {
  const response = await api.put(`/hr/employees/${employeeId}/accrual-settings`, data);
  return response.data.data;
};

/** The caller's own accrual statement: how their days built up this year. */
export const getMyAccrualHistory = async (year?: number): Promise<HRAccrualHistory> => {
  const response = await api.get('/hr/my-accruals', { params: year ? { year } : {} });
  return response.data.data;
};

/** One individual's accrual statement — for approvers reviewing a request. */
export const getEmployeeAccrualHistory = async (
  employeeId: number, year?: number
): Promise<HRAccrualHistory> => {
  const response = await api.get(`/hr/employees/${employeeId}/accruals`, {
    params: year ? { year } : {},
  });
  return response.data.data;
};

/**
 * Organisation-wide leave analytics for HR / Super Admin.
 * A HOP receives the same shape, scoped to their own department.
 */
export const getLeaveAnalytics = async (params: {
  year?: number;
  departmentId?: number;
  /** Balance at or above which an employee is flagged as banking too many days. */
  threshold?: number;
} = {}): Promise<HRLeaveAnalytics> => {
  const response = await api.get('/hr/leave-analytics', { params });
  return response.data.data;
};

/** Trigger the monthly accrual manually (Super Admin only). */
export const runLeaveAccrual = async (): Promise<any> => {
  const response = await api.post('/hr/leave-accrual/run');
  return response.data.data;
};

// ============================================================================
// LEAVE EXPORTS
// ============================================================================

/**
 * Shared blob download. Server-side JSON errors arrive as blobs, so unwrap
 * those into a real Error rather than saving a broken file.
 */
const downloadBlob = async (
  url: string,
  fileName: string,
  params: Record<string, any> = {}
): Promise<void> => {
  const res = await api.get(url, { params, responseType: 'blob' });
  const contentType = (res.headers['content-type'] as string | undefined) || '';

  if (contentType.includes('application/json')) {
    const text = await (res.data as Blob).text();
    let msg = 'Export failed';
    try { msg = JSON.parse(text)?.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const objectUrl = window.URL.createObjectURL(
    new Blob([res.data], { type: contentType || 'application/octet-stream' })
  );
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
};

/** One leave application with its full audit trail, as a PDF. */
export const downloadLeaveRequestPDF = async (leaveId: number): Promise<void> =>
  downloadBlob(`/hr/leave-requests/${leaveId}/export/pdf`, `leave-request-${leaveId}.pdf`);

/** The filtered leave register, as a PDF. */
export const downloadLeaveRegisterPDF = async (params: {
  year?: number;
  departmentId?: number;
  status?: string;
  employeeId?: number;
} = {}): Promise<void> =>
  downloadBlob(
    '/hr/exports/leave-register/pdf',
    `leave-register-${params.year || new Date().getFullYear()}.pdf`,
    params
  );

/** Register + balances + analytics workbook, as an .xlsx. */
export const downloadLeaveExcel = async (params: {
  year?: number;
  departmentId?: number;
  status?: string;
  employeeId?: number;
  threshold?: number;
} = {}): Promise<void> =>
  downloadBlob(
    '/hr/exports/leave-report/excel',
    `leave-report-${params.year || new Date().getFullYear()}.xlsx`,
    params
  );

// ============================================================================
// TIMESHEETS
// ============================================================================

export const getTimesheets = async (filters: {
  page?: number;
  limit?: number;
  employeeId?: number;
  departmentId?: number;
  status?: string;
  month?: number;
  year?: number;
} = {}): Promise<{ data: HRTimesheet[]; pagination: any }> => {
  const response = await api.get('/hr/timesheets', { params: filters });
  return { data: response.data.data, pagination: response.data.pagination };
};

export const getTimesheet = async (id: number): Promise<HRTimesheet> => {
  const response = await api.get(`/hr/timesheets/${id}`);
  return response.data.data;
};

export const createTimesheet = async (data: {
  employee_id?: number;
  month: number;
  year: number;
  notes?: string;
  entries?: Array<{
    entry_date: string;
    hours_worked: number;
    donor_id?: number;
    project_code?: string;
    activity_description?: string;
  }>;
}): Promise<any> => {
  const response = await api.post('/hr/timesheets', data);
  return response.data.data;
};

export const submitTimesheet = async (id: number): Promise<any> => {
  const response = await api.put(`/hr/timesheets/${id}/submit`);
  return response.data.data;
};

export const approveTimesheet = async (
  id: number,
  data: { approved: boolean; comments?: string }
): Promise<any> => {
  const response = await api.put(`/hr/timesheets/${id}/approve`, data);
  return response.data.data;
};

// ============================================================================
// PAYROLL
// ============================================================================

export const getPayrollPeriods = async (filters: {
  page?: number;
  limit?: number;
  year?: number;
  status?: string;
} = {}): Promise<{ data: any[]; pagination: any }> => {
  const response = await api.get('/hr/payroll-periods', { params: filters });
  return { data: response.data.data, pagination: response.data.pagination };
};

export const getPayrollRecords = async (periodId: number): Promise<any[]> => {
  const response = await api.get(`/hr/payroll-periods/${periodId}/records`);
  return response.data.data;
};

// ============================================================================
// PERFORMANCE REVIEWS
// ============================================================================

export const getPerformanceReviews = async (filters: {
  page?: number;
  limit?: number;
  employeeId?: number;
  departmentId?: number;
  reviewPeriod?: string;
  status?: string;
} = {}): Promise<{ data: HRPerformanceReview[]; pagination: any }> => {
  const response = await api.get('/hr/performance-reviews', { params: filters });
  return { data: response.data.data, pagination: response.data.pagination };
};

export const createPerformanceReview = async (data: Partial<HRPerformanceReview> & { goals?: any[]; achievements?: any[] }): Promise<any> => {
  const response = await api.post('/hr/performance-reviews', data);
  return response.data.data;
};

export const updatePerformanceReview = async (id: number, data: Partial<HRPerformanceReview> & { goals?: any[]; achievements?: any[] }): Promise<any> => {
  const response = await api.put(`/hr/performance-reviews/${id}`, data);
  return response.data.data;
};

// ============================================================================
// TRAINING RECORDS
// ============================================================================

export const getTrainingRecords = async (filters: {
  page?: number;
  limit?: number;
  employeeId?: number;
  departmentId?: number;
  status?: string;
} = {}): Promise<{ data: HRTrainingRecord[]; pagination: any }> => {
  const response = await api.get('/hr/training-records', { params: filters });
  return { data: response.data.data, pagination: response.data.pagination };
};

export const createTrainingRecord = async (data: Partial<HRTrainingRecord>): Promise<any> => {
  const response = await api.post('/hr/training-records', data);
  return response.data.data;
};

// ============================================================================
// DISCIPLINARY RECORDS
// ============================================================================

export const getDisciplinaryRecords = async (filters: {
  page?: number;
  limit?: number;
  employeeId?: number;
  type?: string;
  status?: string;
} = {}): Promise<{ data: HRDisciplinaryRecord[]; pagination: any }> => {
  const response = await api.get('/hr/disciplinary-records', { params: filters });
  return { data: response.data.data, pagination: response.data.pagination };
};

export const createDisciplinaryRecord = async (data: Partial<HRDisciplinaryRecord>): Promise<any> => {
  const response = await api.post('/hr/disciplinary-records', data);
  return response.data.data;
};

// ============================================================================
// EXIT / CLEARANCE
// ============================================================================

/** Documents attached to an exit clearance (stored as EXIT_CLEARANCE docs). */
export const getExitAttachments = async (clearanceId: number): Promise<HRDocument[]> => {
  const response = await api.get(`/hr/exit-clearances/${clearanceId}/attachments`);
  return response.data.data;
};

export const uploadExitAttachment = async (
  clearanceId: number, file: File, description?: string
): Promise<any> => {
  const form = new FormData();
  form.append('attachment_type', 'HR_DOCUMENT');
  form.append('document_name', file.name);
  if (description) form.append('description', description);
  form.append('file', file);
  const response = await api.post(`/hr/exit-clearances/${clearanceId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data;
};

export const getExitClearances = async (filters: {
  page?: number;
  limit?: number;
  status?: string;
  /** Matches employee name, employee number or system username. */
  search?: string;
} = {}): Promise<{ data: HRExitClearance[]; pagination: any }> => {
  const response = await api.get('/hr/exit-clearances', { params: filters });
  return { data: response.data.data, pagination: response.data.pagination };
};

export const initiateExitClearance = async (data: {
  employee_id: number;
  exit_type: string;
  last_working_day: string;
  reason?: string;
}): Promise<any> => {
  const response = await api.post('/hr/exit-clearances', data);
  return response.data.data;
};

export const updateExitClearance = async (id: number, data: Partial<HRExitClearance>): Promise<any> => {
  const response = await api.put(`/hr/exit-clearances/${id}`, data);
  return response.data.data;
};

// ============================================================================
// HR DOCUMENTS
// ============================================================================

export const getDocuments = async (employeeId: number): Promise<HRDocument[]> => {
  const response = await api.get(`/hr/employees/${employeeId}/documents`);
  return response.data.data;
};

export const uploadDocument = async (formData: FormData): Promise<any> => {
  const response = await api.post('/hr/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
};

/** Open an employee document in a new tab, or download it when not viewable. */
export const viewEmployeeDocument = async (doc: HRDocument): Promise<void> => {
  const res = await api.get(`/hr/documents/${doc.id}/download`, {
    params: { inline: true }, responseType: 'blob',
  });
  const type = (res.headers['content-type'] as string) || 'application/octet-stream';
  const url = window.URL.createObjectURL(new Blob([res.data], { type }));
  const win = window.open(url, '_blank');
  if (!win) {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', doc.document_name);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
};

export const downloadEmployeeDocument = async (doc: HRDocument): Promise<void> => {
  const res = await api.get(`/hr/documents/${doc.id}/download`, { responseType: 'blob' });
  const type = (res.headers['content-type'] as string) || 'application/octet-stream';
  const url = window.URL.createObjectURL(new Blob([res.data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', doc.document_name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const deleteDocument = async (documentId: number): Promise<void> => {
  await api.delete(`/hr/documents/${documentId}`);
};
