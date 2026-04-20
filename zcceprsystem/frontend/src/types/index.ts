/**
 * TypeScript Type Definitions
 * Finance Module - ERP System
 */

// User & Auth Types
export type UserRole = 'ADMIN' | 'GENERAL_USER' | 'PROGRAM_LEAD' | 'HEAD_OF_PROGRAMS' | 'FINANCE_CLERK';

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
  | 'PENDING_LEAD_APPROVAL'
  | 'PENDING_HOP_APPROVAL'
  | 'PENDING_FINANCE_APPROVAL'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'PENDING_RECONCILIATION'
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
  status: RequestStatus;
  total_amount: number;
  justification: string;
  description?: string;
  priority: Priority;
  submitted_at: string | null;
  lead_approved_at: string | null;
  hop_approved_at: string | null;
  finance_approved_at: string | null;
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
export type RequestCategory = 'PROCUREMENT' | 'TRANSPORT' | 'ACCOMMODATION' | 'REIMBURSEMENT' | 'PER_DIEM' | 'TRAINING' | 'MAINTENANCE' | 'OTHER';

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
  priority: Priority;
  currency: Currency;
  isAdminRequest: boolean;
  items: RequestFormItem[];
  supportingDocuments: File[];
}

// Reconciliation Types
export type ReconciliationStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface ReconciliationItem {
  id?: number;
  reconciliation_id?: number;
  request_item_id?: number;
  description: string;
  budgeted_amount: number;
  actual_amount: number;
  variance?: number;
  notes?: string;
  original_description?: string;
  original_quantity?: number;
  original_unit_price?: number;
}

export interface Reconciliation {
  id: number;
  request_id: number;
  reconciled_by: number;
  reconciled_by_first_name: string;
  reconciled_by_last_name: string;
  status: ReconciliationStatus;
  total_spent: number;
  total_returned: number;
  notes: string | null;
  finance_reviewer_id: number | null;
  reviewer_first_name?: string;
  reviewer_last_name?: string;
  finance_comments: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  items?: ReconciliationItem[];
}

export interface ReconciliationSubmitPayload {
  items: Array<{
    requestItemId?: number;
    description: string;
    budgetedAmount: number;
    actualAmount: number;
    notes?: string;
  }>;
  notes?: string;
  totalSpent: number;
  totalReturned: number;
}

// ============================================================================
// HR MODULE TYPES
// ============================================================================

export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'NOTICE_PERIOD' | 'TERMINATED' | 'RETIRED';
export type ContractType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'CONSULTANT' | 'INTERN' | 'VOLUNTEER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type ReviewStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'ACKNOWLEDGED';
export type TrainingStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type DisciplinaryActionType = 'VERBAL_WARNING' | 'WRITTEN_WARNING' | 'FINAL_WARNING' | 'SUSPENSION' | 'TERMINATION';
export type ExitType = 'RESIGNATION' | 'TERMINATION' | 'RETIREMENT' | 'CONTRACT_END' | 'OTHER';
export type ClearanceStatus = 'INITIATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface HREmployee {
  id: number;
  employee_number: string;
  user_id: number | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  national_id: string | null;
  personal_email: string | null;
  phone_number: string | null;
  address: string | null;
  department_id: number | null;
  department_name?: string;
  job_title: string | null;
  employment_status: EmploymentStatus;
  contract_type: ContractType;
  hire_date: string;
  termination_date: string | null;
  termination_reason: string | null;
  supervisor_id: number | null;
  supervisor_name?: string;
  salary_grade_id: number | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  donor_funding_source: string | null;
  cost_center: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contracts?: HRContract[];
  leaveBalances?: HRLeaveBalance[];
}

export interface HRContract {
  id: number;
  employee_id: number;
  employee_name?: string;
  contract_type: ContractType;
  start_date: string;
  end_date: string | null;
  salary_amount: number;
  currency: string;
  terms_summary: string | null;
  document_url: string | null;
  status: string;
  created_at: string;
}

export interface HRLeaveType {
  id: number;
  name: string;
  default_days: number;
  max_days_per_year: number;
  carry_over_allowed: boolean;
  max_carry_over_days: number;
  is_active: boolean;
}

export interface HRLeaveBalance {
  id: number;
  employee_id: number;
  leave_type_id: number;
  leave_type_name?: string;
  year: number;
  total_days: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
  max_days_per_year?: number;
}

export interface HRLeaveRequest {
  id: number;
  employee_id: number;
  employee_name?: string;
  leave_type_id: number;
  leave_type_name?: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: LeaveStatus;
  approved_by: number | null;
  approved_by_name?: string;
  approval_comments: string | null;
  approved_at: string | null;
  department_id?: number;
  department_name?: string;
  created_at: string;
}

export interface HRTimesheet {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  month: number;
  year: number;
  total_hours: number;
  status: TimesheetStatus;
  notes: string | null;
  submitted_at: string | null;
  approved_by: number | null;
  approved_by_name?: string;
  approval_comments: string | null;
  approved_at: string | null;
  created_at: string;
  entries?: HRTimesheetEntry[];
}

export interface HRTimesheetEntry {
  id: number;
  timesheet_id: number;
  entry_date: string;
  hours_worked: number;
  donor_id: number | null;
  donor_name?: string;
  project_code: string | null;
  activity_description: string | null;
}

export interface HRPerformanceReview {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_number?: string;
  job_title?: string;
  department_name?: string;
  reviewer_id: number | null;
  reviewer_name?: string;
  review_period: string;
  review_date: string;
  goals_json: string | null;
  achievements_json: string | null;
  areas_of_improvement: string | null;
  overall_rating: number | null;
  status: ReviewStatus;
  comments: string | null;
  created_at: string;
}

export interface HRTrainingRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_number?: string;
  department_name?: string;
  training_title: string;
  training_type: string;
  provider: string | null;
  start_date: string;
  end_date: string | null;
  cost: number;
  currency: string;
  donor_funded: boolean;
  donor_id: number | null;
  certification_received: boolean;
  certification_name: string | null;
  certification_expiry: string | null;
  status: TrainingStatus;
  notes: string | null;
  created_at: string;
}

export interface HRDisciplinaryRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_number?: string;
  action_type: DisciplinaryActionType;
  incident_date: string;
  description: string;
  action_taken: string | null;
  issued_by: number | null;
  issued_by_name?: string;
  status: string;
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface HRExitClearance {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_number?: string;
  job_title?: string;
  department_name?: string;
  exit_type: ExitType;
  last_working_day: string;
  reason: string | null;
  hr_clearance: boolean;
  finance_clearance: boolean;
  it_clearance: boolean;
  admin_clearance: boolean;
  supervisor_clearance: boolean;
  exit_interview_notes: string | null;
  status: ClearanceStatus;
  created_at: string;
}

export interface HRDocument {
  id: number;
  employee_id: number;
  document_type: string;
  document_name: string;
  file_path: string;
  file_size: number;
  expiry_date: string | null;
  notes: string | null;
  uploaded_by: number;
  uploaded_at: string;
}

export interface HRDashboardStats {
  totalEmployees: number;
  byStatus: Array<{ employment_status: string; count: number }>;
  byDepartment: Array<{ department_name: string; count: number }>;
  byContractType: Array<{ employment_type: string; count: number }>;
  pendingLeaveRequests: number;
  expiringContracts: number;
  upcomingBirthdays: Array<{ id: number; first_name: string; last_name: string; date_of_birth: string }>;
}
