-- ============================================================================
-- Procurement high-value approval: the second seat moves to Finance
--
-- A high-value request (selected quotation at or above USD 5,000) is recommended
-- by the Procurement Committee and then needs two approvals before it reaches
-- the Finance desk for final approval. The second of those was held by the Lead
-- / Head of Department of the department that owned the project; it is now held
-- by the Finance (FOS) Lead / Head of Department, so that every high-value
-- commitment is signed off in one place regardless of who raised it.
--
--   PENDING_COMMITTEE            (committee recommends)
--     -> PENDING_HIGH_VALUE_APPROVAL  (Super Admin + Finance Lead/HOD, parallel)
--     -> PENDING_FINAL_FINANCE        (only when BOTH approve)
--
-- Safe to run against live data: the seat column is renamed in place, and any
-- approval already recorded under the old departmental seat is carried over to
-- the Finance seat so no request loses a decision it had already collected.
-- ============================================================================

-- Widen the enum first so both values are legal while rows are migrated.
ALTER TABLE proc_high_value_approvals
  MODIFY COLUMN seat ENUM('SUPER_ADMIN','DEPARTMENT','FINANCE') NOT NULL;

UPDATE proc_high_value_approvals
   SET seat = 'FINANCE'
 WHERE seat = 'DEPARTMENT';

-- Then drop the retired value.
ALTER TABLE proc_high_value_approvals
  MODIFY COLUMN seat ENUM('SUPER_ADMIN','FINANCE') NOT NULL;
