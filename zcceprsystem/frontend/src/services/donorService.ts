import api from './api';

export interface Donor {
  id: number;
  donor_code: string;
  donor_name: string;
  donor_type: 'INDIVIDUAL' | 'ORGANIZATION' | 'GOVERNMENT' | 'FOUNDATION';
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  total_committed: number;
  total_allocated: number;
  total_spent: number;
  currency_code: string;
  fiscal_year: number;
  agreement_reference?: string;
  agreement_start_date?: string;
  agreement_end_date?: string;
  restrictions?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: number;
  creator?: {
    id: number;
    full_name: string;
    email: string;
  };
  budget_lines?: any[];
  requests?: any[];
  projects?: import('../types').Project[];
  projects_count?: number;
  _count?: {
    budget_lines: number;
    requests: number;
  };
}

export interface DonorStats {
  donor_id: number;
  donor_name: string;
  donor_code: string;
  currency: string;
  total_committed: number;
  total_allocated: number;
  total_spent: number;
  remaining_balance: number;
  utilization_rate: string;
  budget_lines_count: number;
  requests_count: number;
  requests_by_status: Record<string, number>;
}

export interface CreateDonorDto {
  donor_code: string;
  donor_name: string;
  donor_type: 'INDIVIDUAL' | 'ORGANIZATION' | 'GOVERNMENT' | 'FOUNDATION';
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  total_committed: number;
  currency_code?: string;
  fiscal_year: number;
  agreement_reference?: string;
  agreement_start_date?: string;
  agreement_end_date?: string;
  restrictions?: string;
  notes?: string;
}

export interface UpdateDonorDto extends Partial<CreateDonorDto> {
  is_active?: boolean;
}

class DonorService {
  /**
   * Get all donors (with optional filters)
   */
  async getAllDonors(params?: {
    fiscal_year?: number;
    is_active?: boolean;
    donor_type?: string;
  }): Promise<Donor[]> {
    const response = await api.get('/donors', { params });
    return response.data;
  }

  /**
   * Get donor by ID
   */
  async getDonorById(id: number): Promise<Donor> {
    const response = await api.get(`/donors/${id}`);
    return response.data;
  }

  /**
   * Get next auto-generated donor code
   */
  async getNextDonorCode(): Promise<string> {
    const response = await api.get('/donors/next-code');
    return response.data.donor_code;
  }

  /**
   * Create new donor
   */
  async createDonor(data: CreateDonorDto): Promise<Donor> {
    const response = await api.post('/donors', data);
    return response.data;
  }

  /**
   * Update donor
   */
  async updateDonor(id: number, data: UpdateDonorDto): Promise<Donor> {
    const response = await api.put(`/donors/${id}`, data);
    return response.data;
  }

  /**
   * Deactivate donor
   */
  async deactivateDonor(id: number): Promise<{ message: string; donor: Donor }> {
    const response = await api.patch(`/donors/${id}/deactivate`);
    return response.data;
  }

  /**
   * Activate donor
   */
  async activateDonor(id: number): Promise<{ message: string; donor: Donor }> {
    const response = await api.patch(`/donors/${id}/activate`);
    return response.data;
  }

  /**
   * Get budget lines for a specific donor
   */
  async getDonorBudgetLines(
    donorId: number,
    params?: { is_active?: boolean }
  ): Promise<any[]> {
    const response = await api.get(`/donors/${donorId}/budget-lines`, { params });
    return response.data;
  }

  /**
   * Get donor statistics
   */
  async getDonorStats(donorId: number): Promise<DonorStats> {
    const response = await api.get(`/donors/${donorId}/stats`);
    return response.data;
  }

  /**
   * Get active donors for dropdown selection
   */
  async getActiveDonors(): Promise<Donor[]> {
    const response = await api.get('/donors', {
      params: { is_active: true }
    });
    return response.data;
  }

  /**
   * Get budget lines filtered by donor (for request form)
   */
  async getBudgetLinesByDonor(
    donorId: number,
    params?: { is_active?: boolean }
  ): Promise<any> {
    const response = await api.get(`/budgets/donor/${donorId}`, { params });
    return response.data;
  }

  /**
   * Delete donor permanently
   */
  async deleteDonor(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/donors/${id}`);
    return response.data;
  }

  /**
   * Add committed funds to donor
   */
  async addFunds(id: number, amount: number, description?: string): Promise<any> {
    const response = await api.post(`/donors/${id}/add-funds`, { amount, description });
    return response.data;
  }

  /**
   * Remove committed funds from donor
   */
  async removeFunds(id: number, amount: number, description?: string): Promise<any> {
    const response = await api.post(`/donors/${id}/remove-funds`, { amount, description });
    return response.data;
  }

  /**
   * Get donor fund transaction history
   */
  async getDonorTransactions(id: number): Promise<any[]> {
    const response = await api.get(`/donors/${id}/transactions`);
    return response.data;
  }
}

export default new DonorService();
