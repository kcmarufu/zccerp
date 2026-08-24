-- ============================================================================
-- Leave Module v6 — Canonical leave types and free-day allowances
-- ----------------------------------------------------------------------------
-- The organisation's actual leave types:
--
--   Vacation Leave          deductible; the accrued pool (+2.5 days monthly)
--   Maternity Leave         never deducted
--   Compassionate Leave     first 12 days free, anything beyond is deducted
--   Study Leave             deductible
--   Examination Day Leave   never deducted
--   Sick Leave              first 90 days in a rolling 12 months free,
--                           anything beyond is deducted
--
-- "Deducted" always means deducted from the Vacation pool, because that is the
-- only balance that accrues. A type with a free allowance therefore costs the
-- employee nothing until the allowance is exhausted.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Allowance columns
-- ---------------------------------------------------------------------------

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_types'
    AND COLUMN_NAME = 'free_days_limit');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `free_days_limit` DECIMAL(6,1) NULL AFTER `requires_document`',
  'SELECT "free_days_limit exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_types'
    AND COLUMN_NAME = 'free_days_window_months');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `free_days_window_months` INT NULL AFTER `free_days_limit`',
  'SELECT "free_days_window_months exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- How many days of a request were actually charged to the Vacation pool.
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_requests'
    AND COLUMN_NAME = 'deductible_days');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_requests` ADD COLUMN `deductible_days` DECIMAL(5,1) NOT NULL DEFAULT 0 AFTER `days_requested`',
  'SELECT "deductible_days exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Days covered by the type's free allowance (for display: "12 free + 3 charged").
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_requests'
    AND COLUMN_NAME = 'free_days_used');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_requests` ADD COLUMN `free_days_used` DECIMAL(5,1) NOT NULL DEFAULT 0 AFTER `deductible_days`',
  'SELECT "free_days_used exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------------
-- 2) Reshape the existing types in place.
--    Rows are updated rather than replaced so existing leave requests keep
--    pointing at a valid type.
-- ---------------------------------------------------------------------------

-- Annual Leave becomes Vacation Leave: the accrued, fully deductible pool.
UPDATE `hr_leave_types`
SET `leave_code` = 'VL',
    `leave_name` = 'Vacation Leave',
    `is_deductible` = 1,
    `is_accrual_target` = 1,
    `monthly_accrual_days` = 2.5,
    `requires_document` = 0,
    `free_days_limit` = NULL,
    `free_days_window_months` = NULL,
    `is_active` = 1
WHERE `leave_code` IN ('AL', 'VL', 'ANNUAL');

-- Sick Leave: 90 free days in any rolling 12 months, then charged.
UPDATE `hr_leave_types`
SET `leave_name` = 'Sick Leave',
    `is_deductible` = 1,
    `is_accrual_target` = 0,
    `monthly_accrual_days` = 0,
    `requires_document` = 0,
    `free_days_limit` = 90,
    `free_days_window_months` = 12,
    `is_active` = 1
WHERE `leave_code` IN ('SL', 'SICK');

-- Compassionate Leave: 12 free days per fiscal year, then charged.
UPDATE `hr_leave_types`
SET `leave_name` = 'Compassionate Leave',
    `is_deductible` = 1,
    `is_accrual_target` = 0,
    `monthly_accrual_days` = 0,
    `requires_document` = 0,
    `free_days_limit` = 12,
    `free_days_window_months` = 12,
    `is_active` = 1
WHERE `leave_code` IN ('CL', 'COMPASSIONATE');

-- Maternity Leave: never deducted.
UPDATE `hr_leave_types`
SET `leave_name` = 'Maternity Leave',
    `is_deductible` = 0,
    `is_accrual_target` = 0,
    `monthly_accrual_days` = 0,
    `requires_document` = 0,
    `free_days_limit` = NULL,
    `free_days_window_months` = NULL,
    `is_active` = 1
WHERE `leave_code` IN ('ML', 'MATERNITY');

-- Study Leave: deductible, and evidence is required.
UPDATE `hr_leave_types`
SET `leave_name` = 'Study Leave',
    `is_deductible` = 1,
    `is_accrual_target` = 0,
    `monthly_accrual_days` = 0,
    `requires_document` = 1,
    `free_days_limit` = NULL,
    `free_days_window_months` = NULL,
    `is_active` = 1
WHERE `leave_code` IN ('SU', 'STUDY');

-- Retire the types that are not part of the scheme.
UPDATE `hr_leave_types`
SET `is_active` = 0
WHERE `leave_code` IN ('PL', 'UL', 'FL', 'PATERNITY', 'UNPAID', 'FAMILY');

-- Examination Day Leave: never deducted. Insert only if missing.
INSERT INTO `hr_leave_types`
  (`leave_code`, `leave_name`, `description`, `default_days_per_year`,
   `is_paid`, `requires_documentation`, `max_carry_forward`, `is_active`,
   `is_deductible`, `is_accrual_target`, `monthly_accrual_days`,
   `requires_document`, `free_days_limit`, `free_days_window_months`)
SELECT 'EX', 'Examination Day Leave',
       'Paid leave for sitting an examination. Not deducted from the vacation balance.',
       0, 1, 0, 0, 1,
       0, 0, 0,
       0, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM (SELECT * FROM `hr_leave_types`) t WHERE t.`leave_code` = 'EX');

-- Keep Examination Leave correct if it already existed.
UPDATE `hr_leave_types`
SET `leave_name` = 'Examination Day Leave',
    `is_deductible` = 0,
    `is_accrual_target` = 0,
    `monthly_accrual_days` = 0,
    `requires_document` = 0,
    `free_days_limit` = NULL,
    `free_days_window_months` = NULL,
    `is_active` = 1
WHERE `leave_code` = 'EX';
