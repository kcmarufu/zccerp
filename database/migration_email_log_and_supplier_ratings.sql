-- ============================================================================
-- Email log + supplier ratings (2026-11-12)
-- ----------------------------------------------------------------------------
-- 1. email_log: one row per email the system tries to send. The monthly and
--    daily sending caps count the SENT rows, and the log answers "was I
--    emailed?" — SKIPPED rows show addresses that are deliberately not mailed.
-- 2. proc_supplier_ratings: after a purchase request is paid, its requester
--    and the Procurement team each rate every supplier that was awarded part
--    of it (quality and delivery, 1–5 stars). A supplier's rating is the
--    average of those ratings, and rating_count says how many lie behind it.
-- 3. The old ratings are cleared. They came from a rule that added a star on
--    each payment, so ten suppliers paid once showed 1 star — "Poor".
--
-- Idempotent: safe to re-run. Step 3 only clears a supplier that has no rating
-- from the new table, so it never undoes a real rating.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `email_log` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `to_email`   VARCHAR(255) NOT NULL,
  `subject`    VARCHAR(255) NOT NULL,
  -- SENT | FAILED | SKIPPED | CAPPED | DUPLICATE | NO_KEY
  `status`     VARCHAR(20)  NOT NULL,
  `detail`     VARCHAR(500) NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `email_log_status_created_idx` (`status`, `created_at`),
  INDEX `email_log_to_idx` (`to_email`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `proc_supplier_ratings` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `request_id`      INT          NOT NULL,
  `vendor_id`       INT          NOT NULL,
  `rated_by`        INT          NOT NULL,
  -- REQUESTER (raised the purchase request) or PROCUREMENT (Procurement team)
  `rater_type`      VARCHAR(20)  NOT NULL,
  `quality_rating`  TINYINT      NOT NULL,
  `delivery_rating` TINYINT      NOT NULL,
  `comment`         VARCHAR(1000) NULL,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `proc_supplier_ratings_once` (`request_id`, `vendor_id`, `rated_by`),
  INDEX `proc_supplier_ratings_vendor_idx` (`vendor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_vendors' AND COLUMN_NAME = 'rating_count');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_vendors` ADD COLUMN `rating_count` INT NOT NULL DEFAULT 0 AFTER `rating`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

UPDATE `proc_vendors` v
   SET v.rating = NULL, v.rating_count = 0
 WHERE NOT EXISTS (SELECT 1 FROM `proc_supplier_ratings` r WHERE r.vendor_id = v.id)
   AND (v.rating IS NOT NULL OR v.rating_count <> 0);
