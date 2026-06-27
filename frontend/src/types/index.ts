/**
 * TypeScript Type Definitions
 * Finance Module - ERP System
 */

// User & Auth Types
<<<<<<< HEAD
export type UserRole = 'ADMIN' | 'GENERAL_USER' | 'PROGRAM_LEAD' | 'HEAD_OF_PROGRAMS' | 'FINANCE_CLERK' | 'PROCUREMENT_OFFICER' | 'PROCUREMENT_COMMITTEE';
=======
export type UserRole = 'GENERAL_USER' | 'PROGRAM_LEAD' | 'HEAD_OF_PROGRAMS' | 'FINANCE_CLERK';
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

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
<<<<<<< HEAD
  | 'PENDING_ADMIN_APPROVAL'
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  | 'PENDING_LEAD_APPROVAL'
  | 'PENDING_HOP_APPROVAL'
  | 'PENDING_FINANCE_APPROVAL'
  | 'APPROVED'
<<<<<<< HEAD
  | 'DISPATCHED'
  | 'PENDING_RECONCILIATION'
  | 'RECON_PENDING_LEAD'
  | 'RECON_PENDING_FINANCE'
  | 'RECONCILED'
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
  request_code: string;
=======
  request_number: string;
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  requester_id: number;
  requester_first_name: string;
  requester_last_name: string;
  requester_email?: string;
  department_id: number;
  department_name: string;
  department_code: string;
<<<<<<< HEAD
  donor_id?: number;
  donor_name?: string;
  donor_code?: string;
  project_id?: number;
  project_name?: string;
  project_code?: string;
  routing_department_id?: number | null;
  routing_department_name?: string | null;
  routing_department_code?: string | null;
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  status: RequestStatus;
  total_amount: number;
  justification: string;
  description?: string;
  priority: Priority;
<<<<<<< HEAD
  has_per_diem_claim?: boolean;
  is_activity_request?: boolean;
  activity_start_date?: string | null;
  activity_end_date?: string | null;
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  submitted_at: string | null;
  lead_approved_at: string | null;
  hop_approved_at: string | null;
  finance_approved_at: string | null;
<<<<<<< HEAD
  dispatched_at: string | null;
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
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

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
// Budget Types
export interface BudgetLine {
  id: number;
  budget_code: string;
  budget_name: string;
<<<<<<< HEAD
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
=======
  department_id: number;
  department_name: string;
  department_code: string;
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
  request_code?: string;
=======
  request_number?: string;
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
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
=======
// Form Types for Request Creation
export interface RequestFormItem {
  id: string; // UUID for React key
  itemDescription: string;
  totalCost: number;
  budgetLineId: number | '';
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
}

export interface RequestFormData {
  justification: string;
<<<<<<< HEAD
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

// ============================================================================
// PER DIEM / TRAVEL & SUBSISTENCE CLAIM TYPES
// ============================================================================

export interface PerDiemTripItemFormData {
  id?: string;               // local React key
  recipient_user_id?: number | null;
  recipient_name?: string;   // free-text fallback / display
  trip_date: string;         // YYYY-MM-DD (depart)
  return_date?: string;      // YYYY-MM-DD (expected return)
  from_location: string;
  to_location: string;
  departure_time: string;    // HH:MM
  arrival_time: string;      // HH:MM
  purpose: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  overnight_stay: boolean;
  rate_breakfast?: number;
  rate_lunch?: number;
  rate_dinner?: number;
  rate_overnight?: number;
  rate_accommodation?: number;
  accommodation?: boolean;    // derived: rate_accommodation > 0
  line_total?: number;       // calculated client-side
}

export interface PerDiemCostDistributionFormData {
  id?: string;               // local React key
  account_name: string;
  account_code: string;
  partner_project?: string;
  amount: number;
}

export interface PerDiemClaimFormData {
  full_name: string;
  designation: string;
  project_id?: number | null;
  strategic_focus?: string;
  budget_line_id?: number | null;
  less_outstanding_advance: number;
  trip_items: PerDiemTripItemFormData[];
  cost_distribution: PerDiemCostDistributionFormData[];
}

// Read model (from API)
export interface PerDiemTripItem extends Omit<PerDiemTripItemFormData, 'id'> {
  id: number;
  claim_id: number;
  row_order: number;
  rate_breakfast: number;
  rate_lunch: number;
  rate_dinner: number;
  rate_overnight: number;
  line_total: number;
  recipient_display_name?: string;
  recipient_email?: string;
  created_at: string;
  updated_at: string;
}

export interface PerDiemCostDistribution extends Omit<PerDiemCostDistributionFormData, 'id'> {
  id: number;
  claim_id: number;
  row_order: number;
  created_at: string;
  updated_at: string;
}

export interface PerDiemClaim {
  id: number;
  request_id: number;
  full_name: string;
  designation: string;
  project_id: number | null;
  project_name?: string;
  project_code?: string;
  strategic_focus: string | null;
  budget_line_id: number | null;
  budget_code?: string;
  budget_name?: string;
  trip_start_date: string | null;
  trip_end_date: string | null;
  total_claimed: number;
  less_outstanding_advance: number;
  amount_payable: number;
  advance_reconciliation_due: string | null;
  reconciled_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  trip_items: PerDiemTripItem[];
  cost_distribution: PerDiemCostDistribution[];
}

export interface PerDiemRates {
  breakfast: number;
  lunch: number;
  dinner: number;
  overnight: number;
  accommodation: number;
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
  overspendNotes?: string;
  totalSpent: number;
  totalReturned: number;
  actualStartDate?: string;
  actualEndDate?: string;
}

// ============================================================================
// HR MODULE TYPES
// ============================================================================

export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'NOTICE_PERIOD' | 'TERMINATED' | 'RETIRED';
export type ContractType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'CONSULTANT' | 'INTERN' | 'VOLUNTEER';
export type LeaveStatus = 'PENDING' | 'DEPT_APPROVED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ESCALATED';
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
  leave_code: string;
  leave_name: string;
  description: string | null;
  default_days_per_year: number;
  is_paid: boolean;
  requires_documentation: boolean;
  max_carry_forward: number;
  is_active: boolean;
  is_deductible: boolean;
  is_accrual_target: boolean;
  monthly_accrual_days: number;
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
  // Stage 1 — departmental approval
  dept_approved_by: number | null;
  dept_approved_by_name?: string;
  dept_approved_at: string | null;
  dept_rejection_reason: string | null;
  // Stage 2 — HR/final approval
  approved_by: number | null;
  approved_by_name?: string;
  approved_at: string | null;
  hr_rejection_reason: string | null;
  // Shared comment field
  approval_comments: string | null;
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

// ============================================================================
// PROCUREMENT MODULE TYPES
// ============================================================================

export type ProcurementStatus =
  | 'DRAFT'
  | 'PENDING_DEPT_APPROVAL'
  | 'PENDING_FINANCE_APPROVAL'
  | 'PENDING_PROCUREMENT'
  | 'PENDING_COMMITTEE'
  | 'PENDING_FINAL_FINANCE'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export interface ProcRequestItem {
  id?: number;
  request_id?: number;
  budget_line_id?: number | null;
  budget_code?: string;
  budget_name?: string;
  budget_balance?: number;
  item_description: string;
  specifications?: string;
  quantity: number;
  unit_of_measure: string;
  estimated_unit_price: number;
  estimated_total?: number;
  actual_unit_price?: number;
  actual_total?: number;
  notes?: string;
}

export interface ProcRequest {
  id: number;
  request_code: string;
  title?: string;
  requester_id: number;
  first_name: string;
  last_name: string;
  requester_email?: string;
  department_id: number;
  department_name: string;
  department_code: string;
  donor_id?: number | null;
  donor_name?: string;
  donor_code?: string;
  project_id?: number | null;
  project_name?: string;
  project_code?: string;
  justification: string;
  expected_delivery_date?: string | null;
  priority: Priority;
  total_estimated_amount: number;
  status: ProcurementStatus;
  rejection_reason?: string | null;
  submitted_at?: string | null;
  dept_approved_at?: string | null;
  finance_approved_at?: string | null;
  procurement_assigned_at?: string | null;
  committee_reviewed_at?: string | null;
  final_finance_approved_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  quotation_count?: number;
  items?: ProcRequestItem[];
  approvalTrail?: ProcApprovalLog[];
  quotations?: ProcQuotation[];
  attachments?: ProcAttachment[];
}

export interface ProcApprovalLog {
  id: number;
  request_id: number;
  actor_id: number;
  actor_role: string;
  actor_first_name: string;
  actor_last_name: string;
  action: string;
  previous_status?: string | null;
  new_status?: string | null;
  comments?: string | null;
  created_at: string;
}

export interface ProcAttachment {
  id: number;
  request_id: number;
  file_name: string;
  original_name: string;
  file_type: string;
  file_size: number;
  attachment_type: 'PHOTO' | 'QUOTATION' | 'SPECIFICATION' | 'OTHER';
  description?: string;
  uploaded_by: number;
  first_name: string;
  last_name: string;
  created_at: string;
}

export interface ProcQuotation {
  id: number;
  request_id: number;
  vendor_id?: number | null;
  vendor_name: string;
  vendor_email?: string;
  vendor_phone?: string;
  vendor_company?: string;
  is_prequalified?: boolean;
  vendor_rating?: number;
  quotation_number?: string;
  total_amount: number;
  currency: string;
  validity_date?: string | null;
  delivery_timeline?: string;
  terms_and_conditions?: string;
  notes?: string;
  file_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  is_selected: boolean;
  selected_at?: string | null;
  created_by: number;
  created_by_first_name?: string;
  created_by_last_name?: string;
  created_at: string;
}

export interface ProcVendor {
  id: number;
  vendor_code: string;
  company_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tin_number?: string;
  registration_number?: string;
  category?: string;
  is_prequalified: boolean;
  prequalification_expiry?: string | null;
  rating: number;
  notes?: string;
  is_active: boolean;
  created_by?: number;
  created_by_first_name?: string;
  created_by_last_name?: string;
  quotation_count?: number;
  total_awarded?: number;
  created_at: string;
  updated_at: string;
}

export interface ProcCommitteeReview {
  id: number;
  request_id: number;
  selected_quotation_id?: number | null;
  reviewer_id: number;
  reviewer_first_name: string;
  reviewer_last_name: string;
  decision: 'APPROVED' | 'REJECTED' | 'DEFERRED';
  justification?: string;
  conditions?: string;
  vendor_name?: string;
  selected_amount?: number;
  reviewed_at: string;
}

export interface ProcDashboardStats {
  statusSummary: Record<ProcurementStatus, number>;
  totalCompleted: number;
  totalPending: number;
  totalInProcurement: number;
  totalAwaitingCommittee: number;
  totalFinalFinance: number;
  totalRejected: number;
  totalSpend: number;
  pendingDeptApproval: number;
  recentRequests: ProcRequest[];
}

export interface CreateProcRequestPayload {
  title: string;
  justification: string;
  donor_id?: number | null;
  project_id?: number | null;
  expected_delivery_date?: string | null;
  priority?: Priority;
  items: Array<{
    item_description: string;
    specifications?: string;
    quantity: number;
    unit_of_measure?: string;
    estimated_unit_price: number;
    budget_line_id?: number | null;
    notes?: string;
  }>;
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
=======
  priority: Priority;
  currency: Currency;
  isAdminRequest: boolean;
  items: RequestFormItem[];
  supportingDocuments: File[];
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
}
