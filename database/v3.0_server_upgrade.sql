-- ============================================================================
-- ERP Connect — Version 3.0 server upgrade
-- Generated 2026-11-06
--
-- Run ONCE on the server database before (or right after) deploying the
-- v3.0 code. Structure changes only — no existing data is lost. Safe to run
-- again: every step checks before it changes anything.
--
--   cd backend && node src/scripts/runSqlMigration.js ../database/v3.0_server_upgrade.sql
--
-- Take a backup first:
--   mysqldump -u <user> -p finance_erp > finance_erp_before_v3.sql
--
-- What it adds:
--   * Purchase request -> float requisition flow (workflow v2): new PR statuses
--     (department confirmation, returned to Procurement, pending payment), the
--     link between a PR and its float, payment batches and their reversal.
--   * Partner totals reset to the sum of their budget lines (the stored
--     counters had drifted on some partners).
--   * Budget reservations (v3.1): an approved float / purchase request holds
--     its funds for up to 10 working days; unpaid / undispatched past that it
--     is rejected automatically. Approved floats not yet dispatched are
--     reserved from the moment this runs, with a fresh 10-working-day clock.
--   * Finance approval separate from payment: who approved, the 5-working-day
--     proof-of-payment deadline, and payment method / bank on every payment.
--   * A deactivated "System" account that automatic actions are logged under.
-- Purchase requests already in the system keep the old flow.
-- ============================================================================

-- ============================================================================

-- 1. New statuses on proc_requests ------------------------------------------
ALTER TABLE proc_requests MODIFY COLUMN status ENUM(
  'DRAFT',
  'PENDING_DEPT_APPROVAL',
  'PENDING_GS_APPROVAL',
  'PENDING_FINANCE_APPROVAL',
  'PENDING_PROCUREMENT',
  'PENDING_COMMITTEE',
  'PENDING_HIGH_VALUE_APPROVAL',
  'PENDING_DEPT_CONFIRMATION',
  'PENDING_FINAL_FINANCE',
  'RETURNED_TO_PROCUREMENT',
  'PENDING_PAYMENT',
  'COMPLETED',
  'REJECTED',
  'CANCELLED'
) COLLATE utf8mb4_unicode_ci DEFAULT 'DRAFT';

-- 2. New columns on proc_requests -------------------------------------------
SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_requests' AND COLUMN_NAME = 'workflow_version') = 0,
  'ALTER TABLE proc_requests ADD COLUMN workflow_version TINYINT NOT NULL DEFAULT 1 COMMENT ''1 = legacy flow; 2 = unified PR→float flow'' AFTER status',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_requests' AND COLUMN_NAME = 'dept_confirmed_at') = 0,
  'ALTER TABLE proc_requests ADD COLUMN dept_confirmed_at TIMESTAMP NULL DEFAULT NULL AFTER committee_reviewed_at',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_requests' AND COLUMN_NAME = 'returned_to') = 0,
  'ALTER TABLE proc_requests ADD COLUMN returned_to VARCHAR(20) NULL DEFAULT NULL COMMENT ''Who amends a request sent back: PROCUREMENT or REQUESTER'' AFTER rejected_from_status',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_requests' AND COLUMN_NAME = 'payment_mode') = 0,
  'ALTER TABLE proc_requests ADD COLUMN payment_mode VARCHAR(10) NULL DEFAULT NULL COMMENT ''FULL or BATCH, chosen by Finance at approval'' AFTER returned_to',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_requests' AND COLUMN_NAME = 'payable_amount') = 0,
  'ALTER TABLE proc_requests ADD COLUMN payable_amount DECIMAL(15,2) NULL DEFAULT NULL COMMENT ''Amount approved for payment by Finance'' AFTER payment_mode',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_requests' AND COLUMN_NAME = 'float_request_id') = 0,
  'ALTER TABLE proc_requests ADD COLUMN float_request_id INT NULL DEFAULT NULL COMMENT ''The float requisition generated at Finance approval'' AFTER payable_amount',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_requests' AND INDEX_NAME = 'idx_proc_requests_float') = 0,
  'ALTER TABLE proc_requests ADD KEY idx_proc_requests_float (float_request_id), ADD CONSTRAINT fk_proc_requests_float FOREIGN KEY (float_request_id) REFERENCES requests (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3. Back-link on the float --------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'requests' AND COLUMN_NAME = 'source_proc_request_id') = 0,
  'ALTER TABLE requests ADD COLUMN source_proc_request_id INT NULL DEFAULT NULL COMMENT ''Set when the float was generated from a purchase request; such floats are paid in batches through the PR and need no reconciliation''',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'requests' AND INDEX_NAME = 'idx_requests_source_proc') = 0,
  'ALTER TABLE requests ADD UNIQUE KEY idx_requests_source_proc (source_proc_request_id), ADD CONSTRAINT fk_requests_source_proc FOREIGN KEY (source_proc_request_id) REFERENCES proc_requests (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4. Payment batches ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS proc_payment_batches (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  request_id        INT            NOT NULL,
  float_request_id  INT            NULL,
  batch_no          INT            NOT NULL,
  amount            DECIMAL(15,2)  NOT NULL,
  payment_date      DATE           NOT NULL,
  payment_reference VARCHAR(100)   NULL,
  notes             VARCHAR(500)   NULL,
  paid_by           INT            NOT NULL,
  created_at        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_proc_payment_batch (request_id, batch_no),
  KEY idx_proc_payment_float (float_request_id),

  CONSTRAINT fk_proc_payment_request FOREIGN KEY (request_id) REFERENCES proc_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_proc_payment_float   FOREIGN KEY (float_request_id) REFERENCES requests (id) ON DELETE SET NULL,
  CONSTRAINT fk_proc_payment_user    FOREIGN KEY (paid_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each proof of payment can name the batch it proves.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_request_pops' AND COLUMN_NAME = 'batch_id') = 0,
  'ALTER TABLE proc_request_pops ADD COLUMN batch_id INT NULL DEFAULT NULL, ADD KEY idx_proc_request_pops_batch (batch_id), ADD CONSTRAINT fk_proc_request_pops_batch FOREIGN KEY (batch_id) REFERENCES proc_payment_batches (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 5. Version 3.0: Finance can reverse a payment batch --------------------------
-- A reversed batch is kept (the trail needs it) and no longer counts as paid.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_payment_batches' AND COLUMN_NAME = 'reversed_at') = 0,
  'ALTER TABLE proc_payment_batches ADD COLUMN reversed_at DATETIME NULL DEFAULT NULL, ADD COLUMN reversed_by INT NULL DEFAULT NULL, ADD COLUMN reversal_reason VARCHAR(500) NULL DEFAULT NULL, ADD CONSTRAINT fk_proc_payment_reversed_by FOREIGN KEY (reversed_by) REFERENCES users (id)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 6. Version 3.0: partner totals tally with their budget lines -----------------
-- donors.total_spent / total_allocated are running counters that had drifted
-- from the budget lines they summarise (reversals were clamped at zero, lines
-- were edited). The budget lines are the source of truth; reset the counters
-- to what the lines say. Safe to re-run.
UPDATE donors d
  LEFT JOIN (SELECT donor_id, SUM(spent_amount) AS spent, SUM(allocated_amount) AS allocated
               FROM budget_lines GROUP BY donor_id) s ON s.donor_id = d.id
   SET d.total_spent = COALESCE(s.spent, 0),
       d.total_allocated = COALESCE(s.allocated, 0);

-- ============================================================================
-- Version 3.1 — appended from migration_budget_reservations.sql
-- ============================================================================

-- ============================================================================
-- Version 3.1: budget reservations, Finance approval separate from payment,
-- payment method / bank on every payment, and a system account for
-- automatic actions.
--
--  1. budget_reservations — once a float requisition or purchase request is
--     approved by Finance its amount is held on its budget lines for up to 10
--     working days. Nobody else can request or approve against held money.
--     Dispatch (float) or the first proof of payment (purchase request)
--     deducts the funds as normal; past 10 working days the request is
--     rejected automatically and the hold is released.
--  2. proc_requests.final_finance_approved_by — who approved the purchase
--     request for payment. That account must attach the proof of payment
--     within 5 working days or it cannot approve further purchase requests.
--  3. proc_payment_batches.payment_method / bank_name — every payment says how
--     it was paid and, for a bank payment, from which bank.
--  4. A deactivated "System" account that automatic actions are logged under,
--     so the audit trail never shows a person for something no person did.
--  5. Approved, undispatched floats already in the system are reserved from
--     the moment this runs, with a fresh 10-working-day clock.
--
-- Safe to re-run: every step checks before it changes anything.
-- ============================================================================

SET @db := DATABASE();

-- 1. Reservations ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_reservations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  source_type     ENUM('FLOAT','PR') NOT NULL COMMENT 'FLOAT = requests.id, PR = proc_requests.id',
  source_id       INT            NOT NULL,
  budget_line_id  INT            NOT NULL,
  amount          DECIMAL(15,2)  NOT NULL,
  status          ENUM('ACTIVE','CONSUMED','RELEASED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  reserved_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME       NULL DEFAULT NULL COMMENT 'NULL = no expiry (a purchase request already being paid)',
  reserved_by     INT            NULL,
  closed_at       DATETIME       NULL DEFAULT NULL,
  closed_by       INT            NULL,
  close_reason    VARCHAR(255)   NULL,
  updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_budget_reservation (source_type, source_id, budget_line_id),
  KEY idx_budget_reservation_line (budget_line_id, status),
  KEY idx_budget_reservation_expiry (status, expires_at),

  CONSTRAINT fk_budget_reservation_line FOREIGN KEY (budget_line_id) REFERENCES budget_lines (id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_reservation_by   FOREIGN KEY (reserved_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_budget_reservation_closed_by FOREIGN KEY (closed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Who approved a purchase request for payment -----------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_requests' AND COLUMN_NAME = 'final_finance_approved_by') = 0,
  'ALTER TABLE proc_requests ADD COLUMN final_finance_approved_by INT NULL DEFAULT NULL AFTER final_finance_approved_at, ADD KEY idx_proc_requests_fin_approver (final_finance_approved_by, status)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_requests' AND COLUMN_NAME = 'pop_due_at') = 0,
  'ALTER TABLE proc_requests ADD COLUMN pop_due_at DATETIME NULL DEFAULT NULL COMMENT ''Proof of payment due: 5 working days after Finance approval'' AFTER final_finance_approved_by',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Back-fill it from the approval trail for requests already approved.
UPDATE proc_requests pr
  JOIN (SELECT request_id, SUBSTRING_INDEX(GROUP_CONCAT(actor_id ORDER BY created_at DESC, id DESC), ',', 1) AS actor_id
          FROM proc_approval_logs WHERE action = 'FINAL_APPROVED' GROUP BY request_id) l ON l.request_id = pr.id
   SET pr.final_finance_approved_by = l.actor_id
 WHERE pr.final_finance_approved_by IS NULL;

-- 3. How each payment was made -----------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'proc_payment_batches' AND COLUMN_NAME = 'payment_method') = 0,
  'ALTER TABLE proc_payment_batches ADD COLUMN payment_method VARCHAR(20) NULL DEFAULT NULL COMMENT ''BANK, CASH or MOBILE_MONEY'' AFTER payment_reference, ADD COLUMN bank_name VARCHAR(100) NULL DEFAULT NULL COMMENT ''Bank used, for a bank payment'' AFTER payment_method',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4. The System account -------------------------------------------------------
-- Deactivated, with a password hash nothing can match, so it can never sign in.
INSERT INTO users (employee_id, email, password_hash, first_name, last_name, department_id, role_id, job_title, is_active, created_at, updated_at)
SELECT 'SYSTEM', 'system@automated.local', '!no-login!', 'System', '(automatic)',
       (SELECT MIN(id) FROM departments),
       (SELECT id FROM roles WHERE role_name = 'GENERAL_USER' LIMIT 1),
       'Automated action', 0, NOW(3), NOW(3)
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE employee_id = 'SYSTEM');

-- 5. Reserve floats that are approved but not yet dispatched -------------------
-- Ten working days from a weekday is exactly two calendar weeks.
INSERT INTO budget_reservations (source_type, source_id, budget_line_id, amount, status, reserved_at, expires_at, reserved_by)
SELECT 'FLOAT', r.id, ri.budget_line_id, ROUND(SUM(ri.quantity * ri.unit_price), 2), 'ACTIVE', NOW(),
       DATE_ADD(NOW(), INTERVAL 14 DAY), NULL
  FROM requests r
  JOIN request_items ri ON ri.request_id = r.id AND ri.budget_line_id IS NOT NULL
 WHERE r.status = 'APPROVED' AND r.source_proc_request_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM budget_reservations br WHERE br.source_type = 'FLOAT' AND br.source_id = r.id)
 GROUP BY r.id, ri.budget_line_id
HAVING SUM(ri.quantity * ri.unit_price) > 0;

INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments)
SELECT r.id, (SELECT id FROM users WHERE employee_id = 'SYSTEM'), 'SYSTEM', 'FUNDS_RESERVED', 'APPROVED', 'APPROVED',
       CONCAT('Budget reservation introduced: $', FORMAT(SUM(br.amount), 2),
              ' held on the budget lines until ', DATE_FORMAT(MIN(br.expires_at), '%d %b %Y'),
              '. Dispatch before then, or the request is rejected automatically and the funds released.')
  FROM requests r
  JOIN budget_reservations br ON br.source_type = 'FLOAT' AND br.source_id = r.id AND br.status = 'ACTIVE'
 WHERE r.status = 'APPROVED'
   AND NOT EXISTS (SELECT 1 FROM approval_logs al WHERE al.request_id = r.id AND al.action = 'FUNDS_RESERVED')
 GROUP BY r.id;
