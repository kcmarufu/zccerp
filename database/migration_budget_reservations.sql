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
