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
  /** Display title that overrides the role label (e.g. "General Secretary"). Cosmetic only. */
  job_title?: string | null;
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
  actor_department_code?: string | null;
  /** Approver's display title override, when they have one. */
  actor_job_title?: string | null;
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

// ============================================================================
// PER DIEM / TRAVEL & SUBSISTENCE CLAIM TYPES
// ============================================================================

export interface PerDiemTripItemFormData {
  id?: string;
  recipient_user_id?: number | null;
  recipient_name?: string;
  trip_date: string;
  return_date?: string;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time: string;
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
  accommodation?: boolean;
  line_total?: number;
}

export interface PerDiemCostDistributionFormData {
  id?: string;
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

// ============================================================================
// RECONCILIATION TYPES
// ============================================================================

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
  overspend_notes?: string | null;
  finance_reviewer_id: number | null;
  reviewer_first_name?: string;
  reviewer_last_name?: string;
  finance_comments: string | null;
  lead_comments?: string | null;
  lead_action?: string | null;
  lead_reviewer_name?: string | null;
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
// HR TYPES
// ============================================================================

export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'NOTICE_PERIOD' | 'TERMINATED' | 'RETIRED';
export type ContractType = 'PERMANENT' | 'FIXED_TERM' | 'CASUAL' | 'INTERN' | 'CONSULTANT';
export type LeaveStatus = 'PENDING' | 'DEPT_APPROVED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ESCALATED';
export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface HREmployee {
  // --- Accrual settings -----------------------------------------------------
  /** False for accounts that must never earn leave (service, contractor). */
  accrual_enabled?: boolean | number;
  /** Days earned per month by THIS person; null = the standard rate. */
  monthly_accrual_days?: number | string | null;
  /** Why this person's rate differs, e.g. "Level of effort — 50%". */
  accrual_note?: string | null;

  // --- Education / qualifications -------------------------------------------
  // Summary fields; the certificates themselves are files in hr_documents.
  highest_qualification?: string | null;
  field_of_study?: string | null;
  institution?: string | null;
  year_qualified?: number | string | null;
  professional_body?: string | null;

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
  /** Types like Study Leave cannot be submitted without a document. */
  requires_document?: boolean | number;
  /** Days granted before the vacation balance is charged (Compassionate 12, Sick 90). */
  free_days_limit?: number | null;
  /** Rolling window the allowance is measured over, in months. */
  free_days_window_months?: number | null;
  is_deductible?: boolean | number;
  is_accrual_target?: boolean | number;
  id: number;
  name: string;
  leave_name?: string;            // alias used in some pages
  description: string | null;
  days_per_year: number;
  default_days_per_year?: number; // alias used in some pages
  is_paid: boolean;
  carry_forward: boolean;
  max_carry_forward_days: number | null;
  requires_documentation: boolean;
  is_active: boolean;
}

export interface HRLeaveRequest {
  id: number;
  employee_id: number;
  employee_name?: string;
  first_name?: string;
  last_name?: string;
  department_name?: string;
  leave_type_id: number;
  leave_type_name?: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  total_days?: number;              // alias used in some pages
  reason: string | null;
  status: LeaveStatus;
  // Stage 1 (departmental) approval
  dept_approved_by?: number | null;
  dept_approved_by_name?: string | null;
  dept_approved_at?: string | null;
  dept_rejection_reason?: string | null;
  // Stage 2 (HR) approval
  approver_id: number | null;
  approver_name?: string;
  approved_by?: number | null;      // alias
  approved_by_name?: string | null; // alias
  approver_comments: string | null;
  approval_comments?: string | null; // alias
  approved_at: string | null;
  hr_rejection_reason?: string | null;
  rejection_reason?: string | null;
  created_at: string;

  // --- Balance snapshot -----------------------------------------------------
  /** Standing balance at the moment the request was raised (deductible types only). */
  balance_before?: number | null;
  /** Balance that remains once the request is approved (deductible types only). */
  balance_after?: number | null;
  /** Live balance for this employee/leave-type/year, recomputed on read. */
  current_balance?: number | null;
  /** Days actually charged to the vacation pool (may be less than requested). */
  deductible_days?: number;
  /** Days covered by the leave type's free allowance. */
  free_days_used?: number;
  free_days_limit?: number | null;
  free_days_window_months?: number | null;
  updated_at?: string;
  /** True when at least one day of this request is charged to the balance. */
  is_deductible?: boolean | number;
  is_accrual_target?: boolean | number;
  /** Role the requester held, used to explain who must approve. */
  requester_role?: UserRole | string;
  employee_number?: string | null;
  department_id?: number | null;
  employee_user_id?: number | null;
}

/**
 * One immutable entry in a leave request's audit trail.
 */
export interface HRLeaveAuditEntry {
  id: number;
  leave_request_id: number;
  employee_id: number;
  leave_type_id: number;
  leave_type_name?: string | null;
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ACCRUAL_ADJUSTMENT' | string;
  from_status: string | null;
  to_status: string | null;
  actor_user_id: number | null;
  /** Null when the entry was written by an automated job. */
  actor_name?: string | null;
  actor_role: string | null;
  comments: string | null;
  days_affected: number;
  is_deductible: boolean | number;
  balance_before: number | null;
  balance_after: number | null;
  entitlement_at: number | null;
  taken_at: number | null;
  pending_at: number | null;
  fiscal_year: number | null;
  created_at: string;
}

/** A supporting document attached to a leave request. */
export interface HRLeaveAttachment {
  id: number;
  leave_request_id: number;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  description: string | null;
  uploaded_by_name?: string | null;
  created_at: string;
}

/** A manual credit or debit applied to someone's leave balance. */
export interface HRLeaveAdjustment {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_number?: string | null;
  department_name?: string | null;
  leave_type_id: number;
  leave_type_name?: string;
  fiscal_year: number;
  /** Positive = top-up, negative = deduction. */
  adjustment_days: number;
  reason: string;
  balance_before: number | null;
  balance_after: number | null;
  adjusted_by: number | null;
  adjusted_by_name?: string | null;
  adjusted_by_role: string | null;
  created_at: string;
}

/** One employee's standing leave position, for the register view. */
export interface HRLeaveRegisterRow {
  employee_id: number;
  employee_number: string | null;
  employee_name: string;
  department_id: number | null;
  department_name: string | null;
  position_title: string | null;
  role_name: string;
  entitlement: number;
  carried_forward: number;
  taken: number;
  pending: number;
  remaining_days: number;
  /** Days credited by the monthly accrual job this year. */
  accrued_this_year: number;
  /** Net of every manual top-up and deduction this year. */
  manual_adjustments: number;
  /** Whether this employee earns leave monthly. */
  accrual_enabled?: boolean | number;
  /** Their own rate, when it differs from the standard one. */
  accrual_rate_override?: number | string | null;
  accrual_note?: string | null;
}

/**
 * One person's accrual statement: every credit, adjustment and deduction over
 * a year, with a running balance.
 */
export interface HRAccrualHistory {
  fiscal_year: number;
  months_covered: number;
  totals: {
    accrued: number;
    adjusted: number;
    taken: number;
    net: number;
  };
  accruals: Array<{
    fiscal_year: number;
    accrual_month: number;
    days_added: number;
    created_at: string;
    leave_type_name: string;
    triggered_by_name: string | null;
  }>;
  adjustments: Array<{
    adjustment_days: number;
    reason: string;
    created_at: string;
    leave_type_name: string;
    adjusted_by_name: string | null;
  }>;
  /** Chronological statement; `days` is signed and `balance_after` runs. */
  events: Array<{
    date: string;
    type: 'ACCRUAL' | 'TOP_UP' | 'DEDUCTION' | 'LEAVE_TAKEN';
    label: string;
    days: number;
    detail: string;
    balance_after: number;
  }>;
  employee?: HREmployee;
}

/** Accrual totals per department and per month. */
export interface HRAccrualReport {
  fiscal_year: number;
  totals: {
    credit_events: number;
    employees: number;
    days_accrued: number;
  };
  byDepartment: Array<{
    department_id: number | null;
    department_name: string;
    employees_credited: number;
    days_accrued: number;
  }>;
  byMonth: Array<{
    month: number;
    employees_credited: number;
    days_accrued: number;
    last_run: string;
  }>;
  adjustments: Array<{
    department_name: string;
    days_added: number;
    days_removed: number;
    adjustment_count: number;
  }>;
}

/**
 * Leave analytics for the HR Office / Super Admin oversight views.
 */
export interface HRLeaveAnalytics {
  fiscal_year: number;
  high_balance_threshold: number;
  summary: {
    employees: number;
    total_entitlement: number;
    total_taken: number;
    total_pending: number;
    total_remaining: number;
    avg_remaining: number;
  };
  /** Employees banking more days than the threshold allows. */
  highBalances: Array<{
    employee_id: number;
    employee_number: string | null;
    employee_name: string;
    department_name: string | null;
    leave_type_name: string;
    entitlement: number;
    carried_forward: number;
    taken: number;
    pending: number;
    remaining_days: number;
  }>;
  /** Employees who have taken 5 days or fewer all year. */
  lowUtilisation: Array<{
    employee_id: number;
    employee_number: string | null;
    employee_name: string;
    department_name: string | null;
    days_taken: number;
  }>;
  byDepartment: Array<{
    department_id: number | null;
    department_name: string | null;
    employees: number;
    days_taken: number;
    days_remaining: number;
  }>;
  byLeaveType: Array<{
    leave_type_id: number;
    leave_name: string;
    leave_code: string;
    is_deductible: boolean | number;
    request_count: number;
    days_approved: number;
    days_pending: number;
  }>;
  monthlyTrend: Array<{ month: number; request_count: number; days: number }>;
  /** Pending requests, oldest first, with how long they have been waiting. */
  pendingAging: Array<{
    id: number;
    employee_name: string;
    department_name: string | null;
    leave_type_name: string;
    start_date: string;
    total_days: number;
    created_at: string;
    days_waiting: number;
  }>;
  /** Recent runs of the 25th-of-month accrual job. */
  accrualHistory: Array<{
    fiscal_year: number;
    accrual_month: number;
    run_at: string;
    employees_credited: number;
    days_added: number;
  }>;
}

export interface HRLeaveBalance {
  id: number;
  employee_id: number;
  leave_type_id: number;
  leave_type_name?: string;
  year: number;
  entitled_days: number;
  used_days: number;
  pending_days: number;
  balance_days: number;
  total_days: number;      // alias used in some pages (= entitled_days)
  remaining_days: number;  // alias used in some pages (= balance_days)
}

export interface HRTimesheetEntry {
  id?: number;
  timesheet_id?: number;
  entry_date: string;
  hours_worked: number;
  donor_id?: number;
  donor_name?: string;
  project_code?: string;
  activity_description?: string;
}

export interface HRTimesheet {
  id: number;
  employee_id: number;
  employee_name?: string;
  first_name?: string;
  last_name?: string;
  department_name?: string;
  month: number;
  year: number;
  total_hours: number;
  status: TimesheetStatus;
  submitted_at: string | null;
  approved_at: string | null;
  approver_id: number | null;
  approver_name?: string;
  approved_by_name?: string;  // alias used in some pages
  comments: string | null;
  notes: string | null;
  created_at: string;
  entries?: HRTimesheetEntry[];
}

export interface HRPerformanceReview {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_number?: string;   // used in some pages
  job_title?: string;         // used in some pages
  department_name?: string;   // used in some pages
  reviewer_id: number;
  reviewer_name?: string;
  review_period: string;
  review_type: string;
  review_date: string;
  overall_score: number | null;
  overall_rating: number | null;  // Rating component requires number | null
  job_knowledge_score: number | null;
  quality_of_work_score: number | null;
  productivity_score: number | null;
  communication_score: number | null;
  teamwork_score: number | null;
  initiative_score: number | null;
  attendance_score: number | null;
  areas_for_improvement: string | null;
  areas_of_improvement?: string | null;   // alias used in some pages
  training_recommendations: string | null;
  reviewer_comments: string | null;
  comments?: string | null;               // alias used in some pages
  achievements: string | null;
  status: string;
  created_at: string;
}

export interface HRTrainingRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;         // used in some pages
  training_name: string;
  training_title?: string;          // alias used in some pages
  training_type?: string;           // used in some pages
  provider: string | null;
  start_date: string;
  end_date: string | null;
  duration_days: number | null;
  cost: number;
  currency: string;
  donor_funded?: boolean;           // used in some pages
  certification_received?: boolean; // used in some pages
  certification_name?: string | null;
  status: string;
  certificate_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface HRDisciplinaryRecord {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_number?: string;   // used in some pages
  incident_date: string;
  type: string;
  action_type?: string;       // alias used in some pages
  description: string;
  action_taken: string | null;
  issued_by: number;
  issuer_name?: string;
  status: string;
  follow_up_date?: string | null;  // used in some pages
  notes?: string | null;           // used in some pages
  resolution_date: string | null;
  resolution_notes: string | null;
  document_url: string | null;
  created_at: string;
}

export interface HRExitClearance {
  id: number;
  employee_id: number;
  employee_name?: string;
  exit_type: string;
  last_working_day: string;
  reason: string | null;
  status: string;
  hr_cleared: boolean;
  hr_clearance?: boolean;     // alias used in some pages
  finance_cleared: boolean;
  it_cleared: boolean;
  admin_cleared: boolean;
  outstanding_leave_days: number;
  outstanding_advances: number;
  final_salary: number;
  gratuity: number;
  total_final_payment: number;
  exit_interview_conducted: boolean;
  exit_interview_date: string | null;
  exit_interview_notes?: string | null;  // used in some pages
  notes: string | null;
  created_at: string;
}

export interface HRDocument {
  id: number;
  employee_id: number;
  document_type: string;
  document_name: string;
  file_url: string;
  file_size: number | null;
  uploaded_by: number;
  uploader_name?: string;
  notes: string | null;
  created_at: string;
}

export interface HRDashboardStats {
  totalEmployees: number;
  activeEmployees?: number;
  pendingLeaveRequests: number;
  expiringContracts: number;
  byDepartment: Array<{
    department_name: string;
    count: number;
  }>;
  byStatus?: Array<{
    employment_status: string;
    count: number;
  }>;
  byContractType?: Array<{
    employment_type: string;
    count: number;
  }>;
  recentHires?: HREmployee[];
  upcomingBirthdays?: Array<{
    id?: number;            // used as React key in some pages
    employee_id: number;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    department_name?: string;
  }>;
}

// ============================================================================
// PROCUREMENT TYPES
// ============================================================================

export type ProcurementStatus =
  | 'DRAFT'
  | 'PENDING_DEPT_APPROVAL'
  | 'PENDING_FINANCE_APPROVAL'
  | 'PENDING_PROCUREMENT'
  | 'PENDING_COMMITTEE'
  // Selected quotation >= USD 5,000: recommended by the committee, awaiting the
  // Super Admin and the owning department's Lead/HOP (both required).
  | 'PENDING_HIGH_VALUE_APPROVAL'
  | 'PENDING_FINAL_FINANCE'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export interface ProcRequestItem {
  id?: number;
  request_id?: number;
  item_description: string;
  specifications?: string;
  quantity: number;
  unit_of_measure: string;
  estimated_unit_price: number;
  total_estimated_price?: number;
  estimated_total?: number;   // alias used in some pages
  budget_line_id: number | null;
  budget_code?: string;        // used in some pages
  budget_name?: string;
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
  final_approved_at?: string | null;
  selected_quotation_id?: number | null;
  pop_file_url?: string | null;
  quotation_count?: number;          // used in some pages
  created_at: string;
  updated_at: string;
  items?: ProcRequestItem[];
  quotations?: ProcQuotation[];
  approvalTrail?: any[];             // used in some pages
}

export interface ProcQuotation {
  id: number;
  request_id: number;
  vendor_id?: number | null;
  vendor_name?: string;
  vendor_code?: string;
  vendor_email?: string;        // used in some pages
  vendor_phone?: string;        // used in some pages
  quotation_number?: string;    // used in some pages
  file_url: string;
  file_name: string;
  file_size?: number;
  amount: number;
  total_amount: number;         // alias used in some pages (always present)
  currency: string;
  validity_date?: string | null; // used in some pages
  delivery_timeline?: string | null; // used in some pages
  is_selected: boolean;
  is_prequalified?: boolean;    // used in some pages
  notes?: string | null;
  uploaded_by: number;
  uploader_name?: string;
  uploaded_at: string;
  created_at: string;
}

export interface ProcVendor {
  id: number;
  vendor_code?: string;
  company_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tin_number?: string;
  registration_number?: string;
  category?: string;
  notes?: string;
  is_prequalified: boolean;
  is_active: boolean;
  rating?: number;
  quotation_count?: number;  // used in VendorDatabase page
  created_at?: string;
  updated_at?: string;
}

export interface ProcDashboardStats {
  totalRequests: number;
  draftCount?: number;
  pendingDeptApproval?: number;
  pendingFinanceApproval?: number;
  pendingProcurement?: number;
  pendingCommittee?: number;
  pendingFinalFinance?: number;
  totalFinalFinance?: number;   // alias used in DashboardPage
  completedCount?: number;
  rejectedCount?: number;
  totalValue?: number;
  // fields used directly in ProcurementDashboard page
  totalPending?: number;
  totalInProcurement?: number;
  totalAwaitingCommittee?: number;
  totalCompleted?: number;
  totalRejected?: number;
  statusSummary?: Record<string, number>;
  byStatus?: Record<string, number>;
  recentRequests?: ProcRequest[];
  myPendingActions?: number;
}

export interface ProcCommitteeReview {
  id: number;
  request_id: number;
  reviewer_id: number;
  reviewer_name?: string;
  reviewer_first_name?: string;
  reviewer_last_name?: string;
  decision: 'APPROVED' | 'REJECTED' | 'ABSTAINED';
  selected_quotation_id?: number | null;
  justification?: string | null;
  voted_at: string;
  created_at: string;
}

export interface CreateProcRequestPayload {
  title?: string;
  justification: string;
  priority?: Priority;
  donor_id?: number | null;
  project_id?: number | null;
  expected_delivery_date?: string | null;
  items: Array<{
    item_description: string;
    specifications?: string;
    quantity: number;
    unit_of_measure: string;
    estimated_unit_price: number;
    budget_line_id?: number | null;
    notes?: string;
  }>;
}
