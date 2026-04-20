/**
 * Approval Service
 * API calls for approval workflow
 */

import api from './api';
import { 
  Request, 
  ApprovalPayload, 
  ApprovalLog, 
  BudgetImpact,
  ApiResponse 
} from '../types';

interface ReversalInfo {
  canReverse: boolean;
  reason?: string;
  hoursRemaining?: string;
  hoursAgo?: string;
  approvedAt?: string;
}

export const approvalService = {
  // Get pending approvals for current user
  getPendingApprovals: async (departmentId?: number): Promise<ApiResponse<Request[]>> => {
    const response = await api.get('/approvals/pending', { 
      params: departmentId ? { departmentId } : {} 
    });
    return response.data;
  },

  // Approve request
  approve: async (requestId: number | string, payload: ApprovalPayload): Promise<ApiResponse<{ newStatus: string }>> => {
    const response = await api.post(`/approvals/${requestId}/approve`, payload);
    return response.data;
  },

  // Reject request
  reject: async (requestId: number | string, payload: ApprovalPayload): Promise<ApiResponse<{ newStatus: string }>> => {
    const response = await api.post(`/approvals/${requestId}/reject`, payload);
    return response.data;
  },

  // Get approval trail for a request
  getApprovalTrail: async (requestId: number): Promise<ApiResponse<ApprovalLog[]>> => {
    const response = await api.get(`/approvals/${requestId}/trail`);
    return response.data;
  },

  // Get budget impact preview before approval
  getBudgetImpact: async (requestId: number): Promise<ApiResponse<BudgetImpact[]>> => {
    const response = await api.get(`/approvals/${requestId}/budget-impact`);
    return response.data;
  },

  // Dispatch approved request
  dispatch: async (requestId: number | string): Promise<ApiResponse<{ newStatus: string }>> => {
    const response = await api.post(`/approvals/${requestId}/dispatch`);
    return response.data;
  },

  // Reverse approval within 5 hours
  reverseApproval: async (requestId: number | string, comments?: string): Promise<ApiResponse<{ newStatus: string; hoursRemaining: string }>> => {
    const response = await api.post(`/approvals/${requestId}/reverse`, { comments });
    return response.data;
  },

  // Check if approval can be reversed
  canReverseApproval: async (requestId: number | string): Promise<ApiResponse<ReversalInfo>> => {
    const response = await api.get(`/approvals/${requestId}/can-reverse`);
    return response.data;
  },

  // Get approval history (all requests the approver has acted on)
  getApprovalHistory: async (departmentId?: number): Promise<ApiResponse<Request[]>> => {
    const response = await api.get('/approvals/history', {
      params: departmentId ? { departmentId } : {}
    });
    return response.data;
  },

  // Get all approved requests
  getApprovedRequests: async (departmentId?: number): Promise<ApiResponse<Request[]>> => {
    const response = await api.get('/approvals/approved', {
      params: departmentId ? { departmentId } : {}
    });
    return response.data;
  },

  // Get all rejected requests
  getRejectedRequests: async (departmentId?: number): Promise<ApiResponse<Request[]>> => {
    const response = await api.get('/approvals/rejected', {
      params: departmentId ? { departmentId } : {}
    });
    return response.data;
  },

  // Get approver dashboard stats
  getApproverStats: async (): Promise<ApiResponse<{ pending: number; approved: number; rejected: number; total: number }>> => {
    const response = await api.get('/approvals/stats');
    return response.data;
  }
};
