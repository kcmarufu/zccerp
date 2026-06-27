-- ============================================================================
-- Procurement Module - Database Migration
-- ZCC ERP System
-- ============================================================================

-- Purchase Request Status ENUM
-- DRAFT → PENDING_DEPT_APPROVAL → PENDING_FINANCE_APPROVAL → 
-- PENDING_PROCUREMENT → PENDING_COMMITTEE → PENDING_FINAL_FINANCE → 
-- COMPLETED | REJECTED | CANCELLED

-- ============================================================================
-- VENDORS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS proc_vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_code VARCHAR(30) UNIQUE NOT NULL,
  company_name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(150),
  email VARCHAR(150),
  phone VARCHAR(50),
  address TEXT,
  tin_number VARCHAR(50),
  registration_number VARCHAR(100),
  category VARCHAR(100),
  is_prequalified BOOLEAN DEFAULT FALSE,
  prequalification_expiry DATE,
  rating DECIMAL(3,1) DEFAULT 0.0,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_vendor_code (vendor_code),
  INDEX idx_vendor_active (is_active)
);

-- ============================================================================
-- PURCHASE REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS proc_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(50) UNIQUE NOT NULL,
  requester_id INT NOT NULL,
  department_id INT NOT NULL,
  donor_id INT,
  title VARCHAR(300) NOT NULL,
  justification TEXT NOT NULL,
  expected_delivery_date DATE,
  priority ENUM('LOW','MEDIUM','HIGH','URGENT') DEFAULT 'MEDIUM',
  total_estimated_amount DECIMAL(15,2) DEFAULT 0.00,
  status ENUM(
    'DRAFT',
    'PENDING_DEPT_APPROVAL',
    'PENDING_FINANCE_APPROVAL',
    'PENDING_PROCUREMENT',
    'PENDING_COMMITTEE',
    'PENDING_FINAL_FINANCE',
    'COMPLETED',
    'REJECTED',
    'CANCELLED'
  ) DEFAULT 'DRAFT',
  rejection_reason TEXT,
  submitted_at TIMESTAMP NULL,
  dept_approved_at TIMESTAMP NULL,
  finance_approved_at TIMESTAMP NULL,
  procurement_assigned_at TIMESTAMP NULL,
  committee_reviewed_at TIMESTAMP NULL,
  final_finance_approved_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (requester_id) REFERENCES users(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE SET NULL,
  INDEX idx_proc_status (status),
  INDEX idx_proc_requester (requester_id),
  INDEX idx_proc_department (department_id),
  INDEX idx_proc_code (request_code)
);

-- ============================================================================
-- PURCHASE REQUEST ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS proc_request_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  budget_line_id INT,
  item_description VARCHAR(500) NOT NULL,
  specifications TEXT,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_of_measure VARCHAR(50) DEFAULT 'unit',
  estimated_unit_price DECIMAL(15,2) DEFAULT 0.00,
  estimated_total DECIMAL(15,2) GENERATED ALWAYS AS (quantity * estimated_unit_price) STORED,
  actual_unit_price DECIMAL(15,2),
  actual_total DECIMAL(15,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES proc_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (budget_line_id) REFERENCES budget_lines(id) ON DELETE SET NULL,
  INDEX idx_proc_item_request (request_id)
);

-- ============================================================================
-- PROCUREMENT APPROVAL LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS proc_approval_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  actor_id INT NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  action ENUM('SUBMITTED','APPROVED','REJECTED','CANCELLED','ASSIGNED_TO_PROCUREMENT','SUBMITTED_TO_COMMITTEE','COMMITTEE_APPROVED','COMMITTEE_REJECTED','FINAL_APPROVED','COMPLETED') NOT NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  comments TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES proc_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_proc_log_request (request_id),
  INDEX idx_proc_log_actor (actor_id),
  INDEX idx_proc_log_created (created_at)
);

-- ============================================================================
-- QUOTATIONS TABLE  
-- ============================================================================
CREATE TABLE IF NOT EXISTS proc_quotations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  vendor_id INT,
  vendor_name VARCHAR(200) NOT NULL,
  vendor_email VARCHAR(150),
  vendor_phone VARCHAR(50),
  quotation_number VARCHAR(100),
  total_amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  validity_date DATE,
  delivery_timeline VARCHAR(200),
  terms_and_conditions TEXT,
  notes TEXT,
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  file_size BIGINT,
  is_selected BOOLEAN DEFAULT FALSE,
  selected_at TIMESTAMP NULL,
  selected_by INT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES proc_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES proc_vendors(id) ON DELETE SET NULL,
  FOREIGN KEY (selected_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_quot_request (request_id),
  INDEX idx_quot_selected (is_selected)
);

-- ============================================================================
-- QUOTATION ITEMS (line items per quotation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS proc_quotation_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT NOT NULL,
  request_item_id INT,
  description VARCHAR(500) NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(15,2) NOT NULL,
  total_price DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  FOREIGN KEY (quotation_id) REFERENCES proc_quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (request_item_id) REFERENCES proc_request_items(id) ON DELETE SET NULL,
  INDEX idx_qitem_quotation (quotation_id)
);

-- ============================================================================
-- COMMITTEE REVIEWS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS proc_committee_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  selected_quotation_id INT,
  reviewer_id INT NOT NULL,
  decision ENUM('APPROVED','REJECTED','DEFERRED') NOT NULL,
  justification TEXT,
  conditions TEXT,
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES proc_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_quotation_id) REFERENCES proc_quotations(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_id) REFERENCES users(id),
  INDEX idx_committee_request (request_id)
);

-- ============================================================================
-- ROLES EXTENSION — Add Procurement roles to the roles table if not present
-- ============================================================================
INSERT IGNORE INTO roles (role_name, role_description, created_at) VALUES
  ('PROCUREMENT_OFFICER', 'Procurement team member who manages vendors and quotations', NOW()),
  ('PROCUREMENT_COMMITTEE', 'Committee member who reviews and approves selected quotations', NOW());

-- ============================================================================
-- SAMPLE DATA: Test vendors
-- ============================================================================
INSERT IGNORE INTO proc_vendors (vendor_code, company_name, contact_person, email, phone, category, is_prequalified, rating, created_at) VALUES
  ('VND-001', 'TechSupply Ltd', 'John Smith', 'john@techsupply.com', '+260-96-1234567', 'IT Equipment', TRUE, 4.5, NOW()),
  ('VND-002', 'Office Essentials Co', 'Mary Johnson', 'mary@officeessentials.com', '+260-97-7654321', 'Office Supplies', TRUE, 4.2, NOW()),
  ('VND-003', 'BuildRight Construction', 'David Banda', 'david@buildright.com', '+260-95-5551234', 'Construction', FALSE, 3.8, NOW());
