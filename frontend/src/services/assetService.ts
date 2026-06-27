/**
 * Asset Management API Service
 */
import api from './api';

// ============================================================================
// Type Definitions
// ============================================================================

export type AssetStatus = 'REQUESTED' | 'APPROVED' | 'PURCHASED' | 'IN_USE' | 'TRANSFERRED' | 'DAMAGED' | 'LOST' | 'DISPOSED' | 'WRITTEN_OFF';
export type ConditionRating = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'NON_FUNCTIONAL';
export type MaintenanceType = 'PREVENTIVE' | 'CORRECTIVE' | 'EMERGENCY' | 'INSPECTION';
export type MaintenanceStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type DisposalType = 'WRITE_OFF' | 'SALE' | 'DONATION' | 'DESTRUCTION' | 'RETURN_TO_DONOR';
export type IncidentType = 'LOST' | 'STOLEN' | 'DAMAGED' | 'ACCIDENT' | 'FIRE' | 'FLOOD';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AssetCategory {
  id: number;
  category_name: string;
  category_code: string;
  description?: string;
  parent_id?: number;
  depreciation_method: string;
  default_useful_life_years?: number;
  is_active: boolean;
}

export interface AssetLocation {
  id: number;
  location_name: string;
  location_code: string;
  location_type: string;
  address?: string;
  city?: string;
  province?: string;
  country: string;
  is_active: boolean;
}

export interface AssetSupplier {
  id: number;
  supplier_name: string;
  supplier_code: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active: boolean;
}

export interface Asset {
  id: number;
  asset_tag: string;
  asset_name: string;
  description?: string;
  category_id: number;
  category_name?: string;
  category_code?: string;
  serial_number?: string;
  model?: string;
  manufacturer?: string;
  donor_id?: number;
  donor_name?: string;
  project_name?: string;
  purchase_date: string;
  purchase_cost: number;
  currency_code: string;
  supplier_id?: number;
  supplier_name?: string;
  purchase_order_ref?: string;
  invoice_ref?: string;
  useful_life_years: number;
  salvage_value: number;
  depreciation_method: string;
  accumulated_depreciation: number;
  current_value: number;
  warranty_start_date?: string;
  warranty_end_date?: string;
  warranty_provider?: string;
  warranty_terms?: string;
  location_id?: number;
  location_name?: string;
  location_code?: string;
  custodian_id?: number;
  custodian_name?: string;
  department_id?: number;
  department_name?: string;
  status: AssetStatus;
  condition_rating: ConditionRating;
  last_inspection_date?: string;
  next_inspection_date?: string;
  insurance_policy_no?: string;
  insurance_expiry?: string;
  insured_value?: number;
  notes?: string;
  barcode?: string;
  photo_url?: string;
  created_by?: number;
  created_by_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssetAssignment {
  id: number;
  asset_id: number;
  assigned_to: number;
  assigned_to_name?: string;
  assigned_by: number;
  assigned_by_name?: string;
  assignment_type: string;
  assignment_date: string;
  expected_return_date?: string;
  actual_return_date?: string;
  return_condition?: string;
  return_notes?: string;
  returned_to?: number;
  returned_to_name?: string;
  purpose?: string;
  location_id?: number;
  location_name?: string;
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE';
  notes?: string;
}

export interface AssetTransfer {
  id: number;
  asset_id: number;
  asset_tag?: string;
  asset_name?: string;
  transfer_code: string;
  from_location?: string;
  to_location?: string;
  transfer_reason: string;
  transfer_date: string;
  status: 'PENDING' | 'APPROVED' | 'IN_TRANSIT' | 'COMPLETED' | 'REJECTED';
  initiated_by_name?: string;
  approved_by_name?: string;
}

export interface AssetMaintenance {
  id: number;
  asset_id: number;
  asset_tag?: string;
  asset_name?: string;
  maintenance_code: string;
  maintenance_type: MaintenanceType;
  description: string;
  priority: string;
  status: MaintenanceStatus;
  scheduled_date?: string;
  start_date?: string;
  completion_date?: string;
  cost: number;
  currency_code: string;
  vendor_name?: string;
  invoice_ref?: string;
  downtime_hours?: number;
  parts_replaced?: string;
  findings?: string;
  next_service_date?: string;
  reported_by_name?: string;
  notes?: string;
}

export interface AssetDisposal {
  id: number;
  asset_id: number;
  asset_tag?: string;
  asset_name?: string;
  disposal_code: string;
  disposal_type: DisposalType;
  disposal_reason: string;
  disposal_description: string;
  disposal_date: string;
  book_value_at_disposal: number;
  sale_value: number;
  gain_loss: number;
  buyer_name?: string;
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED';
  requested_by_name?: string;
  approved_by_name?: string;
  approval_comments?: string;
}

export interface AssetIncident {
  id: number;
  asset_id: number;
  asset_tag?: string;
  asset_name?: string;
  incident_code: string;
  incident_type: IncidentType;
  incident_date: string;
  location?: string;
  description: string;
  responsible_person_name?: string;
  severity: Severity;
  status: IncidentStatus;
  investigation_notes?: string;
  police_report_ref?: string;
  insurance_claim_ref?: string;
  estimated_loss?: number;
  recovery_amount?: number;
  resolution?: string;
  resolved_date?: string;
  reported_by_name?: string;
}

export interface AssetStatusHistoryEntry {
  id: number;
  asset_id: number;
  previous_status?: string;
  new_status: string;
  change_reason?: string;
  changed_by_name?: string;
  created_at: string;
}

export interface AssetDashboardStats {
  totalAssets: number;
  totalValue: number;
  statusBreakdown: Array<{ status: string; count: number }>;
  categoryBreakdown: Array<{ category_name: string; count: number; total_value: number }>;
  conditionBreakdown: Array<{ condition_rating: string; count: number }>;
  upcomingMaintenance: number;
  openIncidents: number;
  pendingDisposals: number;
}

// ============================================================================
// Service Class
// ============================================================================

class AssetService {
  // Dashboard
  async getDashboardStats(): Promise<AssetDashboardStats> {
    const { data } = await api.get('/assets/dashboard');
    return data.data;
  }

  // Categories
  async getCategories(): Promise<AssetCategory[]> {
    const { data } = await api.get('/assets/categories');
    return data.data;
  }

  async createCategory(payload: Partial<AssetCategory>): Promise<any> {
    const { data } = await api.post('/assets/categories', payload);
    return data;
  }

  // Locations
  async getLocations(): Promise<AssetLocation[]> {
    const { data } = await api.get('/assets/locations');
    return data.data;
  }

  async createLocation(payload: Partial<AssetLocation>): Promise<any> {
    const { data } = await api.post('/assets/locations', payload);
    return data;
  }

  // Suppliers
  async getSuppliers(): Promise<AssetSupplier[]> {
    const { data } = await api.get('/assets/suppliers');
    return data.data;
  }

  async createSupplier(payload: Partial<AssetSupplier>): Promise<any> {
    const { data } = await api.post('/assets/suppliers', payload);
    return data;
  }

  // Assets CRUD
  async getAssets(filters: Record<string, any> = {}): Promise<{ data: Asset[]; pagination: any }> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)); });
    const { data } = await api.get(`/assets?${params.toString()}`);
    return { data: data.data, pagination: data.pagination };
  }

  async getAssetById(id: number): Promise<Asset> {
    const { data } = await api.get(`/assets/${id}`);
    return data.data;
  }

  async createAsset(payload: Record<string, any>): Promise<any> {
    const { data } = await api.post('/assets', payload);
    return data;
  }

  async updateAsset(id: number, payload: Record<string, any>): Promise<any> {
    const { data } = await api.put(`/assets/${id}`, payload);
    return data;
  }

  async deleteAsset(id: number): Promise<any> {
    const { data } = await api.delete(`/assets/${id}`);
    return data;
  }

  // Status History & Audit
  async getStatusHistory(assetId: number): Promise<AssetStatusHistoryEntry[]> {
    const { data } = await api.get(`/assets/${assetId}/status-history`);
    return data.data;
  }

  async getAuditLog(assetId: number): Promise<any[]> {
    const { data } = await api.get(`/assets/${assetId}/audit-log`);
    return data.data;
  }

  // Assignments
  async getAssignments(assetId: number): Promise<AssetAssignment[]> {
    const { data } = await api.get(`/assets/${assetId}/assignments`);
    return data.data;
  }

  async checkoutAsset(payload: { assetId: number; assignedTo: number; expectedReturnDate?: string; purpose?: string; locationId?: number; notes?: string }): Promise<any> {
    const { data } = await api.post('/assets/assignments/checkout', payload);
    return data;
  }

  async checkinAsset(assignmentId: number, payload: { returnCondition?: string; returnNotes?: string }): Promise<any> {
    const { data } = await api.put(`/assets/assignments/${assignmentId}/checkin`, payload);
    return data;
  }

  // Transfers
  async getTransfers(filters: Record<string, any> = {}): Promise<AssetTransfer[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
    const { data } = await api.get(`/assets/transfers/list?${params.toString()}`);
    return data.data;
  }

  async createTransfer(payload: Record<string, any>): Promise<any> {
    const { data } = await api.post('/assets/transfers', payload);
    return data;
  }

  async approveTransfer(transferId: number, payload: { approved: boolean; notes?: string }): Promise<any> {
    const { data } = await api.put(`/assets/transfers/${transferId}/approve`, payload);
    return data;
  }

  // Maintenance
  async getMaintenanceRecords(filters: Record<string, any> = {}): Promise<AssetMaintenance[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
    const { data } = await api.get(`/assets/maintenance/list?${params.toString()}`);
    return data.data;
  }

  async createMaintenance(payload: Record<string, any>): Promise<any> {
    const { data } = await api.post('/assets/maintenance', payload);
    return data;
  }

  async updateMaintenance(id: number, payload: Record<string, any>): Promise<any> {
    const { data } = await api.put(`/assets/maintenance/${id}`, payload);
    return data;
  }

  // Disposals
  async getDisposals(filters: Record<string, any> = {}): Promise<AssetDisposal[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
    const { data } = await api.get(`/assets/disposals/list?${params.toString()}`);
    return data.data;
  }

  async createDisposal(payload: Record<string, any>): Promise<any> {
    const { data } = await api.post('/assets/disposals', payload);
    return data;
  }

  async approveDisposal(disposalId: number, payload: { approved: boolean; comments?: string }): Promise<any> {
    const { data } = await api.put(`/assets/disposals/${disposalId}/approve`, payload);
    return data;
  }

  // Incidents
  async getIncidents(filters: Record<string, any> = {}): Promise<AssetIncident[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
    const { data } = await api.get(`/assets/incidents/list?${params.toString()}`);
    return data.data;
  }

  async createIncident(payload: Record<string, any>): Promise<any> {
    const { data } = await api.post('/assets/incidents', payload);
    return data;
  }

  async updateIncident(id: number, payload: Record<string, any>): Promise<any> {
    const { data } = await api.put(`/assets/incidents/${id}`, payload);
    return data;
  }
}

export default new AssetService();
