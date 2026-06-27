-- ============================================================================
-- Per Diem: per-row recipient and return date
-- - Each trip row can target a different employee (recipient_user_id)
-- - Each trip row stores both depart (trip_date) and expected return_date
-- ============================================================================

ALTER TABLE per_diem_trip_items
  ADD COLUMN return_date       DATE         NULL AFTER trip_date,
  ADD COLUMN recipient_user_id INT          NULL AFTER claim_id,
  ADD COLUMN recipient_name    VARCHAR(255) NULL AFTER recipient_user_id,
  ADD CONSTRAINT fk_pdti_recipient FOREIGN KEY (recipient_user_id)
    REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX idx_pdti_recipient ON per_diem_trip_items (recipient_user_id);
