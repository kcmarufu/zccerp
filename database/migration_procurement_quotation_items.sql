-- ============================================================================
-- Procurement: per-quotation line items priced against the requested items
--
-- Until now a quotation carried only a single total_amount, so nothing recorded
-- what each supplier actually charged for each requested item. The Committee,
-- Finance and the Super Admin were asked to approve a number with no bid
-- analysis behind it, and the "actual" price columns on proc_request_items were
-- never filled in.
--
-- proc_quotation_items already existed (see procurement_module_migration.sql)
-- but was unused. This migration makes it the record of a supplier's offer:
--
--   * one row per requested item, per quotation   (request_item_id set)
--   * plus manual rows the Procurement team add   (request_item_id NULL,
--     is_manual = 1) for substitutes or extras the supplier proposes
--   * a row may be marked is_available = 0 when the supplier cannot supply
--     that item at all — it then carries no price and is excluded from the
--     quotation total
--
-- The rows persist across a committee rejection, so a resubmission only means
-- correcting the lines that were queried rather than re-keying the whole bid.
-- ============================================================================

CREATE TABLE IF NOT EXISTS proc_quotation_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT NOT NULL,
  request_item_id INT,
  description VARCHAR(500) NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(15,2) NOT NULL,
  total_price DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  FOREIGN KEY (quotation_id) REFERENCES proc_quotations(id) ON DELETE CASCADE,
  FOREIGN KEY (request_item_id) REFERENCES proc_request_items(id) ON DELETE SET NULL,
  INDEX idx_qitem_quotation (quotation_id)
);

-- Unit of measure, carried over from the requested item so the Committee reads
-- like-for-like (10 reams vs 10 boxes).
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_quotation_items' AND COLUMN_NAME = 'unit_of_measure');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_quotation_items` ADD COLUMN `unit_of_measure` VARCHAR(50) NULL DEFAULT ''unit'' AFTER `quantity`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 0 when the supplier cannot supply this line at all. Such a row keeps its
-- place in the comparison (so the gap is visible) but contributes nothing.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_quotation_items' AND COLUMN_NAME = 'is_available');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_quotation_items` ADD COLUMN `is_available` TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 1 for a line the Procurement team keyed in themselves rather than one that
-- maps back to a requested item.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_quotation_items' AND COLUMN_NAME = 'is_manual');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_quotation_items` ADD COLUMN `is_manual` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Why a line is unavailable, or what a manual line substitutes for.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_quotation_items' AND COLUMN_NAME = 'notes');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_quotation_items` ADD COLUMN `notes` VARCHAR(500) NULL',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Ordering is meaningful: the comparison table lists the requested items in the
-- order they were raised, then the manual additions.
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_quotation_items' AND COLUMN_NAME = 'sort_order');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_quotation_items` ADD COLUMN `sort_order` INT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- A priced line is mandatory before submission to Committee, but an
-- unavailable line has no price — so unit_price must accept NULL.
ALTER TABLE `proc_quotation_items` MODIFY COLUMN `unit_price` DECIMAL(15,2) NULL;

-- ============================================================================
-- proc_request_items: record which quotation the actuals came from
--
-- actual_unit_price / actual_total already existed. They are written from the
-- selected quotation at submission to Committee; this column says which one, so
-- the figure can always be traced back to the bid it came from.
-- ============================================================================
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_request_items' AND COLUMN_NAME = 'actual_quotation_id');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_request_items` ADD COLUMN `actual_quotation_id` INT NULL AFTER `actual_total`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_request_items' AND COLUMN_NAME = 'is_available');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_request_items` ADD COLUMN `is_available` TINYINT(1) NOT NULL DEFAULT 1 AFTER `actual_quotation_id`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
