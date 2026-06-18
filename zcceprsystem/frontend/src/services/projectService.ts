import api from './api';
import { Project, BudgetLine } from '../types';

export interface CreateProjectPayload {
  project_code?: string;
  project_name: string;
  department_id?: number | null;
  description?: string;
  start_date?: string;
  end_date?: string;
  total_budget: number;
}

export interface UpdateProjectPayload extends Partial<CreateProjectPayload> {
  is_active?: boolean;
}

const projectService = {
  getAllProjects: async (params?: { donor_id?: number; is_active?: boolean; department_id?: number }): Promise<Project[]> => {
    const response = await api.get('/projects', { params });
    return response.data.data;
  },

  getProjectsByDonor: async (donorId: number): Promise<Project[]> => {
    const response = await api.get(`/donors/${donorId}/projects`);
    return response.data.data;
  },

  getProjectById: async (id: number): Promise<Project> => {
    const response = await api.get(`/projects/${id}`);
    return response.data.data;
  },

  getProjectBudgetLines: async (id: number, params?: { is_active?: boolean }): Promise<BudgetLine[]> => {
    const response = await api.get(`/projects/${id}/budget-lines`, { params });
    return response.data.data;
  },

  createProject: async (donorId: number, payload: CreateProjectPayload): Promise<Project> => {
    const response = await api.post(`/donors/${donorId}/projects`, payload);
    return response.data.data;
  },

  updateProject: async (id: number, payload: UpdateProjectPayload): Promise<Project> => {
    const response = await api.put(`/projects/${id}`, payload);
    return response.data.data;
  },

  deleteProject: async (id: number): Promise<void> => {
    await api.delete(`/projects/${id}`);
  },

  addProjectFunds: async (id: number, amount: number, notes?: string): Promise<{ new_total_budget: number }> => {
    const response = await api.post(`/projects/${id}/add-funds`, { amount, notes });
    return response.data.data;
  },

  deductProjectFunds: async (id: number, amount: number, notes?: string): Promise<{ new_total_budget: number }> => {
    const response = await api.post(`/projects/${id}/deduct-funds`, { amount, notes });
    return response.data.data;
  },

  getProjectActivity: async (id: number): Promise<{
    budget_lines: any[];
    budget_transactions: any[];
    requests: any[];
  }> => {
    const response = await api.get(`/projects/${id}/activity`);
    return response.data.data;
  },
};

export default projectService;
