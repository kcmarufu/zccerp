-- ============================================================================
-- FINANCE MODULE - ERP SYSTEM
-- SQL Schema for Request-Based Procurement & Budget Tracking
-- 4-Tier Approval Workflow: User -> Program Lead -> HOP -> Finance Clerk
-- ============================================================================

-- Enable strict mode for data integrity
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';

-- ============================================================================
-- ENUM/LOOKUP TABLES
-- ============================================================================

-- User Roles Table
CREATE TABLE roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    role_description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles
INSERT INTO roles (role_name, role_description) VALUES
    ('GENERAL_USER', 'Can create and submit procurement requests'),
    ('PROGRAM_LEAD', 'Supervisor - First level approval for department requests'),
    ('HEAD_OF_PROGRAMS', 'Secondary approval authority'),
    ('FINANCE_CLERK', 'Final approval authority and budget management');

-- Request Status Table
CREATE TABLE request_statuses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    status_name VARCHAR(50) NOT NULL UNIQUE,
    status_description VARCHAR(255)
);

INSERT INTO request_statuses (status_name, status_description) VALUES
    ('DRAFT', 'Request saved but not submitted'),
    ('PENDING_LEAD_APPROVAL', 'Awaiting Program Lead approval'),
    ('PENDING_HOP_APPROVAL', 'Awaiting Head of Programs approval'),
    ('PENDING_FINANCE_APPROVAL', 'Awaiting Finance Clerk final approval'),
    ('APPROVED', 'Fully approved - Budget deducted'),
    ('REJECTED', 'Request rejected at any stage'),
    ('CANCELLED', 'Request cancelled by requester');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Departments Table
CREATE TABLE departments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    department_name VARCHAR(100) NOT NULL UNIQUE,
    department_code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_department_code (department_code),
    INDEX idx_department_active (is_active)
);

-- Users Table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    department_id INT NOT NULL,
    role_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
    
    INDEX idx_user_email (email),
    INDEX idx_user_department (department_id),
    INDEX idx_user_role (role_id),
    INDEX idx_user_active (is_active)
);

-- Budget Lines Table
CREATE TABLE budget_lines (
    id INT PRIMARY KEY AUTO_INCREMENT,
    budget_code VARCHAR(50) NOT NULL UNIQUE,
    budget_name VARCHAR(255) NOT NULL,
    department_id INT NOT NULL,
    fiscal_year INT NOT NULL,
    allocated_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    spent_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    balance DECIMAL(15, 2) GENERATED ALWAYS AS (allocated_amount - spent_amount) STORED,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT,
    
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_budget_department (department_id),
    INDEX idx_budget_fiscal_year (fiscal_year),
    INDEX idx_budget_active (is_active),
    INDEX idx_budget_code (budget_code),
    
    -- Constraint to prevent negative balance
    CONSTRAINT chk_spent_amount CHECK (spent_amount >= 0),
    CONSTRAINT chk_allocated_amount CHECK (allocated_amount >= 0)
);

-- Requests Table (Procurement Requests)
CREATE TABLE requests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    request_number VARCHAR(50) NOT NULL UNIQUE,
    requester_id INT NOT NULL,
    department_id INT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    justification TEXT,
    priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') DEFAULT 'MEDIUM',
    
    -- Timestamps for tracking
    submitted_at TIMESTAMP NULL,
    lead_approved_at TIMESTAMP NULL,
    hop_approved_at TIMESTAMP NULL,
    finance_approved_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Version for optimistic locking (race condition prevention)
    version INT NOT NULL DEFAULT 1,
    
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    FOREIGN KEY (status) REFERENCES request_statuses(status_name) ON DELETE RESTRICT,
    
    INDEX idx_request_requester (requester_id),
    INDEX idx_request_department (department_id),
    INDEX idx_request_status (status),
    INDEX idx_request_number (request_number),
    INDEX idx_request_submitted (submitted_at)
);

-- Request Items Table (Line Items for each Request)
CREATE TABLE request_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    request_id INT NOT NULL,
    item_description VARCHAR(500) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit_of_measure VARCHAR(50) DEFAULT 'EACH',
    unit_price DECIMAL(15, 2) NOT NULL,
    total_price DECIMAL(15, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    budget_line_id INT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
    FOREIGN KEY (budget_line_id) REFERENCES budget_lines(id) ON DELETE RESTRICT,
    
    INDEX idx_item_request (request_id),
    INDEX idx_item_budget_line (budget_line_id),
    
    CONSTRAINT chk_quantity CHECK (quantity > 0),
    CONSTRAINT chk_unit_price CHECK (unit_price >= 0)
);

-- Approval Logs Table (Audit Trail)
CREATE TABLE approval_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    request_id INT NOT NULL,
    approver_id INT NOT NULL,
    approver_role VARCHAR(50) NOT NULL,
    action ENUM('APPROVED', 'REJECTED', 'RETURNED', 'SUBMITTED', 'CANCELLED', 'REVERSED') NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    comments TEXT,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_approval_request (request_id),
    INDEX idx_approval_approver (approver_id),
    INDEX idx_approval_action (action),
    INDEX idx_approval_timestamp (created_at)
);

-- Budget Transaction Logs (For audit and rollback capability)
CREATE TABLE budget_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    budget_line_id INT NOT NULL,
    request_id INT,
    transaction_type ENUM('ALLOCATION', 'TOP_UP', 'DEDUCTION', 'REVERSAL', 'ADJUSTMENT') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    balance_before DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    description TEXT,
    performed_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (budget_line_id) REFERENCES budget_lines(id) ON DELETE RESTRICT,
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT,
    
    INDEX idx_budget_trans_budget_line (budget_line_id),
    INDEX idx_budget_trans_request (request_id),
    INDEX idx_budget_trans_timestamp (created_at)
);

-- ============================================================================
-- VIEWS FOR REPORTING
-- ============================================================================

-- View: Request Summary with Approver Details
CREATE VIEW vw_request_summary AS
SELECT 
    r.id,
    r.request_number,
    r.status,
    r.total_amount,
    r.priority,
    r.justification,
    r.submitted_at,
    r.created_at,
    -- Requester Info
    u.first_name AS requester_first_name,
    u.last_name AS requester_last_name,
    u.email AS requester_email,
    -- Department Info
    d.department_name,
    d.department_code,
    -- Lead Approval
    (SELECT CONCAT(ua.first_name, ' ', ua.last_name) 
     FROM approval_logs al 
     JOIN users ua ON al.approver_id = ua.id 
     WHERE al.request_id = r.id AND al.approver_role = 'PROGRAM_LEAD' AND al.action = 'APPROVED'
     ORDER BY al.created_at DESC LIMIT 1) AS lead_approver_name,
    r.lead_approved_at,
    -- HOP Approval
    (SELECT CONCAT(ua.first_name, ' ', ua.last_name) 
     FROM approval_logs al 
     JOIN users ua ON al.approver_id = ua.id 
     WHERE al.request_id = r.id AND al.approver_role = 'HEAD_OF_PROGRAMS' AND al.action = 'APPROVED'
     ORDER BY al.created_at DESC LIMIT 1) AS hop_approver_name,
    r.hop_approved_at,
    -- Finance Approval
    (SELECT CONCAT(ua.first_name, ' ', ua.last_name) 
     FROM approval_logs al 
     JOIN users ua ON al.approver_id = ua.id 
     WHERE al.request_id = r.id AND al.approver_role = 'FINANCE_CLERK' AND al.action = 'APPROVED'
     ORDER BY al.created_at DESC LIMIT 1) AS finance_approver_name,
    r.finance_approved_at
FROM requests r
JOIN users u ON r.requester_id = u.id
JOIN departments d ON r.department_id = d.id;

-- View: Budget Line Summary with Utilization
CREATE VIEW vw_budget_summary AS
SELECT 
    bl.id,
    bl.budget_code,
    bl.budget_name,
    bl.fiscal_year,
    bl.allocated_amount,
    bl.spent_amount,
    bl.balance,
    ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) AS utilization_percentage,
    d.department_name,
    d.department_code,
    bl.is_active
FROM budget_lines bl
JOIN departments d ON bl.department_id = d.id;

-- ============================================================================
-- STORED PROCEDURES
-- ============================================================================

DELIMITER //

-- Procedure: Generate unique request number
CREATE PROCEDURE sp_generate_request_number(OUT new_request_number VARCHAR(50))
BEGIN
    DECLARE current_year VARCHAR(4);
    DECLARE sequence_num INT;
    
    SET current_year = YEAR(CURRENT_DATE);
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(request_number, 8) AS UNSIGNED)), 0) + 1
    INTO sequence_num
    FROM requests
    WHERE request_number LIKE CONCAT('REQ-', current_year, '-%');
    
    SET new_request_number = CONCAT('REQ-', current_year, '-', LPAD(sequence_num, 6, '0'));
END //

-- Procedure: Final Approval with Budget Deduction (Race Condition Protected)
CREATE PROCEDURE sp_finance_approve_request(
    IN p_request_id INT,
    IN p_approver_id INT,
    IN p_comments TEXT,
    IN p_ip_address VARCHAR(45),
    IN p_expected_version INT,
    OUT p_result VARCHAR(50),
    OUT p_message TEXT
)
BEGIN
    DECLARE v_current_status VARCHAR(50);
    DECLARE v_current_version INT;
    DECLARE v_total_amount DECIMAL(15, 2);
    DECLARE v_budget_line_id INT;
    DECLARE v_current_balance DECIMAL(15, 2);
    DECLARE v_item_amount DECIMAL(15, 2);
    DECLARE v_insufficient_budget BOOLEAN DEFAULT FALSE;
    DECLARE v_done INT DEFAULT FALSE;
    
    -- Cursor for request items
    DECLARE item_cursor CURSOR FOR 
        SELECT ri.budget_line_id, ri.total_price
        FROM request_items ri
        WHERE ri.request_id = p_request_id;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
    
    -- Start transaction with SERIALIZABLE isolation for race condition prevention
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    START TRANSACTION;
    
    -- Lock the request row and get current state
    SELECT status, version, total_amount 
    INTO v_current_status, v_current_version, v_total_amount
    FROM requests 
    WHERE id = p_request_id 
    FOR UPDATE;
    
    -- Validate request exists
    IF v_current_status IS NULL THEN
        SET p_result = 'ERROR';
        SET p_message = 'Request not found';
        ROLLBACK;
    -- Validate correct status
    ELSEIF v_current_status != 'PENDING_FINANCE_APPROVAL' THEN
        SET p_result = 'ERROR';
        SET p_message = CONCAT('Invalid request status: ', v_current_status);
        ROLLBACK;
    -- Optimistic locking check
    ELSEIF v_current_version != p_expected_version THEN
        SET p_result = 'ERROR';
        SET p_message = 'Request has been modified by another user. Please refresh and try again.';
        ROLLBACK;
    ELSE
        -- Check budget availability for each item
        OPEN item_cursor;
        
        check_loop: LOOP
            FETCH item_cursor INTO v_budget_line_id, v_item_amount;
            IF v_done THEN
                LEAVE check_loop;
            END IF;
            
            -- Lock budget line and check balance
            SELECT balance INTO v_current_balance
            FROM budget_lines
            WHERE id = v_budget_line_id
            FOR UPDATE;
            
            IF v_current_balance < v_item_amount THEN
                SET v_insufficient_budget = TRUE;
                SET p_message = CONCAT('Insufficient budget in line ID: ', v_budget_line_id, 
                                       '. Available: ', v_current_balance, ', Required: ', v_item_amount);
                LEAVE check_loop;
            END IF;
        END LOOP;
        
        CLOSE item_cursor;
        
        IF v_insufficient_budget THEN
            SET p_result = 'ERROR';
            ROLLBACK;
        ELSE
            -- Process budget deductions for each item
            SET v_done = FALSE;
            OPEN item_cursor;
            
            deduct_loop: LOOP
                FETCH item_cursor INTO v_budget_line_id, v_item_amount;
                IF v_done THEN
                    LEAVE deduct_loop;
                END IF;
                
                -- Get current balance for logging
                SELECT balance INTO v_current_balance
                FROM budget_lines
                WHERE id = v_budget_line_id;
                
                -- Update spent amount (balance is auto-calculated)
                UPDATE budget_lines
                SET spent_amount = spent_amount + v_item_amount
                WHERE id = v_budget_line_id;
                
                -- Log the transaction
                INSERT INTO budget_transactions 
                    (budget_line_id, request_id, transaction_type, amount, 
                     balance_before, balance_after, description, performed_by)
                VALUES 
                    (v_budget_line_id, p_request_id, 'DEDUCTION', v_item_amount,
                     v_current_balance, v_current_balance - v_item_amount,
                     CONCAT('Budget deduction for request approval'),
                     p_approver_id);
            END LOOP;
            
            CLOSE item_cursor;
            
            -- Update request status
            UPDATE requests
            SET status = 'APPROVED',
                finance_approved_at = CURRENT_TIMESTAMP,
                completed_at = CURRENT_TIMESTAMP,
                version = version + 1
            WHERE id = p_request_id;
            
            -- Log the approval
            INSERT INTO approval_logs 
                (request_id, approver_id, approver_role, action, 
                 previous_status, new_status, comments, ip_address)
            VALUES 
                (p_request_id, p_approver_id, 'FINANCE_CLERK', 'APPROVED',
                 'PENDING_FINANCE_APPROVAL', 'APPROVED', p_comments, p_ip_address);
            
            SET p_result = 'SUCCESS';
            SET p_message = 'Request approved and budget deducted successfully';
            COMMIT;
        END IF;
    END IF;
END //

-- Procedure: Top Up Budget Line (Finance Clerk only)
CREATE PROCEDURE sp_topup_budget_line(
    IN p_budget_line_id INT,
    IN p_amount DECIMAL(15, 2),
    IN p_performed_by INT,
    IN p_description TEXT,
    OUT p_result VARCHAR(50),
    OUT p_message TEXT
)
BEGIN
    DECLARE v_current_balance DECIMAL(15, 2);
    DECLARE v_current_allocated DECIMAL(15, 2);
    
    START TRANSACTION;
    
    -- Lock and get current values
    SELECT balance, allocated_amount 
    INTO v_current_balance, v_current_allocated
    FROM budget_lines
    WHERE id = p_budget_line_id
    FOR UPDATE;
    
    IF v_current_balance IS NULL THEN
        SET p_result = 'ERROR';
        SET p_message = 'Budget line not found';
        ROLLBACK;
    ELSEIF p_amount <= 0 THEN
        SET p_result = 'ERROR';
        SET p_message = 'Top-up amount must be positive';
        ROLLBACK;
    ELSE
        -- Update allocated amount
        UPDATE budget_lines
        SET allocated_amount = allocated_amount + p_amount
        WHERE id = p_budget_line_id;
        
        -- Log the transaction
        INSERT INTO budget_transactions 
            (budget_line_id, transaction_type, amount, 
             balance_before, balance_after, description, performed_by)
        VALUES 
            (p_budget_line_id, 'TOP_UP', p_amount,
             v_current_balance, v_current_balance + p_amount,
             p_description, p_performed_by);
        
        SET p_result = 'SUCCESS';
        SET p_message = CONCAT('Budget topped up by ', p_amount, '. New balance: ', v_current_balance + p_amount);
        COMMIT;
    END IF;
END //

DELIMITER ;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DELIMITER //

-- Trigger: Update request total when items change
CREATE TRIGGER trg_update_request_total_insert
AFTER INSERT ON request_items
FOR EACH ROW
BEGIN
    UPDATE requests 
    SET total_amount = (
        SELECT COALESCE(SUM(total_price), 0) 
        FROM request_items 
        WHERE request_id = NEW.request_id
    )
    WHERE id = NEW.request_id;
END //

CREATE TRIGGER trg_update_request_total_update
AFTER UPDATE ON request_items
FOR EACH ROW
BEGIN
    UPDATE requests 
    SET total_amount = (
        SELECT COALESCE(SUM(total_price), 0) 
        FROM request_items 
        WHERE request_id = NEW.request_id
    )
    WHERE id = NEW.request_id;
END //

CREATE TRIGGER trg_update_request_total_delete
AFTER DELETE ON request_items
FOR EACH ROW
BEGIN
    UPDATE requests 
    SET total_amount = (
        SELECT COALESCE(SUM(total_price), 0) 
        FROM request_items 
        WHERE request_id = OLD.request_id
    )
    WHERE id = OLD.request_id;
END //

-- Trigger: Prevent budget overspending
CREATE TRIGGER trg_prevent_overspend
BEFORE UPDATE ON budget_lines
FOR EACH ROW
BEGIN
    IF NEW.spent_amount > NEW.allocated_amount THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot exceed allocated budget amount';
    END IF;
END //

DELIMITER ;

-- ============================================================================
-- SAMPLE DATA (For Testing)
-- ============================================================================

-- Insert sample departments
INSERT INTO departments (department_name, department_code, description) VALUES
    ('Information Technology', 'IT', 'Technology and systems department'),
    ('Human Resources', 'HR', 'Personnel management'),
    ('Finance', 'FIN', 'Financial operations'),
    ('Operations', 'OPS', 'Daily operations management'),
    ('Marketing', 'MKT', 'Marketing and communications');

-- Insert sample users (password is 'password123' hashed with bcrypt)
INSERT INTO users (employee_id, email, password_hash, first_name, last_name, department_id, role_id) VALUES
    ('EMP001', 'john.doe@company.com', '$2b$10$example_hash_here', 'John', 'Doe', 1, 1),
    ('EMP002', 'jane.smith@company.com', '$2b$10$example_hash_here', 'Jane', 'Smith', 1, 2),
    ('EMP003', 'bob.wilson@company.com', '$2b$10$example_hash_here', 'Bob', 'Wilson', 3, 3),
    ('EMP004', 'alice.finance@company.com', '$2b$10$example_hash_here', 'Alice', 'Finance', 3, 4),
    ('EMP005', 'charlie.ops@company.com', '$2b$10$example_hash_here', 'Charlie', 'Operations', 4, 1);

-- Insert sample budget lines
INSERT INTO budget_lines (budget_code, budget_name, department_id, fiscal_year, allocated_amount, created_by) VALUES
    ('IT-2026-HW', 'IT Hardware', 1, 2026, 50000.00, 4),
    ('IT-2026-SW', 'IT Software', 1, 2026, 30000.00, 4),
    ('IT-2026-TR', 'IT Training', 1, 2026, 15000.00, 4),
    ('HR-2026-RC', 'HR Recruitment', 2, 2026, 25000.00, 4),
    ('OPS-2026-SP', 'Operations Supplies', 4, 2026, 20000.00, 4);
