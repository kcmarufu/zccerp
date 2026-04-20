/**
 * Approval Service
 * Handles the 4-tier approval workflow with race condition prevention
 * 
 * Workflow: General User -> Program Lead -> HOP -> Finance Clerk
 * Budget deduction only occurs at final Finance Clerk approval
 */

const { query, transaction, pool } = require('../config/database');
const { 
  REQUEST_STATUS, 
  ROLES, 
  getNextApprovalStatus,
  getRequiredApprovalRole,
  isValidTransition 
} = require('../config/roles');

class ApprovalService {
  
  /**
   * Submit request for approval (User submits draft)
   */
  async submitRequest(requestId, userId, ipAddress) {
    return await transaction(async (connection) => {
      // Lock the request row
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

      // Verify ownership
      if (request.requester_id !== userId) {
        throw new Error('You can only submit your own requests');
      }

      // Verify status
      if (request.status !== REQUEST_STATUS.DRAFT) {
        throw new Error(`Cannot submit request with status: ${request.status}`);
      }

      // Verify request has items
      const [items] = await connection.execute(
        'SELECT COUNT(*) as count FROM request_items WHERE request_id = ?',
        [requestId]
      );

      if (items[0].count === 0) {
        throw new Error('Cannot submit request without items');
      }

      // Update status
      await connection.execute(
        `UPDATE requests 
         SET status = ?, submitted_at = CURRENT_TIMESTAMP, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.PENDING_LEAD_APPROVAL, requestId]
      );

      // Log the submission
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, ip_address)
         VALUES (?, ?, ?, 'SUBMITTED', ?, ?, ?)`,
        [requestId, userId, 'GENERAL_USER', REQUEST_STATUS.DRAFT, REQUEST_STATUS.PENDING_LEAD_APPROVAL, ipAddress]
      );

      return { success: true, message: 'Request submitted successfully' };
    });
  }

  /**
   * Program Lead Approval (First Level)
   * Approver must be in the same department as the requester (organizational hierarchy)
   * After Lead approval, request goes directly to Finance
   */
  async approveAsLead(requestId, approverId, comments, expectedVersion, ipAddress) {
    comments = comments || null;
    return await transaction(async (connection) => {
      // Lock and fetch request with approver's department
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

      // Validate status
      if (request.status !== REQUEST_STATUS.PENDING_LEAD_APPROVAL) {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      // Optimistic locking
      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified. Please refresh and try again.');
      }

      // Validate: approver's department must match the requester's department
      // Program Lead approves requests from their own department (organizational hierarchy)
      if (request.department_id !== request.approver_dept) {
        throw new Error('You can only approve requests from users in your department');
      }

      // Updated: Lead approval goes directly to Finance (skip HOP)
      await connection.execute(
        `UPDATE requests 
         SET status = ?, lead_approved_at = CURRENT_TIMESTAMP, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.PENDING_FINANCE_APPROVAL, requestId]
      );

      // Log approval
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
        [requestId, approverId, ROLES.PROGRAM_LEAD, REQUEST_STATUS.PENDING_LEAD_APPROVAL, 
         REQUEST_STATUS.PENDING_FINANCE_APPROVAL, comments, ipAddress]
      );

      return { 
        success: true, 
        message: 'Request approved by Program Lead - sent to Finance for final approval',
        newStatus: REQUEST_STATUS.PENDING_FINANCE_APPROVAL
      };
    });
  }

  /**
   * Head of Programs Approval
   * HOP can approve requests at PENDING_LEAD_APPROVAL stage (as alternative to Program Lead)
   * After HOP approval, request goes directly to Finance
   */
  async approveAsHOP(requestId, approverId, comments, expectedVersion, ipAddress) {
    comments = comments || null;
    return await transaction(async (connection) => {
      // Lock and fetch request
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

      // HOP can approve at either PENDING_LEAD_APPROVAL or PENDING_HOP_APPROVAL stage
      const validStatuses = [REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
      if (!validStatuses.includes(request.status)) {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      // Optimistic locking
      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified. Please refresh and try again.');
      }

      // HOP can approve requests from any department (cross-department oversight)

      // Updated: HOP approval goes directly to Finance
      await connection.execute(
        `UPDATE requests 
         SET status = ?, hop_approved_at = CURRENT_TIMESTAMP, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.PENDING_FINANCE_APPROVAL, requestId]
      );

      // Log approval
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
        [requestId, approverId, ROLES.HEAD_OF_PROGRAMS, request.status, 
         REQUEST_STATUS.PENDING_FINANCE_APPROVAL, comments, ipAddress]
      );

      return { 
        success: true, 
        message: 'Request approved by Head of Programs - sent to Finance for final approval',
        newStatus: REQUEST_STATUS.PENDING_FINANCE_APPROVAL
      };
    });
  }

  /**
   * Finance Clerk Final Approval with Budget Deduction
   * CRITICAL: This method handles the actual budget deduction with race condition prevention
   */
  async approveAsFinance(requestId, approverId, comments, expectedVersion, ipAddress) {
    comments = comments || null;
    const connection = await pool.getConnection();
    
    try {
      // Set SERIALIZABLE isolation level for maximum consistency
      await connection.execute('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await connection.beginTransaction();

      // Step 1: Lock and validate the request
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      // Validate status
      if (request.status !== REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      // Optimistic locking check
      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified by another user. Please refresh and try again.');
      }

      // Step 2: Get all request items and lock their associated budget lines
      const [items] = await connection.execute(
        `SELECT ri.*, (ri.quantity * ri.unit_price) as item_total, (bl.allocated_amount - bl.spent_amount) as current_balance, bl.budget_name
         FROM request_items ri
         JOIN budget_lines bl ON ri.budget_line_id = bl.id
         WHERE ri.request_id = ?
         FOR UPDATE`,
        [requestId]
      );

      if (items.length === 0) {
        throw new Error('Request has no items');
      }

      // Step 3: Validate sufficient budget for ALL items BEFORE making any changes
      const insufficientBudgets = [];
      const budgetDeductions = new Map(); // Group deductions by budget line

      for (const item of items) {
        const budgetLineId = item.budget_line_id;
        const itemTotal = parseFloat(item.item_total);
        
        // Accumulate deductions per budget line
        if (!budgetDeductions.has(budgetLineId)) {
          budgetDeductions.set(budgetLineId, {
            budgetLineId,
            budgetName: item.budget_name,
            currentBalance: parseFloat(item.current_balance),
            totalDeduction: 0
          });
        }
        
        budgetDeductions.get(budgetLineId).totalDeduction += itemTotal;
      }

      // Check if all budget lines have sufficient funds
      for (const [budgetLineId, deduction] of budgetDeductions) {
        if (deduction.currentBalance < deduction.totalDeduction) {
          insufficientBudgets.push({
            budgetName: deduction.budgetName,
            available: deduction.currentBalance,
            required: deduction.totalDeduction,
            shortfall: deduction.totalDeduction - deduction.currentBalance
          });
        }
      }

      if (insufficientBudgets.length > 0) {
        const errorDetails = insufficientBudgets.map(b => 
          `${b.budgetName}: Available $${b.available.toFixed(2)}, Required $${b.required.toFixed(2)}, Shortfall $${b.shortfall.toFixed(2)}`
        ).join('; ');
        throw new Error(`Insufficient budget: ${errorDetails}`);
      }

      // Step 4: Process budget deductions for each budget line
      // Also track deductions per donor to update donor totals
      const donorDeductions = new Map();

      for (const [budgetLineId, deduction] of budgetDeductions) {
        const balanceBefore = deduction.currentBalance;
        const balanceAfter = balanceBefore - deduction.totalDeduction;

        // Get the donor_id for this budget line
        const [budgetLineInfo] = await connection.execute(
          'SELECT donor_id FROM budget_lines WHERE id = ?',
          [budgetLineId]
        );
        
        if (budgetLineInfo.length > 0) {
          const donorId = budgetLineInfo[0].donor_id;
          if (!donorDeductions.has(donorId)) {
            donorDeductions.set(donorId, 0);
          }
          donorDeductions.set(donorId, donorDeductions.get(donorId) + deduction.totalDeduction);
        }

        // Update the budget line (spent_amount increases, balance auto-decreases)
        await connection.execute(
          `UPDATE budget_lines 
           SET spent_amount = spent_amount + ?, updated_at = NOW()
           WHERE id = ?`,
          [deduction.totalDeduction, budgetLineId]
        );

        // Log the budget transaction for audit trail
        await connection.execute(
          `INSERT INTO budget_transactions 
           (budget_line_id, request_id, transaction_type, amount, 
            balance_before, balance_after, description, performed_by)
           VALUES (?, ?, 'DEDUCTION', ?, ?, ?, ?, ?)`,
          [budgetLineId, requestId, deduction.totalDeduction, 
           balanceBefore, balanceAfter,
           `Budget deduction for approved request #${request.request_code}`,
           approverId]
        );
      }

      // Step 4b: Update donor total_spent for each affected donor
      for (const [donorId, totalDeduction] of donorDeductions) {
        await connection.execute(
          `UPDATE donors 
           SET total_spent = total_spent + ?, updated_at = NOW()
           WHERE id = ?`,
          [totalDeduction, donorId]
        );
      }

      // Step 5: Update request status to APPROVED
      await connection.execute(
        `UPDATE requests 
         SET status = ?, 
             finance_approved_at = CURRENT_TIMESTAMP, 
             completed_at = CURRENT_TIMESTAMP,
             updated_at = NOW(),
             version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.APPROVED, requestId]
      );

      // Step 6: Log the approval action
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
        [requestId, approverId, ROLES.FINANCE_CLERK, REQUEST_STATUS.PENDING_FINANCE_APPROVAL, 
         REQUEST_STATUS.APPROVED, comments, ipAddress]
      );

      await connection.commit();

      return {
        success: true,
        message: 'Request approved and budget deducted successfully',
        newStatus: REQUEST_STATUS.APPROVED,
        deductions: Array.from(budgetDeductions.values()).map(d => ({
          budgetName: d.budgetName,
          amount: d.totalDeduction,
          newBalance: d.currentBalance - d.totalDeduction
        }))
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Reject request at any approval stage
   */
  async rejectRequest(requestId, approverId, approverRole, comments, expectedVersion, ipAddress) {
    comments = comments || null;
    return await transaction(async (connection) => {
      // Lock and fetch request
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];
      const previousStatus = request.status;

      // Validate can reject from current status
      const validRejectStatuses = [
        REQUEST_STATUS.PENDING_LEAD_APPROVAL,
        REQUEST_STATUS.PENDING_HOP_APPROVAL,
        REQUEST_STATUS.PENDING_FINANCE_APPROVAL
      ];

      if (!validRejectStatuses.includes(previousStatus)) {
        throw new Error(`Cannot reject request with status: ${previousStatus}`);
      }

      // Optimistic locking
      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified. Please refresh and try again.');
      }

      // Validate approver role matches required role for current status
      const requiredRole = getRequiredApprovalRole(previousStatus);
      const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      if (!allowedRoles.includes(approverRole)) {
        throw new Error(`Only ${allowedRoles.join(' or ')} can reject requests at this stage`);
      }

      // Update status to rejected
      await connection.execute(
        `UPDATE requests 
         SET status = ?, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.REJECTED, requestId]
      );

      // Log rejection
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'REJECTED', ?, ?, ?, ?)`,
        [requestId, approverId, approverRole, previousStatus, REQUEST_STATUS.REJECTED, comments, ipAddress]
      );

      return {
        success: true,
        message: 'Request rejected',
        newStatus: REQUEST_STATUS.REJECTED
      };
    });
  }

  /**
   * Get requests pending approval for a specific role
   */
  async getPendingApprovals(role, userId, departmentId, filters = {}) {
    let statusFilter;
    let departmentFilter = '';
    let useInClause = false;

    switch (role) {
      case ROLES.PROGRAM_LEAD:
        statusFilter = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
        // Program Lead sees requests from their own department (requester's dept)
        departmentFilter = 'AND r.department_id = ?';
        break;
      case ROLES.HEAD_OF_PROGRAMS:
        // HOP can approve at PENDING_LEAD_APPROVAL (as alternative to Lead) or PENDING_HOP_APPROVAL
        statusFilter = [REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
        useInClause = true;
        // HOP sees all requests (cross-department oversight)
        break;
      case ROLES.FINANCE_CLERK:
        statusFilter = REQUEST_STATUS.PENDING_FINANCE_APPROVAL;
        // Finance sees all requests at Finance stage
        break;
      default:
        throw new Error('Invalid approver role');
    }

    const params = [];
    let statusCondition;
    
    if (useInClause) {
      statusCondition = 'r.status IN (?, ?)';
      params.push(...statusFilter);
    } else {
      statusCondition = 'r.status = ?';
      params.push(statusFilter);
    }
    
    if (role === ROLES.PROGRAM_LEAD) {
      params.push(departmentId);
    }
    if (filters.departmentId && role !== ROLES.PROGRAM_LEAD) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }

    const sql = `
      SELECT DISTINCT
        r.*,
        u.first_name as requester_first_name,
        u.last_name as requester_last_name,
        u.email as requester_email,
        d.department_name,
        d.department_code
      FROM requests r
      JOIN users u ON r.requester_id = u.id
      JOIN departments d ON r.department_id = d.id
      WHERE ${statusCondition} ${departmentFilter}
      ORDER BY 
        CASE r.priority 
          WHEN 'URGENT' THEN 1 
          WHEN 'HIGH' THEN 2 
          WHEN 'MEDIUM' THEN 3 
          ELSE 4 
        END,
        r.submitted_at ASC
    `;

    return await query(sql, params);
  }

  /**
   * Get full approval trail for a request
   */
  async getApprovalTrail(requestId) {
    return await query(
      `SELECT
        al.*,
        u.first_name as approver_first_name,
        u.last_name as approver_last_name,
        u.email as approver_email,
        CONCAT(u.first_name, ' ', u.last_name) as actor_name,
        al.approver_role as actor_role,
        al.comments as comment
       FROM approval_logs al
       JOIN users u ON al.approver_id = u.id
       WHERE al.request_id = ?
       ORDER BY al.created_at ASC`,
      [requestId]
    );
  }

  /**
   * Get budget impact preview for a request
   */
  async getBudgetImpactPreview(requestId) {
    const items = await query(
      `SELECT 
        ri.budget_line_id,
        bl.budget_code,
        bl.budget_name,
        bl.allocated_amount,
        bl.spent_amount,
        (bl.allocated_amount - bl.spent_amount) as current_balance,
        SUM(ri.quantity * ri.unit_price) as requested_amount
       FROM request_items ri
       JOIN budget_lines bl ON ri.budget_line_id = bl.id
       WHERE ri.request_id = ?
       GROUP BY ri.budget_line_id, bl.budget_code, bl.budget_name, bl.allocated_amount, bl.spent_amount`,
      [requestId]
    );

    return items.map(item => ({
      ...item,
      balanceAfterApproval: parseFloat(item.current_balance) - parseFloat(item.requested_amount),
      hasInsufficientFunds: parseFloat(item.current_balance) < parseFloat(item.requested_amount),
      utilizationBeforePercent: ((parseFloat(item.spent_amount) / parseFloat(item.allocated_amount)) * 100).toFixed(2),
      utilizationAfterPercent: (((parseFloat(item.spent_amount) + parseFloat(item.requested_amount)) / parseFloat(item.allocated_amount)) * 100).toFixed(2)
    }));
  }

  /**
   * Reverse (withdraw) an approval within 5 hours
   * Only the approver who made the approval can reverse it within 5 hours
   */
  async reverseApproval(requestId, approverId, approverRole, comments, ipAddress) {
    comments = comments || null;
    return await transaction(async (connection) => {
      // Lock and fetch request
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];
      
      // Get the last approval log for this approver
      const [lastApproval] = await connection.execute(
        `SELECT * FROM approval_logs 
         WHERE request_id = ? AND approver_id = ? AND action = 'APPROVED'
         ORDER BY created_at DESC LIMIT 1`,
        [requestId, approverId]
      );

      if (lastApproval.length === 0) {
        throw new Error('No approval found to reverse');
      }

      const approval = lastApproval[0];
      const approvalTime = new Date(approval.created_at);
      const now = new Date();
      const hoursSinceApproval = (now - approvalTime) / (1000 * 60 * 60);

      if (hoursSinceApproval > 5) {
        throw new Error('Approval reversal window has expired (5 hours limit)');
      }

      // Determine the previous status based on who approved
      let revertToStatus;
      switch (approverRole) {
        case ROLES.PROGRAM_LEAD:
          // Updated: Lead approval now goes to Finance, so revert from Finance stage
          if (request.status !== REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
            throw new Error('Cannot reverse - request has already progressed');
          }
          revertToStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
          await connection.execute(
            'UPDATE requests SET lead_approved_at = NULL, updated_at = NOW() WHERE id = ?',
            [requestId]
          );
          break;
        case ROLES.HEAD_OF_PROGRAMS:
          // Updated: HOP approval also goes to Finance, so revert from Finance stage
          if (request.status !== REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
            throw new Error('Cannot reverse - request has already progressed');
          }
          revertToStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
          await connection.execute(
            'UPDATE requests SET hop_approved_at = NULL, updated_at = NOW() WHERE id = ?',
            [requestId]
          );
          break;
        case ROLES.FINANCE_CLERK:
          // Finance reversal - need to restore budget
          if (request.status !== REQUEST_STATUS.APPROVED && request.status !== 'DISPATCHED') {
            throw new Error('Cannot reverse - request is not in approved state');
          }
          
          // Get deductions to reverse
          const [transactions] = await connection.execute(
            `SELECT bt.*, bl.donor_id FROM budget_transactions bt
             JOIN budget_lines bl ON bt.budget_line_id = bl.id
             WHERE bt.request_id = ? AND bt.transaction_type = 'DEDUCTION'`,
            [requestId]
          );

          // Track donor reversals
          const donorReversals = new Map();

          // Reverse each budget deduction
          for (const trans of transactions) {
            await connection.execute(
              `UPDATE budget_lines 
               SET spent_amount = spent_amount - ?, updated_at = NOW()
               WHERE id = ?`,
              [trans.amount, trans.budget_line_id]
            );

            // Track reversal per donor
            if (trans.donor_id) {
              if (!donorReversals.has(trans.donor_id)) {
                donorReversals.set(trans.donor_id, 0);
              }
              donorReversals.set(trans.donor_id, donorReversals.get(trans.donor_id) + parseFloat(trans.amount));
            }

            // Log the reversal
            const [bl] = await connection.execute(
              'SELECT (allocated_amount - spent_amount) as balance FROM budget_lines WHERE id = ?',
              [trans.budget_line_id]
            );

            await connection.execute(
              `INSERT INTO budget_transactions 
               (budget_line_id, request_id, transaction_type, amount, 
                balance_before, balance_after, description, performed_by)
               VALUES (?, ?, 'REVERSAL', ?, ?, ?, ?, ?)`,
              [trans.budget_line_id, requestId, trans.amount,
               bl[0].balance - trans.amount, bl[0].balance,
               `Budget reversal for request #${request.request_code} - approval withdrawn`,
               approverId]
            );
          }

          // Reverse donor total_spent
          for (const [donorId, reversalAmount] of donorReversals) {
            await connection.execute(
              `UPDATE donors 
               SET total_spent = total_spent - ?, updated_at = NOW()
               WHERE id = ?`,
              [reversalAmount, donorId]
            );
          }

          revertToStatus = REQUEST_STATUS.PENDING_FINANCE_APPROVAL;
          await connection.execute(
            'UPDATE requests SET finance_approved_at = NULL, completed_at = NULL, updated_at = NOW() WHERE id = ?',
            [requestId]
          );
          break;
        default:
          throw new Error('Invalid approver role for reversal');
      }

      // Update request status
      await connection.execute(
        `UPDATE requests 
         SET status = ?, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [revertToStatus, requestId]
      );

      // Log the reversal
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'REVERSED', ?, ?, ?, ?)`,
        [requestId, approverId, approverRole, request.status, revertToStatus, comments, ipAddress]
      );

      return {
        success: true,
        message: 'Approval reversed successfully',
        newStatus: revertToStatus,
        hoursRemaining: Math.max(0, 5 - hoursSinceApproval).toFixed(2)
      };
    });
  }

  /**
   * Check if an approver can reverse their approval
   */
  async canReverseApproval(requestId, approverId, approverRole) {
    // Get the last approval log for this approver
    const results = await query(
      `SELECT * FROM approval_logs 
       WHERE request_id = ? AND approver_id = ? AND action = 'APPROVED'
       ORDER BY created_at DESC LIMIT 1`,
      [requestId, approverId]
    );

    if (results.length === 0) {
      return { canReverse: false, reason: 'No approval found' };
    }

    const approval = results[0];
    const approvalTime = new Date(approval.created_at);
    const now = new Date();
    const hoursSinceApproval = (now - approvalTime) / (1000 * 60 * 60);

    if (hoursSinceApproval > 5) {
      return { 
        canReverse: false, 
        reason: 'Reversal window expired',
        hoursAgo: hoursSinceApproval.toFixed(2)
      };
    }

    return {
      canReverse: true,
      hoursRemaining: (5 - hoursSinceApproval).toFixed(2),
      approvedAt: approval.created_at
    };
  }

  /**
   * Get all requests that an approver has acted on (approved or rejected)
   * This includes requests that have moved past their approval stage
   */
  async getApprovalHistory(role, userId, departmentId, filters = {}) {
    let departmentFilter = '';
    const params = [userId];

    // Program Lead only sees history for requests from their department
    if (role === ROLES.PROGRAM_LEAD) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    } else if (filters.departmentId) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }
    // HOP and Finance see all their approval history

    // Get requests where this user has an approval log entry
    const sql = `
      SELECT DISTINCT
        r.*,
        u.first_name as requester_first_name,
        u.last_name as requester_last_name,
        u.email as requester_email,
        d.department_name,
        d.department_code,
        latest_log.action as approver_action,
        latest_log.created_at as action_timestamp,
        latest_log.comments as approver_comments
      FROM requests r
      JOIN users u ON r.requester_id = u.id
      JOIN departments d ON r.department_id = d.id
      INNER JOIN (
        SELECT al.request_id, al.action, al.created_at, al.comments
        FROM approval_logs al
        WHERE al.approver_id = ?
          AND al.action IN ('APPROVED', 'REJECTED', 'REVERSED')
        ORDER BY al.created_at DESC
      ) latest_log ON latest_log.request_id = r.id
      WHERE 1=1 ${departmentFilter}
      ORDER BY latest_log.created_at DESC
    `;

    return await query(sql, params);
  }

  /**
   * Get all approved requests for approvers to see
   */
  async getApprovedRequests(role, departmentId, filters = {}) {
    let departmentFilter = '';
    const params = [];

    // Program Lead sees approved requests from their department
    if (role === ROLES.PROGRAM_LEAD) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    } else if (filters.departmentId) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }
    // HOP and Finance see all approved requests

    const sql = `
      SELECT DISTINCT
        r.*,
        u.first_name as requester_first_name,
        u.last_name as requester_last_name,
        u.email as requester_email,
        d.department_name,
        d.department_code
      FROM requests r
      JOIN users u ON r.requester_id = u.id
      JOIN departments d ON r.department_id = d.id
      WHERE r.status IN ('APPROVED', 'DISPATCHED', 'PENDING_RECONCILIATION', 'RECONCILED') ${departmentFilter}
      ORDER BY r.finance_approved_at DESC, r.created_at DESC
    `;

    return await query(sql, params);
  }

  /**
   * Get all rejected requests for approvers to see
   */
  async getRejectedRequests(role, departmentId, filters = {}) {
    let departmentFilter = '';
    const params = [];

    // Program Lead sees rejected requests from their department
    if (role === ROLES.PROGRAM_LEAD) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    } else if (filters.departmentId) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }
    // HOP and Finance see all rejected requests

    const sql = `
      SELECT DISTINCT
        r.*,
        u.first_name as requester_first_name,
        u.last_name as requester_last_name,
        u.email as requester_email,
        d.department_name,
        d.department_code,
        (SELECT CONCAT(u2.first_name, ' ', u2.last_name)
         FROM approval_logs al
         JOIN users u2 ON al.approver_id = u2.id
         WHERE al.request_id = r.id AND al.action = 'REJECTED'
         ORDER BY al.created_at DESC LIMIT 1) as rejected_by,
        (SELECT al.comments
         FROM approval_logs al
         WHERE al.request_id = r.id AND al.action = 'REJECTED'
         ORDER BY al.created_at DESC LIMIT 1) as rejection_reason
      FROM requests r
      JOIN users u ON r.requester_id = u.id
      JOIN departments d ON r.department_id = d.id
      WHERE r.status = 'REJECTED' ${departmentFilter}
      ORDER BY r.updated_at DESC
    `;

    return await query(sql, params);
  }

  /**
   * Get dashboard statistics for an approver
   */
  async getApproverStats(role, userId, departmentId) {
    let pendingStatus;
    let departmentFilter = '';
    const baseParams = [];
    let useInClause = false;

    switch (role) {
      case ROLES.PROGRAM_LEAD:
        pendingStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
        // Program Lead stats: filter by requester's department
        departmentFilter = 'AND r.department_id = ?';
        baseParams.push(departmentId);
        break;
      case ROLES.HEAD_OF_PROGRAMS:
        // HOP sees requests at both PENDING_LEAD_APPROVAL and PENDING_HOP_APPROVAL
        pendingStatus = [REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
        useInClause = true;
        // HOP sees all requests (cross-department oversight)
        break;
      case ROLES.FINANCE_CLERK:
        pendingStatus = REQUEST_STATUS.PENDING_FINANCE_APPROVAL;
        // Finance sees all requests
        break;
      default:
        throw new Error('Invalid approver role');
    }

    // Get pending count
    let pendingParams;
    let pendingCondition;
    if (useInClause) {
      pendingCondition = 'r.status IN (?, ?)';
      pendingParams = [...pendingStatus, ...baseParams];
    } else {
      pendingCondition = 'r.status = ?';
      pendingParams = [pendingStatus, ...baseParams];
    }
    const pendingResult = await query(
      `SELECT COUNT(DISTINCT r.id) as count FROM requests r WHERE ${pendingCondition} ${departmentFilter}`,
      pendingParams
    );

    // Get approved count
    const approvedParams = [...baseParams];
    const approvedResult = await query(
      `SELECT COUNT(DISTINCT r.id) as count FROM requests r WHERE r.status IN ('APPROVED', 'DISPATCHED', 'RECONCILED') ${departmentFilter}`,
      approvedParams
    );

    // Get rejected count
    const rejectedResult = await query(
      `SELECT COUNT(DISTINCT r.id) as count FROM requests r WHERE r.status = 'REJECTED' ${departmentFilter}`,
      approvedParams
    );

    // Get total requests they can see
    const totalResult = await query(
      `SELECT COUNT(DISTINCT r.id) as count FROM requests r WHERE r.status != 'DRAFT' ${departmentFilter}`,
      approvedParams
    );

    return {
      pending: pendingResult[0]?.count || 0,
      approved: approvedResult[0]?.count || 0,
      rejected: rejectedResult[0]?.count || 0,
      total: totalResult[0]?.count || 0
    };
  }
}

module.exports = new ApprovalService();
