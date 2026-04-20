/**
 * Reconciliation Service
 * Handles the reconciliation workflow after dispatch
 * 
 * Flow: DISPATCHED -> requester submits reconciliation -> PENDING_RECONCILIATION -> Finance approves -> RECONCILED
 */

const { query, transaction, pool } = require('../config/database');
const { REQUEST_STATUS, ROLES } = require('../config/roles');

class ReconciliationService {

  /**
   * Submit a reconciliation for a dispatched request
   * Called by the requester after receiving the float
   */
  async submitReconciliation(requestId, userId, data, ipAddress) {
    return await transaction(async (connection) => {
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

      const { items, notes, totalSpent, totalReturned } = data;

      // Create reconciliation record
      const [reconResult] = await connection.execute(
        `INSERT INTO reconciliations 
         (request_id, reconciled_by, status, total_spent, total_returned, notes, created_at, updated_at)
         VALUES (?, ?, 'SUBMITTED', ?, ?, ?, NOW(), NOW())`,
        [requestId, userId, totalSpent || 0, totalReturned || 0, notes || null]
      );

      const reconciliationId = reconResult.insertId;

      // Insert reconciliation items
      if (items && items.length > 0) {
        for (const item of items) {
          await connection.execute(
            `INSERT INTO reconciliation_items 
             (reconciliation_id, request_item_id, description, budgeted_amount, actual_amount, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [reconciliationId, item.requestItemId || null, item.description, 
             item.budgetedAmount || 0, item.actualAmount || 0, item.notes || null]
          );
        }
      }

      // Update request status to RECON_PENDING_LEAD (first level - Program Lead/HOP)
      await connection.execute(
        `UPDATE requests 
         SET status = ?, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.RECON_PENDING_LEAD, requestId]
      );

      // Log the reconciliation submission
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, 'GENERAL_USER', 'SUBMITTED', ?, ?, ?, ?)`,
        [requestId, userId, REQUEST_STATUS.DISPATCHED, REQUEST_STATUS.RECON_PENDING_LEAD, 
         'Reconciliation submitted', ipAddress]
      );

      return { 
        success: true, 
        message: 'Reconciliation submitted successfully',
        reconciliationId,
        newStatus: REQUEST_STATUS.RECON_PENDING_LEAD
      };
    });
  }

  /**
   * Finance approves a reconciliation
   * 
   * Budget adjustment logic (only on final approval):
   * - For each budget line in the request, compare original budgeted amount vs actual spent
   * - Over-expenditure: actual > budgeted → further deduct the difference from the budget line
   * - Change returned: actual < budgeted → reverse the difference back to the budget line
   */
  async approveReconciliation(requestId, financeUserId, comments, ipAddress) {
    return await transaction(async (connection) => {
      // Lock request
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      if (request.status !== REQUEST_STATUS.RECON_PENDING_FINANCE) {
        throw new Error(`Cannot approve reconciliation for request with status: ${request.status}. Must be pending finance review.`);
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

      // Get reconciliation items with their matching request items and budget lines
      const [reconItems] = await connection.execute(
        `SELECT 
          rci.id as recon_item_id,
          rci.request_item_id,
          rci.description,
          rci.budgeted_amount,
          rci.actual_amount,
          ri.budget_line_id,
          ri.quantity,
          ri.unit_price,
          (ri.quantity * ri.unit_price) as original_line_total,
          bl.id as bl_id,
          bl.budget_code,
          bl.budget_name,
          bl.spent_amount as bl_spent,
          bl.allocated_amount as bl_allocated,
          (bl.allocated_amount - bl.spent_amount) as bl_balance,
          bl.donor_id
         FROM reconciliation_items rci
         LEFT JOIN request_items ri ON rci.request_item_id = ri.id
         LEFT JOIN budget_lines bl ON ri.budget_line_id = bl.id
         WHERE rci.reconciliation_id = ?`,
        [reconciliation.id]
      );

      // Group adjustments by budget line to handle multiple items per line
      const budgetAdjustments = {};

      for (const item of reconItems) {
        if (!item.budget_line_id) continue;

        const budgeted = parseFloat(item.budgeted_amount) || 0;
        const actual = parseFloat(item.actual_amount) || 0;
        const difference = actual - budgeted; // positive = over-spent, negative = change returned

        if (difference === 0) continue;

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
      }

      // Also handle the case where reconciliation items don't have request_item_id matches
      // Use the total_spent and total_returned from the reconciliation header
      const totalSpent = parseFloat(reconciliation.total_spent) || 0;
      const totalReturned = parseFloat(reconciliation.total_returned) || 0;
      const requestTotal = parseFloat(request.total_amount) || 0;
      const headerDifference = totalSpent - requestTotal; // positive = over-expenditure

      // If no per-item adjustments were computed, fall back to header-level adjustment
      const hasItemAdjustments = Object.keys(budgetAdjustments).length > 0;

      if (!hasItemAdjustments && (headerDifference !== 0 || totalReturned > 0)) {
        // Get all budget lines for this request to distribute adjustment
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
          // Distribute adjustment proportionally across budget lines based on their share of the request
          for (const ri of requestItems) {
            const lineTotal = parseFloat(ri.line_total) || 0;
            const proportion = requestTotal > 0 ? lineTotal / requestTotal : 1 / requestItems.length;
            
            let adjustment = 0;
            if (totalReturned > 0) {
              // Change returned: reduce spent on budget line
              adjustment = -(totalReturned * proportion);
            } else if (headerDifference > 0) {
              // Over-expenditure: increase spent on budget line
              adjustment = headerDifference * proportion;
            } else if (headerDifference < 0) {
              // Under-expenditure: reduce spent on budget line
              adjustment = headerDifference * proportion;
            }

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
              description: `Header-level reconciliation adjustment`,
              budgeted: lineTotal,
              actual: lineTotal + adjustment,
              difference: adjustment
            });
          }
        }
      }

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
           balanceBefore, balanceAfter, description, financeUserId]
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
        [financeUserId, comments || null, reconciliation.id]
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
        [requestId, financeUserId, ROLES.FINANCE_CLERK, 
         REQUEST_STATUS.RECON_PENDING_FINANCE, REQUEST_STATUS.RECONCILED, 
         comments || 'Reconciliation approved', ipAddress]
      );

      return {
        success: true,
        message: 'Reconciliation approved successfully',
        newStatus: REQUEST_STATUS.RECONCILED,
        budgetAdjustments: adjustmentResults,
        totalSpent,
        totalReturned
      };
    });
  }

  /**
   * Finance rejects a reconciliation (sends back to requester)
   */
  async rejectReconciliation(requestId, financeUserId, comments, ipAddress) {
    return await transaction(async (connection) => {
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
        [financeUserId, comments || null, recons[0].id]
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
        [requestId, financeUserId, ROLES.FINANCE_CLERK,
         request.status, REQUEST_STATUS.DISPATCHED,
         comments || 'Reconciliation rejected', ipAddress]
      );

      return {
        success: true,
        message: 'Reconciliation rejected. Requester can resubmit.',
        newStatus: REQUEST_STATUS.DISPATCHED
      };
    });
  }

  /**
   * Program Lead / HOP approves reconciliation (sends to Finance for final review)
   */
  async approveReconciliationAsLead(requestId, approverId, approverRole, comments, ipAddress) {
    return await transaction(async (connection) => {
      const [requests] = await connection.execute(
        `SELECT r.*, u.department_id as approver_dept
         FROM requests r
         JOIN users u ON u.id = ?
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

      // Program Lead: must be same department
      if (approverRole === ROLES.PROGRAM_LEAD && request.department_id !== request.approver_dept) {
        throw new Error('You can only approve reconciliations from users in your department');
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
        newStatus: REQUEST_STATUS.RECON_PENDING_FINANCE
      };
    });
  }

  /**
   * Program Lead / HOP rejects reconciliation (sends back to requester)
   */
  async rejectReconciliationAsLead(requestId, approverId, approverRole, comments, ipAddress) {
    return await transaction(async (connection) => {
      const [requests] = await connection.execute(
        `SELECT r.*, u.department_id as approver_dept
         FROM requests r
         JOIN users u ON u.id = ?
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

      // Program Lead: must be same department
      if (approverRole === ROLES.PROGRAM_LEAD && request.department_id !== request.approver_dept) {
        throw new Error('You can only reject reconciliations from users in your department');
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
        newStatus: REQUEST_STATUS.DISPATCHED
      };
    });
  }

  /**
   * Get pending reconciliations for lead/HOP approval
   */
  async getPendingLeadReconciliations(approverId, approverRole, departmentId) {
    let departmentFilter = '';
    let params = [REQUEST_STATUS.RECON_PENDING_LEAD];

    // Program Leads only see their department
    if (approverRole === ROLES.PROGRAM_LEAD) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    }

    return await query(
      `SELECT r.*, 
              u.first_name as requester_first_name,
              u.last_name as requester_last_name,
              d.department_name, d.department_code,
              rec.id as reconciliation_id,
              rec.total_spent,
              rec.total_returned,
              rec.notes as reconciliation_notes,
              rec.created_at as reconciliation_submitted_at
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       JOIN reconciliations rec ON rec.request_id = r.id AND rec.status = 'SUBMITTED'
       WHERE r.status = ? ${departmentFilter}
       ORDER BY rec.created_at ASC`,
      params
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
              fr.last_name as reviewer_last_name
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

    // Get reconciliation items
    const items = await query(
      `SELECT ri.*, 
              rqi.item_description as original_description,
              rqi.quantity as original_quantity,
              rqi.unit_price as original_unit_price
       FROM reconciliation_items ri
       LEFT JOIN request_items rqi ON ri.request_item_id = rqi.id
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
              (SELECT COUNT(*) FROM reconciliations rec WHERE rec.request_id = r.id) as reconciliation_count
       FROM requests r
       JOIN departments d ON r.department_id = d.id
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
  async getPendingReconciliations() {
    return await query(
      `SELECT r.*, 
              u.first_name as requester_first_name,
              u.last_name as requester_last_name,
              d.department_name, d.department_code,
              rec.id as reconciliation_id,
              rec.total_spent,
              rec.total_returned,
              rec.notes as reconciliation_notes,
              rec.created_at as reconciliation_submitted_at
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       JOIN reconciliations rec ON rec.request_id = r.id AND rec.status = 'SUBMITTED'
       WHERE r.status = ?
       ORDER BY rec.created_at ASC`,
      [REQUEST_STATUS.RECON_PENDING_FINANCE]
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
   * Get reconciliation history (all completed reconciliations)
   */
  async getReconciliationHistory() {
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
              fr.first_name as reviewer_first_name,
              fr.last_name as reviewer_last_name
       FROM requests r
       JOIN users u ON r.requester_id = u.id
       JOIN departments d ON r.department_id = d.id
       JOIN reconciliations rec ON rec.request_id = r.id
       LEFT JOIN users fr ON rec.finance_reviewer_id = fr.id
       WHERE rec.status IN ('APPROVED', 'REJECTED')
       ORDER BY rec.reviewed_at DESC`
    );
  }
}

module.exports = new ReconciliationService();
