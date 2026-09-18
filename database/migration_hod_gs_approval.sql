-- ============================================================================
-- Heads of Department -> General Secretary approval route
-- ----------------------------------------------------------------------------
-- Floats, purchase requests and reconciliations raised by a Head of Department
-- (HEAD_OF_PROGRAMS in CPJS, AHR, HSD or FOS) are approved by the General
-- Secretary (a Super Admin account) instead of a departmental Lead/HOD, then go
-- through Finance exactly as everyone else's do.
--
-- Floats keep their status in a VARCHAR checked against the request_statuses
-- lookup table, which gets a new row (below). Purchase requests
-- keep their status in an ENUM, which has to learn the new value.
--
-- Idempotent: safe to re-run.
-- ============================================================================

SET @has := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'proc_requests'
     AND COLUMN_NAME = 'status'
     AND COLUMN_TYPE LIKE '%PENDING_GS_APPROVAL%'
);
SET @s := IF(@has = 0,
  "ALTER TABLE `proc_requests` MODIFY COLUMN `status`
     ENUM('DRAFT','PENDING_DEPT_APPROVAL','PENDING_GS_APPROVAL','PENDING_FINANCE_APPROVAL',
          'PENDING_PROCUREMENT','PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL',
          'PENDING_FINAL_FINANCE','COMPLETED','REJECTED','CANCELLED')
     NULL DEFAULT 'DRAFT'",
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Floats: requests.status is a foreign key into request_statuses, so the new
-- status needs its lookup row before any request can move into it.
INSERT IGNORE INTO `request_statuses` (`status_name`, `status_description`)
VALUES ('PENDING_GS_APPROVAL', 'Head of Department request - awaiting General Secretary approval');
