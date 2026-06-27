-- ============================================================================
-- Procurement Committee Voting Overhaul - Migration
-- ZCC ERP System
-- 
-- New procurement flow:
--   DRAFT → PENDING_DEPT_APPROVAL → PENDING_PROCUREMENT →
--   PENDING_COMMITTEE (requires ALL 3 seats: HSD, CPJS, FINANCE_ADMIN) →
--   PENDING_FINAL_FINANCE → COMPLETED | REJECTED | CANCELLED
--
-- Removes: PENDING_FINANCE_APPROVAL stage (dept approval now goes directly
--          to PENDING_PROCUREMENT)
-- ============================================================================

-- 1. Add committee_seat column to users table
--    Only used for PROCUREMENT_COMMITTEE role members
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS committee_seat ENUM('HSD', 'CPJS', 'FINANCE_ADMIN') NULL DEFAULT NULL;

-- 2. Create committee votes table (per-member voting, enforces one-vote-per-seat)
CREATE TABLE IF NOT EXISTS proc_committee_votes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  request_id      INT NOT NULL,
  voter_id        INT NOT NULL,
  committee_seat  ENUM('HSD', 'CPJS', 'FINANCE_ADMIN') NOT NULL,
  vote            ENUM('APPROVED', 'REJECTED') NOT NULL,
  justification   TEXT,
  voted_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- One vote per voter per request
  UNIQUE KEY uq_voter_request   (request_id, voter_id),
  -- One seat vote per request (prevents two HSD members both voting on same req)
  UNIQUE KEY uq_seat_request    (request_id, committee_seat),
  FOREIGN KEY (request_id) REFERENCES proc_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (voter_id)   REFERENCES users(id),
  INDEX idx_votes_request (request_id)
);

-- 3. Seed the 3 committee member accounts
--    Passwords are set to: Committee@2026! (hashed below via application seed script)
--    Run backend/src/scripts/seedCommitteeMembers.js to create these accounts properly.
--
--    These INSERT IGNORE statements serve as a schema reference only.
--    Actual seeding with bcrypt hashes is done via the Node.js seed script.

-- ============================================================================
-- NOTE: Run the following Node.js script to actually create the accounts:
--   cd backend && node src/scripts/seedCommitteeMembers.js
-- ============================================================================
