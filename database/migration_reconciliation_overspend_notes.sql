-- Migration: Add overspend_notes column to reconciliations table
-- This stores mandatory overspend justification when actual spend exceeds the float amount.
-- Run this once on the target database.

ALTER TABLE reconciliations
  ADD COLUMN overspend_notes TEXT NULL AFTER notes;
