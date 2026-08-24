-- ============================================================================
-- HR v5 — Employee record audit ("who changed this")
-- ----------------------------------------------------------------------------
-- hr_employees already carries created_by and updated_at, but nothing recorded
-- WHO made the last change. Adds updated_by plus a full change log.
-- Idempotent: safe to re-run.
-- ============================================================================

SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_employees'
    AND COLUMN_NAME = 'updated_by');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `hr_employees` ADD COLUMN `updated_by` INT NULL AFTER `created_by`',
  'SELECT "updated_by exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Change log: one row per edit, naming the actor and what moved.
CREATE TABLE IF NOT EXISTS `hr_employee_audit` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `employee_id` INT          NOT NULL,
  `action`      VARCHAR(30)  NOT NULL,   -- CREATED | UPDATED
  `changes`     TEXT         NULL,       -- JSON: { field: { from, to } }
  `actor_user_id` INT        NULL,
  `actor_role`  VARCHAR(40)  NULL,
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `hr_emp_audit_employee_idx` (`employee_id`),
  INDEX `hr_emp_audit_created_idx`  (`created_at`),
  CONSTRAINT `fk_emp_audit_employee` FOREIGN KEY (`employee_id`)
    REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_emp_audit_actor` FOREIGN KEY (`actor_user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  ROW_FORMAT = Dynamic;
