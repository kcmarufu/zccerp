-- Migration: Widen approval_logs.action column from VARCHAR(20) to VARCHAR(50)
-- Reason: 'EDITED_AFTER_REJECTION' (22 chars) exceeds the original VARCHAR(20) limit,
--         causing "Data too long for column 'action'" errors on request edit after rejection.

ALTER TABLE `approval_logs`
  MODIFY COLUMN `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
