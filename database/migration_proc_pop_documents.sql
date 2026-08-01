-- Migration: Support multiple Proof of Payment (POP) documents per procurement request
--
-- Final finance approval previously stored a single POP in proc_requests
-- (pop_file_path / pop_file_name / pop_file_size). Payments are often made in
-- several tranches, so POPs now live in their own table and the legacy columns
-- are kept in sync with the first document for backward compatibility.
--
-- Run this once on the target database.

CREATE TABLE IF NOT EXISTS proc_pop_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(150),
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES proc_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_pop_request (request_id)
);

-- Backfill: move any POP already recorded on proc_requests into the new table.
INSERT INTO proc_pop_documents (request_id, file_path, file_name, file_size, uploaded_by, created_at)
SELECT pr.id, pr.pop_file_path, COALESCE(pr.pop_file_name, 'proof-of-payment'), pr.pop_file_size,
       NULL, COALESCE(pr.final_finance_approved_at, pr.updated_at, NOW())
FROM proc_requests pr
WHERE pr.pop_file_path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM proc_pop_documents p WHERE p.request_id = pr.id);
