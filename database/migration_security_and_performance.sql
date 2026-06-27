-- ============================================================================
-- Migration: Security Hardening + Performance Indexes
-- Date: 2026-06-25
-- Purpose:
--   1. Add failed_login_attempts and locked_until to users (account lockout)
--   2. Add composite indexes for high-traffic queries (scalability)
-- Run: mysql -u <user> -p <dbname> < migration_security_and_performance.sql
-- ============================================================================

-- ── 1. Account lockout columns (safe for MySQL 5.7+) ─────────────────────────
-- Add failed_login_attempts if not already present
SET @col1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'failed_login_attempts');
SET @sql1 = IF(@col1 = 0,
  'ALTER TABLE users ADD COLUMN failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT ''Column failed_login_attempts already exists'' AS info');
PREPARE stmt FROM @sql1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add locked_until if not already present
SET @col2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'locked_until');
SET @sql2 = IF(@col2 = 0,
  'ALTER TABLE users ADD COLUMN locked_until DATETIME NULL DEFAULT NULL',
  'SELECT ''Column locked_until already exists'' AS info');
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. Performance indexes (safe for MySQL 5.7+) ─────────────────────────────
DROP PROCEDURE IF EXISTS create_index_if_missing;
DELIMITER $$
CREATE PROCEDURE create_index_if_missing(
  IN tbl VARCHAR(64), IN idx VARCHAR(64), IN col_def VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
  ) THEN
    SET @ddl = CONCAT('CREATE INDEX `', idx, '` ON `', tbl, '` (', col_def, ')');
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END$$
DELIMITER ;

CALL create_index_if_missing('users','idx_users_locked_until','locked_until');
CALL create_index_if_missing('requests','idx_requests_status','status');
CALL create_index_if_missing('requests','idx_requests_requester_id','requester_id');
CALL create_index_if_missing('requests','idx_requests_department_id','department_id');
CALL create_index_if_missing('requests','idx_requests_donor_id','donor_id');
CALL create_index_if_missing('requests','idx_requests_created_at','created_at');
CALL create_index_if_missing('requests','idx_requests_dept_status','department_id, status');
CALL create_index_if_missing('requests','idx_requests_status_date','status, created_at');
CALL create_index_if_missing('budget_lines','idx_budget_lines_donor_id','donor_id');
CALL create_index_if_missing('budget_lines','idx_budget_lines_project_id','project_id');
CALL create_index_if_missing('budget_lines','idx_budget_lines_department_id','department_id');
CALL create_index_if_missing('budget_transactions','idx_budget_txn_budget_line_id','budget_line_id');
CALL create_index_if_missing('budget_transactions','idx_budget_txn_created_at','created_at');
CALL create_index_if_missing('approval_logs','idx_approval_logs_request_id','request_id');
CALL create_index_if_missing('approval_logs','idx_approval_logs_approver_id','approver_id');
CALL create_index_if_missing('approval_logs','idx_approval_logs_action','action');
CALL create_index_if_missing('reconciliations','idx_recon_request_id','request_id');
CALL create_index_if_missing('reconciliations','idx_recon_submitted_by','submitted_by');
CALL create_index_if_missing('reconciliations','idx_recon_status','status');
CALL create_index_if_missing('projects','idx_projects_donor_id','donor_id');
CALL create_index_if_missing('projects','idx_projects_is_active','is_active');
CALL create_index_if_missing('notifications','idx_notifications_user_id','user_id');
CALL create_index_if_missing('notifications','idx_notifications_is_read','is_read');
CALL create_index_if_missing('notifications','idx_notifications_created_at','created_at');

DROP PROCEDURE IF EXISTS create_index_if_missing;

-- ── 3. Verify ─────────────────────────────────────────────────────────────────
SELECT 'Migration complete: security_and_performance' AS status;
SELECT
  TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('users','requests','budget_lines','budget_transactions','approval_logs','reconciliations','projects','notifications')
ORDER BY TABLE_NAME, INDEX_NAME;
