-- ============================================================
-- Migration: Admin Partner with Project and Budget Lines
-- Budget: $1,400 split across 4 lines at $350 each
--   0001 Maintenance  | 0002 Softwares
--   0003 Rentals      | 0004 Office Supplies
-- Safe to re-run — INSERT IGNORE + UPDATE ensures correct totals.
-- ============================================================

-- ── 0. Register the new request status ──────────────────────────────────
INSERT IGNORE INTO request_statuses (status_name, status_description)
VALUES ('PENDING_ADMIN_APPROVAL', 'Awaiting Admin approval before Lead/HOP review');

-- ── 1. Admin donor ────────────────────────────────────────────
INSERT IGNORE INTO donors (
  donor_code, donor_name, donor_type, contact_person, email,
  total_committed, total_allocated, currency_code, is_active,
  created_at, updated_at
) VALUES (
  'ADMIN', 'Administration (Internal)', 'ADMIN',
  'System Administrator', NULL,
  1400.00, 1400.00, 'USD', 1,
  NOW(), NOW()
);

-- Ensure totals are correct if the row already existed
UPDATE donors
SET total_committed = 1400.00,
    total_allocated = 1400.00,
    updated_at      = NOW()
WHERE donor_code = 'ADMIN';

-- ── 2. Admin project ──────────────────────────────────────────
INSERT INTO projects (
  project_code, project_name, donor_id, department_id,
  description, total_budget, is_active, created_at, updated_at
)
SELECT
  'ADMIN-PRJ-001', 'Admin', d.id, NULL,
  'Internal administrative operational budget',
  1400.00, 1, NOW(), NOW()
FROM donors d
WHERE d.donor_code = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.project_code = 'ADMIN-PRJ-001')
LIMIT 1;

-- Ensure total_budget is correct if the row already existed
UPDATE projects
SET total_budget = 1400.00, updated_at = NOW()
WHERE project_code = 'ADMIN-PRJ-001';

-- ── 3. Budget lines ($350 each = $1,400 total) ────────────────

-- 0001 Maintenance
INSERT INTO budget_lines (
  budget_code, budget_name, donor_id, project_id,
  department_id, category, fiscal_year,
  allocated_amount, spent_amount, description,
  is_active, created_at, updated_at
)
SELECT
  'ADMIN-ADMIN-0001', 'Maintenance', d.id, p.id, NULL,
  'MAINTENANCE', YEAR(NOW()),
  350.00, 0.00, 'Administrative maintenance and repairs',
  1, NOW(), NOW()
FROM donors d
JOIN projects p ON p.project_code = 'ADMIN-PRJ-001' AND p.donor_id = d.id
WHERE d.donor_code = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM budget_lines bl WHERE bl.budget_code = 'ADMIN-ADMIN-0001');

UPDATE budget_lines SET allocated_amount = 350.00, updated_at = NOW()
WHERE budget_code = 'ADMIN-ADMIN-0001';

-- 0002 Softwares
INSERT INTO budget_lines (
  budget_code, budget_name, donor_id, project_id,
  department_id, category, fiscal_year,
  allocated_amount, spent_amount, description,
  is_active, created_at, updated_at
)
SELECT
  'ADMIN-ADMIN-0002', 'Softwares', d.id, p.id, NULL,
  'PROCUREMENT', YEAR(NOW()),
  350.00, 0.00, 'Software licences and subscriptions',
  1, NOW(), NOW()
FROM donors d
JOIN projects p ON p.project_code = 'ADMIN-PRJ-001' AND p.donor_id = d.id
WHERE d.donor_code = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM budget_lines bl WHERE bl.budget_code = 'ADMIN-ADMIN-0002');

UPDATE budget_lines SET allocated_amount = 350.00, updated_at = NOW()
WHERE budget_code = 'ADMIN-ADMIN-0002';

-- 0003 Rentals
INSERT INTO budget_lines (
  budget_code, budget_name, donor_id, project_id,
  department_id, category, fiscal_year,
  allocated_amount, spent_amount, description,
  is_active, created_at, updated_at
)
SELECT
  'ADMIN-ADMIN-0003', 'Rentals', d.id, p.id, NULL,
  'OTHER', YEAR(NOW()),
  350.00, 0.00, 'Office and equipment rentals',
  1, NOW(), NOW()
FROM donors d
JOIN projects p ON p.project_code = 'ADMIN-PRJ-001' AND p.donor_id = d.id
WHERE d.donor_code = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM budget_lines bl WHERE bl.budget_code = 'ADMIN-ADMIN-0003');

UPDATE budget_lines SET allocated_amount = 350.00, updated_at = NOW()
WHERE budget_code = 'ADMIN-ADMIN-0003';

-- 0004 Office Supplies
INSERT INTO budget_lines (
  budget_code, budget_name, donor_id, project_id,
  department_id, category, fiscal_year,
  allocated_amount, spent_amount, description,
  is_active, created_at, updated_at
)
SELECT
  'ADMIN-ADMIN-0004', 'Office Supplies', d.id, p.id, NULL,
  'PROCUREMENT', YEAR(NOW()),
  350.00, 0.00, 'Stationery, printing, and general office supplies',
  1, NOW(), NOW()
FROM donors d
JOIN projects p ON p.project_code = 'ADMIN-PRJ-001' AND p.donor_id = d.id
WHERE d.donor_code = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM budget_lines bl WHERE bl.budget_code = 'ADMIN-ADMIN-0004');

UPDATE budget_lines SET allocated_amount = 350.00, updated_at = NOW()
WHERE budget_code = 'ADMIN-ADMIN-0004';

-- ── 4. Initial allocation transactions (one per line, skip if exists) ─
INSERT INTO budget_transactions (
  budget_line_id, transaction_type, amount,
  balance_before, balance_after, description, performed_by
)
SELECT
  bl.id, 'ALLOCATION', 350.00, 0.00, 350.00,
  'Initial budget allocation', (SELECT MIN(id) FROM users)
FROM budget_lines bl
WHERE bl.budget_code IN (
  'ADMIN-ADMIN-0001', 'ADMIN-ADMIN-0002',
  'ADMIN-ADMIN-0003', 'ADMIN-ADMIN-0004'
)
  AND NOT EXISTS (
    SELECT 1 FROM budget_transactions bt
    WHERE bt.budget_line_id = bl.id
      AND bt.transaction_type = 'ALLOCATION'
  );

