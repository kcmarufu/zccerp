/**
 * Approval Service
 * Handles the 4-tier approval workflow with race condition prevention
 * 
 * Workflow: General User -> Program Lead -> HOP -> Finance Clerk
 * Budget deduction only occurs at final Finance Clerk approval
 */

const { query, transaction, pool } = require('../config/database');
<<<<<<< HEAD
const notificationService = require('./notification.service');
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
      // Verify status (rejected requests can be resubmitted after edits).
      const submitAllowedStatuses = [REQUEST_STATUS.DRAFT, REQUEST_STATUS.REJECTED];
      if (!submitAllowedStatuses.includes(request.status)) {
=======
      // Verify status
      if (request.status !== REQUEST_STATUS.DRAFT) {
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
      const isResubmission = request.status === REQUEST_STATUS.REJECTED;

      // For resubmissions, route back to the level that last rejected the request
      // so the user doesn't have to go through already-approved levels again.
      let targetStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
      if (isResubmission) {
        const [rejectionLogs] = await connection.execute(
          `SELECT previous_status FROM approval_logs
           WHERE request_id = ? AND action = 'REJECTED'
           ORDER BY created_at DESC LIMIT 1`,
          [requestId]
        );

        if (rejectionLogs.length > 0) {
          const rejectedFromStatus = rejectionLogs[0].previous_status;
          if (rejectedFromStatus === REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
            targetStatus = REQUEST_STATUS.PENDING_FINANCE_APPROVAL;
          } else if (rejectedFromStatus === REQUEST_STATUS.PENDING_HOP_APPROVAL) {
            targetStatus = REQUEST_STATUS.PENDING_HOP_APPROVAL;
          } else if (rejectedFromStatus === REQUEST_STATUS.PENDING_ADMIN_APPROVAL) {
            targetStatus = REQUEST_STATUS.PENDING_ADMIN_APPROVAL;
          } else {
            // PENDING_LEAD_APPROVAL or unrecognised — start from Lead level
            targetStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
          }
        }
      } else {
        // New submission: determine routing based on donor type and requester role.

        // 1. Check if the requester is a Finance Clerk — their requests must go to
        //    Finance HOP/Lead first (PENDING_LEAD_APPROVAL at Finance dept).
        const [requesterRows] = await connection.execute(
          'SELECT r.role_name AS role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?',
          [userId]
        );
        const requesterRole = requesterRows[0]?.role;

        // 2. Check if this request targets an Admin-type donor.
        if (request.donor_id) {
          const [donorRows] = await connection.execute(
            'SELECT donor_type FROM donors WHERE id = ?',
            [request.donor_id]
          );
          if (donorRows.length > 0 && donorRows[0].donor_type === 'ADMIN') {
            targetStatus = REQUEST_STATUS.PENDING_ADMIN_APPROVAL;
          }
        }

        // Finance Clerk-created requests always start at PENDING_LEAD_APPROVAL
        // (Finance dept Lead/HOP acts as first approver).
        // This overrides any other routing — Finance Clerk requests never skip to Finance.
        if (requesterRole === 'FINANCE_CLERK') {
          targetStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
        }
      }

      // Cross-department routing: if the selected project belongs to a different
      // department, store that department's ID so approvals are routed there.
      // Skip routing for Admin-donor requests — they use a single shared approval queue.
      let routingDepartmentId = null;
      const isAdminDonorSubmit = (targetStatus === REQUEST_STATUS.PENDING_ADMIN_APPROVAL);
      if (!isAdminDonorSubmit && request.project_id) {
        // Use project's own department_id; if NULL (old projects), fall back to the
        // department set on the budget lines used by this request's items.
        const [projRows] = await connection.execute(
          `SELECT COALESCE(
             p.department_id,
             (SELECT bl.department_id
              FROM request_items ri
              JOIN budget_lines bl ON bl.id = ri.budget_line_id
              WHERE ri.request_id = ? AND bl.department_id IS NOT NULL
              LIMIT 1)
           ) AS effective_dept_id
           FROM projects p WHERE p.id = ?`,
          [requestId, request.project_id]
        );
        const effectiveDeptId = projRows[0]?.effective_dept_id;
        if (effectiveDeptId && effectiveDeptId !== request.requester_dept) {
          routingDepartmentId = effectiveDeptId;
        }
      }

      // Update status to the correct target level
      if (routingDepartmentId) {
        await connection.execute(
          `UPDATE requests
           SET status = ?, submitted_at = CURRENT_TIMESTAMP, updated_at = NOW(),
               version = version + 1, routing_department_id = ?
           WHERE id = ?`,
          [targetStatus, routingDepartmentId, requestId]
        );
      } else {
        await connection.execute(
          `UPDATE requests
           SET status = ?, submitted_at = CURRENT_TIMESTAMP, updated_at = NOW(), version = version + 1
           WHERE id = ?`,
          [targetStatus, requestId]
        );
      }

      // Log the submission/resubmission for a complete audit trail.
      await connection.execute(
        `INSERT INTO approval_logs
         (request_id, approver_id, approver_role, action, previous_status, new_status, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          requestId,
          userId,
          'GENERAL_USER',
          isResubmission ? 'RESUBMITTED' : 'SUBMITTED',
          request.status,
          targetStatus,
          ipAddress
        ]
      );

      return {
        success: true,
        message: isResubmission ? 'Request resubmitted successfully' : 'Request submitted successfully',
        _notif: { requestCode: request.request_code, requesterId: userId, deptId: request.department_id, routingDeptId: routingDepartmentId }
      };
    });
    // Fire notification outside transaction (silent)
    if (result._notif) {
      const n = result._notif; delete result._notif;
      notificationService.onRequestSubmitted(requestId, n.requestCode, n.requesterId, n.deptId, n.routingDeptId).catch(() => {});
    }
    return result;
=======
      // Update status
      await connection.execute(
        `UPDATE requests 
         SET status = ?, submitted_at = CURRENT_TIMESTAMP, version = version + 1
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
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  }

  /**
   * Program Lead Approval (First Level)
<<<<<<< HEAD
   * Approver must be in the same department as the requester (organizational hierarchy)
   * After Lead approval, request goes directly to Finance
   */
  async approveAsLead(requestId, approverId, comments, expectedVersion, ipAddress) {
    comments = comments || null;
    return await transaction(async (connection) => {
      // Lock and fetch request with approver's department + donor type
      const [requests] = await connection.execute(
        `SELECT r.*, u.department_id as approver_dept,
                u.first_name as approver_first, u.last_name as approver_last,
                don.donor_type as donor_type
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

      // Validate status — Lead can act at PENDING_LEAD_APPROVAL or PENDING_ADMIN_APPROVAL
      const validLeadStatuses = [REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_ADMIN_APPROVAL];
      if (!validLeadStatuses.includes(request.status)) {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      // Optimistic locking
      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified. Please refresh and try again.');
      }

      // Department check: skip for Admin-donor requests — any Lead can approve.
      // For cross-dept requests, check against routing_department_id (the project-owner's dept).
      const isAdminDonorRequest = request.donor_type === 'ADMIN';
      const effectiveDeptId = Number(request.routing_department_id || request.department_id);
      if (!isAdminDonorRequest && effectiveDeptId !== Number(request.approver_dept)) {
        throw new Error('You can only approve requests from your department (or the project-owning department for cross-department requests)');
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
        [requestId, approverId, ROLES.PROGRAM_LEAD, request.status,
         REQUEST_STATUS.PENDING_FINANCE_APPROVAL, comments, ipAddress]
      );

      return {
        success: true,
        message: 'Request approved by Program Lead - sent to Finance for final approval',
        newStatus: REQUEST_STATUS.PENDING_FINANCE_APPROVAL,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverName: `${request.approver_first} ${request.approver_last}` }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      notificationService.onRequestLeadApproved(requestId, n.requestCode, n.requesterId, n.approverName).catch(() => {});
    }
    return result;
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
        `SELECT r.*, u.department_id as approver_dept,
                u.first_name as approver_first, u.last_name as approver_last
=======
   */
  async approveAsLead(requestId, approverId, comments, expectedVersion, ipAddress) {
    return await transaction(async (connection) => {
      // Lock and fetch request
      const [requests] = await connection.execute(
        `SELECT r.*, u.department_id as approver_dept
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
         FROM requests r
         JOIN users u ON u.id = ?
         WHERE r.id = ? FOR UPDATE`,
        [approverId, requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

<<<<<<< HEAD
      // HOP can approve at PENDING_ADMIN_APPROVAL, PENDING_LEAD_APPROVAL or PENDING_HOP_APPROVAL
      const validStatuses = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
      if (!validStatuses.includes(request.status)) {
=======
      // Validate status
      if (request.status !== REQUEST_STATUS.PENDING_LEAD_APPROVAL) {
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      // Optimistic locking
      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified. Please refresh and try again.');
      }

<<<<<<< HEAD
      // Cross-dept routing: if routing_department_id is set, HOP must belong to that department.
      if (request.routing_department_id && Number(request.routing_department_id) !== Number(request.approver_dept)) {
        throw new Error('This cross-department request must be approved by the HOP of the project-owning department');
      }

      // Updated: HOP approval goes directly to Finance
      await connection.execute(
        `UPDATE requests 
         SET status = ?, hop_approved_at = CURRENT_TIMESTAMP, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.PENDING_FINANCE_APPROVAL, requestId]
=======
      // Validate department match (Program Lead can only approve their department)
      if (request.department_id !== request.approver_dept) {
        throw new Error('You can only approve requests from your department');
      }

      // Update status
      await connection.execute(
        `UPDATE requests 
         SET status = ?, lead_approved_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.PENDING_HOP_APPROVAL, requestId]
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      );

      // Log approval
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
<<<<<<< HEAD
        [requestId, approverId, ROLES.HEAD_OF_PROGRAMS, request.status, 
         REQUEST_STATUS.PENDING_FINANCE_APPROVAL, comments, ipAddress]
      );

      return {
        success: true,
        message: 'Request approved by Head of Programs - sent to Finance for final approval',
        newStatus: REQUEST_STATUS.PENDING_FINANCE_APPROVAL,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverName: `${request.approver_first} ${request.approver_last}` }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      notificationService.onRequestLeadApproved(requestId, n.requestCode, n.requesterId, n.approverName).catch(() => {});
    }
    return result;
  }

  /**
   * Admin Approval — two distinct behaviours:
   *   1. PENDING_ADMIN_APPROVAL (Admin-donor request): Admin is the first approver.
   *      After Admin approval the request moves to PENDING_LEAD_APPROVAL so that
   *      a Lead/HOP can review, and then Finance does final processing.
   *   2. Any other pending stage: Admin holds combined authority and advances
   *      the request directly to APPROVED (existing bypass behaviour).
   */
  async approveAsAdmin(requestId, approverId, comments, expectedVersion, ipAddress) {
    comments = comments || null;

    return await transaction(async (connection) => {
=======
        [requestId, approverId, ROLES.PROGRAM_LEAD, REQUEST_STATUS.PENDING_LEAD_APPROVAL, 
         REQUEST_STATUS.PENDING_HOP_APPROVAL, comments, ipAddress]
      );

      return { 
        success: true, 
        message: 'Request approved by Program Lead',
        newStatus: REQUEST_STATUS.PENDING_HOP_APPROVAL
      };
    });
  }

  /**
   * Head of Programs Approval (Second Level)
   */
  async approveAsHOP(requestId, approverId, comments, expectedVersion, ipAddress) {
    return await transaction(async (connection) => {
      // Lock and fetch request
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );
<<<<<<< HEAD
      if (requests.length === 0) throw new Error('Request not found');

      const request = requests[0];

=======

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      // Validate status
      if (request.status !== REQUEST_STATUS.PENDING_HOP_APPROVAL) {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      // Optimistic locking
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified. Please refresh and try again.');
      }

<<<<<<< HEAD
      const validStatuses = [
        REQUEST_STATUS.PENDING_ADMIN_APPROVAL,
        REQUEST_STATUS.PENDING_LEAD_APPROVAL,
        REQUEST_STATUS.PENDING_HOP_APPROVAL,
        REQUEST_STATUS.PENDING_FINANCE_APPROVAL
      ];
      if (!validStatuses.includes(request.status)) {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      // Admin-donor request at PENDING_ADMIN_APPROVAL: advance directly to Finance.
      // (HR Lead/HOP act at the same stage — first to approve wins.)
      if (request.status === REQUEST_STATUS.PENDING_ADMIN_APPROVAL) {
        await connection.execute(
          `UPDATE requests
           SET status = ?,
               updated_at = NOW(),
               version = version + 1
           WHERE id = ?`,
          [REQUEST_STATUS.PENDING_FINANCE_APPROVAL, requestId]
        );

        await connection.execute(
          `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
           VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
          [requestId, approverId, ROLES.ADMIN, REQUEST_STATUS.PENDING_ADMIN_APPROVAL,
           REQUEST_STATUS.PENDING_FINANCE_APPROVAL, comments, ipAddress]
        );

        return {
          success: true,
          message: 'Request approved — sent to Finance for final processing',
          newStatus: REQUEST_STATUS.PENDING_FINANCE_APPROVAL,
          _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId }
        };
      }

      // Default: Admin holds combined Lead/HOP + Finance authority — approve all remaining stages.
      await connection.execute(
        `UPDATE requests
         SET status = ?,
             lead_approved_at = COALESCE(lead_approved_at, CURRENT_TIMESTAMP),
             hop_approved_at  = COALESCE(hop_approved_at,  CURRENT_TIMESTAMP),
             finance_approved_at = CURRENT_TIMESTAMP,
             updated_at = NOW(),
=======
      // Update status
      await connection.execute(
        `UPDATE requests 
         SET status = ?, hop_approved_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.PENDING_FINANCE_APPROVAL, requestId]
      );

      // Log approval
      await connection.execute(
        `INSERT INTO approval_logs 
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
        [requestId, approverId, ROLES.HEAD_OF_PROGRAMS, REQUEST_STATUS.PENDING_HOP_APPROVAL, 
         REQUEST_STATUS.PENDING_FINANCE_APPROVAL, comments, ipAddress]
      );

      return { 
        success: true, 
        message: 'Request approved by Head of Programs',
        newStatus: REQUEST_STATUS.PENDING_FINANCE_APPROVAL
      };
    });
  }

  /**
   * Finance Clerk Final Approval with Budget Deduction
   * CRITICAL: This method handles the actual budget deduction with race condition prevention
   */
  async approveAsFinance(requestId, approverId, comments, expectedVersion, ipAddress) {
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
        `SELECT ri.*, bl.balance as current_balance, bl.budget_name
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
        const itemTotal = parseFloat(item.total_price);
        
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
      for (const [budgetLineId, deduction] of budgetDeductions) {
        const balanceBefore = deduction.currentBalance;
        const balanceAfter = balanceBefore - deduction.totalDeduction;

        // Update the budget line (spent_amount increases, balance auto-decreases)
        await connection.execute(
          `UPDATE budget_lines 
           SET spent_amount = spent_amount + ?
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
           `Budget deduction for approved request #${request.request_number}`,
           approverId]
        );
      }

      // Step 5: Update request status to APPROVED
      await connection.execute(
        `UPDATE requests 
         SET status = ?, 
             finance_approved_at = CURRENT_TIMESTAMP, 
             completed_at = CURRENT_TIMESTAMP,
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
             version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.APPROVED, requestId]
      );

<<<<<<< HEAD
      await connection.execute(
        `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
        [requestId, approverId, ROLES.ADMIN, request.status, REQUEST_STATUS.APPROVED, comments, ipAddress]
      );

      return {
        success: true,
        message: 'Request fully approved by Admin — ready for dispatch',
        newStatus: REQUEST_STATUS.APPROVED,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      const approver = await query('SELECT first_name, last_name FROM users WHERE id = ?', [n.approverId]).catch(() => [{}]);
      const approverName = approver[0] ? `${approver[0].first_name} ${approver[0].last_name}` : 'Admin';
      notificationService.onRequestFinanceApproved(requestId, n.requestCode, n.requesterId, approverName).catch(() => {});
    }
    return result;
  }

  /**
   * Finance Clerk Final Approval — status update only.
   * Budget deduction occurs at dispatch time (markAsDispatched), NOT here.
   * This prevents double-deduction: approve does not touch budget, dispatch does.
   */
  async approveAsFinance(requestId, approverId, comments, expectedVersion, ipAddress) {
    comments = comments || null;
    return await transaction(async (connection) => {
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );

      if (requests.length === 0) throw new Error('Request not found');

      const request = requests[0];

      if (request.status !== REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified by another user. Please refresh and try again.');
      }

      // A Finance Clerk cannot approve a request they themselves created.
      if (request.requester_id === approverId) {
        throw new Error('You cannot approve a request that you created. Another Finance account must handle this approval.');
      }

      // Update status to APPROVED — no budget change here, deduction happens at dispatch
      await connection.execute(
        `UPDATE requests
         SET status = ?, finance_approved_at = CURRENT_TIMESTAMP, updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.APPROVED, requestId]
      );

      await connection.execute(
        `INSERT INTO approval_logs
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?)`,
        [requestId, approverId, ROLES.FINANCE_CLERK, REQUEST_STATUS.PENDING_FINANCE_APPROVAL,
         REQUEST_STATUS.APPROVED, comments, ipAddress]
      );

      return {
        success: true,
        message: 'Request approved by Finance — ready for dispatch',
        newStatus: REQUEST_STATUS.APPROVED,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      const approver = await query('SELECT first_name, last_name FROM users WHERE id = ?', [n.approverId]).catch(() => [{}]);
      const approverName = approver[0] ? `${approver[0].first_name} ${approver[0].last_name}` : 'Finance';
      notificationService.onRequestFinanceApproved(requestId, n.requestCode, n.requesterId, approverName).catch(() => {});
    }
    return result;
=======
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
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  }

  /**
   * Reject request at any approval stage
   */
  async rejectRequest(requestId, approverId, approverRole, comments, expectedVersion, ipAddress) {
<<<<<<< HEAD
    comments = comments || null;
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
        REQUEST_STATUS.PENDING_ADMIN_APPROVAL,
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
      // Validate approver role matches required role for current status (ADMIN bypasses)
      if (approverRole !== ROLES.ADMIN) {
        const requiredRole = getRequiredApprovalRole(previousStatus);
        const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        if (!allowedRoles.includes(approverRole)) {
          throw new Error(`Only ${allowedRoles.join(' or ')} can reject requests at this stage`);
        }
=======
      // Validate approver role matches required role for current status
      const requiredRole = getRequiredApprovalRole(previousStatus);
      if (approverRole !== requiredRole) {
        throw new Error(`Only ${requiredRole} can reject requests at this stage`);
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      }

      // Update status to rejected
      await connection.execute(
        `UPDATE requests 
<<<<<<< HEAD
         SET status = ?, updated_at = NOW(), version = version + 1
=======
         SET status = ?, version = version + 1
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
        newStatus: REQUEST_STATUS.REJECTED,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId, reason: comments }
      };
    });
    if (result._notif) {
      const n = result._notif; delete result._notif;
      const approver = await query('SELECT first_name, last_name FROM users WHERE id = ?', [n.approverId]).catch(() => [{}]);
      const approverName = approver[0] ? `${approver[0].first_name} ${approver[0].last_name}` : 'Approver';
      notificationService.onRequestRejected(requestId, n.requestCode, n.requesterId, approverName, n.reason).catch(() => {});
    }
    return result;
=======
        newStatus: REQUEST_STATUS.REJECTED
      };
    });
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  }

  /**
   * Get requests pending approval for a specific role
   */
  async getPendingApprovals(role, userId, departmentId, filters = {}) {
    let statusFilter;
    let departmentFilter = '';
<<<<<<< HEAD
    let useInClause = false;

    switch (role) {
      case ROLES.PROGRAM_LEAD:
        // Lead sees:
        //   - Own-dept requests at PENDING_LEAD/ADMIN stages (with department routing)
        //   - ALL requests at PENDING_FINANCE_APPROVAL (Finance Lead authority)
        statusFilter = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_FINANCE_APPROVAL];
        useInClause = true;
        departmentFilter = `AND (
          r.status = '${REQUEST_STATUS.PENDING_FINANCE_APPROVAL}'
          OR (r.routing_department_id IS NULL AND r.department_id = ?)
          OR r.routing_department_id = ?
          OR EXISTS (
            SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'
          )
        )`;
        break;
      case ROLES.HEAD_OF_PROGRAMS:
        // HOP oversees all departments — sees all pending approvals including Finance stage
        statusFilter = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL, REQUEST_STATUS.PENDING_FINANCE_APPROVAL];
        useInClause = true;
        break;
      case ROLES.FINANCE_CLERK:
        statusFilter = REQUEST_STATUS.PENDING_FINANCE_APPROVAL;
        // Finance sees all requests at Finance stage
        break;
      case ROLES.ADMIN:
        // Admin sees ALL pending requests across all stages and departments
        statusFilter = [
          REQUEST_STATUS.PENDING_ADMIN_APPROVAL,
          REQUEST_STATUS.PENDING_LEAD_APPROVAL,
          REQUEST_STATUS.PENDING_HOP_APPROVAL,
          REQUEST_STATUS.PENDING_FINANCE_APPROVAL
        ];
        useInClause = true;
=======

    switch (role) {
      case ROLES.PROGRAM_LEAD:
        statusFilter = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
        // Program Leads only see their department
        departmentFilter = 'AND r.department_id = ?';
        break;
      case ROLES.HEAD_OF_PROGRAMS:
        statusFilter = REQUEST_STATUS.PENDING_HOP_APPROVAL;
        break;
      case ROLES.FINANCE_CLERK:
        statusFilter = REQUEST_STATUS.PENDING_FINANCE_APPROVAL;
        if (filters.departmentId) {
          departmentFilter = 'AND r.department_id = ?';
        }
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        break;
      default:
        throw new Error('Invalid approver role');
    }

<<<<<<< HEAD
    const params = [];
    let statusCondition;
    
    if (useInClause) {
      const placeholders = statusFilter.map(() => '?').join(', ');
      statusCondition = `r.status IN (${placeholders})`;
      params.push(...statusFilter);
    } else {
      statusCondition = 'r.status = ?';
      params.push(statusFilter);
    }
    
    if (role === ROLES.PROGRAM_LEAD) {
      params.push(departmentId, departmentId);
    }
    if (filters.departmentId && ![ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(role)) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }

    const sql = `
      SELECT DISTINCT
=======
    const params = [statusFilter];
    if (departmentFilter) {
      params.push(filters.departmentId || departmentId);
    }

    const sql = `
      SELECT 
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        r.*,
        u.first_name as requester_first_name,
        u.last_name as requester_last_name,
        u.email as requester_email,
        d.department_name,
<<<<<<< HEAD
        d.department_code,
        rd.department_name as routing_department_name,
        rd.department_code as routing_department_code
      FROM requests r
      JOIN users u ON r.requester_id = u.id
      JOIN departments d ON r.department_id = d.id
      LEFT JOIN departments rd ON r.routing_department_id = rd.id
      WHERE ${statusCondition} ${departmentFilter}
      ORDER BY
        r.submitted_at DESC, r.created_at DESC
=======
        d.department_code
      FROM requests r
      JOIN users u ON r.requester_id = u.id
      JOIN departments d ON r.department_id = d.id
      WHERE r.status = ? ${departmentFilter}
      ORDER BY 
        CASE r.priority 
          WHEN 'URGENT' THEN 1 
          WHEN 'HIGH' THEN 2 
          WHEN 'MEDIUM' THEN 3 
          ELSE 4 
        END,
        r.submitted_at ASC
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
        (bl.allocated_amount - bl.spent_amount) as current_balance,
        SUM(ri.quantity * ri.unit_price) as requested_amount
       FROM request_items ri
       JOIN budget_lines bl ON ri.budget_line_id = bl.id
       WHERE ri.request_id = ?
       GROUP BY ri.budget_line_id, bl.budget_code, bl.budget_name, bl.allocated_amount, bl.spent_amount`,
=======
        bl.balance as current_balance,
        SUM(ri.total_price) as requested_amount
       FROM request_items ri
       JOIN budget_lines bl ON ri.budget_line_id = bl.id
       WHERE ri.request_id = ?
       GROUP BY ri.budget_line_id`,
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
    comments = comments || null;
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
      if (hoursSinceApproval > 12) {
        throw new Error('Approval reversal window has expired (12 hours limit)');
=======
      if (hoursSinceApproval > 5) {
        throw new Error('Approval reversal window has expired (5 hours limit)');
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      }

      // Determine the previous status based on who approved
      let revertToStatus;
      switch (approverRole) {
        case ROLES.PROGRAM_LEAD:
<<<<<<< HEAD
          // Updated: Lead approval now goes to Finance, so revert from Finance stage
          if (request.status !== REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
=======
          if (request.status !== REQUEST_STATUS.PENDING_HOP_APPROVAL) {
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            throw new Error('Cannot reverse - request has already progressed');
          }
          revertToStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
          await connection.execute(
<<<<<<< HEAD
            'UPDATE requests SET lead_approved_at = NULL, updated_at = NOW() WHERE id = ?',
=======
            'UPDATE requests SET lead_approved_at = NULL WHERE id = ?',
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            [requestId]
          );
          break;
        case ROLES.HEAD_OF_PROGRAMS:
<<<<<<< HEAD
          // Updated: HOP approval also goes to Finance, so revert from Finance stage
          if (request.status !== REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
            throw new Error('Cannot reverse - request has already progressed');
          }
          revertToStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
          await connection.execute(
            'UPDATE requests SET hop_approved_at = NULL, updated_at = NOW() WHERE id = ?',
=======
          if (request.status !== REQUEST_STATUS.PENDING_FINANCE_APPROVAL) {
            throw new Error('Cannot reverse - request has already progressed');
          }
          revertToStatus = REQUEST_STATUS.PENDING_HOP_APPROVAL;
          await connection.execute(
            'UPDATE requests SET hop_approved_at = NULL WHERE id = ?',
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
            `SELECT bt.*, bl.donor_id FROM budget_transactions bt
             JOIN budget_lines bl ON bt.budget_line_id = bl.id
             WHERE bt.request_id = ? AND bt.transaction_type = 'DEDUCTION'`,
            [requestId]
          );

          // Track donor reversals
          const donorReversals = new Map();

=======
            `SELECT * FROM budget_transactions 
             WHERE request_id = ? AND transaction_type = 'DEDUCTION'`,
            [requestId]
          );

>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          // Reverse each budget deduction
          for (const trans of transactions) {
            await connection.execute(
              `UPDATE budget_lines 
<<<<<<< HEAD
               SET spent_amount = spent_amount - ?, updated_at = NOW()
=======
               SET spent_amount = spent_amount - ?
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
               WHERE id = ?`,
              [trans.amount, trans.budget_line_id]
            );

<<<<<<< HEAD
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
=======
            // Log the reversal
            const [bl] = await connection.execute(
              'SELECT balance FROM budget_lines WHERE id = ?',
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              [trans.budget_line_id]
            );

            await connection.execute(
              `INSERT INTO budget_transactions 
               (budget_line_id, request_id, transaction_type, amount, 
                balance_before, balance_after, description, performed_by)
               VALUES (?, ?, 'REVERSAL', ?, ?, ?, ?, ?)`,
              [trans.budget_line_id, requestId, trans.amount,
               bl[0].balance - trans.amount, bl[0].balance,
<<<<<<< HEAD
               `Budget reversal for request #${request.request_code} - approval withdrawn`,
=======
               `Budget reversal for request #${request.request_number} - approval withdrawn`,
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
               approverId]
            );
          }

<<<<<<< HEAD
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
=======
          revertToStatus = REQUEST_STATUS.PENDING_FINANCE_APPROVAL;
          await connection.execute(
            'UPDATE requests SET finance_approved_at = NULL, completed_at = NULL WHERE id = ?',
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            [requestId]
          );
          break;
        default:
          throw new Error('Invalid approver role for reversal');
      }

      // Update request status
      await connection.execute(
        `UPDATE requests 
<<<<<<< HEAD
         SET status = ?, updated_at = NOW(), version = version + 1
=======
         SET status = ?, version = version + 1
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
        hoursRemaining: Math.max(0, 12 - hoursSinceApproval).toFixed(2)
=======
        hoursRemaining: Math.max(0, 5 - hoursSinceApproval).toFixed(2)
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
    if (hoursSinceApproval > 12) {
=======
    if (hoursSinceApproval > 5) {
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      return { 
        canReverse: false, 
        reason: 'Reversal window expired',
        hoursAgo: hoursSinceApproval.toFixed(2)
      };
    }

    return {
      canReverse: true,
<<<<<<< HEAD
      hoursRemaining: (12 - hoursSinceApproval).toFixed(2),
=======
      hoursRemaining: (5 - hoursSinceApproval).toFixed(2),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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

<<<<<<< HEAD
    // Program Lead sees history only for their own department; HOP sees all.
=======
    // Program Leads only see their department's requests
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    if (role === ROLES.PROGRAM_LEAD) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    } else if (filters.departmentId) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }
<<<<<<< HEAD
    // Finance/Admin can view cross-department history.
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

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

<<<<<<< HEAD
    // Program Lead sees approved requests from their own department; HOP and Finance see all.
=======
    // Program Leads only see their department's requests
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    if (role === ROLES.PROGRAM_LEAD) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    } else if (filters.departmentId) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }
<<<<<<< HEAD
    // Finance/Admin can view cross-department approved requests.

    const sql = `
      SELECT DISTINCT
=======

    const sql = `
      SELECT
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        r.*,
        u.first_name as requester_first_name,
        u.last_name as requester_last_name,
        u.email as requester_email,
        d.department_name,
        d.department_code
      FROM requests r
      JOIN users u ON r.requester_id = u.id
      JOIN departments d ON r.department_id = d.id
<<<<<<< HEAD
      WHERE r.status IN (
        'PENDING_FINANCE_APPROVAL',
        'APPROVED', 'DISPATCHED',
        'PENDING_RECONCILIATION',
        'RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE', 'RECONCILED'
      ) ${departmentFilter}
      ORDER BY r.updated_at DESC, r.created_at DESC
=======
      WHERE r.status IN ('APPROVED', 'DISPATCHED') ${departmentFilter}
      ORDER BY r.finance_approved_at DESC, r.created_at DESC
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    `;

    return await query(sql, params);
  }

  /**
   * Get all rejected requests for approvers to see
   */
  async getRejectedRequests(role, departmentId, filters = {}) {
    let departmentFilter = '';
    const params = [];

<<<<<<< HEAD
    // Program Lead and HOP see rejected requests from their department.
    if ([ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(role)) {
=======
    // Program Leads only see their department's requests
    if (role === ROLES.PROGRAM_LEAD) {
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    } else if (filters.departmentId) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }
<<<<<<< HEAD
    // Finance/Admin can view cross-department rejected requests.

    const sql = `
      SELECT DISTINCT
=======

    const sql = `
      SELECT
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
<<<<<<< HEAD
    let useInClause = false;

    switch (role) {
      case ROLES.PROGRAM_LEAD:
        // Lead sees own-dept requests + Finance stage requests (Finance Lead authority)
        pendingStatus = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_FINANCE_APPROVAL];
        useInClause = true;
        departmentFilter = `AND (r.status = '${REQUEST_STATUS.PENDING_FINANCE_APPROVAL}' OR r.department_id = ? OR r.routing_department_id = ? OR EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'))`;
        baseParams.push(departmentId, departmentId);
        break;
      case ROLES.HEAD_OF_PROGRAMS:
        // HOP oversees all departments — sees all pending approvals including Finance stage
        pendingStatus = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL, REQUEST_STATUS.PENDING_FINANCE_APPROVAL];
        useInClause = true;
        break;
      case ROLES.FINANCE_CLERK:
        pendingStatus = REQUEST_STATUS.PENDING_FINANCE_APPROVAL;
        // Finance sees all requests
        break;
      case ROLES.ADMIN:
        // Admin sees ALL pending requests across all stages
        pendingStatus = [
          REQUEST_STATUS.PENDING_ADMIN_APPROVAL,
          REQUEST_STATUS.PENDING_LEAD_APPROVAL,
          REQUEST_STATUS.PENDING_HOP_APPROVAL,
          REQUEST_STATUS.PENDING_FINANCE_APPROVAL
        ];
        useInClause = true;
=======

    switch (role) {
      case ROLES.PROGRAM_LEAD:
        pendingStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
        departmentFilter = 'AND r.department_id = ?';
        baseParams.push(departmentId);
        break;
      case ROLES.HEAD_OF_PROGRAMS:
        pendingStatus = REQUEST_STATUS.PENDING_HOP_APPROVAL;
        break;
      case ROLES.FINANCE_CLERK:
        pendingStatus = REQUEST_STATUS.PENDING_FINANCE_APPROVAL;
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        break;
      default:
        throw new Error('Invalid approver role');
    }

    // Get pending count
<<<<<<< HEAD
    let pendingParams;
    let pendingCondition;
    if (useInClause) {
      const placeholders = pendingStatus.map(() => '?').join(', ');
      pendingCondition = `r.status IN (${placeholders})`;
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
=======
    const pendingParams = [pendingStatus, ...baseParams];
    const pendingResult = await query(
      `SELECT COUNT(*) as count FROM requests r WHERE r.status = ? ${departmentFilter}`,
      pendingParams
    );

    // Get approved count (all approved requests they can see)
    const approvedParams = [...baseParams];
    const approvedResult = await query(
      `SELECT COUNT(*) as count FROM requests r WHERE r.status IN ('APPROVED', 'DISPATCHED') ${departmentFilter}`,
      approvedParams.length > 0 ? approvedParams : undefined
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    );

    // Get rejected count
    const rejectedResult = await query(
<<<<<<< HEAD
      `SELECT COUNT(DISTINCT r.id) as count FROM requests r WHERE r.status = 'REJECTED' ${departmentFilter}`,
      approvedParams
=======
      `SELECT COUNT(*) as count FROM requests r WHERE r.status = 'REJECTED' ${departmentFilter}`,
      approvedParams.length > 0 ? approvedParams : undefined
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    );

    // Get total requests they can see
    const totalResult = await query(
<<<<<<< HEAD
      `SELECT COUNT(DISTINCT r.id) as count FROM requests r WHERE r.status != 'DRAFT' ${departmentFilter}`,
      approvedParams
=======
      `SELECT COUNT(*) as count FROM requests r WHERE r.status != 'DRAFT' ${departmentFilter}`,
      approvedParams.length > 0 ? approvedParams : undefined
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
