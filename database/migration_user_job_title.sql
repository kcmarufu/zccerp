-- Per-user display title override
--
-- Roles drive permissions; they are a poor fit for what a person is *called* on
-- an approval trail or a PDF. The General Secretary, for example, holds the
-- ADMIN role (super admin) but must never appear on paper as "Super
-- Administrator". job_title, when set, replaces the role label wherever a
-- person's title is displayed. It has no effect on permissions.

-- Idempotent: the column was added by hand on the live database before the
-- migration runner tracked this file, so a bare ADD COLUMN would fail here and
-- abort the whole deploy at the migration step.
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'job_title');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN job_title VARCHAR(100) NULL AFTER role_id',
  'SELECT "job_title exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Wilfred Dimingu — General Secretary (keeps the ADMIN role and all its rights)
UPDATE users SET job_title = 'General Secretary', updated_at = NOW()
 WHERE email = 'gensec@zccinzim.org';
