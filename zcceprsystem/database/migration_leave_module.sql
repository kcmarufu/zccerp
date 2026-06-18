-- ============================================================================
-- MIGRATION: Leave Module — Add accrual/deductible columns & accrual log table
-- Run in Navicat on the finance_erp database AFTER migration_category_and_hr.sql
-- Date: 2026
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- PART 1: Add missing columns to hr_leave_types
-- ============================================================================
-- is_deductible : when true, the request deducts from the employee's leave balance
-- is_accrual_target : exactly one type should be TRUE — this type accumulates 2.5 days/month
-- monthly_accrual_days : how many days are credited per monthly accrual run

ALTER TABLE `hr_leave_types`
  ADD COLUMN IF NOT EXISTS `is_deductible`        tinyint(1)    NOT NULL DEFAULT 1    AFTER `is_active`,
  ADD COLUMN IF NOT EXISTS `is_accrual_target`    tinyint(1)    NOT NULL DEFAULT 0    AFTER `is_deductible`,
  ADD COLUMN IF NOT EXISTS `monthly_accrual_days` decimal(5, 1) NOT NULL DEFAULT 0.0  AFTER `is_accrual_target`;

-- ============================================================================
-- PART 2: Seed / update flags on existing leave types
-- ============================================================================
-- Annual Leave: employees accrue 2.5 days on the 25th of each month (30 days/year)
UPDATE `hr_leave_types`
SET `is_accrual_target` = 1, `monthly_accrual_days` = 2.5
WHERE `leave_code` = 'ANNUAL';

-- Unpaid Leave does NOT deduct from any leave balance
UPDATE `hr_leave_types`
SET `is_deductible` = 0
WHERE `leave_code` = 'UNPAID';

-- ============================================================================
-- PART 3: Create hr_leave_accrual_log
-- Idempotency table — UNIQUE(employee_id, leave_type_id, fiscal_year, accrual_month)
-- ensures the scheduler never double-credits even across server restarts.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `hr_leave_accrual_log` (
  `id`              int           NOT NULL AUTO_INCREMENT,
  `employee_id`     int           NOT NULL,
  `leave_type_id`   int           NOT NULL,
  `fiscal_year`     int           NOT NULL,
  `accrual_month`   int           NOT NULL COMMENT '1–12',
  `days_added`      decimal(5, 1) NOT NULL DEFAULT 0.0,
  `triggered_by`    int           NULL DEFAULT NULL COMMENT 'user_id who triggered (NULL = scheduler)',
  `created_at`      datetime(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_leave_accrual_log_unique` (`employee_id`, `leave_type_id`, `fiscal_year`, `accrual_month`),
  INDEX `hr_leave_accrual_log_type_idx`     (`leave_type_id`),
  INDEX `hr_leave_accrual_log_period_idx`   (`fiscal_year`, `accrual_month`),
  CONSTRAINT `fk_accrual_log_employee`  FOREIGN KEY (`employee_id`)   REFERENCES `hr_employees` (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `fk_accrual_log_type`      FOREIGN KEY (`leave_type_id`) REFERENCES `hr_leave_types` (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `fk_accrual_log_triggered` FOREIGN KEY (`triggered_by`)  REFERENCES `users`         (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- NOTES:
--   • Run this after migration_category_and_hr.sql (which creates hr_leave_types,
--     hr_leave_balances, hr_leave_requests, hr_employees).
--   • The "ADD COLUMN IF NOT EXISTS" syntax requires MySQL 8.0+.
--     On MySQL 5.7 remove the "IF NOT EXISTS" keywords and only run once.
--   • After running, restart the backend server so the scheduler starts.
-- ============================================================================
