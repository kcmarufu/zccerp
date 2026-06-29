/**
 * TypeScript Type Definitions
 * Finance Module - ERP System
 */

// User & Auth Types
export type UserRole = 'ADMIN' | 'GENERAL_USER' | 'PROGRAM_LEAD' | 'HEAD_OF_PROGRAMS' | 'FINANCE_CLERK' | 'PROCUREMENT_OFFICER' | 'PROCUREMENT_COMMITTEE';

export interface User {
  id: number;
  employee_id: string;
  email: string;
  first_name: string;
  last_name: string;
  department_id: number;
  department_name: string;
  department_code: string;
  role: UserRole;
  role_name: UserRole;
  is_active: boolean;
  last_login: string | null;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Request Types
export type RequestStatus = 
  | 'DRAFT'
  | 'PENDING_ADMIN_APPROVAL'
  | 'PENDING_LEAD_APPROVAL'
  | 'PENDING_HOP_APPROVAL'
  | 'PENDING_FINANCE_APPROVAL'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'PENDING_RECONCILIATION'
  | 'RECON_PENDING_LEAD'
  | 'RECON_PENDING_FINANCE'
  | 'RECONCILED'
  | 'REJECTED'
  | 'CANCELLED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface RequestItem {
  id?: number;
  request_id?: number;
  item_description: string;
  description?: string;
  quantity: number;
  unit_of_measure: string;
  unit_price: number;
  total_price?: number;
  subtotal?: number;
  budget_line_id: number;
  budget_code?: string;
  budget_name?: string;
  budget_balance?: number;
  notes?: string;
}

export interface Request {
  id: number;
  request_code: string;
  requester_id: number;
  requester_first_name: string;
  requester_last_name: string;
  requester_email?: string;
  department_id: number;
  department_name: string;
  department_code: string;
  donor_id?: number;
  donor_name?: string;
  donor_code?: string;
  project_id?: number;
  project_name?: string;
  project_code?: string;
  routing_department_id?: number | null;
  routing_department_name?: string | null;
  routing_department_code?: string | null;
  status: RequestStatus;
  total_amount: number;
  justification: string;
  description?: string;
  priority: Priority;
  has_per_diem_claim?: boolean;
  is_activity_request?: boolean;
  activity_start_date?: string | null;
  activity_end_date?: string | null;
  submitted_at: string | null;
  lead_approved_at: string | null;
  hop_approved_at: string | null;
  finance_approved_at: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by?: number;
  created_by_name?: string;
  updated_at: string;
  version: number;
  items?: RequestItem[];
  approvalTrail?: ApprovalLog[];
}

export interface CreateRequestPayload {
  justification: string;
  priority?: Priority;
  items: Array<{
    item_description?: string;
    itemDescription?: string;
    quantity: number;
    unit_of_measure?: string;
    unitOfMeasure?: string;
    unit_price?: number;
    unitPrice?: number;
    budget_line_id?: number;
    budgetLineId?: number;
    notes?: string;
  }>;
}

// Approval Types
export type ApprovalAction = 'APPROVED' | 'REJECTED' | 'RETURNED' | 'SUBMITTED' | 'CANCELLED' | 'APPROVE' | 'REJECT';

export interface ApprovalLog {
  id: number;
  request_id: number;
  approver_id: number;
  approver_first_name: string;
  approver_last_name: string;
  approver_email: string;
  actor_name?: string;
  actor_role?: string;
  comment?: string;
  approver_role: UserRole;
  action: ApprovalAction;
  previous_status: RequestStatus;
  new_status: RequestStatus;
  comments: string | null;
  created_at: string;
}

export interface ApprovalPayload {
  action: 'APPROVED' | 'REJECTED';
  comments?: string;
  version: number;
}

// Project Types
export interface Project {
  id: number;
  project_code: string;
  project_name: string;
  donor_id: number;
  donor_name?: string;
  donor_code?: string;
  currency_code?: string;
  department_id?: number | null;
  department_name?: string;
  department_code?: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  total_budget: number;
  last_request_seq: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  budget_lines_count?: number;
  total_allocated?: number;
  total_spent?: number;
  budget_lines?: BudgetLine[];
}

// Budget Types
export interface BudgetLine {
  id: number;
  budget_code: string;
  budget_name: string;
  donor_id?: number;
  donor_name?: string;
  donor_code?: string;
  currency_code?: string;
  department_id: number;
  department_name: string;
  department_code: string;
  category?: string;
  project_id?: number;
  project_code?: string;
  project_name?: string;
  fiscal_year: number;
  allocated_amount: number;
  spent_amount: number;
  balance: number;
  utilization_percentage: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BudgetImpact {
  budget_line_id: number;
  budget_code: string;
  budget_name: string;
  allocated_amount: number;
  spent_amount: number;
  current_balance: number;
  requested_amount: number;
  balanceAfterApproval: number;
  hasInsufficientFunds: boolean;
  utilizationBeforePercent: string;
  utilizationAfterPercent: string;
}

export interface BudgetTransaction {
  id: number;
  budget_line_id: number;
  request_id: number | null;
  request_code?: string;
  transaction_type: 'ALLOCATION' | 'TOP_UP' | 'DEDUCTION' | 'REVERSAL' | 'ADJUSTMENT';
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

// Department Type
export interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    requests: T[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

// Currency Type
export type Currency = 'ZIG' | 'USD';

// Request Category Type
export type RequestCategory =
  | 'PROCUREMENT'
  | 'TRANSPORT'
  | 'ACCOMMODATION'
  | 'REIMBURSEMENT'
  | 'PER_DIEM'
  | 'TRAINING'
  | 'MAINTENANCE'
  | 'CAPACITY_BUILDING'
  | 'COMMUNITY_OUTREACH'
  | 'FIELD_OPERATIONS'
  | 'MEAL'
  | 'RESEARCH'
  | 'ADVOCACY'
  | 'BENEFICIARY_SUPPORT'
  | 'IT_SYSTEMS'
  | 'OFFICE_SUPPLIES'
  | 'UTILITIES'
  | 'VEHICLE_FLEET'
  | 'SECURITY'
  | 'STAFF_WELFARE'
  | 'AUDIT_COMPLIANCE'
  | 'LEGAL_CONSULTANCY'
  | 'SUBSCRIPTIONS'
  | 'OTHER';

// Form Types for Request Creation
export interface RequestFormItem {
  id: string; // UUID for React key
  category: RequestCategory;
  itemDescription: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  totalCost: number;
  budgetLineId: number | '';
  notes: string;
}

export interface RequestFormData {
  justification: string;
  currency: Currency;
  isAdminRequest: boolean;
  isActivityRequest: boolean;
  activityStartDate: string;
  activityEndDate: string;
  items: RequestFormItem[];
  supportingDocuments: File[];
  hasPerDiemClaim?: boolean;
  perDiemClaim?: PerDiemClaimFormData;
}

// =====================================================================}
