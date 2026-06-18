-- ============================================================================
-- Migration: Projects Entity + Procurement Fixes
-- ZCC ERP System
-- Run this migration after procurement_module_migration.sql
-- ============================================================================

-- ============================================================================
-- 1. PROJECTS TABLE
-- Hierarchy: Donor → Projects → Budget Lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_code VARCHAR(50) UNIQUE NOT NULL,
  project_name VARCHAR(255) NOT NULL,
  donor_id INT NOT NULL,
  department_id INT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  total_budget DECIMAL(15,2) DEFAULT 0.00,
  last_request_seq INT DEFAULT 0,   -- per-project sequence counter for float refs
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT,
  FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE RESTRICT,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_project_donor (donor_id),
  INDEX idx_project_code (project_code),
  INDEX idx_project_active (is_active)
);

-- ============================================================================
-- 2. ADD project_id TO budget_lines
-- ============================================================================
ALTER TABLE budget_lines
  ADD COLUMN project_id INT NULL AFTER donor_id;

ALTER TABLE budget_lines
  ADD CONSTRAINT budget_lines_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE budget_lines
  ADD INDEX idx_budget_project (project_id);

-- ============================================================================
-- 3. ADD project_id TO requests (float requisitions)
-- ============================================================================
ALTER TABLE requests
  ADD COLUMN project_id INT NULL AFTER donor_id;

ALTER TABLE requests
  ADD CONSTRAINT requests_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE requests
  ADD INDEX idx_request_project (project_id);

-- ============================================================================
-- 4. ADD project_id TO proc_requests (procurement module)
-- ============================================================================
ALTER TABLE proc_requests
  ADD COLUMN project_id INT NULL AFTER donor_id;

ALTER TABLE proc_requests
  ADD CONSTRAINT proc_requests_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE proc_requests
  ADD INDEX idx_proc_request_project (project_id);

-- ============================================================================
-- 5. FIX proc_approval_logs: Change ENUM to VARCHAR for flexibility
-- This allows 'RESUBMITTED' and future action types without schema changes
-- ============================================================================
ALTER TABLE proc_approval_logs
  MODIFY COLUMN action VARCHAR(50) NOT NULL;

-- ============================================================================
-- 6. CREATE proc_request_attachments (was missing from original migration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS proc_request_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  attachment_type ENUM('PHOTO','QUOTATION','SPECIFICATION','OTHER') DEFAULT 'OTHER',
  description TEXT,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES proc_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_pra_request (request_id),
  INDEX idx_pra_uploaded_by (uploaded_by)
);

-- ============================================================================
-- End of migration
-- ============================================================================
