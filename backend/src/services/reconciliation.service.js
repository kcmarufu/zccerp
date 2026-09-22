/**
 * Reconciliation Service
 * Handles the reconciliation workflow after dispatch
 * 
 * Flow: DISPATCHED -> requester submits reconciliation -> PENDING_RECONCILIATION -> Finance approves -> RECONCILED
 */

const { query, transaction, pool } = require('../config/database');
const {
  REQUEST_STATUS, ROLES, FINANCE_DEPT_CODE, ADMIN_HR_DEPT_CODE,
  isGsTrackRole, gsTrackRequesterSql
} = require('../config/roles');
const notificationService = require('./notification.service');

/**
 * Can this approver act on the departmental (Lead/HOP) stage of a reconciliation?
 *
 * This mirrors what getPendingLeadReconciliations() puts in each approver's
 * queue — the two used to disagree, so approvers were shown items the action
 * then refused. In particular the Admin-donor gate compared the department
 * code against 'HR', a code that does not exist (Admin & HR is 'AHR'), so
 * *every* Lead was blocked from Admin-donor reconciliations.
 *
 * @param {object} request  request row, incl. donor_type and approver_dept
 * @param {string} role     approver's role
 * @param {string} deptCode approver's department code
 * @returns {string|null}   null when allowed, otherwise the reason to refuse
 */
function leadReconRefusalReason(request, role, deptCode) {
  // A Head of Department's own reconciliation is reviewed by the General
  // Secretary (a Super Admin account), never by a departmental desk.
  if (isGsTrackRole(request.requester_role)) {
    return role === ROLES.ADMIN
      ? null
      : "A Head of Department's reconciliation is reviewed by the General Secretary";
  }

  // Super Admin and Head of Department carry cross-department authority.
  if (role === ROLES.ADMIN || role === ROLES.HEAD_OF_PROGRAMS) return null;

  if (role !== ROLES.PROGRAM_LEAD) {
    return 'Only a Department Lead or Head of Department can review reconciliations at this stage';
  }

  // The Finance (FOS) Department Lead oversees reconciliations across all
  // departments — at the departmental stage as well as the Finance stage.
  if (deptCode === FINANCE_DEPT_CODE) return null;

  // Admin-donor reconciliations belong to the Admin & HR department.
  if (request.donor_type === 'ADMIN') {
    return deptCode === ADMIN_HR_DEPT_CODE
      ? null
      : 'Admin reconciliations can only be reviewed by the Admin & HR Department Lead or Head of Department';
  }

  // For cross-dept requests, use the routing (project-owning) dept; otherwise
  // the requester's own dept.
  const effectiveDeptId = Number(request.routing_department_id || request.department_id);
  if (effectiveDeptId !== Number(request.approver_dept)) {
    return 'You can only review reconciliations from your department (or the project-owning department for cross-department requests)';
  }

  return null;
}

/**
 * Nobody reviews their own reconciliation. The Finance Head of Department
 * raises floats of their own and also sits on the Finance review desk, so
 * without this they could approve their own spending.
 */
function assertNotOwnReconciliation(request, approverId) {
  if (Number(request.requester_id) === Number(approverId)) {
    throw new Error('You cannot review your own reconciliation — another approver must handle it.');
  }
}

/** Was this request raised by someone on the General Secretary track? */
async function isGsTrackRequester(connection, requesterId) {
  const [rows] = await connection.execute(
    'SELECT rr.role_name AS role FROM users u JOIN roles rr ON rr.id = u.role_id WHERE u.id = ?',
    [requesterId]
  );
  return isGsTrackRole(rows[0]?.role);
}

/**
 * Who may act at the Finance review stage: the Finance desk itself, plus the
 * Finance department's own Lead / Head of Department (and Super Admin).
 */
function canReviewReconAsFinance(role, deptCode) {
  if (role === ROLES.FINANCE_CLERK || role === ROLES.ADMIN) return true;
  return deptCode === FINANCE_DEPT_CODE &&
    (role === ROLES.PROGRAM_LEAD || role === ROLES.HEAD_OF_PROGRAMS);
}

/**
 * Descriptions written by approveReconciliation() when it moves money, and by
 * this file when it moves it back. Matching on description is what lets an undo
 * touch *only* the reconciliation's own budget effects and leave the original
 * dispatch deduction — booked against the same request_id — alone.
 */
const RECON_EFFECT_DESC = 'Reconciliation over-expenditure for request #';
const RECON_RETURN_DESC = 'Reconciliation change returned for request #';
const RECON_UNDO_DESC = 'Reconciliation undo for request #';

/**
 * Invert the budget movements a Finance reconciliation approval made.
 *
 * approveReconciliation() writes one transaction per affected budget line: a
 * DEDUCTION when actual spend exceeded budget, or a REVERSAL when change came
 * back. Undoing means applying each one backwards and recording that as its own
 * transaction, so the ledger reads forward rather than having rows deleted from
 * under it.
 *
 * Only effects written *since the last undo* are considered. A reconciliation
 * can be approved, undone, corrected and approved again; without that cutoff
 * the second undo would replay the first approval's rows a second time and
 * double-count them.
 *
 * @returns {Promise<Array>} one entry per budget line touched, for the response
 */
async function undoReconciliationBudgetEffects(connection, requestId, requestCode, approverId) {
  const [lastUndo] = await connection.execute(
    `SELECT MAX(id) as id FROM budget_transactions
     WHERE request_id = ? AND description LIKE ?`,
    [requestId, `${RECON_UNDO_DESC}%`]
  );
  const cutoffId = lastUndo[0]?.id || 0;

  const [effects] = await connection.execute(
    `SELECT bt.*, bl.donor_id FROM budget_transactions bt
     JOIN budget_lines bl ON bl.id = bt.budget_line_id
     WHERE bt.request_id = ? AND bt.id > ?
       AND (bt.description LIKE ? OR bt.description LIKE ?)
     ORDER BY bt.id`,
    [requestId, cutoffId, `${RECON_EFFECT_DESC}%`, `${RECON_RETURN_DESC}%`]
  );

  const donorDeltas = new Map();
  const undone = [];

  for (const effect of effects) {
    const amount = parseFloat(effect.amount);
    if (!amount) continue;

    // A DEDUCTION added to spent_amount, so undoing it subtracts; a REVERSAL
    // subtracted, so undoing it adds back.
    const addsToSpent = effect.transaction_type !== 'DEDUCTION';

    const [rows] = await connection.execute(
      'SELECT (allocated_amount - spent_amount) as balance FROM budget_lines WHERE id = ? FOR UPDATE',
      [effect.budget_line_id]
    );
    if (rows.length === 0) continue;
    const balanceBefore = parseFloat(rows[0].balance);

    await connection.execute(
      `UPDATE budget_lines
       SET spent_amount = GREATEST(spent_amount ${addsToSpent ? '+' : '-'} ?, 0), updated_at = NOW()
       WHERE id = ?`,
      [amount, effect.budget_line_id]
    );

    if (effect.donor_id) {
      const signed = addsToSpent ? amount : -amount;
      donorDeltas.set(effect.donor_id, (donorDeltas.get(effect.donor_id) || 0) + signed);
    }

    const [after] = await connection.execute(
      'SELECT (allocated_amount - spent_amount) as balance FROM budget_lines WHERE id = ?',
      [effect.budget_line_id]
    );
    const balanceAfter = parseFloat(after[0].balance);

    await connection.execute(
      `INSERT INTO budget_transactions
       (budget_line_id, request_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [effect.budget_line_id, requestId,
       addsToSpent ? 'DEDUCTION' : 'REVERSAL', amount,
       balanceBefore, balanceAfter,
       `${RECON_UNDO_DESC}${requestCode} — reversing "${effect.description}"`,
       approverId]
    );

    undone.push({
      budgetLineId: effect.budget_line_id,
      amount,
      direction: addsToSpent ? 'RE_DEDUCTED' : 'RETURNED_TO_BUDGET',
      balanceBefore,
      balanceAfter
    });
  }

  for (const [donorId, delta] of donorDeltas) {
    if (!delta) continue;
    await connection.execute(
      delta > 0
        ? 'UPDATE donors SET total_spent = total_spent + ?, updated_at = NOW() WHERE id = ?'
        : 'UPDATE donors SET total_spent = GREATEST(total_spent - ?, 0), updated_at = NOW() WHERE id = ?',
      [Math.abs(delta), donorId]
    );
  }

  return undone;
}

/**
 * The reconciliation deadline: four working days after the money was used.
 *
 * The clock starts from the day the activity ended (activity requests) or the
 * day the float was dispatched (everything else), matching getOverdueCount().
 * Expressed in SQL so a list view can show, per row, when a reconciliation was
 * due and whether it is late — without shipping the rule to the client.
 */
const RECON_DUE_BASE_SQL = `
  CASE WHEN r.is_activity_request = 1 AND r.activity_end_date IS NOT NULL
       THEN r.activity_end_date
       ELSE DATE(r.dispatched_at)
  END`;

/**
 * Date of the 4th working day after `base`.
 *
 * A base landing on a weekend is first slid back to the Friday (nothing accrues
 * over a weekend), which leaves a Mon-Fri base; from there the 4th working day
 * is 4 days later from a Monday and 6 from any other weekday, since exactly one
 * weekend falls inside the span.
 */
const reconDueDateSql = (base) => {
  const weekdayBase = `DATE_SUB(${base}, INTERVAL GREATEST(WEEKDAY(${base}) - 4, 0) DAY)`;
  return `
    CASE WHEN ${base} IS NULL THEN NULL ELSE
      DATE_ADD(${weekdayBase},
               INTERVAL (4 + 2 * FLOOR((WEEKDAY(${weekdayBase}) + 4) / 5)) DAY)
    END`;
};

/**
 * Working days (Mon-Fri) strictly after `from` and up to and including `to`,
 * as a SQL expression — the query-side twin of calcWorkingDays() below.
 *
 * Both arguments must be DATEs (wrap a DATETIME in DATE()). The identity used:
 * for any date D, `TO_DAYS(D) - WEEKDAY(D)` is the day-number of that week's
 * Monday, so the difference between the two Mondays divided by 7 is the number
 * of whole weeks between them — five working days each — and the two LEAST()
 * terms add the part-week at either end, clamping Sat/Sun onto Friday.
 *
 * Written closed-form rather than as a numbers-table SUM (the shape used by
 * getOverdueCount) because a reconciliation can sit on a desk for months, and a
 * fixed numbers table silently stops counting past its last row.
 */
const workingDaysBetweenSql = (from, to) => `
  CAST(5 * ((TO_DAYS(${to}) - WEEKDAY(${to}) - TO_DAYS(${from}) + WEEKDAY(${from})) / 7)
       + LEAST(WEEKDAY(${to}) + 1, 5) - LEAST(WEEKDAY(${from}) + 1, 5)
       AS SIGNED)`;

/**
 * How long a reconciliation may sit on a Lead/HOP desk before it counts as
 * stale, and how many stale ones bar that approver from approving floats.
 *
 * The clock starts at rec.created_at — the moment the reconciliation landed on
 * the desk. submitReconciliation() resets created_at on every resubmission, so
 * a returned-and-corrected reconciliation starts its four days afresh and the
 * reviewer is never charged for the requester's turnaround time.
 */
const STALE_LEAD_RECON_WORKING_DAYS = 4;
const STALE_LEAD_RECON_LIMIT = 2;

/** Only these roles hold a lead-review desk, so only they can build a backlog. */
const LEAD_DESK_ROLES = [ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS];

/**
 * The department scoping for a Lead/HOP's reconciliation review desk.
 *
 * Extracted so the queue (getPendingLeadReconciliations), the ageing figures it
 * displays, and the backlog gate that blocks approvals all describe the same
 * desk. If they drifted, an approver could be blocked over a reconciliation
 * their own queue never showed them.
 *
 * Returns null for roles that hold no lead desk of their own (Finance Clerk,
 * Super Admin), whose callers apply no filter and see everything.
 *
 * `ownedOnly` narrows the Finance (FOS) Lead/HOP from oversight to ownership.
 * Their queue deliberately spans every department, but the backlog block must
 * only count what is genuinely theirs to clear — judged on the oversight queue
 * they would be blocked by any other department's inaction, which would take
 * the Finance approval stage down with them.
 */
function leadDeskScope(approverRole, departmentId, departmentCode, { ownedOnly = false } = {}) {
  if (!LEAD_DESK_ROLES.includes(approverRole)) return null;

  // Heads of Department's reconciliations go to the General Secretary, so they
  // never sit on — or count against — a departmental desk.
  const notGsTrack = `AND NOT ${gsTrackRequesterSql('r')}`;

  // FOS (Finance) Lead/HOP oversee reconciliations across every department.
  if (departmentCode === FINANCE_DEPT_CODE && !ownedOnly) return { filter: notGsTrack, params: [] };

  // AHR: own-dept requests, requests routed to them, plus every Admin-donor
  // request wherever it was raised.
  if (departmentCode === ADMIN_HR_DEPT_CODE) {
    return {
      filter: `AND (
        (r.routing_department_id IS NULL AND r.department_id = ?)
        OR r.routing_department_id = ?
        OR EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN')
      ) ${notGsTrack}`,
      params: [departmentId, departmentId]
    };
  }

  // Every other department: own-dept requests with no cross-dept routing, plus
  // requests explicitly routed to them. Admin-donor requests belong to AHR.
  return {
    filter: `AND (
      (r.routing_department_id IS NULL AND r.department_id = ?)
      OR r.routing_department_id = ?
    ) AND NOT EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN')
    ${notGsTrack}`,
    params: [departmentId, departmentId]
  };
}

/**
 * Calculate number of working days (Mon-Fri) between two dates.
 * Counts from the day after startDate up to and including endDate.
 * @param {Date|string} startDate - The dispatch date
 * @param {Date|string} endDate   - The reconciliation submission date
 * @returns {number} Number of working days
 */
function calcWorkingDays(startDate, endDate) {
  let count = 0;
  const start = new Date(startDate);
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

class ReconciliationService {

  /**
   * Submit a reconciliation for a dispatched request
   * Called by the requester after receiving the float
   */
  async submitReconciliation(requestId, userId, data, ipAddress) {
    const result = await transaction(async (connection) => {
      // Lock and validate the request
      const [requests] = await connection.execute(
        `SELECT r.*, u.department_id as requester_dept
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         WHERE r.id = ? FOR UPDATE`,
        [requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      // Only the requester can reconcile
      if (request.requester_id !== userId) {
        throw new Error('Only the original requester can submit a reconciliation');
      }

      // Must be in DISPATCHED status
      if (request.status !== REQUEST_STATUS.DISPATCHED) {
        throw new Error(`Cannot reconcile request with status: ${request.status}. Request must be dispatched first.`);
      }

      const { items, notes, overspendNotes, totalSpent, totalReturned, actualStartDate, actualEndDate } = data;

      // Validate actual dates for activity requests
      const isActivity = Boolean(request.is_activity_request);
      if (isActivity && !actualEndDate) {
        throw new Error('Actual End Date is required for activity requests');
      }

      // Determine dispatch time for timeliness calculation
      // Use dispatched_at column; fall back to approval_logs for older records
      let dispatchedAt = request.dispatched_at;
      if (!dispatchedAt) {
        const [logRows] = await connection.execute(
          `SELECT created_at FROM approval_logs WHERE request_id = ? AND action = 'DISPATCHED' ORDER BY created_at DESC LIMIT 1`,
          [requestId]
        );
        if (logRows.length > 0) dispatchedAt = logRows[0].created_at;
      }

      const submissionTime = new Date();
      const workingDaysTaken = dispatchedAt ? calcWorkingDays(dispatchedAt, submissionTime) : null;

      // Determine timeliness:
      // - Activity requests: 4 working days from actual_end_date (if provided) or activity_end_date
      // - Non-activity requests: 4 working days from dispatch date
      let submissionTimeliness = null;
      let workingDaysFromBase = null;
      if (workingDaysTaken !== null) {
        const baseDate = isActivity
          ? (actualEndDate || request.activity_end_date)  // prefer actual end date
          : dispatchedAt;
        workingDaysFromBase = baseDate ? calcWorkingDays(baseDate, submissionTime) : workingDaysTaken;
        submissionTimeliness = workingDaysFromBase !== null
          ? (workingDaysFromBase <= 4 ? 'ON_TIME' : 'LATE')
          : null;
      }

      // Check if Finance previously rejected this reconciliation.
      // If so, the Lead already approved once — skip Lead re-approval and send
      // directly back to Finance to avoid restarting the entire chain.
      const [financeRejectionLog] = await connection.execute(
        `SELECT id FROM approval_logs
         WHERE request_id = ? AND action = 'REJECTED' AND previous_status = ?
         ORDER BY created_at DESC LIMIT 1`,
        [requestId, REQUEST_STATUS.RECON_PENDING_FINANCE]
      );
      const wasFinanceRejected = financeRejectionLog.length > 0;
      const nextStatus = wasFinanceRejected
        ? REQUEST_STATUS.RECON_PENDING_FINANCE
        : REQUEST_STATUS.RECON_PENDING_LEAD;

      // A request has exactly ONE reconciliation record, which is amended in
      // place each time it is resubmitted. Inserting a fresh row per attempt
      // left the requester looking at a pile of near-identical records — one
      // per rejection — with no way to tell which one was live.
      const [priorRecons] = await connection.execute(
        `SELECT id FROM reconciliations WHERE request_id = ? ORDER BY id DESC LIMIT 1`,
        [requestId]
      );
      const priorRecon = priorRecons[0] || null;

      // Which attempt this is. Counted from the audit trail rather than held on
      // the record, so it stays right for requests that were resubmitted before
      // reconciliations became single-record. Every reconciliation submission
      // logs SUBMITTED out of DISPATCHED, and nothing else does.
      const [[submissionCount]] = await connection.execute(
        `SELECT COUNT(*) AS n FROM approval_logs
          WHERE request_id = ? AND action = 'SUBMITTED' AND previous_status = ?`,
        [requestId, REQUEST_STATUS.DISPATCHED]
      );
      const attemptNo = Number(submissionCount.n || 0) + 1;

      let reconciliationId;

      if (priorRecon) {
        // Resubmission after a rejection: revive the same row. The reviewer's
        // verdict on the previous attempt is cleared because it no longer
        // describes what is being reviewed; approval_logs keeps the full
        // history of every decision taken along the way.
        //
        // created_at is moved to the submission time of THIS attempt: the
        // history views date an attempt by it and match it to the decisions
        // taken during its lifetime.
        reconciliationId = priorRecon.id;
        await connection.execute(
          `UPDATE reconciliations
              SET reconciled_by = ?, status = 'SUBMITTED',
                  total_spent = ?, total_returned = ?, notes = ?, overspend_notes = ?,
                  submission_timeliness = ?, working_days_taken = ?,
                  actual_start_date = ?, actual_end_date = ?,
                  finance_reviewer_id = NULL, finance_comments = NULL, reviewed_at = NULL,
                  created_at = NOW(), updated_at = NOW()
            WHERE id = ?`,
          [userId, totalSpent || 0, totalReturned || 0, notes || null, overspendNotes || null,
           submissionTimeliness, workingDaysFromBase ?? workingDaysTaken,
           actualStartDate || null, actualEndDate || null, reconciliationId]
        );
        await connection.execute(
          `DELETE FROM reconciliation_items WHERE reconciliation_id = ?`,
          [reconciliationId]
        );
      } else {
        const [reconResult] = await connection.execute(
          `INSERT INTO reconciliations
           (request_id, reconciled_by, status, total_spent, total_returned, notes, overspend_notes, submission_timeliness, working_days_taken, actual_start_date, actual_end_date, created_at, updated_at)
           VALUES (?, ?, 'SUBMITTED', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [requestId, userId, totalSpent || 0, totalReturned || 0, notes || null, overspendNotes || null,
           submissionTimeliness, workingDaysFromBase ?? workingDaysTaken,
           actualStartDate || null, actualEndDate || null]
        );
        reconciliationId = reconResult.insertId;
      }

      // Insert reconciliation items
      if (items && items.length > 0) {
        for (const item of items) {
          await connection.execute(
            `INSERT INTO reconciliation_items
             (reconciliation_id, request_item_id, budget_line_id, description, budgeted_amount, actual_amount, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [reconciliationId, item.requestItemId || null, item.budgetLineId || null, item.description,
             item.budgetedAmount || 0, item.actualAmount || 0, item.notes || null]
          );
        }
      }

      // Advance to the correct stage
      await connection.execute(
        `UPDATE requests
         SET status = ?, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [nextStatus, requestId]
      );

      // Log the reconciliation submission
      await connection.execute(
        `INSERT INTO approval_logs
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, 'GENERAL_USER', 'SUBMITTED', ?, ?, ?, ?)`,
        [requestId, userId, REQUEST_STATUS.DISPATCHED, nextStatus,
         attemptNo > 1
           ? `Reconciliation resubmitted (attempt ${attemptNo})${wasFinanceRejected ? ' — Finance review resumed' : ''}`
           : 'Reconciliation submitted',
         ipAddress]
      );

      return {
        success: true,
        message: wasFinanceRejected
          ? 'Reconciliation resubmitted — sent directly to Finance for review'
          : attemptNo > 1
            ? 'Reconciliation resubmitted for review'
            : 'Reconciliation submitted successfully',
        reconciliationId,
        attemptNo,
        newStatus: nextStatus,
        _notif: { requestCode: request.request_code, requesterId: userId, deptId: request.department_id, timeliness: submissionTimeliness, routingDeptId: request.routing_department_id || null, nextStatus }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      const [requester] = await query(
        'SELECT rr.role_name AS role FROM users u JOIN roles rr ON rr.id = u.role_id WHERE u.id = ?',
        [n.requesterId]
      ).catch(() => []);
      if (n.nextStatus === REQUEST_STATUS.RECON_PENDING_LEAD && isGsTrackRole(requester?.role)) {
        notificationService.onRequestAwaitingGs(requestId, n.requestCode, n.requesterId, 'reconciliation').catch(() => {});
      } else {
        notificationService.onReconciliationSubmitted(requestId, n.requestCode, n.requesterId, n.deptId, n.timeliness, n.routingDeptId).catch(() => {});
      }
    }
    return result;
  }

  /**
   * Update an existing reconciliation (requester edits before final approval)
   * Allowed when request status is RECON_PENDING_LEAD or RECON_PENDING_FINANCE.
   */
  async updateReconciliation(requestId, userId, data, ipAddress) {
    const result = await transaction(async (connection) => {
      const [requests] = await connection.execute(
        `SELECT r.*, u.department_id as requester_dept
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         WHERE r.id = ? FOR UPDATE`,
        [requestId]
      );

      if (requests.length === 0) throw new Error('Request not found');
      const request = requests[0];

      if (request.requester_id !== userId) {
        throw new Error('Only the original requester can edit a reconciliation');
      }

      const editableStatuses = [REQUEST_STATUS.RECON_PENDING_LEAD, REQUEST_STATUS.RECON_PENDING_FINANCE];
      if (!editableStatuses.includes(request.status)) {
        throw new Error(`Cannot edit reconciliation with status: ${request.status}. Only pending-review records are editable.`);
      }

      // Find the active SUBMITTED reconciliation
      const [recons] = await connection.execute(
        `SELECT * FROM reconciliations WHERE request_id = ? AND status = 'SUBMITTED' ORDER BY created_at DESC LIMIT 1`,
        [requestId]
      );
      if (recons.length === 0) throw new Error('No active reconciliation found to update');
      const reconciliation = recons[0];

      const { items, notes, overspendNotes, totalSpent, totalReturned, actualStartDate, actualEndDate } = data;

      // Validate actual dates for activity requests
      if (Boolean(request.is_activity_request) && !actualEndDate && !reconciliation.actual_end_date) {
        throw new Error('Actual End Date is required for activity requests');
      }

      // Update reconciliation header
      await connection.execute(
        `UPDATE reconciliations
         SET total_spent = ?, total_returned = ?, notes = ?, overspend_notes = ?,
             actual_start_date = COALESCE(?, actual_start_date),
             actual_end_date = COALESCE(?, actual_end_date),
             updated_at = NOW()
         WHERE id = ?`,
        [totalSpent || 0, totalReturned || 0, notes || null, overspendNotes || null,
         actualStartDate || null, actualEndDate || null, reconciliation.id]
      );

      // Replace reconciliation items
      await connection.execute(`DELETE FROM reconciliation_items WHERE reconciliation_id = ?`, [reconciliation.id]);
      if (items && items.length > 0) {
        for (const item of items) {
          await connection.execute(
            `INSERT INTO reconciliation_items
             (reconciliation_id, request_item_id, budget_line_id, description, budgeted_amount, actual_amount, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [reconciliation.id, item.requestItemId || null, item.budgetLineId || null, item.description,
             item.budgetedAmount || 0, item.actualAmount || 0, item.notes || null]
          );
        }
      }

      // Log the edit in audit trail
      await connection.execute(
        `INSERT INTO approval_logs
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, 'GENERAL_USER', 'EDITED', ?, ?, 'Reconciliation updated by requester', ?)`,
        [requestId, userId, request.status, request.status, ipAddress]
      );

      return {
        success: true,
        message: 'Reconciliation updated successfully',
        reconciliationId: reconciliation.id
      };
    });
    return result;
  }

  /**
   * Finance approves a reconciliation
   * 
   * Budget adjustment logic (only on final approval):
   * - For each budget line in the request, compare original budgeted amount vs actual spent
   * - Over-expenditure: actual > budgeted → further deduct the difference from the budget line
   * - Change returned: actual < budgeted → reverse the difference back to the budget line
   */
  async approveReconciliation(requestId, approverId, approverRole, comments, ipAddress, approverDeptCode) {
    if (!canReviewReconAsFinance(approverRole, approverDeptCode)) {
      throw new Error('Only the Finance desk, or the Finance Department Lead / Head of Department, can approve at Finance review');
    }
    const result = await transaction(async (connection) => {
      // Lock request
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      // Finance, Admin, and HOP can approve at either pending stage directly to RECONCILED
      const validStatuses = [REQUEST_STATUS.RECON_PENDING_LEAD, REQUEST_STATUS.RECON_PENDING_FINANCE];
      if (!validStatuses.includes(request.status)) {
        throw new Error(`Cannot approve reconciliation for request with status: ${request.status}. Must be pending lead or finance review.`);
      }

      assertNotOwnReconciliation(request, approverId);

      // The Finance desk may normally settle a reconciliation straight from the
      // departmental stage. A Head of Department's is the exception: the General
      // Secretary reviews it first, then Finance — neither skips the other.
      if (request.status === REQUEST_STATUS.RECON_PENDING_LEAD &&
          await isGsTrackRequester(connection, request.requester_id)) {
        throw new Error(
          "A Head of Department's reconciliation is reviewed by the General Secretary first, then by Finance."
        );
      }

      // Get the reconciliation
      const [recons] = await connection.execute(
        'SELECT * FROM reconciliations WHERE request_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        [requestId, 'SUBMITTED']
      );

      if (recons.length === 0) {
        throw new Error('No pending reconciliation found for this request');
      }

      const reconciliation = recons[0];

      // Get reconciliation items with their matching request items and budget lines.
      // For additional-cost items (no request_item_id), fall back to the
      // budget_line_id that the requester explicitly selected on submission.
      const [reconItems] = await connection.execute(
        `SELECT
          rci.id as recon_item_id,
          rci.request_item_id,
          rci.budget_line_id as extra_budget_line_id,
          rci.description,
          rci.budgeted_amount,
          rci.actual_amount,
          ri.budget_line_id as req_budget_line_id,
          ri.quantity,
          ri.unit_price,
          (ri.quantity * ri.unit_price) as original_line_total,
          COALESCE(ri.budget_line_id, rci.budget_line_id) as budget_line_id,
          bl.id as bl_id,
          bl.budget_code,
          bl.budget_name,
          bl.spent_amount as bl_spent,
          bl.allocated_amount as bl_allocated,
          (bl.allocated_amount - bl.spent_amount) as bl_balance,
          bl.donor_id
         FROM reconciliation_items rci
         LEFT JOIN request_items ri ON rci.request_item_id = ri.id
         LEFT JOIN budget_lines bl ON COALESCE(ri.budget_line_id, rci.budget_line_id) = bl.id
         WHERE rci.reconciliation_id = ?`,
        [reconciliation.id]
      );

      // Group adjustments by budget line to handle multiple items per line
      const budgetAdjustments = {};
      // Track items that could not be mapped to a specific budget line so the
      // residual is still applied via the header-level proportional fallback.
      let unmappedDifference = 0;
      let allocatedItemDiff = 0;

      for (const item of reconItems) {
        const budgeted = parseFloat(item.budgeted_amount) || 0;
        const actual = parseFloat(item.actual_amount) || 0;
        const difference = actual - budgeted; // positive = over-spent, negative = change returned

        if (difference === 0) continue;

        if (!item.budget_line_id) {
          unmappedDifference += difference;
          continue;
        }

        if (!budgetAdjustments[item.budget_line_id]) {
          budgetAdjustments[item.budget_line_id] = {
            budgetLineId: item.budget_line_id,
            budgetCode: item.budget_code,
            budgetName: item.budget_name,
            donorId: item.donor_id,
            currentBalance: parseFloat(item.bl_balance),
            totalAdjustment: 0,
            details: []
          };
        }

        budgetAdjustments[item.budget_line_id].totalAdjustment += difference;
        budgetAdjustments[item.budget_line_id].details.push({
          description: item.description,
          budgeted,
          actual,
          difference
        });
        allocatedItemDiff += difference;
      }

      // Compute residual from the reconciliation header that was NOT covered
      // by per-item adjustments. This catches surpluses/overspends that came
      // in via items whose budget line could not be resolved, and any drift
      // between the header totals and the sum of item-level differences.
      const totalSpent = parseFloat(reconciliation.total_spent) || 0;
      const totalReturned = parseFloat(reconciliation.total_returned) || 0;
      const requestTotal = parseFloat(request.total_amount) || 0;
      const headerDifference = totalSpent - requestTotal; // positive = over-expenditure
      const residual = (headerDifference - allocatedItemDiff);

      const needsHeaderFallback = Math.abs(residual) > 0.005 || Math.abs(unmappedDifference) > 0.005;

      if (needsHeaderFallback) {
        // Distribute the residual proportionally across the request's budget lines.
        const [requestItems] = await connection.execute(
          `SELECT ri.budget_line_id, ri.quantity, ri.unit_price,
                  (ri.quantity * ri.unit_price) as line_total,
                  bl.budget_code, bl.budget_name, bl.donor_id,
                  bl.allocated_amount, bl.spent_amount,
                  (bl.allocated_amount - bl.spent_amount) as bl_balance
           FROM request_items ri
           JOIN budget_lines bl ON ri.budget_line_id = bl.id
           WHERE ri.request_id = ?`,
          [requestId]
        );

        if (requestItems.length > 0) {
          for (const ri of requestItems) {
            const lineTotal = parseFloat(ri.line_total) || 0;
            const proportion = requestTotal > 0 ? lineTotal / requestTotal : 1 / requestItems.length;
            const adjustment = residual * proportion;

            if (adjustment === 0) continue;

            if (!budgetAdjustments[ri.budget_line_id]) {
              budgetAdjustments[ri.budget_line_id] = {
                budgetLineId: ri.budget_line_id,
                budgetCode: ri.budget_code,
                budgetName: ri.budget_name,
                donorId: ri.donor_id,
                currentBalance: parseFloat(ri.bl_balance),
                totalAdjustment: 0,
                details: []
              };
            }

            budgetAdjustments[ri.budget_line_id].totalAdjustment += adjustment;
            budgetAdjustments[ri.budget_line_id].details.push({
              description: 'Header-level reconciliation residual',
              budgeted: lineTotal,
              actual: lineTotal + adjustment,
              difference: adjustment
            });
          }
        }
      }

      // (Header-fallback handled above — ensures both per-item and residual
      // effects are applied so that surplus and overspend offset correctly.)
      void totalReturned; // kept for parity with prior interface

      // Apply budget adjustments
      const adjustmentResults = [];

      for (const blId of Object.keys(budgetAdjustments)) {
        const adj = budgetAdjustments[blId];
        const adjustment = Math.round(adj.totalAdjustment * 100) / 100; // round to 2 decimals

        if (adjustment === 0) continue;

        // Get current balance before adjustment
        const [currentBl] = await connection.execute(
          'SELECT allocated_amount, spent_amount, (allocated_amount - spent_amount) as balance, donor_id FROM budget_lines WHERE id = ? FOR UPDATE',
          [adj.budgetLineId]
        );

        if (currentBl.length === 0) continue;

        const balanceBefore = parseFloat(currentBl[0].balance);
        const donorId = currentBl[0].donor_id;

        if (adjustment > 0) {
          // Over-expenditure: FURTHER DEDUCT from budget line (increase spent_amount)
          await connection.execute(
            `UPDATE budget_lines 
             SET spent_amount = spent_amount + ?, updated_at = NOW()
             WHERE id = ?`,
            [adjustment, adj.budgetLineId]
          );

          // Update donor total_spent (increase)
          if (donorId) {
            await connection.execute(
              `UPDATE donors SET total_spent = total_spent + ?, updated_at = NOW() WHERE id = ?`,
              [adjustment, donorId]
            );
          }
        } else {
          // Change returned: REVERSE back to budget line (decrease spent_amount)
          const returnAmount = Math.abs(adjustment);
          await connection.execute(
            `UPDATE budget_lines 
             SET spent_amount = GREATEST(spent_amount - ?, 0), updated_at = NOW()
             WHERE id = ?`,
            [returnAmount, adj.budgetLineId]
          );

          // Update donor total_spent (decrease)
          if (donorId) {
            await connection.execute(
              `UPDATE donors SET total_spent = GREATEST(total_spent - ?, 0), updated_at = NOW() WHERE id = ?`,
              [returnAmount, donorId]
            );
          }
        }

        // Get updated balance
        const [updatedBl] = await connection.execute(
          'SELECT (allocated_amount - spent_amount) as balance FROM budget_lines WHERE id = ?',
          [adj.budgetLineId]
        );

        const balanceAfter = parseFloat(updatedBl[0].balance);
        const txnType = adjustment > 0 ? 'DEDUCTION' : 'REVERSAL';
        const txnAmount = Math.abs(adjustment);
        const description = adjustment > 0 
          ? `Reconciliation over-expenditure for request #${request.request_code}`
          : `Reconciliation change returned for request #${request.request_code}`;

        // Log budget transaction
        await connection.execute(
          `INSERT INTO budget_transactions 
           (budget_line_id, request_id, transaction_type, amount, 
            balance_before, balance_after, description, performed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [adj.budgetLineId, requestId, txnType, txnAmount,
           balanceBefore, balanceAfter, description, approverId]
        );

        adjustmentResults.push({
          budgetLine: `${adj.budgetCode} - ${adj.budgetName}`,
          type: adjustment > 0 ? 'OVER_EXPENDITURE' : 'CHANGE_RETURNED',
          amount: txnAmount,
          balanceBefore,
          balanceAfter
        });
      }

      // Update reconciliation status
      await connection.execute(
        `UPDATE reconciliations 
         SET status = 'APPROVED', finance_reviewer_id = ?, finance_comments = ?, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [approverId, comments || null, reconciliation.id]
      );

      // Update request status to RECONCILED
      await connection.execute(
        `UPDATE requests 
         SET status = ?, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.RECONCILED, requestId]
      );

      // Log approval
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
        [requestId, approverId, approverRole || ROLES.FINANCE_CLERK,
         request.status, REQUEST_STATUS.RECONCILED,
         comments || 'Reconciliation approved', ipAddress]
      );

      return {
        success: true,
        message: 'Reconciliation approved successfully',
        newStatus: REQUEST_STATUS.RECONCILED,
        budgetAdjustments: adjustmentResults,
        totalSpent,
        totalReturned,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      const approver = await query('SELECT first_name, last_name FROM users WHERE id = ?', [n.approverId]).catch(() => [{}]);
      const approverName = approver[0] ? `${approver[0].first_name} ${approver[0].last_name}` : 'Finance';
      notificationService.onReconciliationApproved(requestId, n.requestCode, n.requesterId, approverName).catch(() => {});
    }
    return result;
  }

  /**
   * Finance rejects a reconciliation (sends back to requester)
   */
  async rejectReconciliation(requestId, approverId, approverRole, comments, ipAddress, approverDeptCode) {
    if (!canReviewReconAsFinance(approverRole, approverDeptCode)) {
      throw new Error('Only the Finance desk, or the Finance Department Lead / Head of Department, can reject at Finance review');
    }
    const result = await transaction(async (connection) => {
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      const validStatuses = [REQUEST_STATUS.RECON_PENDING_LEAD, REQUEST_STATUS.RECON_PENDING_FINANCE];
      if (!validStatuses.includes(request.status)) {
        throw new Error(`Cannot reject reconciliation for request with status: ${request.status}`);
      }

      assertNotOwnReconciliation(request, approverId);

      // Until the General Secretary has reviewed a Head of Department's
      // reconciliation, only a Super Admin may send it back.
      if (request.status === REQUEST_STATUS.RECON_PENDING_LEAD && approverRole !== ROLES.ADMIN &&
          await isGsTrackRequester(connection, request.requester_id)) {
        throw new Error(
          "A Head of Department's reconciliation is reviewed by the General Secretary first, then by Finance."
        );
      }

      // Get the reconciliation
      const [recons] = await connection.execute(
        'SELECT * FROM reconciliations WHERE request_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        [requestId, 'SUBMITTED']
      );

      if (recons.length === 0) {
        throw new Error('No pending reconciliation found');
      }

      // Mark reconciliation as rejected
      await connection.execute(
        `UPDATE reconciliations 
         SET status = 'REJECTED', finance_reviewer_id = ?, finance_comments = ?, reviewed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [approverId, comments || null, recons[0].id]
      );

      // Revert request to DISPATCHED so requester can re-submit reconciliation
      await connection.execute(
        `UPDATE requests 
         SET status = ?, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.DISPATCHED, requestId]
      );

      // Log rejection
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'REJECTED', ?, ?, ?, ?)`,
        [requestId, approverId, approverRole || ROLES.FINANCE_CLERK,
         request.status, REQUEST_STATUS.DISPATCHED,
         comments || 'Reconciliation rejected', ipAddress]
      );

      return {
        success: true,
        message: 'Reconciliation rejected. Requester can resubmit.',
        newStatus: REQUEST_STATUS.DISPATCHED,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId, reason: comments }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      const approver = await query('SELECT first_name, last_name FROM users WHERE id = ?', [n.approverId]).catch(() => [{}]);
      const approverName = approver[0] ? `${approver[0].first_name} ${approver[0].last_name}` : 'Finance';
      notificationService.onReconciliationRejected(requestId, n.requestCode, n.requesterId, approverName, n.reason).catch(() => {});
    }
    return result;
  }

  /**
   * Program Lead / HOP approves reconciliation (sends to Finance) (sends to Finance for final review)
   */
  async approveReconciliationAsLead(requestId, approverId, approverRole, comments, ipAddress, approverDeptCode) {
    const result = await transaction(async (connection) => {
      const [requests] = await connection.execute(
        `SELECT r.*, u.department_id as approver_dept, don.donor_type,
                (SELECT rr.role_name FROM users ru JOIN roles rr ON rr.id = ru.role_id WHERE ru.id = r.requester_id) AS requester_role
         FROM requests r
         JOIN users u ON u.id = ?
         LEFT JOIN donors don ON don.id = r.donor_id
         WHERE r.id = ? FOR UPDATE`,
        [approverId, requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      if (request.status !== REQUEST_STATUS.RECON_PENDING_LEAD) {
        throw new Error(`Cannot approve reconciliation with status: ${request.status}. Must be pending lead review.`);
      }

      assertNotOwnReconciliation(request, approverId);

      const refusal = leadReconRefusalReason(request, approverRole, approverDeptCode);
      if (refusal) throw new Error(refusal);

      // Update status to RECON_PENDING_FINANCE
      await connection.execute(
        `UPDATE requests 
         SET status = ?, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.RECON_PENDING_FINANCE, requestId]
      );

      // Log approval
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
        [requestId, approverId, approverRole,
         REQUEST_STATUS.RECON_PENDING_LEAD, REQUEST_STATUS.RECON_PENDING_FINANCE,
         comments || 'Reconciliation approved by lead - sent to Finance', ipAddress]
      );

      return {
        success: true,
        message: 'Reconciliation approved - sent to Finance for final review',
        newStatus: REQUEST_STATUS.RECON_PENDING_FINANCE,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      const approver = await query('SELECT first_name, last_name FROM users WHERE id = ?', [n.approverId]).catch(() => [{}]);
      const approverName = approver[0] ? `${approver[0].first_name} ${approver[0].last_name}` : 'Lead';
      notificationService.onReconciliationLeadApproved(requestId, n.requestCode, n.requesterId, approverName).catch(() => {});
    }
    return result;
  }

  /**
   * Program Lead / HOP rejects reconciliation (sends back to requester)
   */
  async rejectReconciliationAsLead(requestId, approverId, approverRole, comments, ipAddress, approverDeptCode) {
    const result = await transaction(async (connection) => {
      const [requests] = await connection.execute(
        `SELECT r.*, u.department_id as approver_dept, don.donor_type,
                (SELECT rr.role_name FROM users ru JOIN roles rr ON rr.id = ru.role_id WHERE ru.id = r.requester_id) AS requester_role
         FROM requests r
         JOIN users u ON u.id = ?
         LEFT JOIN donors don ON don.id = r.donor_id
         WHERE r.id = ? FOR UPDATE`,
        [approverId, requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      if (request.status !== REQUEST_STATUS.RECON_PENDING_LEAD) {
        throw new Error(`Cannot reject reconciliation with status: ${request.status}`);
      }

      assertNotOwnReconciliation(request, approverId);

      const refusal = leadReconRefusalReason(request, approverRole, approverDeptCode);
      if (refusal) throw new Error(refusal);

      // Get the reconciliation and mark as rejected
      const [recons] = await connection.execute(
        'SELECT * FROM reconciliations WHERE request_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
        [requestId, 'SUBMITTED']
      );

      if (recons.length > 0) {
        await connection.execute(
          `UPDATE reconciliations 
           SET status = 'REJECTED', finance_comments = ?, reviewed_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [comments || null, recons[0].id]
        );
      }

      // Revert request to DISPATCHED
      await connection.execute(
        `UPDATE requests 
         SET status = ?, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.DISPATCHED, requestId]
      );

      // Log rejection
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'REJECTED', ?, ?, ?, ?)`,
        [requestId, approverId, approverRole,
         REQUEST_STATUS.RECON_PENDING_LEAD, REQUEST_STATUS.DISPATCHED,
         comments || 'Reconciliation rejected by lead', ipAddress]
      );

      return {
        success: true,
        message: 'Reconciliation rejected. Requester can resubmit.',
        newStatus: REQUEST_STATUS.DISPATCHED,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId, reason: comments }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      const approver = await query('SELECT first_name, last_name FROM users WHERE id = ?', [n.approverId]).catch(() => [{}]);
      const approverName = approver[0] ? `${approver[0].first_name} ${approver[0].last_name}` : 'Lead';
      notificationService.onReconciliationRejected(requestId, n.requestCode, n.requesterId, approverName, n.reason).catch(() => {});
    }
    return result;
  }

  /**
   * Get pending reconciliations for lead/HOP review
   */
  async getPendingLeadReconciliations(approverId, approverRole, departmentId, departmentCode) {
    // Routing rules live in leadDeskScope() — shared with the backlog gate so the
    // queue an approver is shown and the queue they are judged on are the same.
    const scope = leadDeskScope(approverRole, departmentId, departmentCode);
    const departmentFilter = scope ? scope.filter : '';
    const params = [REQUEST_STATUS.RECON_PENDING_LEAD, ...(scope ? scope.params : [])];

    return await query(
      `SELECT r.*, 
              u.first_name as requester_first_name,
              u.last_name as requester_last_name,
              d.department_name, d.department_code,
              rd.department_name as routing_department_name,
              rd.department_code as routing_department_code,
              rec.id as reconciliation_id,
              rec.total_spent,
              rec.total_returned,
              rec.notes as reconciliation_notes,
              rec.created_at as reconciliation_submitted_at,
              rec.submission_timeliness,
              rec.working_days_taken,
              -- How long this has been waiting on the reviewer, in working days.
              -- Sent down so the queue can flag the stale ones instead of the
              -- client re-deriving a rule the server enforces.
              ${workingDaysBetweenSql('DATE(rec.created_at)', 'CURDATE()')} AS working_days_on_desk,
              -- A Head of Department's reconciliation, reviewed by the General Secretary.
              (${gsTrackRequesterSql('r')}) AS is_gs_track
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN departments rd ON r.routing_department_id = rd.id
       JOIN reconciliations rec ON rec.request_id = r.id AND rec.status = 'SUBMITTED'
       WHERE r.status = ? ${departmentFilter}
       ORDER BY rec.created_at ASC`,
      params
    );
  }

  /**
   * The reconciliations this approver has left sitting on their lead-review desk
   * for four working days or more without approving or rejecting them.
   *
   * Drives both halves of the rule: the list the reviewer is shown, and the gate
   * that stops them approving floats once two or more have gone stale. Super
   * Admin is exempt by design — the account that has to be able to unblock
   * everybody else can never be blocked itself.
   *
   * @param {object} user   the approver (role, department_id, department_code)
   * @param {object} [connection]  run inside a caller's transaction when given
   */
  async getStaleLeadReconciliations(user, connection = null) {
    if (!user || user.role === ROLES.ADMIN) return [];
    if (!LEAD_DESK_ROLES.includes(user.role)) return [];

    // ownedOnly: the block counts only the reconciliations this approver owns —
    // see leadDeskScope() for why Finance's oversight queue is not used here.
    const scope = leadDeskScope(user.role, user.department_id, user.department_code, { ownedOnly: true });
    if (!scope) return [];

    const run = connection
      ? async (sql, params) => (await connection.execute(sql, params))[0]
      : query;

    const daysOnDesk = workingDaysBetweenSql('DATE(rec.created_at)', 'CURDATE()');

    return await run(
      `SELECT r.id AS request_id,
              r.request_code,
              r.total_amount,
              d.department_code,
              CONCAT(u.first_name, ' ', u.last_name) AS requester_name,
              rec.created_at AS reconciliation_submitted_at,
              ${daysOnDesk} AS working_days_on_desk
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       JOIN reconciliations rec ON rec.request_id = r.id AND rec.status = 'SUBMITTED'
       WHERE r.status = ? ${scope.filter}
         AND ${daysOnDesk} >= ?
       ORDER BY rec.created_at ASC`,
      [REQUEST_STATUS.RECON_PENDING_LEAD, ...scope.params, STALE_LEAD_RECON_WORKING_DAYS]
    );
  }

  /**
   * Backlog summary for one approver: what is stale, and whether that is enough
   * to bar them from approving float requests.
   */
  async getLeadDeskBacklog(user, connection = null) {
    const items = await this.getStaleLeadReconciliations(user, connection);
    return {
      items,
      staleCount: items.length,
      limit: STALE_LEAD_RECON_LIMIT,
      workingDays: STALE_LEAD_RECON_WORKING_DAYS,
      isBlocked: items.length >= STALE_LEAD_RECON_LIMIT
    };
  }

  /**
   * Throws when this approver may not approve a float request because their own
   * reconciliation review desk has gone stale. Called from the approval
   * controller before any float approval is attempted.
   *
   * Rejecting is deliberately not gated: a blocked reviewer must still be able
   * to turn back a bad request, or it would sit in the queue with nobody able
   * to act on it at all.
   */
  async assertLeadDeskClear(user, connection = null) {
    const backlog = await this.getLeadDeskBacklog(user, connection);
    if (!backlog.isBlocked) return backlog;

    // Name a handful so the reviewer can start immediately, without pasting a
    // list of twenty request codes into a toast.
    const shown = backlog.items.slice(0, 3).map(i => i.request_code).join(', ');
    const rest = backlog.items.length - 3;
    const err = new Error(
      `Float approvals are on hold for you: ${backlog.staleCount} reconciliations have been ` +
      `awaiting your review for ${backlog.workingDays} working days or more ` +
      `(${shown}${rest > 0 ? ` and ${rest} more` : ''}). ` +
      `Approve or reject them in the Reconciliation module to restore your approval rights.`
    );
    err.status = 403;
    err.code = 'RECON_BACKLOG_BLOCKED';
    err.backlog = backlog;
    throw err;
  }

  /**
   * Get reconciliations already approved at lead level (forwarded to finance / completed)
   * Provides audit trail for Lead/HOP of what they have already approved
   */
  async getLeadApprovedReconciliations(approverId, approverRole, departmentId, departmentCode) {
    let departmentFilter = '';
    const params = [approverId];

    if (approverRole === ROLES.PROGRAM_LEAD) {
      if (departmentCode !== 'FOS') {
        // Non-FOS Lead: filter by their department only
        departmentFilter = 'AND (r.department_id = ? OR r.routing_department_id = ?)';
        params.push(departmentId, departmentId);
      }
      // FOS Lead: no department filter — sees all approvals across departments
    }

    return await query(
      `SELECT r.*,
              u.first_name as requester_first_name,
              u.last_name as requester_last_name,
              d.department_name, d.department_code,
              rec.id as reconciliation_id,
              rec.total_spent,
              rec.total_returned,
              rec.status as reconciliation_status,
              rec.notes as reconciliation_notes,
              rec.created_at as reconciliation_submitted_at,
              rec.reviewed_at,
              al.comments as lead_comments,
              al.created_at as lead_approved_at
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       JOIN reconciliations rec ON rec.request_id = r.id
       JOIN approval_logs al ON al.request_id = r.id
         AND al.approver_id = ?
         AND al.action = 'APPROVED'
         AND al.new_status IN (?, ?)
       WHERE r.status IN (?, ?) ${departmentFilter}
       ORDER BY al.created_at DESC`,
      [approverId, REQUEST_STATUS.RECON_PENDING_FINANCE, REQUEST_STATUS.RECONCILED,
       REQUEST_STATUS.RECON_PENDING_FINANCE, REQUEST_STATUS.RECONCILED,
       ...params.slice(1)]
    );
  }

  /**
   * Get reconciliation details for a request (the most recent attempt)
   *
   * The reviewer subqueries are scoped to `al.created_at >= r.created_at`, i.e.
   * to decisions taken on *this* attempt. Unscoped, a freshly resubmitted
   * reconciliation inherited the previous attempt's rejection and displayed it
   * as though the work had already been knocked back again.
   */
  async getReconciliation(requestId) {
    const reconciliations = await query(
      `SELECT r.*,
              u.first_name as reconciled_by_first_name,
              u.last_name as reconciled_by_last_name,
              fr.first_name as reviewer_first_name,
              fr.last_name as reviewer_last_name,
              (SELECT al.comments FROM approval_logs al
               WHERE al.request_id = r.request_id
                 AND al.previous_status = 'RECON_PENDING_LEAD'
                 AND al.action IN ('APPROVED', 'REJECTED')
                 AND al.created_at >= r.created_at
               ORDER BY al.created_at ASC LIMIT 1) AS lead_comments,
              (SELECT al.action FROM approval_logs al
               WHERE al.request_id = r.request_id
                 AND al.previous_status = 'RECON_PENDING_LEAD'
                 AND al.action IN ('APPROVED', 'REJECTED')
                 AND al.created_at >= r.created_at
               ORDER BY al.created_at ASC LIMIT 1) AS lead_action,
              (SELECT CONCAT(lu.first_name, ' ', lu.last_name)
               FROM approval_logs al2
               JOIN users lu ON al2.approver_id = lu.id
               WHERE al2.request_id = r.request_id
                 AND al2.previous_status = 'RECON_PENDING_LEAD'
                 AND al2.action IN ('APPROVED', 'REJECTED')
                 AND al2.created_at >= r.created_at
               ORDER BY al2.created_at ASC LIMIT 1) AS lead_reviewer_name,
              -- Which desk sent this attempt back, and why
              (SELECT CASE al.previous_status
                        WHEN 'RECON_PENDING_LEAD'    THEN 'LEAD'
                        WHEN 'RECON_PENDING_FINANCE' THEN 'FINANCE'
                      END
               FROM approval_logs al
               WHERE al.request_id = r.request_id
                 AND al.action = 'REJECTED' AND al.new_status = 'DISPATCHED'
                 AND al.created_at >= r.created_at
               ORDER BY al.created_at ASC LIMIT 1) AS rejected_by_stage,
              (SELECT al.approver_role FROM approval_logs al
               WHERE al.request_id = r.request_id
                 AND al.action = 'REJECTED' AND al.new_status = 'DISPATCHED'
                 AND al.created_at >= r.created_at
               ORDER BY al.created_at ASC LIMIT 1) AS rejected_by_role,
              (SELECT CONCAT(ru.first_name, ' ', ru.last_name)
               FROM approval_logs al
               JOIN users ru ON al.approver_id = ru.id
               WHERE al.request_id = r.request_id
                 AND al.action = 'REJECTED' AND al.new_status = 'DISPATCHED'
                 AND al.created_at >= r.created_at
               ORDER BY al.created_at ASC LIMIT 1) AS rejected_by_name,
              (SELECT al.comments FROM approval_logs al
               WHERE al.request_id = r.request_id
                 AND al.action = 'REJECTED' AND al.new_status = 'DISPATCHED'
                 AND al.created_at >= r.created_at
               ORDER BY al.created_at ASC LIMIT 1) AS rejection_comments,
              -- What the float was raised for. A reviewer deciding whether the
              -- spending matches the request needs it beside the figures.
              req.justification,
              req.department_id,
              d.department_code,
              d.department_name
       FROM reconciliations r
       JOIN users u ON r.reconciled_by = u.id
       LEFT JOIN users fr ON r.finance_reviewer_id = fr.id
       LEFT JOIN requests req ON r.request_id = req.id
       LEFT JOIN departments d ON req.department_id = d.id
       WHERE r.request_id = ?
       ORDER BY r.created_at DESC`,
      [requestId]
    );

    if (reconciliations.length === 0) {
      return null;
    }

    const reconciliation = reconciliations[0];

    // Get reconciliation items with budget line details
    const items = await query(
      `SELECT ri.*, 
              rqi.item_description as original_description,
              rqi.quantity as original_quantity,
              rqi.unit_price as original_unit_price,
              COALESCE(bl1.budget_code, bl2.budget_code) as budget_code,
              COALESCE(bl1.budget_name, bl2.budget_name) as budget_name
       FROM reconciliation_items ri
       LEFT JOIN request_items rqi ON ri.request_item_id = rqi.id
       LEFT JOIN budget_lines bl1 ON rqi.budget_line_id = bl1.id
       LEFT JOIN budget_lines bl2 ON ri.budget_line_id = bl2.id
       WHERE ri.reconciliation_id = ?
       ORDER BY ri.id`,
      [reconciliation.id]
    );

    return {
      ...reconciliation,
      items
    };
  }

  /**
   * Get all requests pending reconciliation (for requester)
   *
   * A rejected reconciliation puts the request back into DISPATCHED, which is
   * indistinguishable on screen from one that was never reconciled at all. The
   * latest attempt's status — and who rejected it — travels with the row so the
   * list can say "Rejected by Finance, amend" rather than just "Reconcile".
   */
  async getMyDispatchedRequests(userId) {
    return await query(
      `SELECT r.*,
              d.department_name, d.department_code,
              (${gsTrackRequesterSql('r')}) AS is_gs_track,
              (SELECT COUNT(*) FROM reconciliations rec WHERE rec.request_id = r.id) as reconciliation_count,
              latest_rec.submission_timeliness,
              latest_rec.working_days_taken,
              latest_rec.status AS last_reconciliation_status,
              latest_rec.created_at AS last_reconciliation_at,
              (SELECT CASE al.previous_status
                        WHEN 'RECON_PENDING_LEAD'    THEN 'LEAD'
                        WHEN 'RECON_PENDING_FINANCE' THEN 'FINANCE'
                      END
                 FROM approval_logs al
                WHERE al.request_id = r.id
                  AND al.action = 'REJECTED' AND al.new_status = 'DISPATCHED'
                  AND al.created_at >= latest_rec.created_at
                ORDER BY al.created_at ASC LIMIT 1) AS rejected_by_stage,
              (SELECT CONCAT(ru.first_name, ' ', ru.last_name)
                 FROM approval_logs al
                 JOIN users ru ON ru.id = al.approver_id
                WHERE al.request_id = r.id
                  AND al.action = 'REJECTED' AND al.new_status = 'DISPATCHED'
                  AND al.created_at >= latest_rec.created_at
                ORDER BY al.created_at ASC LIMIT 1) AS rejected_by_name,
              (SELECT al.comments
                 FROM approval_logs al
                WHERE al.request_id = r.id
                  AND al.action = 'REJECTED' AND al.new_status = 'DISPATCHED'
                  AND al.created_at >= latest_rec.created_at
                ORDER BY al.created_at ASC LIMIT 1) AS rejection_comments
       FROM requests r
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN (
         SELECT request_id, id, status, created_at, submission_timeliness, working_days_taken
         FROM reconciliations
         WHERE id = (SELECT MAX(id) FROM reconciliations r2 WHERE r2.request_id = reconciliations.request_id)
       ) latest_rec ON latest_rec.request_id = r.id
       WHERE r.requester_id = ? AND r.status IN (?, ?, ?, ?, ?)
       ORDER BY r.updated_at DESC`,
      [userId, REQUEST_STATUS.DISPATCHED, REQUEST_STATUS.RECON_PENDING_LEAD, 
       REQUEST_STATUS.RECON_PENDING_FINANCE, REQUEST_STATUS.PENDING_RECONCILIATION,
       REQUEST_STATUS.RECONCILED]
    );
  }

  /**
   * Get all requests pending reconciliation review (for Finance)
   */
  async getPendingReconciliations(role) {
    // The Finance Review tab is a work queue: it must contain only what the
    // Finance desk can actually act on. It previously also included
    // RECON_PENDING_LEAD for "pipeline visibility", which meant the queue was
    // mostly items still sitting with the Lead — indistinguishable on screen
    // from the ones awaiting Finance. Pipeline-wide visibility belongs in the
    // All History tab, which already provides it.
    const statuses = [REQUEST_STATUS.RECON_PENDING_FINANCE];
    const placeholders = statuses.map(() => '?').join(', ');

    return await query(
      `SELECT r.*, 
              u.first_name as requester_first_name,
              u.last_name as requester_last_name,
              d.department_name, d.department_code,
              rec.id as reconciliation_id,
              rec.total_spent,
              rec.total_returned,
              rec.notes as reconciliation_notes,
              rec.created_at as reconciliation_submitted_at,
              rec.submission_timeliness,
              rec.working_days_taken
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       JOIN reconciliations rec ON rec.request_id = r.id AND rec.status = 'SUBMITTED'
       WHERE r.status IN (${placeholders})
       ORDER BY rec.created_at DESC`,
      statuses
    );
  }

  /**
   * Get current user's submitted reconciliations (all statuses)
   *
   * A rejected reconciliation used to arrive here as a bare "REJECTED" with the
   * reviewer's reason parked in `finance_comments` regardless of who wrote it,
   * so a requester could not tell whether the Lead/HOP or Finance had sent it
   * back, nor what they were being asked to fix. The decision itself is fully
   * recorded in approval_logs, so each attempt is matched to the decisions
   * taken during its own lifetime — from when it was submitted until the next
   * attempt was submitted — and the stage, the reviewer's name and their
   * comments are returned alongside it.
   */
  async getMyReconciliations(userId) {
    return await query(
      `WITH attempt AS (
         SELECT rec.id,
                rec.request_id,
                rec.created_at AS attempt_start,
                COALESCE(
                  (SELECT MIN(r2.created_at) FROM reconciliations r2
                    WHERE r2.request_id = rec.request_id
                      AND r2.created_at > rec.created_at),
                  '9999-12-31 23:59:59'
                ) AS attempt_end
         FROM reconciliations rec
         WHERE rec.reconciled_by = ?
       ),
       logs AS (
         SELECT a.id AS rec_id,
                al.action, al.previous_status, al.new_status,
                al.approver_role, al.comments, al.created_at,
                CONCAT(u.first_name, ' ', u.last_name) AS approver_name
         FROM attempt a
         JOIN approval_logs al
           ON al.request_id = a.request_id
          AND al.created_at >= a.attempt_start
          AND al.created_at <  a.attempt_end
         JOIN users u ON u.id = al.approver_id
       )
       SELECT rec.*,
              r.request_code,
              r.status AS request_status,
              r.total_amount as request_amount,
              -- How many times this reconciliation has been submitted; every
              -- submission logs SUBMITTED out of DISPATCHED and nothing else does.
              (SELECT COUNT(*) FROM approval_logs sal
                WHERE sal.request_id = rec.request_id
                  AND sal.action = 'SUBMITTED' AND sal.previous_status = 'DISPATCHED') AS attempt_no,
              d.department_name, d.department_code,
              fr.first_name as reviewer_first_name,
              fr.last_name as reviewer_last_name,
              -- Lead / HOP decision on this attempt
              (SELECT l.action FROM logs l
                WHERE l.rec_id = rec.id AND l.previous_status = 'RECON_PENDING_LEAD'
                  AND l.action IN ('APPROVED', 'REJECTED')
                ORDER BY l.created_at ASC LIMIT 1) AS lead_action,
              (SELECT l.comments FROM logs l
                WHERE l.rec_id = rec.id AND l.previous_status = 'RECON_PENDING_LEAD'
                  AND l.action IN ('APPROVED', 'REJECTED')
                ORDER BY l.created_at ASC LIMIT 1) AS lead_comments,
              (SELECT l.approver_name FROM logs l
                WHERE l.rec_id = rec.id AND l.previous_status = 'RECON_PENDING_LEAD'
                  AND l.action IN ('APPROVED', 'REJECTED')
                ORDER BY l.created_at ASC LIMIT 1) AS lead_reviewer_name,
              (SELECT l.created_at FROM logs l
                WHERE l.rec_id = rec.id AND l.previous_status = 'RECON_PENDING_LEAD'
                  AND l.action IN ('APPROVED', 'REJECTED')
                ORDER BY l.created_at ASC LIMIT 1) AS lead_reviewed_at,
              -- Finance decision on this attempt
              (SELECT l.action FROM logs l
                WHERE l.rec_id = rec.id AND l.previous_status = 'RECON_PENDING_FINANCE'
                  AND l.action IN ('APPROVED', 'REJECTED')
                ORDER BY l.created_at ASC LIMIT 1) AS finance_action,
              (SELECT l.approver_name FROM logs l
                WHERE l.rec_id = rec.id AND l.previous_status = 'RECON_PENDING_FINANCE'
                  AND l.action IN ('APPROVED', 'REJECTED')
                ORDER BY l.created_at ASC LIMIT 1) AS finance_reviewer_name,
              -- The rejection that sent this attempt back to the requester.
              -- Reconciliation rejections are the ones that land on DISPATCHED;
              -- previous_status says which desk it came from.
              (SELECT CASE l.previous_status
                        WHEN 'RECON_PENDING_LEAD'    THEN 'LEAD'
                        WHEN 'RECON_PENDING_FINANCE' THEN 'FINANCE'
                      END
                 FROM logs l
                WHERE l.rec_id = rec.id AND l.action = 'REJECTED' AND l.new_status = 'DISPATCHED'
                ORDER BY l.created_at ASC LIMIT 1) AS rejected_by_stage,
              (SELECT l.approver_role FROM logs l
                WHERE l.rec_id = rec.id AND l.action = 'REJECTED' AND l.new_status = 'DISPATCHED'
                ORDER BY l.created_at ASC LIMIT 1) AS rejected_by_role,
              (SELECT l.approver_name FROM logs l
                WHERE l.rec_id = rec.id AND l.action = 'REJECTED' AND l.new_status = 'DISPATCHED'
                ORDER BY l.created_at ASC LIMIT 1) AS rejected_by_name,
              (SELECT l.comments FROM logs l
                WHERE l.rec_id = rec.id AND l.action = 'REJECTED' AND l.new_status = 'DISPATCHED'
                ORDER BY l.created_at ASC LIMIT 1) AS rejection_comments
       FROM reconciliations rec
       JOIN requests r ON rec.request_id = r.id
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN users fr ON rec.finance_reviewer_id = fr.id
       WHERE rec.reconciled_by = ?
         -- One row per request. A resubmission now amends the request's own
         -- record, but requests resubmitted before that change still carry a
         -- row per attempt; only the live one belongs in this list.
         AND rec.id = (SELECT MAX(r3.id) FROM reconciliations r3
                        WHERE r3.request_id = rec.request_id)
       ORDER BY rec.created_at DESC`,
      [userId, userId]
    );
  }

  /**
   * Get reconciliation history (all reconciliations including in-progress)
   */
  async getReconciliationHistory(role, departmentId, departmentCode) {
    // Finance Lead/HOP (FOS dept) and system Admins see all history.
    // Everyone else only sees reconciliations for their own department.
    const isFOS = departmentCode === 'FOS';
    const seeAll = role === ROLES.ADMIN ||
      role === ROLES.FINANCE_CLERK ||
      (isFOS && (role === ROLES.PROGRAM_LEAD || role === ROLES.HEAD_OF_PROGRAMS));

    let deptFilter = '';
    const params = [];
    if (!seeAll && departmentId) {
      deptFilter = 'AND (r.department_id = ? OR r.routing_department_id = ?)';
      params.push(departmentId, departmentId);
    }

    return await query(
      `SELECT r.*,
              u.first_name as requester_first_name,
              u.last_name as requester_last_name,
              d.department_name, d.department_code,
              rec.id as reconciliation_id,
              rec.total_spent,
              rec.total_returned,
              rec.status as reconciliation_status,
              rec.reviewed_at,
              rec.submission_timeliness,
              rec.working_days_taken,
              rec.created_at as reconciliation_submitted_at,
              fr.first_name as reviewer_first_name,
              fr.last_name as reviewer_last_name,
              -- The day the reconciliation is/was due: 4 working days after the
              -- activity ended (activity requests) or after dispatch (all others).
              ${reconDueDateSql(RECON_DUE_BASE_SQL)} AS reconciliation_due_date,
              -- A Head of Department's: its departmental stage is the General Secretary.
              (${gsTrackRequesterSql('r')}) AS is_gs_track
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN reconciliations rec ON rec.id = (
         SELECT MAX(id) FROM reconciliations WHERE request_id = r.id
       )
       LEFT JOIN users fr ON rec.finance_reviewer_id = fr.id
       WHERE (r.status IN ('DISPATCHED','RECON_PENDING_LEAD','RECON_PENDING_FINANCE','RECONCILED')
          OR rec.status IN ('APPROVED','REJECTED','SUBMITTED'))
       ${deptFilter}
       ORDER BY COALESCE(rec.created_at, r.updated_at) DESC`,
      params
    );
  }
  /**
   * Count the number of overdue unsubmitted reconciliations for a user.
   * A reconciliation is overdue when the request is still in DISPATCHED status
   * and more than 4 working days have elapsed since the reference date
   * (i.e. the 4-working-day deadline has been missed).
   *
   * Reference date:
   *   - Activity requests: activity_end_date  (DATE column — no time component)
   *   - All other requests: DATE(dispatched_at) (strip time so day-boundary is midnight)
   *
   * Using DATE() on dispatched_at is critical: dispatched_at is a DATETIME
   * (e.g. 2026-07-08 08:04:06), so DATE_ADD(dispatched_at, INTERVAL 7 DAY)
   * = 2026-07-15 08:04:06, which is NOT <= CURDATE() (midnight) and therefore
   * the final working day is missed, under-counting by 1.
   */
  async getOverdueCount(userId, connection = null) {
    // When a connection is supplied the count runs inside the caller's
    // transaction, so the submit gate sees the same consistent snapshot as the
    // row it has locked.
    const run = connection
      ? async (sql, params) => (await connection.execute(sql, params))[0]
      : query;
    const rows = await run(
      `SELECT COUNT(*) AS cnt
       FROM requests r
       WHERE r.requester_id = ?
         AND r.status = 'DISPATCHED'
         AND (
           (r.is_activity_request = 0 AND r.dispatched_at IS NOT NULL)
           OR (r.is_activity_request = 1 AND r.activity_end_date IS NOT NULL)
         )
         AND (
           SELECT COUNT(*) FROM reconciliations rec
           WHERE rec.request_id = r.id
         ) = 0
         AND (
           SELECT COALESCE(SUM(
             CASE WHEN DAYOFWEEK(DATE_ADD(
               CASE WHEN r.is_activity_request = 1 AND r.activity_end_date IS NOT NULL
                    THEN r.activity_end_date
                    ELSE DATE(r.dispatched_at)
               END,
             INTERVAL seq.n DAY)) NOT IN (1,7) THEN 1 ELSE 0 END
           ), 0)
           FROM (
             SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
             UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10
             UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
           ) seq
           WHERE DATE_ADD(
             CASE WHEN r.is_activity_request = 1 AND r.activity_end_date IS NOT NULL
                  THEN r.activity_end_date
                  ELSE DATE(r.dispatched_at)
             END,
           INTERVAL seq.n DAY) <= CURDATE()
         ) > 4`,
      [userId]
    );
    return rows[0] ? Number(rows[0].cnt) : 0;
  }

  /**
   * Get reconciliations reviewed by a specific Finance Clerk (for My Review History tab)
   */
  async getFinanceReviewHistory(financeClerkId) {
    return await query(
      `SELECT r.*,
              u.first_name as requester_first_name,
              u.last_name as requester_last_name,
              d.department_name, d.department_code,
              rec.id as reconciliation_id,
              rec.total_spent,
              rec.total_returned,
              rec.status as reconciliation_status,
              rec.finance_comments,
              rec.reviewed_at,
              al.action as finance_action,
              al.created_at as finance_reviewed_at
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       JOIN reconciliations rec ON rec.request_id = r.id
         AND rec.finance_reviewer_id = ?
       LEFT JOIN approval_logs al ON al.request_id = r.id
         AND al.approver_id = ?
         AND al.approver_role = 'FINANCE_CLERK'
         AND al.action IN ('APPROVED', 'REJECTED')
       WHERE rec.status IN ('APPROVED', 'REJECTED')
       ORDER BY rec.reviewed_at DESC`,
      [financeClerkId, financeClerkId]
    );
  }

  /**
   * Undo a reconciliation approval that was made in error.
   *
   * The pre-dispatch flow has had reverseApproval() for a long time; the
   * reconciliation flow had nothing, so a Lead/HOP who approved the wrong
   * record could not take it back, and Finance — which by then owned the
   * record — could only approve it, since rejecting sends it back to the
   * *requester* rather than to the Lead who mis-approved it.
   *
   * Two stages can be undone, and which one applies is read off the request's
   * current status rather than passed in by the caller:
   *
   *   RECON_PENDING_FINANCE -> RECON_PENDING_LEAD
   *     Undoes the Lead/HOP approval. No money has moved at this stage, so
   *     this is a pure status change.
   *
   *   RECONCILED -> RECON_PENDING_FINANCE
   *     Undoes the Finance approval, which *did* move money: it wrote
   *     budget_transactions rows and adjusted budget_lines.spent_amount and
   *     donors.total_spent. Those effects are inverted here (see
   *     reconciliationEffectsToUndo) so the budget is left exactly where it
   *     was before the approval.
   *
   * Unlike reverseApproval() there is no time window. The 12-hour limit there
   * exists because a reversed request re-enters a queue someone else is
   * actively working; a reconciliation that was approved in error stays wrong
   * until it is fixed, and the whole point of this action is that the mistake
   * is usually noticed late.
   */
  async reverseReconciliationApproval(requestId, approverId, approverRole, comments, ipAddress, approverDeptCode) {
    const result = await transaction(async (connection) => {
      const [requests] = await connection.execute(
        `SELECT r.*, u.department_id as approver_dept, don.donor_type,
                (SELECT rr.role_name FROM users ru JOIN roles rr ON rr.id = ru.role_id WHERE ru.id = r.requester_id) AS requester_role
         FROM requests r
         JOIN users u ON u.id = ?
         LEFT JOIN donors don ON don.id = r.donor_id
         WHERE r.id = ? FOR UPDATE`,
        [approverId, requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];
      const isFinanceDesk = canReviewReconAsFinance(approverRole, approverDeptCode);

      if (request.status === REQUEST_STATUS.RECON_PENDING_FINANCE) {
        // Undoing the Lead/HOP stage. Either the Lead desk that owns this
        // reconciliation or the Finance desk holding it now may do it — the
        // person who notices the mistake is as often the latter as the former.
        if (!isFinanceDesk && leadReconRefusalReason(request, approverRole, approverDeptCode)) {
          throw new Error(
            'Only the Lead/Head of Department for this reconciliation, or the Finance desk, can undo the departmental approval'
          );
        }

        await connection.execute(
          `UPDATE requests SET status = ?, updated_at = NOW(), version = version + 1 WHERE id = ?`,
          [REQUEST_STATUS.RECON_PENDING_LEAD, requestId]
        );

        await connection.execute(
          `INSERT INTO approval_logs
           (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
           VALUES (?, ?, ?, 'REVERSED', ?, ?, ?, ?)`,
          [requestId, approverId, approverRole,
           REQUEST_STATUS.RECON_PENDING_FINANCE, REQUEST_STATUS.RECON_PENDING_LEAD,
           comments || 'Departmental reconciliation approval undone', ipAddress]
        );

        return {
          success: true,
          message: 'Departmental approval undone — the reconciliation is back with the Lead/HOP for review',
          newStatus: REQUEST_STATUS.RECON_PENDING_LEAD,
          stage: 'LEAD',
          budgetAdjustments: [],
          _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId }
        };
      }

      if (request.status === REQUEST_STATUS.RECONCILED) {
        // Undoing the Finance stage. Only the Finance desk may do this: it is
        // the only stage that touched the budget.
        if (!isFinanceDesk) {
          throw new Error('Only the Finance desk, or the Finance Department Lead / Head of Department, can undo a completed reconciliation');
        }

        const budgetAdjustments = await undoReconciliationBudgetEffects(
          connection, requestId, request.request_code, approverId
        );

        const [recons] = await connection.execute(
          `SELECT * FROM reconciliations WHERE request_id = ? AND status = 'APPROVED'
           ORDER BY reviewed_at DESC, id DESC LIMIT 1`,
          [requestId]
        );

        if (recons.length === 0) {
          throw new Error('No approved reconciliation found to undo');
        }

        // Back to SUBMITTED so it re-enters the Finance queue, which joins on
        // reconciliations.status = 'SUBMITTED'.
        await connection.execute(
          `UPDATE reconciliations
           SET status = 'SUBMITTED', finance_reviewer_id = NULL, finance_comments = NULL,
               reviewed_at = NULL, updated_at = NOW()
           WHERE id = ?`,
          [recons[0].id]
        );

        await connection.execute(
          `UPDATE requests SET status = ?, updated_at = NOW(), version = version + 1 WHERE id = ?`,
          [REQUEST_STATUS.RECON_PENDING_FINANCE, requestId]
        );

        await connection.execute(
          `INSERT INTO approval_logs
           (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
           VALUES (?, ?, ?, 'REVERSED', ?, ?, ?, ?)`,
          [requestId, approverId, approverRole,
           REQUEST_STATUS.RECONCILED, REQUEST_STATUS.RECON_PENDING_FINANCE,
           comments || 'Finance reconciliation approval undone', ipAddress]
        );

        return {
          success: true,
          message: 'Reconciliation approval undone — budget effects reversed and the record is back in the Finance queue',
          newStatus: REQUEST_STATUS.RECON_PENDING_FINANCE,
          stage: 'FINANCE',
          budgetAdjustments,
          _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId }
        };
      }

      throw new Error(
        `Cannot undo a reconciliation approval for a request with status: ${request.status}. ` +
        `Only reconciliations awaiting Finance review or already reconciled can be undone.`
      );
    });

    if (result._notif) {
      const n = result._notif; delete result._notif;
      const approver = await query('SELECT first_name, last_name FROM users WHERE id = ?', [n.approverId]).catch(() => [{}]);
      const approverName = approver[0] ? `${approver[0].first_name} ${approver[0].last_name}` : 'Reviewer';
      notificationService.onReconciliationReversed?.(
        requestId, n.requestCode, n.requesterId, approverName, result.stage
      )?.catch?.(() => {});
    }
    return result;
  }

  /**
   * What, if anything, the current user may undo on this reconciliation.
   * Drives the UI so the button only appears where the action would succeed.
   */
  async canReverseReconciliation(requestId, approverId, approverRole, approverDeptCode) {
    const requests = await query(
      `SELECT r.*, u.department_id as approver_dept, don.donor_type,
                (SELECT rr.role_name FROM users ru JOIN roles rr ON rr.id = ru.role_id WHERE ru.id = r.requester_id) AS requester_role
       FROM requests r
       JOIN users u ON u.id = ?
       LEFT JOIN donors don ON don.id = r.donor_id
       WHERE r.id = ?`,
      [approverId, requestId]
    );

    if (requests.length === 0) return { canReverse: false, reason: 'Request not found' };

    const request = requests[0];
    const isFinanceDesk = canReviewReconAsFinance(approverRole, approverDeptCode);

    if (request.status === REQUEST_STATUS.RECON_PENDING_FINANCE) {
      const allowed = isFinanceDesk || !leadReconRefusalReason(request, approverRole, approverDeptCode);
      return {
        canReverse: allowed,
        stage: 'LEAD',
        revertsTo: REQUEST_STATUS.RECON_PENDING_LEAD,
        reason: allowed ? null : 'Only this reconciliation\'s Lead/HOP desk or Finance can undo the departmental approval'
      };
    }

    if (request.status === REQUEST_STATUS.RECONCILED) {
      return {
        canReverse: isFinanceDesk,
        stage: 'FINANCE',
        revertsTo: REQUEST_STATUS.RECON_PENDING_FINANCE,
        reason: isFinanceDesk ? null : 'Only the Finance desk can undo a completed reconciliation'
      };
    }

    return { canReverse: false, reason: 'There is no reconciliation approval to undo at this stage' };
  }
}

module.exports = new ReconciliationService();

// A requester with this many overdue unsubmitted reconciliations is barred from
// raising new requests. Shared by the /reconciliations/overdue-check endpoint
// (which drives the UI warning) and the server-side submit gate, so the warning
// the user sees and the rule that is enforced can never drift apart.
module.exports.OVERDUE_RECON_LIMIT = 2;

// Lead-review desk rule, exported for the controller (which reports it to the UI)
// and the approval gate (which enforces it), so the figure a reviewer is warned
// about is by construction the figure they are held to.
module.exports.STALE_LEAD_RECON_LIMIT = STALE_LEAD_RECON_LIMIT;
module.exports.STALE_LEAD_RECON_WORKING_DAYS = STALE_LEAD_RECON_WORKING_DAYS;
