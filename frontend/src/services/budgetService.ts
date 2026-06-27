/**
 * Budget Service
 * API calls for budget management
 */

import api from './api';
import { BudgetLine, BudgetTransaction, ApiResponse, Request } from '../types';

interface BudgetFilters {
  departmentId?: number;
  donorId?: number;
  fiscalYear?: number;
  isActive?: boolean;
}

interface BudgetSummary {
  department_id: number;
  department_name: string;
  department_code: string;
  budget_line_count: number;
  total_allocated: number;
  total_spent: number;
  total_balance: number;
  avg_utilization: number;
}

interface CreateBudgetPayload {
  budgetCode: string;
  budgetName: string;
  departmentId?: number;
  donorId?: number;
  projectCode?: string;
  fiscalYear: number;
  allocatedAmount: number;
  description?: string;
}

interface BudgetLineDetails extends BudgetLine {
  donor_id: number;
  donor_name: string;
  donor_code: string;
  donor_type: string;
  contact_person?: string;
  donor_email?: string;
  currency_code: string;
  donor_fiscal_year: number;
  donor_total_committed: number;
  donor_total_allocated: number;
  donor_total_spent: number;
  created_by_first?: string;
  created_by_last?: string;
  transactions: BudgetTransaction[];
  requestSummary: Array<{
    status: string;
    count: number;
    total_amount: number;
  }>;
}

interface BudgetLineRequestsResponse {
  requests: Array<Request & { amount_from_budget: number }>;
  summary: {
    total_requests: number;
    total_approved_amount: number;
    total_pending_amount: number;
  };
}

export const budgetService = {
  // Get all budget lines
  getAll: async (filters: BudgetFilters = {}): Promise<ApiResponse<BudgetLine[]>> => {
    const response = await api.get('/budgets', { params: filters });
    return response.data;
  },

  // Get single budget line with transaction history
  getById: async (budgetLineId: number): Promise<ApiResponse<BudgetLine & { transactions: BudgetTransaction[] }>> => {
    const response = await api.get(`/budgets/${budgetLineId}`);
    return response.data;
  },

  // Get detailed budget line info with donor and request summary
  getDetails: async (budgetLineId: number): Promise<ApiResponse<BudgetLineDetails>> => {
    const response = await api.get(`/budgets/${budgetLineId}/details`);
    return response.data;
  },

  // Get requests linked to a budget line
  getRequests: async (budgetLineId: number, params?: { status?: string; limit?: number }): Promise<ApiResponse<BudgetLineRequestsResponse>> => {
    const response = await api.get(`/budgets/${budgetLineId}/requests`, { params });
    return response.data;
  },

  // Create new budget line (Finance only)
  create: async (data: CreateBudgetPayload): Promise<ApiResponse<{ id: number }>> => {
    const response = await api.post('/budgets', data);
    return response.data;
  },

  // Update budget line (Finance only)
  update: async (budgetLineId: number, data: Partial<CreateBudgetPayload & { isActive: boolean }>): Promise<ApiResponse<void>> => {
    const response = await api.put(`/budgets/${budgetLineId}`, data);
    return response.data;
  },

  // Top up budget (Finance only)
  topUp: async (budgetLineId: number, amount: number, description?: string): Promise<ApiResponse<{ newBalance: number }>> => {
    const response = await api.post(`/budgets/${budgetLineId}/topup`, { amount, description });
    return response.data;
  },

  // Delete budget line (Finance only)
  delete: async (budgetLineId: number): Promise<ApiResponse<void>> => {
    const response = await api.delete(`/budgets/${budgetLineId}`);
    return response.data;
  },

  // Get budget summary by department
  getSummary: async (fiscalYear?: number): Promise<ApiResponse<BudgetSummary[]>> => {
    const response = await api.get('/budgets/summary', { params: fiscalYear ? { fiscalYear } : {} });
    return response.data;
  },

  // Get financial reports data (variance, donor summary, trends)
  getReports: async (fiscalYear?: number, donorId?: number, projectId?: number, dateFrom?: string, dateTo?: string): Promise<ApiResponse<any>> => {
    const params: any = {};
    if (fiscalYear) params.fiscalYear = fiscalYear;
    if (donorId) params.donorId = donorId;
    if (projectId) params.projectId = projectId;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    const response = await api.get('/budgets/reports', { params });
    return response.data;
  }
};
