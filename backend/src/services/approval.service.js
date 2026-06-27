/**
 * Approval Service
 * Handles the 4-tier approval workflow with race condition prevention
 * 
 * Workflow: General User -> Program Lead -> HOP -> Finance Clerk
 * Budget deduction only occurs at final Finance Clerk approval
 */

const { query, transaction, pool } = require('../config/database');
const notificationService = require('./notification.service');
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

      // Verify status (rejected requests can be resubmitted after edits).
      const submitAllowedStatuses = [REQUEST_STATUS.DRAFT, REQUEST_STATUS.REJECTED];
      if (!submitAllowedStatuses.includes(request.status)) {
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
  }

  /**
   * Program Lead Approval (First Level)
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
         FROM requests r
         JOIN users u ON u.id = ?
         WHERE r.id = ? FOR UPDATE`,
        [approverId, requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      // HOP can approve at PENDING_ADMIN_APPROVAL, PENDING_LEAD_APPROVAL or PENDING_HOP_APPROVAL
      const validStatuses = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
      if (!validStatuses.includes(request.status)) {
        throw new Error(`Cannot approve request with status: ${request.status}`);
      }

      // Optimistic locking
      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified. Please refresh and try again.');
      }

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
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );
      if (requests.length === 0) throw new Error('Request not found');

      const request = requests[0];

      if (request.version !== expectedVersion) {
        throw new Error('Request has been modified. Please refresh and try again.');
      }

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
             version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.APPROVED, requestId]
      );

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
        REQUEST_STATUS.PENDING_ADMIN_APPROVAL,
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

      // Validate approver role matches required role for current status (ADMIN bypasses)
      if (approverRole !== ROLES.ADMIN) {
        const requiredRole = getRequiredApprovalRole(previousStatus);
        const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        if (!allowedRoles.includes(approverRole)) {
          throw new Error(`Only ${allowedRoles.join(' or ')} can reject requests at this stage`);
        }
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
        break;
      default:
        throw new Error('Invalid approver role');
    }

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
        r.*,
        u.first_name as requester_first_name,
        u.last_name as requester_last_name,
        u.email as requester_email,
        d.department_name,
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

      if (hoursSinceApproval > 12) {
        throw new Error('Approval reversal window has expired (12 hours limit)');
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
        hoursRemaining: Math.max(0, 12 - hoursSinceApproval).toFixed(2)
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

    if (hoursSinceApproval > 12) {
      return { 
        canReverse: false, 
        reason: 'Reversal window expired',
        hoursAgo: hoursSinceApproval.toFixed(2)
      };
    }

    return {
      canReverse: true,
      hoursRemaining: (12 - hoursSinceApproval).toFixed(2),
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

    // Program Lead sees history only for their own department; HOP sees all.
    if (role === ROLES.PROGRAM_LEAD) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    } else if (filters.departmentId) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }
    // Finance/Admin can view cross-department history.

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

    // Program Lead sees approved requests from their own department; HOP and Finance see all.
    if (role === ROLES.PROGRAM_LEAD) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    } else if (filters.departmentId) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }
    // Finance/Admin can view cross-department approved requests.

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
      WHERE r.status IN (
        'PENDING_FINANCE_APPROVAL',
        'APPROVED', 'DISPATCHED',
        'PENDING_RECONCILIATION',
        'RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE', 'RECONCILED'
      ) ${departmentFilter}
      ORDER BY r.updated_at DESC, r.created_at DESC
    `;

    return await query(sql, params);
  }

  /**
   * Get all rejected requests for approvers to see
   */
  async getRejectedRequests(role, departmentId, filters = {}) {
    let departmentFilter = '';
    const params = [];

    // Program Lead and HOP see rejected requests from their department.
    if ([ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(role)) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(departmentId);
    } else if (filters.departmentId) {
      departmentFilter = 'AND r.department_id = ?';
      params.push(filters.departmentId);
    }
    // Finance/Admin can view cross-department rejected requests.

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
        break;
      default:
        throw new Error('Invalid approver role');
    }

    // Get pending count
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
