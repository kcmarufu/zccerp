-- ============================================================================
-- Archive users instead of deleting them (2026-11-16)
--
-- Deleting a user used to run DELETE FROM users when they had no float
-- requests. That failed for anyone with procurement, approval or HR history
-- (foreign keys), and where it succeeded it silently cut links such as
-- hr_employees.user_id. "Delete" now archives the account: it is hidden from
-- the user list and can never log in, while every record that mentions the
-- person keeps their name. An archived account can be restored.
-- ============================================================================
SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'deleted_at') = 0,
  'ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL COMMENT ''Archived (deleted) by an admin; hidden and cannot log in''',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'deleted_by') = 0,
  'ALTER TABLE users ADD COLUMN deleted_by INT NULL DEFAULT NULL AFTER deleted_at',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
