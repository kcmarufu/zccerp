-- =====================================================================
-- NOTIFICATION BACKFILL
-- Covers all meaningful workflow events for all relevant users.
-- Admin (21) receives everything; requesters/finance/leads get relevant updates.
-- Run once. Safe to re-run (no unique constraint on notifications).
-- =====================================================================

-- ─── REQUEST 12: DON001-CCMT2026-0000001 ─────────────────────────────
-- SUBMITTED by Promise Mupfigo (26) -> Lead approved (Rumbidzai 15) -> Finance approved (Alice 11) -> APPROVED, awaiting dispatch

INSERT INTO notifications (user_id,title,message,type,entity_type,entity_id,link,is_read,created_at) VALUES
-- Submitted
(15, 'New Float Request: DON001-CCMT2026-0000001', 'Promise Mupfigo submitted a new float request requiring your approval.', 'approval_pending', 'request', 12, '/finance/approvals', 1, '2026-05-20 08:58:05'),
(21, 'New Float Request: DON001-CCMT2026-0000001', 'Promise Mupfigo submitted a new float request requiring approval.', 'approval_pending', 'request', 12, '/finance/approvals', 1, '2026-05-20 08:58:05'),
-- Lead approved
(11, 'Float Request Ready: DON001-CCMT2026-0000001', 'A float request has been lead-approved and requires finance approval.', 'approval_pending', 'request', 12, '/finance/approvals', 1, '2026-05-20 08:58:28'),
(31, 'Float Request Ready: DON001-CCMT2026-0000001', 'A float request has been lead-approved and requires finance approval.', 'approval_pending', 'request', 12, '/finance/approvals', 1, '2026-05-20 08:58:28'),
(21, 'Float Request Lead-Approved: DON001-CCMT2026-0000001', 'Rumbidzai Chirwa approved; now with Finance.', 'approval_pending', 'request', 12, '/finance/approvals', 1, '2026-05-20 08:58:28'),
-- Finance approved -> APPROVED (awaiting dispatch) - UNREAD for admin/finance
(26, 'Request Fully Approved: DON001-CCMT2026-0000001', 'Your float request has been fully approved by Finance (Alice Accountant) and will be dispatched soon.', 'success', 'request', 12, '/finance/requests', 0, '2026-05-20 09:04:14'),
(21, 'Request Approved - Dispatch Pending: DON001-CCMT2026-0000001', 'DON001-CCMT2026-0000001 fully approved by Alice Accountant. Awaiting dispatch.', 'approval_pending', 'request', 12, '/finance/approvals', 0, '2026-05-20 09:04:14'),
(11, 'Ready for Dispatch: DON001-CCMT2026-0000001', 'This approved float request is awaiting dispatch.', 'approval_pending', 'request', 12, '/finance/approvals', 0, '2026-05-20 09:04:15'),
(31, 'Ready for Dispatch: DON001-CCMT2026-0000001', 'This approved float request is awaiting dispatch.', 'approval_pending', 'request', 12, '/finance/approvals', 0, '2026-05-20 09:04:15');

-- ─── REQUEST 11: DON002-UKHO-0000001 ─────────────────────────────────
-- Full chain: submitted -> lead approved -> finance approved -> dispatched -> recon submitted -> lead approved -> finance REJECTED recon

INSERT INTO notifications (user_id,title,message,type,entity_type,entity_id,link,is_read,created_at) VALUES
(21, 'New Float Request: DON002-UKHO-0000001', 'Tendai Moyo submitted a new float request requiring approval.', 'approval_pending', 'request', 11, '/finance/approvals', 1, '2026-05-18 16:33:00'),
(21, 'Float Request Lead-Approved: DON002-UKHO-0000001', 'Rumbidzai Chirwa approved; now with Finance.', 'approval_pending', 'request', 11, '/finance/approvals', 1, '2026-05-18 16:33:51'),
(14, 'Request Fully Approved: DON002-UKHO-0000001', 'Your float request has been fully approved by Finance (Alice Accountant) and will be dispatched soon.', 'success', 'request', 11, '/finance/requests', 1, '2026-05-18 16:34:22'),
(21, 'Request Finance-Approved: DON002-UKHO-0000001', 'Float request approved by Alice Accountant. Ready for dispatch.', 'success', 'request', 11, '/finance/approvals', 1, '2026-05-18 16:34:22'),
-- Dispatched (user 14 already has one from live code; admin gets one)
(21, 'Float Dispatched: DON002-UKHO-0000001', 'Float DON002-UKHO-0000001 dispatched to Tendai Moyo.', 'info', 'request', 11, '/finance/approvals', 1, '2026-05-18 16:34:31'),
-- Reconciliation submitted
(11, 'Reconciliation Submitted: DON002-UKHO-0000001', 'Tendai Moyo submitted a reconciliation requiring your review.', 'reconciliation_pending', 'request', 11, '/finance/reconciliation', 1, '2026-05-19 18:43:17'),
(31, 'Reconciliation Submitted: DON002-UKHO-0000001', 'Tendai Moyo submitted a reconciliation requiring your review.', 'reconciliation_pending', 'request', 11, '/finance/reconciliation', 1, '2026-05-19 18:43:17'),
(21, 'Reconciliation Submitted: DON002-UKHO-0000001', 'Tendai Moyo submitted a reconciliation for DON002-UKHO-0000001.', 'reconciliation_pending', 'request', 11, '/finance/reconciliation', 1, '2026-05-19 18:43:17'),
-- Lead approved reconciliation
(14, 'Reconciliation Under Finance Review: DON002-UKHO-0000001', 'Your reconciliation was approved by Rumbidzai Chirwa and is now with Finance.', 'success', 'request', 11, '/finance/reconciliation', 1, '2026-05-19 19:12:34'),
(21, 'Reconciliation Lead-Approved: DON002-UKHO-0000001', 'Reconciliation for DON002-UKHO-0000001 approved by Rumbidzai Chirwa; now with Finance.', 'reconciliation_pending', 'request', 11, '/finance/reconciliation', 1, '2026-05-19 19:12:34'),
-- Finance REJECTED reconciliation - UNREAD
(14, 'Reconciliation Rejected: DON002-UKHO-0000001', 'Your reconciliation was rejected by Alice Accountant. Please review and resubmit.', 'error', 'request', 11, '/finance/reconciliation', 0, '2026-05-19 19:13:23'),
(21, 'Reconciliation Rejected: DON002-UKHO-0000001', 'Reconciliation for DON002-UKHO-0000001 was rejected by Alice Accountant.', 'error', 'request', 11, '/finance/reconciliation', 0, '2026-05-19 19:13:23');

-- ─── REQUEST 10: DON006-CAB3-0000002 ─────────────────────────────────
-- user 16 already has "Float Dispatched" from live code; add admin history + requester approval notification

INSERT INTO notifications (user_id,title,message,type,entity_type,entity_id,link,is_read,created_at) VALUES
(21, 'New Float Request: DON006-CAB3-0000002', 'Blessing Ncube submitted a new float request.', 'approval_pending', 'request', 10, '/finance/approvals', 1, '2026-05-18 14:40:01'),
(21, 'Float Request Lead-Approved: DON006-CAB3-0000002', 'Farai Mutasa approved; now with Finance.', 'approval_pending', 'request', 10, '/finance/approvals', 1, '2026-05-18 14:40:51'),
(16, 'Request Fully Approved: DON006-CAB3-0000002', 'Your float request has been fully approved by Finance (Alice Accountant) and will be dispatched soon.', 'success', 'request', 10, '/finance/requests', 1, '2026-05-18 14:41:38'),
(21, 'Request Finance-Approved: DON006-CAB3-0000002', 'Approved by Alice Accountant. Ready for dispatch.', 'success', 'request', 10, '/finance/approvals', 1, '2026-05-18 14:41:38'),
(21, 'Float Dispatched: DON006-CAB3-0000002', 'Float DON006-CAB3-0000002 dispatched to Blessing Ncube.', 'info', 'request', 10, '/finance/approvals', 1, '2026-05-18 14:42:11');

-- ─── REQUEST 9: DON005-BROT-0000002 ──────────────────────────────────
-- Dispatched, awaiting reconciliation from Promise Mupfigo (26)

INSERT INTO notifications (user_id,title,message,type,entity_type,entity_id,link,is_read,created_at) VALUES
(21, 'New Float Request: DON005-BROT-0000002', 'Promise Mupfigo submitted a new float request.', 'approval_pending', 'request', 9, '/finance/approvals', 1, '2026-05-18 13:04:47'),
(21, 'Float Request Lead-Approved: DON005-BROT-0000002', 'Rumbidzai Chirwa approved; now with Finance.', 'approval_pending', 'request', 9, '/finance/approvals', 1, '2026-05-18 13:05:20'),
(26, 'Request Fully Approved: DON005-BROT-0000002', 'Your float request has been fully approved by Finance (Alice Accountant) and will be dispatched soon.', 'success', 'request', 9, '/finance/requests', 1, '2026-05-18 13:05:50'),
(21, 'Request Finance-Approved: DON005-BROT-0000002', 'Approved by Alice Accountant. Ready for dispatch.', 'success', 'request', 9, '/finance/approvals', 1, '2026-05-18 13:05:50'),
-- Dispatched - UNREAD for requester (action needed: reconcile)
(26, 'Float Dispatched: DON005-BROT-0000002', 'Your float has been dispatched. Please submit your reconciliation within 5 working days.', 'info', 'request', 9, '/finance/reconciliation', 0, '2026-05-18 13:06:04'),
(21, 'Float Dispatched: DON005-BROT-0000002', 'Float DON005-BROT-0000002 dispatched to Promise Mupfigo.', 'info', 'request', 9, '/finance/approvals', 1, '2026-05-18 13:06:04');

-- ─── REQUEST 8: DON007-ADM-0000004 ───────────────────────────────────
-- Full cycle: submitted -> dispatched -> reconciliation submitted -> approved

INSERT INTO notifications (user_id,title,message,type,entity_type,entity_id,link,is_read,created_at) VALUES
(21, 'New Float Request: DON007-ADM-0000004', 'Promise Mupfigo submitted a float request.', 'approval_pending', 'request', 8, '/finance/approvals', 1, '2026-05-18 11:47:16'),
(21, 'Float Dispatched: DON007-ADM-0000004', 'Float DON007-ADM-0000004 dispatched to Promise Mupfigo.', 'info', 'request', 8, '/finance/approvals', 1, '2026-05-18 12:31:39'),
(21, 'Reconciliation Submitted: DON007-ADM-0000004', 'Promise Mupfigo submitted a reconciliation.', 'reconciliation_pending', 'request', 8, '/finance/reconciliation', 1, '2026-05-18 12:48:58'),
(21, 'Reconciliation Lead-Approved: DON007-ADM-0000004', 'Approved by Rumbidzai Chirwa; now with Finance.', 'reconciliation_pending', 'request', 8, '/finance/reconciliation', 1, '2026-05-18 12:49:43'),
(26, 'Reconciliation Approved: DON007-ADM-0000004', 'Your reconciliation has been fully approved by Alice Accountant. The process is complete.', 'success', 'request', 8, '/finance/reconciliation', 1, '2026-05-18 12:50:37'),
(21, 'Reconciliation Approved: DON007-ADM-0000004', 'Reconciliation for DON007-ADM-0000004 fully approved by Alice Accountant.', 'success', 'request', 8, '/finance/reconciliation', 1, '2026-05-18 12:50:37');

-- ─── COMPLETED RECONCILIATIONS (summary for admin) ───────────────────

INSERT INTO notifications (user_id,title,message,type,entity_type,entity_id,link,is_read,created_at) VALUES
(21, 'Reconciliation Approved: DON009-NCA-0000001', 'Reconciliation for DON009-NCA-0000001 fully approved.', 'success', 'request', 6, '/finance/reconciliation', 1, '2026-05-07 15:43:19'),
(21, 'Reconciliation Approved: DON007-ADM-0000002', 'Reconciliation for DON007-ADM-0000002 fully approved.', 'success', 'request', 5, '/finance/reconciliation', 1, '2026-05-06 16:50:07'),
(21, 'Reconciliation Approved: DON008-CR2026-0000001', 'Reconciliation for DON008-CR2026-0000001 fully approved.', 'success', 'request', 4, '/finance/reconciliation', 1, '2026-05-05 16:30:04'),
(21, 'Reconciliation Approved: DON005-BROT-0000001', 'Reconciliation for DON005-BROT-0000001 fully approved.', 'success', 'request', 3, '/finance/reconciliation', 1, '2026-05-05 15:39:16'),
(21, 'Reconciliation Approved: DON006-CAB3-0000001', 'Reconciliation for DON006-CAB3-0000001 fully approved.', 'success', 'request', 2, '/finance/reconciliation', 1, '2026-05-05 14:47:04'),
(21, 'Reconciliation Approved: DON007-ADM-0000001-ADM', 'Reconciliation for DON007-ADM-0000001-ADM fully approved.', 'success', 'request', 1, '/finance/reconciliation', 1, '2026-05-05 09:25:36');
