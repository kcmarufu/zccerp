/**
 * Request Service
 * API calls for procurement requests
 */

import api from './api';
import { 
  Request, 
  CreateRequestPayload, 
  ApiResponse, 
  PaginatedResponse,
  BudgetImpact
} from '../types';

interface RequestFilters {
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
}

export const requestService = {
  // Create a new request
  create: async (data: CreateRequestPayload): Promise<ApiResponse<{ requestId: number; requestCode: string }>> => {
    const response = await api.post('/requests', data);
    return response.data;
  },

  // Get all requests (filtered by role on backend)
  getAll: async (filters: RequestFilters = {}): Promise<PaginatedResponse<Request>> => {
    const response = await api.get('/requests', { params: filters });
    return response.data;
  },

  // Get single request by ID
  getById: async (requestId: number): Promise<ApiResponse<Request>> => {
    const response = await api.get(`/requests/${requestId}`);
    return response.data;
  },

  // Update request (draft only)
  update: async (requestId: number, data: Partial<CreateRequestPayload>): Promise<ApiResponse<void>> => {
    const response = await api.put(`/requests/${requestId}`, data);
    return response.data;
  },

  // Delete request (draft only)
  delete: async (requestId: number): Promise<ApiResponse<void>> => {
    const response = await api.delete(`/requests/${requestId}`);
    return response.data;
  },

  // Submit request for approval
  submit: async (requestId: number | string): Promise<ApiResponse<void>> => {
    const response = await api.post(`/requests/${requestId}/submit`);
    return response.data;
  },

  // Get budget impact preview
  getBudgetImpact: async (requestId: number): Promise<ApiResponse<BudgetImpact[]>> => {
    const response = await api.get(`/requests/${requestId}/budget-impact`);
    return response.data;
  }
};
