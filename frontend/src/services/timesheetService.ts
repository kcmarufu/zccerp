/**
 * Timesheet Service
 * API calls for the Timesheet module.
 */

import api from './api';
import {
  TimesheetContext,
  TimesheetSettings,
  PublicHoliday,
  TimesheetProject,
  TimesheetPartner,
  TimesheetEmployee,
  LoeAllocation,
  LoeRegisterEntry,
  TimesheetGrid,
  TimesheetYearTracker,
  TimesheetTrackerRow,
  TimesheetPeriodStats,
  TimesheetApprovalQueueRow,
  TimesheetListRow,
  TimesheetProjectSummaryRow,
  TimesheetAuditEntry,
  TimesheetGridSavePayload,
  TimesheetStatus,
} from '../types';

// ============================================================================
// REFERENCE DATA
// ============================================================================

/** Projects come from the Float Requisition register; each carries its partner. */
export const getTimesheetProjects = async (): Promise<TimesheetProject[]> => {
  const res = await api.get('/timesheets/projects');
  return res.data.data;
};

export const getTimesheetPartners = async (): Promise<TimesheetPartner[]> => {
  const res = await api.get('/timesheets/partners');
  return res.data.data;
};

/** Who the signed-in user is, in timesheet terms. */
export const getTimesheetContext = async (): Promise<TimesheetContext> => {
  const res = await api.get('/timesheets/context');
  return res.data.data;
};

/** Staff list for the filters, already scoped to what the caller may see. */
export const getTimesheetEmployees = async (departmentId?: number): Promise<TimesheetEmployee[]> => {
  const res = await api.get('/timesheets/employees', {
    params: departmentId ? { departmentId } : {},
  });
  return res.data.data;
};

// ============================================================================
// SETTINGS AND HOLIDAYS
// ============================================================================

export const getTimesheetSettings = async (): Promise<TimesheetSettings> => {
  const res = await api.get('/timesheets/settings');
  return res.data.data;
};

export const updateTimesheetSettings = async (
  data: Partial<TimesheetSettings>
): Promise<TimesheetSettings> => {
  const res = await api.put('/timesheets/settings', data);
  return res.data.data;
};

export const getHolidays = async (year?: number): Promise<PublicHoliday[]> => {
  const res = await api.get('/timesheets/holidays', { params: year ? { year } : {} });
  return res.data.data;
};

export const createHoliday = async (data: {
  holiday_date: string;
  holiday_name: string;
  is_recurring?: boolean;
  notes?: string;
}): Promise<{ id: number }> => {
  const res = await api.post('/timesheets/holidays', data);
  return res.data.data;
};

export const updateHoliday = async (
  id: number,
  data: Partial<PublicHoliday>
): Promise<{ id: number }> => {
  const res = await api.put(`/timesheets/holidays/${id}`, data);
  return res.data.data;
};

export const deleteHoliday = async (id: number): Promise<void> => {
  await api.delete(`/timesheets/holidays/${id}`);
};

// ============================================================================
// LEVEL OF EFFORT
// ============================================================================

export const getLoeRegister = async (params: {
  year: number;
  month?: number;
  departmentId?: number;
  employeeId?: number;
  projectId?: number;
}): Promise<{ data: LoeRegisterEntry[]; canEdit: boolean }> => {
  const res = await api.get('/timesheets/loe', { params });
  return { data: res.data.data, canEdit: Boolean(res.data.can_edit) };
};

export const getEmployeeLoe = async (
  employeeId: number,
  year: number
): Promise<{ data: LoeAllocation[]; canEdit: boolean; employee: any }> => {
  const res = await api.get(`/timesheets/loe/${employeeId}`, { params: { year } });
  return { data: res.data.data, canEdit: Boolean(res.data.can_edit), employee: res.data.employee };
};

/** Sent whole: what arrives is what the year holds afterwards. */
export const saveEmployeeLoe = async (
  employeeId: number,
  year: number,
  allocations: Array<{
    project_id: number;
    loe_percent: number;
    effective_from_month?: number;
    effective_to_month?: number;
    notes?: string | null;
  }>
): Promise<LoeAllocation[]> => {
  const res = await api.put(`/timesheets/loe/${employeeId}`, { year, allocations });
  return res.data.data;
};

export const copyLoeYear = async (
  fromYear: number,
  toYear: number,
  departmentId?: number
): Promise<{ copied: number; skipped: number }> => {
  const res = await api.post('/timesheets/loe/copy-year', {
    from_year: fromYear, to_year: toYear, departmentId,
  });
  return res.data.data;
};

// ============================================================================
// MY TIMESHEETS
// ============================================================================

export const getMyYear = async (year: number): Promise<TimesheetYearTracker | null> => {
  const res = await api.get('/timesheets/my/year', { params: { year } });
  return res.data.data;
};

export const getEmployeeYear = async (
  employeeId: number,
  year: number
): Promise<TimesheetYearTracker> => {
  const res = await api.get(`/timesheets/employee/${employeeId}/year`, { params: { year } });
  return res.data.data;
};

/** Opens the period, creating the draft the first time it is visited. */
export const openMyTimesheet = async (year: number, month: number): Promise<TimesheetGrid> => {
  const res = await api.get(`/timesheets/my/${year}/${month}`);
  return res.data.data;
};

export const getTimesheet = async (id: number): Promise<TimesheetGrid> => {
  const res = await api.get(`/timesheets/${id}`);
  return res.data.data;
};

export const saveTimesheet = async (
  id: number,
  payload: TimesheetGridSavePayload
): Promise<TimesheetGrid> => {
  const res = await api.put(`/timesheets/${id}`, payload);
  return res.data.data;
};

export const submitTimesheet = async (id: number): Promise<any> => {
  const res = await api.post(`/timesheets/${id}/submit`);
  return res.data.data;
};

export const actOnTimesheet = async (
  id: number,
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  comments?: string
): Promise<any> => {
  const res = await api.post(`/timesheets/${id}/action`, { action, comments });
  return res.data.data;
};

export const reopenTimesheet = async (id: number, reason: string): Promise<any> => {
  const res = await api.post(`/timesheets/${id}/reopen`, { reason });
  return res.data.data;
};

export const getTimesheetAudit = async (id: number): Promise<TimesheetAuditEntry[]> => {
  const res = await api.get(`/timesheets/${id}/audit`);
  return res.data.data;
};

// ============================================================================
// TRACKERS, QUEUES AND REPORTS
// ============================================================================

export const getPeriodTracker = async (params: {
  year: number;
  month: number;
  departmentId?: number;
  status?: TimesheetStatus | '';
  employeeId?: number;
  projectId?: number;
}): Promise<TimesheetTrackerRow[]> => {
  const res = await api.get('/timesheets/tracker', { params });
  return res.data.data;
};

export const getPeriodStats = async (params: {
  year: number;
  month: number;
  departmentId?: number;
}): Promise<TimesheetPeriodStats> => {
  const res = await api.get('/timesheets/stats', { params });
  return res.data.data;
};

export const getApprovalQueue = async (
  scope: 'all' | 'department' = 'all'
): Promise<TimesheetApprovalQueueRow[]> => {
  const res = await api.get('/timesheets/approvals', { params: { scope } });
  return res.data.data;
};

export const listTimesheets = async (params: {
  year?: number;
  month?: number;
  departmentId?: number;
  employeeId?: number;
  status?: string;
  projectId?: number;
  partnerId?: number;
  page?: number;
  limit?: number;
}): Promise<{ data: TimesheetListRow[]; pagination: any }> => {
  const res = await api.get('/timesheets', { params });
  return { data: res.data.data, pagination: res.data.pagination };
};

export const getProjectSummary = async (params: {
  year: number;
  month?: number;
  departmentId?: number;
  projectId?: number;
  partnerId?: number;
  includeUnapproved?: boolean;
}): Promise<TimesheetProjectSummaryRow[]> => {
  const res = await api.get('/timesheets/project-summary', { params });
  return res.data.data;
};

// ============================================================================
// EXPORTS
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

/** One employee's monthly timesheet, as a PDF. */
export const downloadTimesheetPDF = async (
  id: number,
  label = String(id)
): Promise<void> => downloadBlob(`/timesheets/${id}/export/pdf`, `timesheet-${label}.pdf`);

/** The same timesheet as a workbook, with the day calendar alongside. */
export const downloadTimesheetExcel = async (
  id: number,
  label = String(id)
): Promise<void> => downloadBlob(`/timesheets/${id}/export/excel`, `timesheet-${label}.xlsx`);

/** Department or organisation report: tracker, timesheets, allocations, summary. */
export const downloadTimesheetReport = async (params: {
  year: number;
  month?: number;
  departmentId?: number;
  employeeId?: number;
  status?: string;
  projectId?: number;
  partnerId?: number;
  includeUnapproved?: boolean;
}): Promise<void> =>
  downloadBlob(
    '/timesheets/report/excel',
    `timesheet-report-${params.year}${params.month ? `-${String(params.month).padStart(2, '0')}` : ''}.xlsx`,
    params
  );
