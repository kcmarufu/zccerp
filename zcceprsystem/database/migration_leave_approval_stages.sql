-- ============================================================================
-- Migration: Leave Approval Stages
-- Adds departmental approval tracking to hr_leave_requests
-- Run once against the target database
-- ============================================================================

-- Add departmental approval columns (safe / idempotent via stored procedure)
DROP PROCEDURE IF EXISTS add_leave_dept_columns;

DELIMITER $$
CREATE PROCEDURE add_leave_dept_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_leave_requests'
      AND COLUMN_NAME  = 'dept_approved_by'
  ) THEN
    ALTER TABLE hr_leave_requests
      ADD COLUMN `dept_approved_by`        INT          NULL DEFAULT NULL AFTER `approved_by`,
      ADD COLUMN `dept_approved_at`        DATETIME     NULL DEFAULT NULL AFTER `dept_approved_by`,
      ADD COLUMN `dept_rejection_reason`   TEXT         NULL DEFAULT NULL AFTER `dept_approved_at`,
      ADD COLUMN `approval_comments`       TEXT         NULL DEFAULT NULL AFTER `dept_rejection_reason`;

    ALTER TABLE hr_leave_requests
      ADD CONSTRAINT `fk_leave_dept_approved`
        FOREIGN KEY (`dept_approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$
DELIMITER ;

CALL add_leave_dept_columns();
DROP PROCEDURE IF EXISTS add_leave_dept_columns;

-- Extend the status column to allow the new DEPT_APPROVED and ESCALATED states
-- (varchar(30) already allows it; just documenting the new values)
-- hr_leave_requests.status values:
--   PENDING        - submitted by employee, awaiting departmental approval
--   DEPT_APPROVED  - approved by PROGRAM_LEAD / HEAD_OF_PROGRAMS; awaiting HR final approval
--   APPROVED       - final approval granted (HR / Admin)
--   REJECTED       - rejected at any stage
--   CANCELLED      - cancelled by the employee
--   ESCALATED      - escalated to HR Office for decision

-- Add index on dept_approved_by for faster HR-level queries
DROP PROCEDURE IF EXISTS add_leave_dept_index;
DELIMITER $$
CREATE PROCEDURE add_leave_dept_index()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'hr_leave_requests'
      AND INDEX_NAME   = 'hr_leave_dept_approved_idx'
  ) THEN
    ALTER TABLE hr_leave_requests
      ADD INDEX `hr_leave_dept_approved_idx` (`dept_approved_by`);
  END IF;
END$$
DELIMITER ;

CALL add_leave_dept_index();
DROP PROCEDURE IF EXISTS add_leave_dept_index;
