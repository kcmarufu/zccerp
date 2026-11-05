-- ============================================================================
-- Procurement items carry their own category
-- ============================================================================
-- The procurement spending analysis grouped by budget_lines.category, which is
-- almost never filled in, so most of the money showed as "Uncategorised".
-- Each purchase request item now records what it is (the supplier register's
-- category list). Existing items are backfilled from their descriptions by
-- backend/scripts/backfillProcItemCategories.js.
--
-- Idempotent and additive: the column is only added when missing; no data is
-- changed by this file.
-- ============================================================================

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_request_items' AND COLUMN_NAME = 'category');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_request_items` ADD COLUMN `category` VARCHAR(64) NULL DEFAULT NULL AFTER `budget_line_id`',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
