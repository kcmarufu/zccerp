/**
 * Reconciliation Service
 * Handles the reconciliation workflow after dispatch
 * 
 * Flow: DISPATCHED -> requester submits reconciliation -> PENDING_RECONCILIATION -> Finance approves -> RECONCILED
 */

const { query, transaction, pool } = require('../config/database');
const { REQUEST_STATUS, ROLES } = require('../config/roles');
const notificationService = require('./notification.service');

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

      // Create reconciliation record
      const [reconResult] = await connection.execute(
        `INSERT INTO reconciliations
         (request_id, reconciled_by, status, total_spent, total_returned, notes, overspend_notes, submission_timeliness, working_days_taken, actual_start_date, actual_end_date, created_at, updated_at)
         VALUES (?, ?, 'SUBMITTED', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [requestId, userId, totalSpent || 0, totalReturned || 0, notes || null, overspendNotes || null,
         submissionTimeliness, workingDaysFromBase ?? workingDaysTaken,
         actualStartDate || null, actualEndDate || null]
      );

      const reconciliationId = reconResult.insertId;

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
         wasFinanceRejected ? 'Reconciliation resubmitted (Finance review resumed)' : 'Reconciliation submitted', ipAddress]
      );

      return {
        success: true,
        message: wasFinanceRejected
          ? 'Reconciliation resubmitted — sent directly to Finance for review'
          : 'Reconciliation submitted successfully',
        reconciliationId,
        newStatus: nextStatus,
        _notif: { requestCode: request.request_code, requesterId: userId, deptId: request.department_id, timeliness: submissionTimeliness, routingDeptId: request.routing_department_id || null }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      notificationService.onReconciliationSubmitted(requestId, n.requestCode, n.requesterId, n.deptId, n.timeliness, n.routingDeptId).catch(() => {});
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
  async approveReconciliation(requestId, approverId, approverRole, comments, ipAddress) {
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
  async rejectReconciliation(requestId, approverId, approverRole, comments, ipAddress) {
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
        `SELECT r.*, u.department_id as approver_dept, don.donor_type
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

      // Admin-donor reconciliations: HR-dept Lead/HOP can act; HOP can also approve from any dept
      if (request.donor_type === 'ADMIN') {
        if (approverRole === ROLES.PROGRAM_LEAD && approverDeptCode !== 'HR') {
          throw new Error('Admin reconciliations can only be approved by the HR/Admin department Lead or HOP');
        }
        // HOP can approve admin reconciliations from any dept
      } else {
        // For cross-dept requests, use the routing (project-owning) dept; otherwise the requester's dept.
        const effectiveDeptId = Number(request.routing_department_id || request.department_id);
        if (approverRole === ROLES.PROGRAM_LEAD && effectiveDeptId !== Number(request.approver_dept)) {
          throw new Error('You can only approve reconciliations from your department (or the project-owning department for cross-department requests)');
        }
        // HOP can approve reconciliations from ANY department (cross-department authority)
      }

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
        `SELECT r.*, u.department_id as approver_dept, don.donor_type
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

      // Admin-donor reconciliations: HR-dept Lead can act; HOP can act from any dept
      if (request.donor_type === 'ADMIN') {
        if (approverRole === ROLES.PROGRAM_LEAD && approverDeptCode !== 'HR') {
          throw new Error('Admin reconciliations can only be rejected by the HR/Admin department Lead or HOP');
        }
        // HOP can reject admin reconciliations from any dept
      } else {
        const effectiveDeptId = Number(request.routing_department_id || request.department_id);
        if (approverRole === ROLES.PROGRAM_LEAD && effectiveDeptId !== Number(request.approver_dept)) {
          throw new Error('You can only reject reconciliations from your department (or the project-owning department for cross-department requests)');
        }
        // HOP can reject reconciliations from ANY department
      }

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
    let departmentFilter = '';
    let params = [REQUEST_STATUS.RECON_PENDING_LEAD];

    // Routing rules for Admin-donor reconciliations:
    //   - Only HR-dept Lead/HOP see Admin-donor reconciliations (from any department)
    //   - Non-HR Lead/HOP see their own department's requests PLUS cross-dept requests
    //     where routing_department_id matches their department
    if (approverRole === ROLES.PROGRAM_LEAD || approverRole === ROLES.HEAD_OF_PROGRAMS) {
      if (departmentCode === 'HR') {
        // HR-dept approvers: own-dept requests + ALL Admin-donor requests across departments
        departmentFilter = `AND (
          (r.routing_department_id IS NULL AND r.department_id = ?)
          OR r.routing_department_id = ?
          OR EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN')
        )`;
        params.push(departmentId, departmentId);
      } else {
        // Other-dept approvers:
        //   - Own-dept requests with NO cross-dept routing
        //   - Cross-dept requests explicitly routed TO their dept
        //   (exclude admin-donor requests — those go to HR only)
        departmentFilter = `AND (
          (r.routing_department_id IS NULL AND r.department_id = ?)
          OR r.routing_department_id = ?
        ) AND NOT EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN')`;
        params.push(departmentId, departmentId);
      }
    }

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
              rec.working_days_taken
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN departments rd ON r.routing_department_id = rd.id
       JOIN reconciliations rec ON rec.request_id = r.id AND rec.status = 'SUBMITTED'
       WHERE r.status = ? ${departmentFilter}
       ORDER BY rec.created_at DESC`,
      params
    );
  }

  /**
   * Get reconciliations already approved at lead level (forwarded to finance / completed)
   * Provides audit trail for Lead/HOP of what they have already approved
   */
  async getLeadApprovedReconciliations(approverId, approverRole, departmentId) {
    let departmentFilter = '';
    const params = [approverId];

    if (approverRole === ROLES.PROGRAM_LEAD) {
      // Include own-dept AND cross-dept requests routed to their department
      departmentFilter = 'AND (r.department_id = ? OR r.routing_department_id = ?)';
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
   * Get reconciliation details for a request
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
                 AND al.approver_role IN ('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS')
                 AND al.action IN ('APPROVED', 'REJECTED')
               ORDER BY al.created_at DESC LIMIT 1) AS lead_comments,
              (SELECT al.action FROM approval_logs al
               WHERE al.request_id = r.request_id
                 AND al.approver_role IN ('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS')
                 AND al.action IN ('APPROVED', 'REJECTED')
               ORDER BY al.created_at DESC LIMIT 1) AS lead_action,
              (SELECT CONCAT(lu.first_name, ' ', lu.last_name)
               FROM approval_logs al2
               JOIN users lu ON al2.approver_id = lu.id
               WHERE al2.request_id = r.request_id
                 AND al2.approver_role IN ('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS')
                 AND al2.action IN ('APPROVED', 'REJECTED')
               ORDER BY al2.created_at DESC LIMIT 1) AS lead_reviewer_name
       FROM reconciliations r
       JOIN users u ON r.reconciled_by = u.id
       LEFT JOIN users fr ON r.finance_reviewer_id = fr.id
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
   */
  async getMyDispatchedRequests(userId) {
    return await query(
      `SELECT r.*, 
              d.department_name, d.department_code,
              (SELECT COUNT(*) FROM reconciliations rec WHERE rec.request_id = r.id) as reconciliation_count,
              latest_rec.submission_timeliness,
              latest_rec.working_days_taken
       FROM requests r
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN (
         SELECT request_id, submission_timeliness, working_days_taken
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
    // Finance pending tab only shows RECON_PENDING_FINANCE items.
    // Lead/HOP sees RECON_PENDING_LEAD items in the separate Lead tab.
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
   */
  async getMyReconciliations(userId) {
    return await query(
      `SELECT rec.*,
              r.request_code,
              r.total_amount as request_amount,
              d.department_name, d.department_code,
              fr.first_name as reviewer_first_name,
              fr.last_name as reviewer_last_name
       FROM reconciliations rec
       JOIN requests r ON rec.request_id = r.id
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN users fr ON rec.finance_reviewer_id = fr.id
       WHERE rec.reconciled_by = ?
       ORDER BY rec.created_at DESC`,
      [userId]
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
              fr.first_name as reviewer_first_name,
              fr.last_name as reviewer_last_name
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       LEFT JOIN reconciliations rec ON rec.id = (
         SELECT id FROM reconciliations
         WHERE request_id = r.id
         ORDER BY created_at DESC
         LIMIT 1
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
   * and more than 5 working days have elapsed since the dispatch date.
   */
  async getOverdueCount(userId) {
    const rows = await query(
      `SELECT COUNT(*) AS cnt
       FROM requests r
       WHERE r.requester_id = ?
         AND r.status = 'DISPATCHED'
         AND r.dispatched_at IS NOT NULL
         AND (
           SELECT COUNT(*) FROM reconciliations rec
           WHERE rec.request_id = r.id
         ) = 0
         AND (
           SELECT COALESCE(SUM(
             CASE WHEN DAYOFWEEK(DATE_ADD(r.dispatched_at, INTERVAL seq.n DAY)) NOT IN (1,7) THEN 1 ELSE 0 END
           ), 0)
           FROM (
             SELECT 1 AS n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
             UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10
             UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
           ) seq
           WHERE DATE_ADD(r.dispatched_at, INTERVAL seq.n DAY) <= CURDATE()
         ) > 5`,
      [userId]
    );
    return rows[0] ? Number(rows[0].cnt) : 0;
  }
}

module.exports = new ReconciliationService();
