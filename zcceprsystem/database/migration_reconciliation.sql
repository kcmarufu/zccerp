-- ============================================================================
-- MIGRATION: Add Reconciliation Support + DISPATCHED Status
-- Run this against the finance_erp database
-- ============================================================================

-- Add new request statuses for reconciliation workflow
INSERT IGNORE INTO request_statuses (status_name, status_description) VALUES
  ('PENDING_RECONCILIATION', 'Dispatched - awaiting reconciliation from requester'),
  ('RECONCILED', 'Reconciliation submitted and approved by Finance'),
  ('RECON_PENDING_LEAD', 'Reconciliation submitted - awaiting Program Lead/HOP approval'),
  ('RECON_PENDING_FINANCE', 'Reconciliation approved by lead - awaiting Finance review');

-- Create reconciliations table
CREATE TABLE IF NOT EXISTS reconciliations (
  id INT NOT NULL AUTO_INCREMENT,
  request_id INT NOT NULL,
  reconciled_by INT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
  total_spent DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  total_returned DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  finance_reviewer_id INT NULL,
  finance_comments TEXT NULL,
  reviewed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX idx_recon_request (request_id),
  INDEX idx_recon_user (reconciled_by),
  INDEX idx_recon_status (status),
  CONSTRAINT fk_recon_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_recon_user FOREIGN KEY (reconciled_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_recon_reviewer FOREIGN KEY (finance_reviewer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create reconciliation items table (line-level reconciliation)
CREATE TABLE IF NOT EXISTS reconciliation_items (
  id INT NOT NULL AUTO_INCREMENT,
  reconciliation_id INT NOT NULL,
  request_item_id INT NULL,
  description VARCHAR(500) NOT NULL,
  budgeted_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  actual_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  variance DECIMAL(15, 2) GENERATED ALWAYS AS (budgeted_amount - actual_amount) STORED,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX idx_recon_item_recon (reconciliation_id),
  CONSTRAINT fk_recon_item_recon FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
  CONSTRAINT fk_recon_item_req_item FOREIGN KEY (request_item_id) REFERENCES request_items(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
