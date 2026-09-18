-- ============================================================================
-- Timesheet Module
-- ----------------------------------------------------------------------------
-- Every member of staff except the Super Admin completes one timesheet per
-- calendar month. A timesheet is a grid: one row per project the employee is
-- allocated to, one column per day of the month.
--
-- Nothing here duplicates data that already exists:
--   * Projects come from `projects` (the Float Requisition project register).
--   * The Partner shown against a project is its `donors` row, reached through
--     projects.donor_id -- it is never stored twice.
--   * People come from `hr_employees`, departments from `departments`.
--   * Leave taken comes from `hr_leave_requests` where status = 'APPROVED'.
--
-- The two tables that already existed (`hr_timesheets`, `hr_timesheet_entries`)
-- are extended rather than replaced. They carried no rows.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Public holidays
-- ----------------------------------------------------------------------------
-- A holiday falling on a working day removes a day of expected hours for
-- everybody. Managed by the HR Office.
CREATE TABLE IF NOT EXISTS `hr_public_holidays` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `holiday_date`  DATE NOT NULL,
  `holiday_name`  VARCHAR(150) NOT NULL,
  `is_recurring`  TINYINT(1) NOT NULL DEFAULT 0,
  `notes`         VARCHAR(255) NULL,
  `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
  `created_by`    INT NULL,
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_public_holidays_date_key` (`holiday_date`),
  KEY `hr_public_holidays_active_idx` (`is_active`),
  CONSTRAINT `fk_holiday_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Organisation-wide timesheet settings (single row, id = 1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_timesheet_settings` (
  `id`                    INT NOT NULL DEFAULT 1,
  `standard_daily_hours`  DECIMAL(5,2) NOT NULL DEFAULT 8.00,
  `work_days`             VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5',
  `submission_due_day`    INT NOT NULL DEFAULT 5,
  `updated_by`            INT NULL,
  `updated_at`            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ts_settings_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT IGNORE INTO `hr_timesheet_settings` (`id`, `standard_daily_hours`, `work_days`, `submission_due_day`)
VALUES (1, 8.00, '1,2,3,4,5', 5);

-- ----------------------------------------------------------------------------
-- 3. Level of Effort -- HR-controlled project allocation
-- ----------------------------------------------------------------------------
-- "Project A 50%, Project B 30%, Project C 20%". Held per employee, per
-- project, per year, with a month window so a mid-year change can be recorded
-- without destroying the earlier allocation. The percentages that apply to any
-- one month should total 100.
CREATE TABLE IF NOT EXISTS `hr_employee_loe` (
  `id`                   INT NOT NULL AUTO_INCREMENT,
  `employee_id`          INT NOT NULL,
  `project_id`           INT NOT NULL,
  `loe_year`             INT NOT NULL,
  `effective_from_month` INT NOT NULL DEFAULT 1,
  `effective_to_month`   INT NOT NULL DEFAULT 12,
  `loe_percent`          DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `notes`                VARCHAR(255) NULL,
  `is_active`            TINYINT(1) NOT NULL DEFAULT 1,
  `created_by`           INT NULL,
  `updated_by`           INT NULL,
  `created_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `hr_employee_loe_unique` (`employee_id`, `project_id`, `loe_year`, `effective_from_month`),
  KEY `hr_employee_loe_emp_idx` (`employee_id`, `loe_year`),
  KEY `hr_employee_loe_project_idx` (`project_id`),
  CONSTRAINT `fk_loe_employee`   FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_loe_project`    FOREIGN KEY (`project_id`)  REFERENCES `projects` (`id`)     ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_loe_created_by` FOREIGN KEY (`created_by`)  REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_loe_updated_by` FOREIGN KEY (`updated_by`)  REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Grid rows -- one per project (+ activity) on a timesheet
-- ----------------------------------------------------------------------------
-- `loe_percent` is a snapshot of the HR allocation at submission time, so an
-- approved timesheet keeps reading correctly after HR revises the allocation.
-- The partner is NOT stored: it is projects.donor_id -> donors.
CREATE TABLE IF NOT EXISTS `hr_timesheet_lines` (
  `id`                   INT NOT NULL AUTO_INCREMENT,
  `timesheet_id`         INT NOT NULL,
  `project_id`           INT NULL,
  `activity_description` TEXT NULL,
  `loe_percent`          DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  `total_hours`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `sort_order`           INT NOT NULL DEFAULT 0,
  `created_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `hr_ts_lines_timesheet_idx` (`timesheet_id`),
  KEY `hr_ts_lines_project_idx` (`project_id`),
  CONSTRAINT `fk_ts_line_timesheet` FOREIGN KEY (`timesheet_id`) REFERENCES `hr_timesheets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ts_line_project`   FOREIGN KEY (`project_id`)   REFERENCES `projects` (`id`)      ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Approval trail
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hr_timesheet_approvals` (
  `id`             INT NOT NULL AUTO_INCREMENT,
  `timesheet_id`   INT NOT NULL,
  `action`         VARCHAR(30) NOT NULL,
  `from_status`    VARCHAR(30) NULL,
  `to_status`      VARCHAR(30) NULL,
  `actor_id`       INT NULL,
  `actor_role`     VARCHAR(50) NULL,
  `comments`       TEXT NULL,
  `created_at`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `hr_ts_approvals_ts_idx` (`timesheet_id`),
  CONSTRAINT `fk_ts_appr_timesheet` FOREIGN KEY (`timesheet_id`) REFERENCES `hr_timesheets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ts_appr_actor`     FOREIGN KEY (`actor_id`)     REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Extend the existing timesheet header
-- ----------------------------------------------------------------------------
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'expected_hours');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `expected_hours` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `total_hours`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'working_days');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `working_days` DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER `expected_hours`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'holiday_days');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `holiday_days` DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER `working_days`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'leave_days');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `leave_days` DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER `holiday_days`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'daily_hours');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `daily_hours` DECIMAL(5,2) NOT NULL DEFAULT 8.00 AFTER `leave_days`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Who the timesheet is currently sitting with.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'current_approver_role');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `current_approver_role` VARCHAR(50) NULL AFTER `status`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'current_approver_dept_id');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `current_approver_dept_id` INT NULL AFTER `current_approver_role`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'reviewed_by');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `reviewed_by` INT NULL AFTER `submitted_at`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'reviewed_at');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `reviewed_at` DATETIME(3) NULL AFTER `reviewed_by`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'returned_reason');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `returned_reason` TEXT NULL AFTER `rejection_reason`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'locked_at');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `locked_at` DATETIME(3) NULL AFTER `returned_reason`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'locked_by');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `locked_by` INT NULL AFTER `locked_at`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheets' AND COLUMN_NAME = 'created_by');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheets` ADD COLUMN `created_by` INT NULL AFTER `notes`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 7. Extend the existing entry table
-- ----------------------------------------------------------------------------
-- An entry is now one cell of the grid: a line (project row) crossed with a day.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheet_entries' AND COLUMN_NAME = 'line_id');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheet_entries` ADD COLUMN `line_id` INT NULL AFTER `timesheet_id`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheet_entries' AND COLUMN_NAME = 'project_id');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheet_entries` ADD COLUMN `project_id` INT NULL AFTER `line_id`', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheet_entries' AND INDEX_NAME = 'hr_ts_entry_cell_key');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheet_entries` ADD UNIQUE INDEX `hr_ts_entry_cell_key` (`line_id`, `entry_date`)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheet_entries' AND CONSTRAINT_NAME = 'fk_ts_entry_line');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheet_entries` ADD CONSTRAINT `fk_ts_entry_line` FOREIGN KEY (`line_id`) REFERENCES `hr_timesheet_lines` (`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_timesheet_entries' AND CONSTRAINT_NAME = 'fk_ts_entry_project');
SET @s := IF(@c = 0, 'ALTER TABLE `hr_timesheet_entries` ADD CONSTRAINT `fk_ts_entry_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 8. Zimbabwe public holidays -- seed the fixed-date ones for the current year
-- ----------------------------------------------------------------------------
-- Movable feasts (Easter, and the Monday shifts when a holiday falls on a
-- Sunday) are left for the HR Office to add.
SET @y := YEAR(CURDATE());
INSERT IGNORE INTO `hr_public_holidays` (`holiday_date`, `holiday_name`, `is_recurring`) VALUES
  (MAKEDATE(@y, 1), 'New Year Day', 1),
  (STR_TO_DATE(CONCAT(@y, '-02-21'), '%Y-%m-%d'), 'Robert Gabriel Mugabe National Youth Day', 1),
  (STR_TO_DATE(CONCAT(@y, '-04-18'), '%Y-%m-%d'), 'Independence Day', 1),
  (STR_TO_DATE(CONCAT(@y, '-05-01'), '%Y-%m-%d'), 'Workers Day', 1),
  (STR_TO_DATE(CONCAT(@y, '-05-25'), '%Y-%m-%d'), 'Africa Day', 1),
  (STR_TO_DATE(CONCAT(@y, '-08-11'), '%Y-%m-%d'), 'Heroes Day', 1),
  (STR_TO_DATE(CONCAT(@y, '-08-12'), '%Y-%m-%d'), 'Defence Forces Day', 1),
  (STR_TO_DATE(CONCAT(@y, '-12-22'), '%Y-%m-%d'), 'Unity Day', 1),
  (STR_TO_DATE(CONCAT(@y, '-12-25'), '%Y-%m-%d'), 'Christmas Day', 1),
  (STR_TO_DATE(CONCAT(@y, '-12-26'), '%Y-%m-%d'), 'Boxing Day', 1);

INSERT IGNORE INTO `schema_migrations` (`filename`) VALUES ('migration_timesheet_module.sql');
