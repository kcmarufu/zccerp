-- ============================================================================
-- Procurement: split awards — different suppliers for different items
--
-- A purchase request used to be awarded to exactly one quotation. Procurement
-- now may award each requested item to whichever supplier quoted it best, so a
-- request can have several selected quotations at once.
--
-- proc_request_items.actual_quotation_id (already present) records which bid
-- each item was awarded to. awarded_amount records what each selected
-- quotation is worth on this request:
--
--   NULL   — the whole quotation was selected; its total_amount is the award
--            (every row selected before this migration reads this way).
--   value  — only some of its lines were awarded; the sum of those lines.
--
-- Every "selected value" read is COALESCE(awarded_amount, total_amount), so
-- existing data needs no backfill.
-- ============================================================================

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_quotations' AND COLUMN_NAME = 'awarded_amount');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_quotations` ADD COLUMN `awarded_amount` DECIMAL(15,2) NULL DEFAULT NULL AFTER `is_selected`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
