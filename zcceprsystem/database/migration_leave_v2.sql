-- ============================================================================
-- Leave Module v2 — Role-based single-stage approval + monthly accrual
-- ----------------------------------------------------------------------------
-- Idempotent: safe to re-run. Uses information_schema guards instead of
-- IF NOT EXISTS clauses that some MySQL versions do not support on ALTER.
-- ============================================================================

-- 1) hr_leave_types: add is_deductible + is_accrual_target ---------------------

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hr_leave_types'
    AND COLUMN_NAME = 'is_deductible'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `is_deductible` TINYINT(1) NOT NULL DEFAULT 1 AFTER `is_paid`',
  'SELECT "is_deductible already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hr_leave_types'
    AND COLUMN_NAME = 'is_accrual_target'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `is_accrual_target` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_deductible`',
  'SELECT "is_accrual_target already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hr_leave_types'
    AND COLUMN_NAME = 'monthly_accrual_days'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `monthly_accrual_days` DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER `is_accrual_target`',
  'SELECT "monthly_accrual_days already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed sensible defaults: Annual Leave is deductible AND the monthly accrual target.
-- Sick / Maternity / Paternity remain deductible but do not accrue monthly.
-- Compassionate / Bereavement / R&R default to non-deductible per business rule
-- (HR Office can flip these via the leave-types admin page).
UPDATE `hr_leave_types`
SET `is_deductible` = CASE
        WHEN `leave_code` IN ('ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY') THEN 1
        ELSE 0
      END,
    `is_accrual_target`    = IF(`leave_code` = 'ANNUAL', 1, 0),
    `monthly_accrual_days` = IF(`leave_code` = 'ANNUAL', 2.5, 0)
WHERE `leave_code` IN ('ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY',
                       'COMPASSIONATE', 'BEREAVEMENT', 'R_AND_R');

-- Enforce at most one accrual-target leave type
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_leave_types'
    AND INDEX_NAME   = 'hr_leave_types_accrual_target_idx'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX `hr_leave_types_accrual_target_idx` ON `hr_leave_types` (`is_accrual_target`)',
  'SELECT "accrual_target index already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- 2) hr_leave_accrual_log — idempotency for monthly accrual job ---------------

CREATE TABLE IF NOT EXISTS `hr_leave_accrual_log` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `employee_id`    INT          NOT NULL,
  `leave_type_id`  INT          NOT NULL,
  `fiscal_year`    INT          NOT NULL,
  `accrual_month`  TINYINT      NOT NULL, -- 1..12
  `days_added`     DECIMAL(5,2) NOT NULL,
  `triggered_by`   INT          NULL,     -- user id (NULL = automated job)
  `run_at`         DATETIME(3)  NOT NULL  DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `hr_leave_accrual_unique`
    (`employee_id`, `leave_type_id`, `fiscal_year`, `accrual_month`),
  INDEX `hr_leave_accrual_month_idx` (`fiscal_year`, `accrual_month`),
  CONSTRAINT `fk_accrual_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_accrual_type`     FOREIGN KEY (`leave_type_id`)
    REFERENCES `hr_leave_types` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_accrual_user`     FOREIGN KEY (`triggered_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  ROW_FORMAT = Dynamic;


-- 3) hr_leave_requests: collapse any legacy two-stage rows ---------------------
-- Anything that was sitting at DEPT_APPROVED becomes PENDING again under the
-- new single-stage flow, so the correct approver picks it up.

UPDATE `hr_leave_requests`
SET `status` = 'PENDING'
WHERE `status` = 'DEPT_APPROVED';


-- 4) Verification queries (not executed by app — for human inspection) --------
-- SELECT leave_code, leave_name, is_deductible, is_accrual_target, monthly_accrual_days
-- FROM hr_leave_types ORDER BY leave_code;
--
-- SELECT COUNT(*) AS accrual_targets FROM hr_leave_types WHERE is_accrual_target = 1;
-- (should be exactly 1 — enforced in application code, not via SQL constraint,
--  because MySQL does not support partial unique indexes.)
