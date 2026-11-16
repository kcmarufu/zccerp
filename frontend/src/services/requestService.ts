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
  /** Only the caller's own requests, for roles that can otherwise see more. */
  mine?: boolean;
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

  // Update request (draft only).
  // Returns `requestCode` when the edit moved the request to a different partner
  // or project, since the reference number is re-issued from the new pair.
  update: async (requestId: number, data: Partial<CreateRequestPayload>): Promise<ApiResponse<{ requestCode: string } | undefined>> => {
    const response = await api.put(`/requests/${requestId}`, data);
    return response.data;
  },

  // Delete request (draft only)
  delete: async (requestId: number): Promise<ApiResponse<void>> => {
    const response = await api.delete(`/requests/${requestId}`);
    return response.data;
  },

  // Submit request for approval
  // An optional comment (e.g. what changed after a rejection) goes on the trail.
  submit: async (requestId: number | string, comment?: string): Promise<ApiResponse<void>> => {
    const response = await api.post(`/requests/${requestId}/submit`, comment ? { comment } : {});
    return response.data;
  },

  // Add a comment to the approval trail (requester or approver, any stage)
  addComment: async (requestId: number | string, comment: string): Promise<ApiResponse<void>> => {
    const response = await api.post(`/requests/${requestId}/comments`, { comment });
    return response.data;
  },

  // Get budget impact preview
  getBudgetImpact: async (requestId: number): Promise<ApiResponse<BudgetImpact[]>> => {
    const response = await api.get(`/requests/${requestId}/budget-impact`);
    return response.data;
  }
};
