-- ============================================================================
-- Procurement: support multiple Proof of Payment documents per request
--
-- Payments for a purchase request are not always made in one go — Finance
-- settles them in batches. The single pop_file_path/pop_file_name/pop_file_size
-- columns on proc_requests could only ever hold one document, so a second
-- payment either overwrote the first or went unrecorded.
--
-- This table holds every POP for a request. The legacy columns on proc_requests
-- are left in place and continue to mirror the first POP, so existing reads
-- (e.g. the /pop/download endpoint) keep working.
-- ============================================================================

CREATE TABLE IF NOT EXISTS proc_request_pops (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  request_id   INT           NOT NULL,
  file_path    VARCHAR(500)  NOT NULL,
  file_name    VARCHAR(255)  NOT NULL,
  file_size    BIGINT        NULL,
  note         VARCHAR(500)  NULL,
  uploaded_by  INT           NOT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_proc_request_pops_request (request_id),
  KEY idx_proc_request_pops_uploader (uploaded_by),

  CONSTRAINT fk_proc_request_pops_request
    FOREIGN KEY (request_id) REFERENCES proc_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_proc_request_pops_user
    FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Carry across any POP already recorded on the request itself.
INSERT INTO proc_request_pops (request_id, file_path, file_name, file_size, uploaded_by, created_at)
SELECT pr.id, pr.pop_file_path, pr.pop_file_name, pr.pop_file_size,
       COALESCE(pr.requester_id, 1), COALESCE(pr.final_finance_approved_at, NOW())
FROM proc_requests pr
WHERE pr.pop_file_path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM proc_request_pops p WHERE p.request_id = pr.id);
