-- ============================================================================
-- Leave Module v7 — Per-employee accrual settings
-- ----------------------------------------------------------------------------
-- Not everyone accrues, and not everyone accrues at the same rate. Staff on a
-- level-of-effort or part-time contract earn less than the standard 2.5 days a
-- month, and some accounts (system or service accounts, contractors) should not
-- accrue at all — otherwise their balances inflate and skew the reports.
--
-- Both settings live on the employee record and are managed by the HR Office
-- (Admin & HR HOP/Lead) or a Super Admin.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- Does this employee earn leave each month at all?
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees'
    AND COLUMN_NAME = 'accrual_enabled');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `accrual_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `employment_status`',
  'SELECT "accrual_enabled exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Days per month for THIS employee. NULL means "use the leave type default".
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees'
    AND COLUMN_NAME = 'monthly_accrual_days');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `monthly_accrual_days` DECIMAL(5,2) NULL AFTER `accrual_enabled`',
  'SELECT "monthly_accrual_days exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Why this employee's rate differs — shown next to the setting in the UI.
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees'
    AND COLUMN_NAME = 'accrual_note');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `accrual_note` VARCHAR(255) NULL AFTER `monthly_accrual_days`',
  'SELECT "accrual_note exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Existing staff keep the standard behaviour: accrual on, type default rate.
UPDATE `hr_employees`
SET `accrual_enabled` = 1
WHERE `accrual_enabled` IS NULL;
