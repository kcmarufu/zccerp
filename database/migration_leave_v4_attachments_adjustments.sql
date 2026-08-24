-- ============================================================================
-- Leave Module v4 — Supporting documents, manual balance adjustments,
--                   and employee education fields
-- ----------------------------------------------------------------------------
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) hr_leave_types.requires_document
--    Some leave types cannot be granted without evidence (Study Leave needs an
--    acceptance/enrolment letter). The flag is enforced in the service layer.
-- ---------------------------------------------------------------------------

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hr_leave_types'
    AND COLUMN_NAME = 'requires_document'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_leave_types` ADD COLUMN `requires_document` TINYINT(1) NOT NULL DEFAULT 0 AFTER `monthly_accrual_days`',
  'SELECT "requires_document already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Study Leave must carry proof; Maternity/Sick commonly need a medical note.
UPDATE `hr_leave_types`
SET `requires_document` = CASE WHEN `leave_code` IN ('SU', 'STUDY') THEN 1 ELSE 0 END
WHERE `leave_code` IN ('AL','SL','ML','PL','CL','SU','UL','FL',
                       'ANNUAL','SICK','MATERNITY','PATERNITY','COMPASSIONATE','STUDY','UNPAID','FAMILY');


-- ---------------------------------------------------------------------------
-- 2) hr_leave_attachments — supporting documents on a leave request
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `hr_leave_attachments` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `leave_request_id` INT          NOT NULL,
  `file_name`        VARCHAR(255) NOT NULL,   -- original name, shown to users
  `file_path`        VARCHAR(500) NOT NULL,   -- absolute path on the upload volume
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
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  ROW_FORMAT = Dynamic;


-- ---------------------------------------------------------------------------
-- 3) hr_leave_adjustments — manual top-up / deduction by HR, Admin, HOP or Lead
--    Every adjustment carries a mandatory reason and the actor, so the balance
--    can always be explained.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `hr_leave_adjustments` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `employee_id`     INT          NOT NULL,
  `leave_type_id`   INT          NOT NULL,
  `fiscal_year`     INT          NOT NULL,
  -- Positive = credit/top-up, negative = deduction. Applied to `entitlement`.
  `adjustment_days` DECIMAL(6,1) NOT NULL,
  `reason`          TEXT         NOT NULL,
  `balance_before`  DECIMAL(6,1) NULL,
  `balance_after`   DECIMAL(6,1) NULL,
  `adjusted_by`     INT          NULL,
  `adjusted_by_role` VARCHAR(40) NULL,
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_leave_adj_employee_idx` (`employee_id`, `fiscal_year`),
  INDEX `hr_leave_adj_created_idx`  (`created_at`),
  CONSTRAINT `fk_leave_adj_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_adj_type` FOREIGN KEY (`leave_type_id`)
    REFERENCES `hr_leave_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_adj_user` FOREIGN KEY (`adjusted_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  ROW_FORMAT = Dynamic;


-- ---------------------------------------------------------------------------
-- 4) hr_employees — education / qualification summary fields
--    Certificates themselves are files in hr_documents; these columns hold the
--    at-a-glance summary shown in the Employee Directory.
-- ---------------------------------------------------------------------------

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees'
    AND COLUMN_NAME = 'highest_qualification');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `highest_qualification` VARCHAR(150) NULL AFTER `position_title`',
  'SELECT "highest_qualification exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees'
    AND COLUMN_NAME = 'field_of_study');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `field_of_study` VARCHAR(150) NULL AFTER `highest_qualification`',
  'SELECT "field_of_study exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees'
    AND COLUMN_NAME = 'institution');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `institution` VARCHAR(200) NULL AFTER `field_of_study`',
  'SELECT "institution exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees'
    AND COLUMN_NAME = 'year_qualified');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `year_qualified` INT NULL AFTER `institution`',
  'SELECT "year_qualified exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees'
    AND COLUMN_NAME = 'professional_body');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `professional_body` VARCHAR(200) NULL AFTER `year_qualified`',
  'SELECT "professional_body exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
