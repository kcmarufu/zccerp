-- ============================================================================
-- Procurement: high-value requests are recommended by the committee, then
-- approved by BOTH the Super Admin and the Lead/HOP of the department that owns
-- the selected project.
--
-- Previously a selected quotation at or above USD 5,000 locked the committee
-- out entirely and was decided by the Super Admin plus the head of one
-- hardcoded department (FOS). The committee is now back in the loop as a
-- recommending body, and the second approver follows the project rather than
-- being fixed.
--
-- Flow at or above the threshold:
--   PENDING_PROCUREMENT
--     -> PENDING_COMMITTEE            (committee recommends)
--     -> PENDING_HIGH_VALUE_APPROVAL  (Super Admin + owning dept Lead/HOP, in parallel)
--     -> PENDING_FINAL_FINANCE        (only when BOTH approve)
-- A rejection by either approver sends the request back to be amended and
-- resubmitted, and it returns to PENDING_HIGH_VALUE_APPROVAL.
-- ============================================================================

-- 1. New workflow status (additive — existing values are preserved in order).
ALTER TABLE proc_requests
  MODIFY COLUMN status ENUM(
    'DRAFT',
    'PENDING_DEPT_APPROVAL',
    'PENDING_FINANCE_APPROVAL',
    'PENDING_PROCUREMENT',
    'PENDING_COMMITTEE',
    'PENDING_HIGH_VALUE_APPROVAL',
    'PENDING_FINAL_FINANCE',
    'COMPLETED',
    'REJECTED',
    'CANCELLED'
  ) DEFAULT 'DRAFT';

-- 2. Records the two parallel approvals. One row per seat per request, so a
--    re-vote updates in place rather than accumulating duplicates.
CREATE TABLE IF NOT EXISTS proc_high_value_approvals (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  request_id    INT          NOT NULL,
  seat          ENUM('SUPER_ADMIN','DEPARTMENT') NOT NULL,
  approver_id   INT          NOT NULL,
  approver_role VARCHAR(50)  NOT NULL,
  department_id INT          NULL,
  decision      ENUM('APPROVED','REJECTED') NOT NULL,
  comments      TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_proc_hv_request_seat (request_id, seat),
  KEY idx_proc_hv_request (request_id),
  KEY idx_proc_hv_approver (approver_id),

  CONSTRAINT fk_proc_hv_request FOREIGN KEY (request_id) REFERENCES proc_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_proc_hv_approver FOREIGN KEY (approver_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Remember which stage a rejection came from, so an amended request resumes
--    at the high-value approval stage instead of restarting the whole workflow.
ALTER TABLE proc_requests
  ADD COLUMN rejected_from_status VARCHAR(50) NULL AFTER rejection_reason;
