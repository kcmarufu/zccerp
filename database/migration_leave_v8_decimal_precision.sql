-- ============================================================================
-- Leave Module v8 — Two decimal places on every day figure
-- ----------------------------------------------------------------------------
-- Per-employee accrual rates make fractional days real: a level-of-effort
-- contract at 50% earns 1.25 days a month, not 1.3. Every day column was
-- DECIMAL(x,1), so those rates silently rounded on the way into the database
-- and the balance drifted a little further out every month.
--
-- Widening to two decimal places fixes it at the source. Existing values are
-- unaffected — 2.5 stays 2.5.
--
-- Idempotent: MODIFY COLUMN is safe to re-run.
-- ============================================================================

ALTER TABLE `hr_leave_balances`
  MODIFY COLUMN `entitlement`     DECIMAL(7,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `carried_forward` DECIMAL(7,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `taken`           DECIMAL(7,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `pending`         DECIMAL(7,2) NOT NULL DEFAULT 0;

ALTER TABLE `hr_leave_accrual_log`
  MODIFY COLUMN `days_added` DECIMAL(7,2) NOT NULL;

ALTER TABLE `hr_leave_requests`
  MODIFY COLUMN `days_requested`  DECIMAL(7,2) NOT NULL,
  MODIFY COLUMN `deductible_days` DECIMAL(7,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `free_days_used`  DECIMAL(7,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `balance_before`  DECIMAL(8,2) NULL,
  MODIFY COLUMN `balance_after`   DECIMAL(8,2) NULL;

ALTER TABLE `hr_leave_adjustments`
  MODIFY COLUMN `adjustment_days` DECIMAL(8,2) NOT NULL,
  MODIFY COLUMN `balance_before`  DECIMAL(8,2) NULL,
  MODIFY COLUMN `balance_after`   DECIMAL(8,2) NULL;

ALTER TABLE `hr_leave_audit`
  MODIFY COLUMN `days_affected`  DECIMAL(8,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `balance_before` DECIMAL(8,2) NULL,
  MODIFY COLUMN `balance_after`  DECIMAL(8,2) NULL,
  MODIFY COLUMN `entitlement_at` DECIMAL(8,2) NULL,
  MODIFY COLUMN `taken_at`       DECIMAL(8,2) NULL,
  MODIFY COLUMN `pending_at`     DECIMAL(8,2) NULL;

ALTER TABLE `hr_leave_types`
  MODIFY COLUMN `monthly_accrual_days` DECIMAL(7,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `free_days_limit`      DECIMAL(7,2) NULL;
