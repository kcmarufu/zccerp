-- ============================================================
-- Migration: Activity Request Fields
-- Adds is_activity_request, activity_start_date, activity_end_date
-- to the requests table to support the Activity Request feature.
-- ============================================================

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS is_activity_request TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = this float is for a scheduled activity',
  ADD COLUMN IF NOT EXISTS activity_start_date DATE NULL DEFAULT NULL
    COMMENT 'Activity start date (required when is_activity_request = 1)',
  ADD COLUMN IF NOT EXISTS activity_end_date   DATE NULL DEFAULT NULL
    COMMENT 'Activity end date (required when is_activity_request = 1; drives reconciliation due date)';

-- Index for quick filtering of activity requests
CREATE INDEX IF NOT EXISTS idx_requests_is_activity ON requests (is_activity_request);
