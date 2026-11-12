-- ============================================================================
-- Purchase Request → Float Requisition unification (workflow v2)
--
-- A purchase request used to end at Finance with no effect on the budget: the
-- requester then had to raise a separate float and take it through approvals a
-- second time. From now on a purchase request runs one chain:
--
--   Supervisor (Lead/HOD) → Procurement → Committee (+ high-value rule)
--     → Department confirmation → Finance approval → payment (one or more batches)
--
-- Finance approval generates the linked float requisition automatically, with
-- the PR's approval trail copied onto it. Every payment batch deducts its
-- amount from the budget lines. Floats generated this way need no
-- reconciliation: the supplier is paid the exact amount.
--
-- Only requests created (or first submitted) after this migration follow the
-- new flow — workflow_version = 2. Everything already in the system keeps
-- workflow_version = 1 and finishes on the old route.
--
-- Safe to re-run: every step checks before it changes anything.
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
