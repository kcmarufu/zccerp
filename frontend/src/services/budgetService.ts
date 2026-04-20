/**
 * Budget Service
 * API calls for budget management
 */

import api from './api';
import { BudgetLine, BudgetTransaction, ApiResponse } from '../types';

interface BudgetFilters {
  departmentId?: number;
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
  departmentId: number;
  fiscalYear: number;
  allocatedAmount: number;
  description?: string;
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
  }
};
