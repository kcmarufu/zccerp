-- ============================================================================
-- Leave Module v3 — Immutable audit trail
-- ----------------------------------------------------------------------------
-- Records every state change on a leave request together with the leave-balance
-- snapshot at that moment, so HR / Super Admin can reconstruct exactly what the
-- approver saw and what the system deducted.
--
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `hr_leave_audit` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `leave_request_id` INT          NOT NULL,
  `employee_id`      INT          NOT NULL,
  `leave_type_id`    INT          NOT NULL,

  -- SUBMITTED | APPROVED | REJECTED | CANCELLED | ACCRUAL_ADJUSTMENT
  `action`           VARCHAR(30)  NOT NULL,
  `from_status`      VARCHAR(30)  NULL,
  `to_status`        VARCHAR(30)  NULL,

  `actor_user_id`    INT          NULL,   -- NULL = automated
  `actor_role`       VARCHAR(40)  NULL,   -- role held AT THE TIME of the action
  `comments`         TEXT         NULL,

  -- Balance snapshot: what the deductible pool looked like either side of the action
  `days_affected`    DECIMAL(5,1) NOT NULL DEFAULT 0,
  `is_deductible`    TINYINT(1)   NOT NULL DEFAULT 1,
  `balance_before`   DECIMAL(6,1) NULL,
  `balance_after`    DECIMAL(6,1) NULL,
  `entitlement_at`   DECIMAL(6,1) NULL,
  `taken_at`         DECIMAL(6,1) NULL,
  `pending_at`       DECIMAL(6,1) NULL,
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
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  ROW_FORMAT = Dynamic;


-- Persist the balance the approver was shown, on the request itself, so the
-- list/detail views do not need to re-derive history.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hr_leave_requests'
    AND COLUMN_NAME = 'balance_before'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_requests` ADD COLUMN `balance_before` DECIMAL(6,1) NULL AFTER `days_requested`',
  'SELECT "balance_before already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hr_leave_requests'
    AND COLUMN_NAME = 'balance_after'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_requests` ADD COLUMN `balance_after` DECIMAL(6,1) NULL AFTER `balance_before`',
  'SELECT "balance_after already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================================
-- Correct the deductibility flags.
--
-- migration_leave_v2.sql keyed its seeding on leave codes 'ANNUAL' / 'SICK',
-- but this database uses the two-letter codes 'AL' / 'SL', so that UPDATE
-- matched nothing and every type kept the DEFAULT 1 (deductible).
--
-- Business rule: only Annual/Vacation leave draws down the accrued balance.
-- Sick, Maternity, Paternity, Compassionate, Study, Unpaid and Family leave
-- are all granted without deducting accrued days.
-- ============================================================================

UPDATE `hr_leave_types`
SET `is_deductible` = CASE WHEN `leave_code` IN ('AL', 'ANNUAL') THEN 1 ELSE 0 END
WHERE `leave_code` IN ('AL', 'ANNUAL', 'SL', 'SICK', 'ML', 'MATERNITY',
                       'PL', 'PATERNITY', 'CL', 'COMPASSIONATE',
                       'SU', 'STUDY', 'UL', 'UNPAID', 'FL', 'FAMILY');

-- Annual leave is the single accrual target: +2.5 days on the 25th monthly.
UPDATE `hr_leave_types`
SET `is_accrual_target`    = IF(`leave_code` IN ('AL', 'ANNUAL'), 1, 0),
    `monthly_accrual_days` = IF(`leave_code` IN ('AL', 'ANNUAL'), 2.5, 0);
