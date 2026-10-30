-- ============================================================================
-- Procurement: supplier register — anti-terrorism check, and one list of suppliers
--
-- Every quotation so far held a typed supplier name and no link to proc_vendors,
-- so the register held 8 suppliers while quotations named 263. Quotations must
-- now pick a supplier from the register, which first needs those names in it:
--
--   1. Add the anti-terrorism check. NULL means nobody has recorded it yet;
--      1 verified, 0 not verified.
--   2. Add each name not already registered (ignoring case and outer spaces),
--      with no category and no check, for Procurement to complete on first use.
--   3. Point every quotation at its supplier.
--
-- Safe to re-run: a name already registered is skipped, a linked quotation is
-- left alone. Spellings that differ ("Impala" / "Impala car rental") stay
-- separate suppliers; only a person can tell whether they are the same firm.
-- ============================================================================

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proc_vendors' AND COLUMN_NAME = 'antiterror_verified');
SET @s := IF(@c = 0,
  'ALTER TABLE `proc_vendors`
     ADD COLUMN `antiterror_verified` TINYINT(1) NULL DEFAULT NULL AFTER `is_prequalified`,
     ADD COLUMN `antiterror_checked_by` INT NULL DEFAULT NULL AFTER `antiterror_verified`,
     ADD COLUMN `antiterror_checked_at` TIMESTAMP NULL DEFAULT NULL AFTER `antiterror_checked_by`',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @next := (SELECT COUNT(*) FROM proc_vendors);

INSERT INTO proc_vendors (vendor_code, company_name, email, phone, notes, created_by, created_at)
SELECT CONCAT('VND-', LPAD(@next + ROW_NUMBER() OVER (ORDER BY names.company_name), 3, '0')),
       names.company_name, names.email, names.phone,
       'Added from past quotations. Category and anti-terrorism check still to be recorded.',
       names.created_by, names.first_used
  FROM (
    SELECT MIN(TRIM(q.vendor_name)) AS company_name,
           MAX(NULLIF(TRIM(q.vendor_email), '')) AS email,
           MAX(NULLIF(TRIM(q.vendor_phone), '')) AS phone,
           MIN(q.created_by) AS created_by,
           MIN(q.created_at) AS first_used
      FROM proc_quotations q
     WHERE TRIM(q.vendor_name) <> ''
     GROUP BY LOWER(TRIM(q.vendor_name))
  ) AS names
 WHERE NOT EXISTS (
    SELECT 1 FROM proc_vendors v
     WHERE LOWER(TRIM(v.company_name)) = LOWER(names.company_name)
 );

UPDATE proc_quotations q
  JOIN proc_vendors v ON LOWER(TRIM(v.company_name)) = LOWER(TRIM(q.vendor_name))
   SET q.vendor_id = v.id, q.updated_at = q.updated_at
 WHERE q.vendor_id IS NULL;
