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
  /** When true, fetches requests pending departmental action (PENDING for dept approvers, DEPT_APPROVED for HR/Admin) */
  pendingOnly?: boolean;
} = {}): Promise<{ data: HRLeaveRequest[]; pagination: any }> => {
  const { pendingOnly, ...rest } = filters;
  const response = await api.get('/hr/leave-requests', { params: rest });
  return { data: response.data.data, pagination: response.data.pagination };
};

export const createLeaveRequest = async (data: {
  employee_id?: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  reason?: string;
}): Promise<any> => {
  const response = await api.post('/hr/leave-requests', data);
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

export const getExitClearances = async (filters: {
  page?: number;
  limit?: number;
  status?: string;
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

export const deleteDocument = async (documentId: number): Promise<void> => {
  await api.delete(`/hr/documents/${documentId}`);
};
