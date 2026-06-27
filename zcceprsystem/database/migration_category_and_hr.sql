-- ============================================================================
-- MIGRATION: Add category to request_items + HR Module Schema
-- Run in Navicat on the finance_erp database
-- Date: 2026-02-13
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- PART 1: Add category column to request_items
-- ============================================================================
ALTER TABLE `request_items` 
ADD COLUMN `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PROCUREMENT' AFTER `item_description`;

-- ============================================================================
-- PART 2: HR MODULE - Complete Database Schema
-- ============================================================================

-- ============================================================================
-- 2.1 SALARY GRADES / SCALES
-- ============================================================================
DROP TABLE IF EXISTS `hr_salary_grades`;
CREATE TABLE `hr_salary_grades` (
  `id` int NOT NULL AUTO_INCREMENT,
  `grade_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `grade_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `min_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `max_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_salary_grades_code_key` (`grade_code`)
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

INSERT INTO `hr_salary_grades` (`grade_code`, `grade_name`, `min_salary`, `max_salary`) VALUES
('G1', 'Grade 1 - Entry Level', 500.00, 1000.00),
('G2', 'Grade 2 - Junior', 1000.00, 2000.00),
('G3', 'Grade 3 - Mid-Level', 2000.00, 3500.00),
('G4', 'Grade 4 - Senior', 3500.00, 5000.00),
('G5', 'Grade 5 - Lead/Specialist', 5000.00, 7500.00),
('G6', 'Grade 6 - Manager', 7500.00, 10000.00),
('G7', 'Grade 7 - Director', 10000.00, 15000.00),
('C1', 'Consultant - Short Term', 0.00, 50000.00),
('V1', 'Volunteer', 0.00, 500.00);

-- ============================================================================
-- 2.2 EMPLOYEE MASTER RECORD
-- ============================================================================
DROP TABLE IF EXISTS `hr_employees`;
CREATE TABLE `hr_employees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NULL DEFAULT NULL,
  `employee_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `middle_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `date_of_birth` date NULL,
  `gender` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `marital_status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `nationality` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'Zimbabwean',
  
  -- Contact
  `personal_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `work_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `phone_primary` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `phone_secondary` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `province` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- ID Documents
  `national_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `passport_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `passport_expiry` date NULL,
  `tax_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `nssa_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- Next of Kin
  `nok_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `nok_relationship` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `nok_phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `nok_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `nok_address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- Bank Details
  `bank_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `bank_branch` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `bank_account_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `bank_account_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `bank_currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  
  -- Position & Department
  `department_id` int NULL DEFAULT NULL,
  `position_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `salary_grade_id` int NULL DEFAULT NULL,
  `supervisor_id` int NULL DEFAULT NULL,
  `duty_station` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `work_location` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OFFICE',
  
  -- NGO-Specific Fields
  `primary_donor_id` int NULL DEFAULT NULL,
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `cost_allocation_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `hazard_category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- Employment Details
  `employment_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FULL_TIME',
  `employment_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `hire_date` date NULL,
  `probation_end_date` date NULL,
  `confirmation_date` date NULL,
  `termination_date` date NULL,
  `termination_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- Photo
  `photo_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_by` int NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_employees_number_key` (`employee_number`),
  INDEX `hr_employees_user_idx` (`user_id`),
  INDEX `hr_employees_dept_idx` (`department_id`),
  INDEX `hr_employees_supervisor_idx` (`supervisor_id`),
  INDEX `hr_employees_status_idx` (`employment_status`),
  INDEX `hr_employees_type_idx` (`employment_type`),
  INDEX `hr_employees_donor_idx` (`primary_donor_id`),
  CONSTRAINT `fk_hr_emp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_grade` FOREIGN KEY (`salary_grade_id`) REFERENCES `hr_salary_grades` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `hr_employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_donor` FOREIGN KEY (`primary_donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_created` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.3 CONTRACTS
-- ============================================================================
DROP TABLE IF EXISTS `hr_contracts`;
CREATE TABLE `hr_contracts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `contract_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contract_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIXED_TERM',
  `position_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_id` int NULL DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NULL,
  `probation_months` int NULL DEFAULT 3,
  `basic_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `salary_grade_id` int NULL DEFAULT NULL,
  
  -- Funding source
  `donor_id` int NULL DEFAULT NULL,
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `budget_line_id` int NULL DEFAULT NULL,
  `cost_allocation_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- Allowances
  `transport_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `housing_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `field_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `other_allowances` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `allowances_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `renewal_date` date NULL,
  `renewal_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `termination_date` date NULL,
  `termination_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  `signed_date` date NULL,
  `signed_by_employee` tinyint(1) NOT NULL DEFAULT 0,
  `signed_by_employer` tinyint(1) NOT NULL DEFAULT 0,
  `document_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_by` int NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_contracts_number_key` (`contract_number`),
  INDEX `hr_contracts_employee_idx` (`employee_id`),
  INDEX `hr_contracts_status_idx` (`status`),
  INDEX `hr_contracts_end_date_idx` (`end_date`),
  INDEX `hr_contracts_donor_idx` (`donor_id`),
  CONSTRAINT `fk_contract_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_grade` FOREIGN KEY (`salary_grade_id`) REFERENCES `hr_salary_grades` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_donor` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_budget` FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_created` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.4 LEAVE TYPES
-- ============================================================================
DROP TABLE IF EXISTS `hr_leave_types`;
CREATE TABLE `hr_leave_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `leave_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `leave_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `default_days_per_year` decimal(5, 1) NOT NULL DEFAULT 0,
  `is_paid` tinyint(1) NOT NULL DEFAULT 1,
  `requires_documentation` tinyint(1) NOT NULL DEFAULT 0,
  `max_carry_forward` decimal(5, 1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_leave_types_code_key` (`leave_code`)
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

INSERT INTO `hr_leave_types` (`leave_code`, `leave_name`, `default_days_per_year`, `is_paid`, `requires_documentation`, `max_carry_forward`) VALUES
('ANNUAL', 'Annual Leave', 22.0, 1, 0, 5.0),
('SICK', 'Sick Leave', 12.0, 1, 1, 0),
('MATERNITY', 'Maternity Leave', 98.0, 1, 1, 0),
('PATERNITY', 'Paternity Leave', 10.0, 1, 1, 0),
('COMPASSIONATE', 'Compassionate Leave', 5.0, 1, 0, 0),
('STUDY', 'Study Leave', 10.0, 1, 1, 0),
('UNPAID', 'Unpaid Leave', 30.0, 0, 0, 0),
('R_AND_R', 'Rest & Recuperation', 5.0, 1, 0, 0);

-- ============================================================================
-- 2.5 LEAVE BALANCES (Per Employee Per Year)
-- ============================================================================
DROP TABLE IF EXISTS `hr_leave_balances`;
CREATE TABLE `hr_leave_balances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `leave_type_id` int NOT NULL,
  `fiscal_year` int NOT NULL,
  `entitlement` decimal(5, 1) NOT NULL DEFAULT 0,
  `carried_forward` decimal(5, 1) NOT NULL DEFAULT 0,
  `taken` decimal(5, 1) NOT NULL DEFAULT 0,
  `pending` decimal(5, 1) NOT NULL DEFAULT 0,
  `balance` decimal(5, 1) GENERATED ALWAYS AS (`entitlement` + `carried_forward` - `taken` - `pending`) STORED,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_leave_bal_unique` (`employee_id`, `leave_type_id`, `fiscal_year`),
  INDEX `hr_leave_bal_employee_idx` (`employee_id`),
  INDEX `hr_leave_bal_type_idx` (`leave_type_id`),
  CONSTRAINT `fk_leave_bal_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_bal_type` FOREIGN KEY (`leave_type_id`) REFERENCES `hr_leave_types` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.6 LEAVE REQUESTS
-- ============================================================================
DROP TABLE IF EXISTS `hr_leave_requests`;
CREATE TABLE `hr_leave_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `leave_type_id` int NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `days_requested` decimal(5, 1) NOT NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `approved_by` int NULL DEFAULT NULL,
  `approved_at` datetime(3) NULL,
  `rejection_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `handover_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `covering_employee_id` int NULL DEFAULT NULL,
  `document_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_leave_req_employee_idx` (`employee_id`),
  INDEX `hr_leave_req_type_idx` (`leave_type_id`),
  INDEX `hr_leave_req_status_idx` (`status`),
  INDEX `hr_leave_req_dates_idx` (`start_date`, `end_date`),
  CONSTRAINT `fk_leave_req_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_req_type` FOREIGN KEY (`leave_type_id`) REFERENCES `hr_leave_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_req_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_req_cover` FOREIGN KEY (`covering_employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.7 TIMESHEETS (Monthly Headers)
-- ============================================================================
DROP TABLE IF EXISTS `hr_timesheets`;
CREATE TABLE `hr_timesheets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `period_month` int NOT NULL,
  `period_year` int NOT NULL,
  `total_hours` decimal(10, 2) NOT NULL DEFAULT 0,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `submitted_at` datetime(3) NULL,
  `supervisor_approved_by` int NULL DEFAULT NULL,
  `supervisor_approved_at` datetime(3) NULL,
  `hr_approved_by` int NULL DEFAULT NULL,
  `hr_approved_at` datetime(3) NULL,
  `finance_approved_by` int NULL DEFAULT NULL,
  `finance_approved_at` datetime(3) NULL,
  `rejection_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_timesheets_unique` (`employee_id`, `period_month`, `period_year`),
  INDEX `hr_timesheets_status_idx` (`status`),
  INDEX `hr_timesheets_period_idx` (`period_year`, `period_month`),
  CONSTRAINT `fk_timesheet_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_timesheet_supervisor` FOREIGN KEY (`supervisor_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_timesheet_hr` FOREIGN KEY (`hr_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_timesheet_finance` FOREIGN KEY (`finance_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.8 TIMESHEET ENTRIES (Daily entries with project allocation)
-- ============================================================================
DROP TABLE IF EXISTS `hr_timesheet_entries`;
CREATE TABLE `hr_timesheet_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `timesheet_id` int NOT NULL,
  `entry_date` date NOT NULL,
  `donor_id` int NULL DEFAULT NULL,
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `activity_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `hours` decimal(5, 2) NOT NULL DEFAULT 0,
  `is_overtime` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_ts_entry_timesheet_idx` (`timesheet_id`),
  INDEX `hr_ts_entry_date_idx` (`entry_date`),
  INDEX `hr_ts_entry_donor_idx` (`donor_id`),
  CONSTRAINT `fk_ts_entry_timesheet` FOREIGN KEY (`timesheet_id`) REFERENCES `hr_timesheets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ts_entry_donor` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.9 PAYROLL PERIODS
-- ============================================================================
DROP TABLE IF EXISTS `hr_payroll_periods`;
CREATE TABLE `hr_payroll_periods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `period_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `period_month` int NOT NULL,
  `period_year` int NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `processed_by` int NULL DEFAULT NULL,
  `processed_at` datetime(3) NULL,
  `approved_by` int NULL DEFAULT NULL,
  `approved_at` datetime(3) NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_payroll_period_unique` (`period_month`, `period_year`),
  INDEX `hr_payroll_period_status_idx` (`status`)
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.10 PAYROLL RECORDS (Per Employee Per Period)
-- ============================================================================
DROP TABLE IF EXISTS `hr_payroll_records`;
CREATE TABLE `hr_payroll_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `payroll_period_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `contract_id` int NULL DEFAULT NULL,
  
  -- Earnings
  `basic_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `transport_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `housing_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `field_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `overtime_pay` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `other_allowances` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `gross_pay` decimal(15, 2) NOT NULL DEFAULT 0.00,
  
  -- Deductions
  `tax_paye` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `nssa_employee` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `nssa_employer` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `pension_employee` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `pension_employer` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `medical_aid` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `loan_deduction` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `advance_recovery` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `other_deductions` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `total_deductions` decimal(15, 2) NOT NULL DEFAULT 0.00,
  
  `net_pay` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  
  -- Cost allocation (NGO: split across donors/projects)
  `cost_allocation_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `payment_date` date NULL,
  `payment_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_payroll_record_unique` (`payroll_period_id`, `employee_id`),
  INDEX `hr_payroll_record_employee_idx` (`employee_id`),
  INDEX `hr_payroll_record_status_idx` (`status`),
  CONSTRAINT `fk_payroll_period` FOREIGN KEY (`payroll_period_id`) REFERENCES `hr_payroll_periods` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payroll_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payroll_contract` FOREIGN KEY (`contract_id`) REFERENCES `hr_contracts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.11 PERFORMANCE REVIEWS
-- ============================================================================
DROP TABLE IF EXISTS `hr_performance_reviews`;
CREATE TABLE `hr_performance_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `review_period` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `review_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ANNUAL',
  `reviewer_id` int NOT NULL,
  `review_date` date NOT NULL,
  
  -- Scores (1-5 scale)
  `job_knowledge_score` decimal(3, 1) NULL,
  `quality_of_work_score` decimal(3, 1) NULL,
  `productivity_score` decimal(3, 1) NULL,
  `communication_score` decimal(3, 1) NULL,
  `teamwork_score` decimal(3, 1) NULL,
  `initiative_score` decimal(3, 1) NULL,
  `attendance_score` decimal(3, 1) NULL,
  `overall_score` decimal(3, 1) NULL,
  `overall_rating` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  `goals_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `achievements` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `areas_for_improvement` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `training_recommendations` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `employee_comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `reviewer_comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `employee_acknowledged` tinyint(1) NOT NULL DEFAULT 0,
  `acknowledged_at` datetime(3) NULL,
  
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_perf_review_employee_idx` (`employee_id`),
  INDEX `hr_perf_review_reviewer_idx` (`reviewer_id`),
  INDEX `hr_perf_review_status_idx` (`status`),
  INDEX `hr_perf_review_period_idx` (`review_period`),
  CONSTRAINT `fk_perf_review_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_perf_review_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.12 TRAINING RECORDS
-- ============================================================================
DROP TABLE IF EXISTS `hr_training_records`;
CREATE TABLE `hr_training_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `training_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `training_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EXTERNAL',
  `provider` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `start_date` date NOT NULL,
  `end_date` date NULL,
  `duration_hours` decimal(10, 2) NULL,
  `cost` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `donor_id` int NULL DEFAULT NULL,
  `certification_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `certification_expiry` date NULL,
  `certificate_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PLANNED',
  `approved_by` int NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_training_employee_idx` (`employee_id`),
  INDEX `hr_training_status_idx` (`status`),
  INDEX `hr_training_donor_idx` (`donor_id`),
  CONSTRAINT `fk_training_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_training_donor` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_training_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.13 DISCIPLINARY RECORDS
-- ============================================================================
DROP TABLE IF EXISTS `hr_disciplinary_records`;
CREATE TABLE `hr_disciplinary_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `incident_date` date NOT NULL,
  `incident_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WARNING',
  `severity` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MINOR',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_taken` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `warning_level` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `investigation_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `outcome` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `follow_up_date` date NULL,
  `follow_up_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `reported_by` int NOT NULL,
  `investigated_by` int NULL DEFAULT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `document_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_disciplinary_employee_idx` (`employee_id`),
  INDEX `hr_disciplinary_status_idx` (`status`),
  INDEX `hr_disciplinary_type_idx` (`incident_type`),
  CONSTRAINT `fk_disciplinary_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_disciplinary_reported` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_disciplinary_investigated` FOREIGN KEY (`investigated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.14 EXIT / SEPARATION MANAGEMENT
-- ============================================================================
DROP TABLE IF EXISTS `hr_exit_clearance`;
CREATE TABLE `hr_exit_clearance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `exit_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RESIGNATION',
  `exit_date` date NOT NULL,
  `notice_date` date NULL,
  `last_working_date` date NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- Clearance checklist
  `it_cleared` tinyint(1) NOT NULL DEFAULT 0,
  `it_cleared_by` int NULL DEFAULT NULL,
  `it_cleared_at` datetime(3) NULL,
  `finance_cleared` tinyint(1) NOT NULL DEFAULT 0,
  `finance_cleared_by` int NULL DEFAULT NULL,
  `finance_cleared_at` datetime(3) NULL,
  `hr_cleared` tinyint(1) NOT NULL DEFAULT 0,
  `hr_cleared_by` int NULL DEFAULT NULL,
  `hr_cleared_at` datetime(3) NULL,
  `assets_returned` tinyint(1) NOT NULL DEFAULT 0,
  `assets_cleared_by` int NULL DEFAULT NULL,
  `assets_cleared_at` datetime(3) NULL,
  `admin_cleared` tinyint(1) NOT NULL DEFAULT 0,
  `admin_cleared_by` int NULL DEFAULT NULL,
  `admin_cleared_at` datetime(3) NULL,
  
  -- Final Settlement
  `outstanding_leave_days` decimal(5, 1) NOT NULL DEFAULT 0,
  `leave_payment` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `outstanding_advances` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `final_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `gratuity` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `total_final_payment` decimal(15, 2) NOT NULL DEFAULT 0.00,
  
  -- Exit Interview
  `exit_interview_conducted` tinyint(1) NOT NULL DEFAULT 0,
  `exit_interview_date` date NULL,
  `exit_interview_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INITIATED',
  `completed_at` datetime(3) NULL,
  `processed_by` int NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_exit_employee_idx` (`employee_id`),
  INDEX `hr_exit_status_idx` (`status`),
  INDEX `hr_exit_date_idx` (`exit_date`),
  CONSTRAINT `fk_exit_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_exit_processed` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 2.15 HR DOCUMENTS (Employee document uploads)
-- ============================================================================
DROP TABLE IF EXISTS `hr_documents`;
CREATE TABLE `hr_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `document_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int NULL DEFAULT 0,
  `expiry_date` date NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `uploaded_by` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_documents_employee_idx` (`employee_id`),
  INDEX `hr_documents_type_idx` (`document_type`),
  CONSTRAINT `fk_hr_doc_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_doc_uploaded` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- STATUS VALUE REFERENCE:
-- ============================================================================
-- hr_employees.employment_type: FULL_TIME, PART_TIME, CONTRACT, CONSULTANT, VOLUNTEER, INTERN
-- hr_employees.employment_status: ACTIVE, ON_LEAVE, SUSPENDED, PROBATION, TERMINATED, RESIGNED
-- hr_employees.work_location: OFFICE, FIELD, REMOTE, HYBRID
-- hr_employees.gender: MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY
-- hr_employees.marital_status: SINGLE, MARRIED, DIVORCED, WIDOWED
-- hr_contracts.contract_type: PERMANENT, FIXED_TERM, CONSULTANCY, VOLUNTEER, INTERN
-- hr_contracts.status: DRAFT, ACTIVE, EXPIRED, TERMINATED, RENEWED
-- hr_leave_requests.status: PENDING, APPROVED, REJECTED, CANCELLED
-- hr_timesheets.status: DRAFT, SUBMITTED, SUPERVISOR_APPROVED, HR_APPROVED, FINANCE_APPROVED, REJECTED
-- hr_payroll_periods.status: OPEN, PROCESSING, APPROVED, CLOSED
-- hr_payroll_records.status: DRAFT, CALCULATED, APPROVED, PAID
-- hr_performance_reviews.review_type: PROBATION, MID_YEAR, ANNUAL, SPECIAL
-- hr_performance_reviews.overall_rating: OUTSTANDING, EXCEEDS_EXPECTATIONS, MEETS_EXPECTATIONS, NEEDS_IMPROVEMENT, UNSATISFACTORY
-- hr_performance_reviews.status: DRAFT, SUBMITTED, ACKNOWLEDGED, FINALIZED
-- hr_training_records.training_type: INTERNAL, EXTERNAL, ONLINE, WORKSHOP, CONFERENCE
-- hr_training_records.status: PLANNED, APPROVED, IN_PROGRESS, COMPLETED, CANCELLED
-- hr_disciplinary_records.incident_type: WARNING, MISCONDUCT, PERFORMANCE, ATTENDANCE, POLICY_VIOLATION
-- hr_disciplinary_records.severity: MINOR, MODERATE, MAJOR, GROSS
-- hr_disciplinary_records.warning_level: VERBAL, FIRST_WRITTEN, FINAL_WRITTEN, DISMISSAL
-- hr_disciplinary_records.status: OPEN, INVESTIGATING, RESOLVED, CLOSED, APPEALED
-- hr_exit_clearance.exit_type: RESIGNATION, TERMINATION, CONTRACT_END, RETIREMENT, REDUNDANCY, DEATH
-- hr_exit_clearance.status: INITIATED, IN_PROGRESS, COMPLETED, CANCELLED
-- hr_documents.document_type: CV, CONTRACT, CERTIFICATE, ID_DOCUMENT, PASSPORT, TAX_DOCUMENT, BANK_LETTER, OTHER
-- request_items.category: PROCUREMENT, TRANSPORT, ACCOMMODATION, REIMBURSEMENT, PER_DIEM, TRAINING, MAINTENANCE, OTHER
