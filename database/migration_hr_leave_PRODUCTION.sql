-- ============================================================================
-- HR / LEAVE MODULE — CONSOLIDATED PRODUCTION MIGRATION
-- ============================================================================
-- Run this ONCE on the live database after pulling the new code.
--
--   mysql -u <user> -p <database> < migration_hr_leave_PRODUCTION.sql
--
-- It rolls up every change made to the HR module:
--   v3  leave audit trail + balance snapshots on requests
--   v4  supporting documents, manual balance adjustments, education fields
--   v5  employee record audit ("who changed this")
--   v6  the real leave types and their free-day allowances
--   v7  per-employee accrual settings
--   v8  two decimal places on every day figure
--
-- SAFETY
-- ------
--   * Idempotent — every step is guarded, so re-running changes nothing.
--   * Additive — no table or column is ever dropped, and no row is deleted.
--   * Existing leave requests, balances and history are preserved.
--   * Wrapped so that a failure part-way leaves the schema usable.
--
-- It does NOT insert any test or sample data.
-- ============================================================================

SET @OLD_SQL_MODE = @@SESSION.sql_mode;
SET SESSION sql_mode = '';

SELECT '=== HR/Leave migration starting ===' AS status;


-- ############################################################################
-- SECTION 1 — hr_leave_types: behaviour flags
-- ############################################################################

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_types' AND COLUMN_NAME = 'is_deductible');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `is_deductible` TINYINT(1) NOT NULL DEFAULT 1 AFTER `is_paid`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_types' AND COLUMN_NAME = 'is_accrual_target');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `is_accrual_target` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_deductible`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_types' AND COLUMN_NAME = 'monthly_accrual_days');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `monthly_accrual_days` DECIMAL(7,2) NOT NULL DEFAULT 0 AFTER `is_accrual_target`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_types' AND COLUMN_NAME = 'requires_document');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `requires_document` TINYINT(1) NOT NULL DEFAULT 0 AFTER `monthly_accrual_days`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_types' AND COLUMN_NAME = 'free_days_limit');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `free_days_limit` DECIMAL(7,2) NULL AFTER `requires_document`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_types' AND COLUMN_NAME = 'free_days_window_months');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `free_days_window_months` INT NULL AFTER `free_days_limit`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT '1/8  hr_leave_types columns ready' AS status;


-- ############################################################################
-- SECTION 2 — hr_leave_requests: balance snapshot + day split
-- ############################################################################

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_requests' AND COLUMN_NAME = 'balance_before');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_requests` ADD COLUMN `balance_before` DECIMAL(8,2) NULL AFTER `days_requested`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_requests' AND COLUMN_NAME = 'balance_after');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_requests` ADD COLUMN `balance_after` DECIMAL(8,2) NULL AFTER `balance_before`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_requests' AND COLUMN_NAME = 'deductible_days');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_requests` ADD COLUMN `deductible_days` DECIMAL(7,2) NOT NULL DEFAULT 0 AFTER `days_requested`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_leave_requests' AND COLUMN_NAME = 'free_days_used');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_leave_requests` ADD COLUMN `free_days_used` DECIMAL(7,2) NOT NULL DEFAULT 0 AFTER `deductible_days`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT '2/8  hr_leave_requests columns ready' AS status;


-- ############################################################################
-- SECTION 3 — New tables
-- ############################################################################

CREATE TABLE IF NOT EXISTS `hr_leave_audit` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `leave_request_id` INT          NOT NULL,
  `employee_id`      INT          NOT NULL,
  `leave_type_id`    INT          NOT NULL,
  `action`           VARCHAR(30)  NOT NULL,
  `from_status`      VARCHAR(30)  NULL,
  `to_status`        VARCHAR(30)  NULL,
  `actor_user_id`    INT          NULL,
  `actor_role`       VARCHAR(40)  NULL,
  `comments`         TEXT         NULL,
  `days_affected`    DECIMAL(8,2) NOT NULL DEFAULT 0,
  `is_deductible`    TINYINT(1)   NOT NULL DEFAULT 1,
  `balance_before`   DECIMAL(8,2) NULL,
  `balance_after`    DECIMAL(8,2) NULL,
  `entitlement_at`   DECIMAL(8,2) NULL,
  `taken_at`         DECIMAL(8,2) NULL,
  `pending_at`       DECIMAL(8,2) NULL,
  `fiscal_year`      INT          NULL,
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_leave_audit_request_idx`  (`leave_request_id`),
  INDEX `hr_leave_audit_employee_idx` (`employee_id`),
  INDEX `hr_leave_audit_action_idx`   (`action`),
  INDEX `hr_leave_audit_created_idx`  (`created_at`),
  CONSTRAINT `fk_leave_audit_request`  FOREIGN KEY (`leave_request_id`)
    REFERENCES `hr_leave_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_audit_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_audit_type`     FOREIGN KEY (`leave_type_id`)
    REFERENCES `hr_leave_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_audit_actor`    FOREIGN KEY (`actor_user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

CREATE TABLE IF NOT EXISTS `hr_leave_accrual_log` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `employee_id`    INT          NOT NULL,
  `leave_type_id`  INT          NOT NULL,
  `fiscal_year`    INT          NOT NULL,
  `accrual_month`  INT          NOT NULL,
  `days_added`     DECIMAL(7,2) NOT NULL DEFAULT 0,
  `triggered_by`   INT          NULL,
  `created_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_leave_accrual_log_unique` (`employee_id`, `leave_type_id`, `fiscal_year`, `accrual_month`),
  INDEX `hr_leave_accrual_log_period_idx` (`fiscal_year`, `accrual_month`),
  CONSTRAINT `fk_accrual_log_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_accrual_log_type` FOREIGN KEY (`leave_type_id`)
    REFERENCES `hr_leave_types` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_accrual_log_triggered` FOREIGN KEY (`triggered_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

CREATE TABLE IF NOT EXISTS `hr_leave_attachments` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `leave_request_id` INT          NOT NULL,
  `file_name`        VARCHAR(255) NOT NULL,
  `file_path`        VARCHAR(500) NOT NULL,
  `file_size`        INT          NOT NULL DEFAULT 0,
  `mime_type`        VARCHAR(120) NULL,
  `description`      VARCHAR(255) NULL,
  `uploaded_by`      INT          NULL,
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_leave_att_request_idx` (`leave_request_id`),
  CONSTRAINT `fk_leave_att_request` FOREIGN KEY (`leave_request_id`)
    REFERENCES `hr_leave_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_att_user` FOREIGN KEY (`uploaded_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

CREATE TABLE IF NOT EXISTS `hr_leave_adjustments` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `employee_id`      INT          NOT NULL,
  `leave_type_id`    INT          NOT NULL,
  `fiscal_year`      INT          NOT NULL,
  `adjustment_days`  DECIMAL(8,2) NOT NULL,
  `reason`           TEXT         NOT NULL,
  `balance_before`   DECIMAL(8,2) NULL,
  `balance_after`    DECIMAL(8,2) NULL,
  `adjusted_by`      INT          NULL,
  `adjusted_by_role` VARCHAR(40)  NULL,
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_leave_adj_employee_idx` (`employee_id`, `fiscal_year`),
  INDEX `hr_leave_adj_created_idx`  (`created_at`),
  CONSTRAINT `fk_leave_adj_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_adj_type` FOREIGN KEY (`leave_type_id`)
    REFERENCES `hr_leave_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_adj_user` FOREIGN KEY (`adjusted_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

CREATE TABLE IF NOT EXISTS `hr_employee_audit` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `employee_id`   INT          NOT NULL,
  `action`        VARCHAR(30)  NOT NULL,
  `changes`       TEXT         NULL,
  `actor_user_id` INT          NULL,
  `actor_role`    VARCHAR(40)  NULL,
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_emp_audit_employee_idx` (`employee_id`),
  INDEX `hr_emp_audit_created_idx`  (`created_at`),
  CONSTRAINT `fk_emp_audit_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_emp_audit_actor` FOREIGN KEY (`actor_user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

SELECT '3/8  new tables ready' AS status;


-- ############################################################################
-- SECTION 4 — hr_employees: education, audit and accrual settings
-- ############################################################################

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees' AND COLUMN_NAME = 'highest_qualification');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `highest_qualification` VARCHAR(150) NULL AFTER `position_title`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees' AND COLUMN_NAME = 'field_of_study');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `field_of_study` VARCHAR(150) NULL AFTER `highest_qualification`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees' AND COLUMN_NAME = 'institution');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `institution` VARCHAR(200) NULL AFTER `field_of_study`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees' AND COLUMN_NAME = 'year_qualified');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `year_qualified` INT NULL AFTER `institution`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees' AND COLUMN_NAME = 'professional_body');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `professional_body` VARCHAR(200) NULL AFTER `year_qualified`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees' AND COLUMN_NAME = 'updated_by');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `updated_by` INT NULL AFTER `created_by`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees' AND COLUMN_NAME = 'accrual_enabled');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `accrual_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `employment_status`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees' AND COLUMN_NAME = 'monthly_accrual_days');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `monthly_accrual_days` DECIMAL(7,2) NULL AFTER `accrual_enabled`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees' AND COLUMN_NAME = 'accrual_note');
SET @s := IF(@c = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `accrual_note` VARCHAR(255) NULL AFTER `monthly_accrual_days`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT '4/8  hr_employees columns ready' AS status;


-- ############################################################################
-- SECTION 5 — Two decimal places on every day figure
-- ----------------------------------------------------------------------------
-- Per-employee accrual rates make fractional days real: a 50% level-of-effort
-- contract earns 1.25 days a month, which DECIMAL(x,1) silently rounded to 1.3.
-- Widening does not alter existing values.
-- ############################################################################

ALTER TABLE `hr_leave_balances`
  MODIFY COLUMN `entitlement`     DECIMAL(7,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `carried_forward` DECIMAL(7,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `taken`           DECIMAL(7,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `pending`         DECIMAL(7,2) NOT NULL DEFAULT 0;

ALTER TABLE `hr_leave_requests`
  MODIFY COLUMN `days_requested` DECIMAL(7,2) NOT NULL;

SELECT '5/8  decimal precision widened' AS status;


-- ############################################################################
-- SECTION 6 — The organisation's leave types
-- ----------------------------------------------------------------------------
--   Vacation Leave         deductible; the accrued pool (+2.5 days monthly)
--   Maternity Leave        never deducted
--   Compassionate Leave    first 12 days free, excess charged
--   Study Leave            deductible; supporting document required
--   Examination Day Leave  never deducted
--   Sick Leave             first 90 days in a rolling 12 months free
--
-- "Charged" always means charged to the Vacation pool, the only balance that
-- accrues. Rows are UPDATED in place so existing leave requests keep pointing
-- at a valid type; unused types are deactivated, never deleted.
-- ############################################################################

UPDATE `hr_leave_types`
SET `leave_code` = 'VL', `leave_name` = 'Vacation Leave',
    `is_deductible` = 1, `is_accrual_target` = 1, `monthly_accrual_days` = 2.5,
    `requires_document` = 0, `free_days_limit` = NULL, `free_days_window_months` = NULL,
    `is_active` = 1
WHERE `leave_code` IN ('AL', 'VL', 'ANNUAL');

UPDATE `hr_leave_types`
SET `leave_name` = 'Sick Leave',
    `is_deductible` = 1, `is_accrual_target` = 0, `monthly_accrual_days` = 0,
    `requires_document` = 0, `free_days_limit` = 90, `free_days_window_months` = 12,
    `is_active` = 1
WHERE `leave_code` IN ('SL', 'SICK');

UPDATE `hr_leave_types`
SET `leave_name` = 'Compassionate Leave',
    `is_deductible` = 1, `is_accrual_target` = 0, `monthly_accrual_days` = 0,
    `requires_document` = 0, `free_days_limit` = 12, `free_days_window_months` = 12,
    `is_active` = 1
WHERE `leave_code` IN ('CL', 'COMPASSIONATE');

UPDATE `hr_leave_types`
SET `leave_name` = 'Maternity Leave',
    `is_deductible` = 0, `is_accrual_target` = 0, `monthly_accrual_days` = 0,
    `requires_document` = 0, `free_days_limit` = NULL, `free_days_window_months` = NULL,
    `is_active` = 1
WHERE `leave_code` IN ('ML', 'MATERNITY');

UPDATE `hr_leave_types`
SET `leave_name` = 'Study Leave',
    `is_deductible` = 1, `is_accrual_target` = 0, `monthly_accrual_days` = 0,
    `requires_document` = 1, `free_days_limit` = NULL, `free_days_window_months` = NULL,
    `is_active` = 1
WHERE `leave_code` IN ('SU', 'STUDY');

UPDATE `hr_leave_types`
SET `is_active` = 0
WHERE `leave_code` IN ('PL', 'UL', 'FL', 'PATERNITY', 'UNPAID', 'FAMILY');

INSERT INTO `hr_leave_types`
  (`leave_code`, `leave_name`, `description`, `default_days_per_year`,
   `is_paid`, `requires_documentation`, `max_carry_forward`, `is_active`,
   `is_deductible`, `is_accrual_target`, `monthly_accrual_days`,
   `requires_document`, `free_days_limit`, `free_days_window_months`)
SELECT 'EX', 'Examination Day Leave',
       'Paid leave for sitting an examination. Not deducted from the vacation balance.',
       0, 1, 0, 0, 1, 0, 0, 0, 0, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM (SELECT `leave_code` FROM `hr_leave_types`) t WHERE t.`leave_code` = 'EX');

UPDATE `hr_leave_types`
SET `leave_name` = 'Examination Day Leave',
    `is_deductible` = 0, `is_accrual_target` = 0, `monthly_accrual_days` = 0,
    `requires_document` = 0, `free_days_limit` = NULL, `free_days_window_months` = NULL,
    `is_active` = 1
WHERE `leave_code` = 'EX';

-- Exactly one type may be the accrual target.
UPDATE `hr_leave_types` SET `is_accrual_target` = 0 WHERE `leave_code` <> 'VL';

SELECT '6/8  leave types configured' AS status;


-- ############################################################################
-- SECTION 7 — Back-fill existing leave requests
-- ----------------------------------------------------------------------------
-- deductible_days defaults to 0, which would make historical requests look as
-- though they cost nothing, and would make an OLD pending request deduct
-- nothing when finally approved.
--
-- Existing rows are therefore charged their full length where the leave type
-- is chargeable. The free-day allowances are not retro-applied: they take
-- effect for requests raised from now on.
--
-- Only rows still at the default are touched, so re-running is harmless.
-- ############################################################################

UPDATE `hr_leave_requests` lr
JOIN `hr_leave_types` lt ON lr.`leave_type_id` = lt.`id`
SET lr.`deductible_days` = lr.`days_requested`
WHERE lr.`deductible_days` = 0
  AND lr.`free_days_used` = 0
  AND lt.`is_deductible` = 1
  AND lr.`status` IN ('PENDING', 'APPROVED');

-- Non-chargeable types are explicitly recorded as free rather than left at 0/0.
UPDATE `hr_leave_requests` lr
JOIN `hr_leave_types` lt ON lr.`leave_type_id` = lt.`id`
SET lr.`free_days_used` = lr.`days_requested`
WHERE lr.`deductible_days` = 0
  AND lr.`free_days_used` = 0
  AND lt.`is_deductible` = 0
  AND lr.`status` IN ('PENDING', 'APPROVED');

-- Days are now deducted only on approval, so nothing is reserved up front.
-- Any reservation left over from the old behaviour is released; the requests
-- themselves are untouched and will deduct correctly when approved.
UPDATE `hr_leave_balances` SET `pending` = 0 WHERE `pending` <> 0;

SELECT '7/8  existing leave requests back-filled' AS status;


-- ############################################################################
-- SECTION 8 — Verification
-- ############################################################################

SELECT '8/8  migration complete' AS status;

SELECT leave_code, leave_name, is_deductible, is_accrual_target,
       monthly_accrual_days, requires_document,
       free_days_limit, free_days_window_months, is_active
FROM hr_leave_types
ORDER BY is_active DESC, is_accrual_target DESC, leave_name;

SELECT
  (SELECT COUNT(*) FROM hr_leave_types WHERE is_accrual_target = 1) AS accrual_targets_must_be_1,
  (SELECT COUNT(*) FROM hr_employees)        AS employees,
  (SELECT COUNT(*) FROM hr_leave_requests)   AS leave_requests,
  (SELECT COUNT(*) FROM hr_leave_balances)   AS balance_rows,
  (SELECT COUNT(*) FROM hr_leave_audit)      AS audit_rows,
  (SELECT COUNT(*) FROM hr_leave_accrual_log) AS accrual_log_rows;

SET SESSION sql_mode = @OLD_SQL_MODE;
