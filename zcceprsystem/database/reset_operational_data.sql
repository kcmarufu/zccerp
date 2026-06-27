-- =============================================================
-- DATA RESET SCRIPT
-- Clears all operational data; PRESERVES user accounts only.
-- Run once to start fresh with the new Donor→Project→BudgetLine hierarchy.
-- =============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---- Float Requisition module ----
TRUNCATE TABLE reconciliation_items;
TRUNCATE TABLE reconciliations;
TRUNCATE TABLE request_items;
TRUNCATE TABLE approval_logs;
TRUNCATE TABLE attachments;
TRUNCATE TABLE requests;

-- ---- Budget module ----
TRUNCATE TABLE budget_transactions;
TRUNCATE TABLE donor_transactions;
TRUNCATE TABLE budget_lines;

-- ---- Procurement module ----
TRUNCATE TABLE proc_request_attachments;
TRUNCATE TABLE proc_quotation_items;
TRUNCATE TABLE proc_quotations;
TRUNCATE TABLE proc_committee_reviews;
TRUNCATE TABLE proc_approval_logs;
TRUNCATE TABLE proc_request_items;
TRUNCATE TABLE proc_requests;
TRUNCATE TABLE proc_vendors;

-- ---- Project / Donor hierarchy ----
TRUNCATE TABLE projects;
TRUNCATE TABLE donors;

-- ---- HR / Asset (operational) ----
-- Uncomment if you also want to clear HR/Asset operational data:
-- TRUNCATE TABLE assets;
-- TRUNCATE TABLE asset_assignments;
-- TRUNCATE TABLE hr_leave_requests;
-- TRUNCATE TABLE hr_disciplinary_records;
-- TRUNCATE TABLE hr_performance_reviews;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Data reset complete. User accounts preserved.' AS status;
