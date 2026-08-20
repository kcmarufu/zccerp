/**
 * Approval Service
 * Handles the 4-tier approval workflow with race condition prevention
 * 
 * Workflow: General User -> Program Lead -> HOP -> Finance Clerk
 * Budget deduction only occurs at final Finance Clerk approval
 */

const { query, transaction, pool } = require('../config/database');
const notificationService = require('./notification.service');
const reconciliationService = require('./reconciliation.service');
const {
  REQUEST_STATUS,
  ROLES,
  getNextApprovalStatus,
  getRequiredApprovalRole,
  isValidTransition
} = require('../config/roles');

const { OVERDUE_RECON_LIMIT } = reconciliationService;

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

      // ── Overdue reconciliation gate ──────────────────────────────────────
      // A user with 2+ overdue unsubmitted reconciliations may not put a new
      // request into the approval pipeline. This has to be enforced server-side:
      // the UI only disables the submit button on the create screen, so saving a
      // draft and submitting it later bypassed the rule completely.
      //
      // Resubmissions are deliberately exempt — a rejected request predates the
      // block, and refusing to let the user act on reviewer feedback would leave
      // it permanently stuck.
      if (!isResubmission) {
        const overdueCount = await reconciliationService.getOverdueCount(
          request.requester_id, connection
        );
        if (overdueCount >= OVERDUE_RECON_LIMIT) {
          throw new Error(
            `You have ${overdueCount} overdue reconciliations that have not been submitted ` +
            `for approval. Submit them before raising a new request.`
          );
        }
      }

      // For resubmissions, route back to the level that last rejected the request
      // so the user doesn't have to go through already-approved levels again.
      let targetStatus = REQUEST_STATUS.PENDING_LEAD_APPROVAL;
      if (isResubmission) {
        // Reconciliation rejections also log action='REJECTED', but they send the
        // request back to DISPATCHED to be reconciled again — they are not approval
        // -pipeline rejections and must not decide where an approval resumes.
        const [rejectionLogs] = await connection.execute(
          `SELECT previous_status FROM approval_logs
           WHERE request_id = ? AND action = 'REJECTED'
             AND previous_status NOT IN (?, ?)
           ORDER BY created_at DESC, id DESC LIMIT 1`,
          [requestId, REQUEST_STATUS.RECON_PENDING_LEAD, REQUEST_STATUS.RECON_PENDING_FINANCE]
        );

        if (rejectionLogs.length > 0) {
          const rejectedFromStatus = rejectionLogs[0].previous_status;
          // Resume at the desk that rejected it, so already-completed levels are not
          // re-run. A request Finance force-rejected after approval (previous_status
          // APPROVED/DISPATCHED) belongs back on the Finance desk — its budget
          // deduction was reversed by the force-reject, so Finance re-approving it
          // deducts once, correctly.
          const resumeAt = {
            [REQUEST_STATUS.PENDING_FINANCE_APPROVAL]: REQUEST_STATUS.PENDING_FINANCE_APPROVAL,
            [REQUEST_STATUS.PENDING_HOP_APPROVAL]: REQUEST_STATUS.PENDING_HOP_APPROVAL,
            [REQUEST_STATUS.PENDING_ADMIN_APPROVAL]: REQUEST_STATUS.PENDING_ADMIN_APPROVAL,
            [REQUEST_STATUS.PENDING_LEAD_APPROVAL]: REQUEST_STATUS.PENDING_LEAD_APPROVAL,
            [REQUEST_STATUS.APPROVED]: REQUEST_STATUS.PENDING_FINANCE_APPROVAL,
            [REQUEST_STATUS.DISPATCHED]: REQUEST_STATUS.PENDING_FINANCE_APPROVAL
          };
          // Unrecognised origin — fall back to starting at Lead level.
          targetStatus = resumeAt[rejectedFromStatus] || REQUEST_STATUS.PENDING_LEAD_APPROVAL;
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
      // For Admin-donor requests from non-AHR departments, route to AHR so only
      // the Admin/HR Lead or HOP handles them (not the requester's own dept Lead).
      let routingDepartmentId = null;
      const isAdminDonorSubmit = (targetStatus === REQUEST_STATUS.PENDING_ADMIN_APPROVAL);
      if (isAdminDonorSubmit) {
        // Look up AHR department and route there if requester is not already AHR.
        const [ahrDeptRows] = await connection.execute(
          "SELECT id FROM departments WHERE department_code = 'AHR' LIMIT 1"
        );
        const ahrDeptId = ahrDeptRows[0]?.id;
        if (ahrDeptId && Number(request.requester_dept) !== Number(ahrDeptId)) {
          routingDepartmentId = ahrDeptId;
        }
      } else if (request.project_id) {
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
                don.donor_type as donor_type,
                dept.department_code as approver_dept_code
         FROM requests r
         JOIN users u ON u.id = ?
         JOIN departments dept ON dept.id = u.department_id
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

      // Department check:
      // - PENDING_ADMIN_APPROVAL (Admin-donor requests): only AHR Lead can approve, not Finance Lead
      // - Other requests: Lead must match the effective department
      const isAdminDonorRequest = request.donor_type === 'ADMIN';
      const effectiveDeptId = Number(request.routing_department_id || request.department_id);
      if (isAdminDonorRequest && request.status === REQUEST_STATUS.PENDING_ADMIN_APPROVAL) {
        if (request.approver_dept_code !== 'AHR') {
          throw new Error('Only the Admin/HR Department Lead can approve Admin department requests');
        }
      } else if (!isAdminDonorRequest && effectiveDeptId !== Number(request.approver_dept)) {
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
        message: 'Request approved by Department Lead - sent to Finance for final approval',
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
                u.first_name as approver_first, u.last_name as approver_last,
                dept.department_code as approver_dept_code
         FROM requests r
         JOIN users u ON u.id = ?
         JOIN departments dept ON dept.id = u.department_id
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

      // Department check:
      // - PENDING_ADMIN_APPROVAL: only AHR HOP can approve (blocks Finance HOP from approving FOS requests at admin stage)
      // - Other stages: HOP must be in the request's effective department
      if (request.status === REQUEST_STATUS.PENDING_ADMIN_APPROVAL) {
        if (request.approver_dept_code !== 'AHR') {
          throw new Error('Only the Admin/HR Head of Department can approve Admin department requests');
        }
      } else {
        const effectiveDeptId = Number(request.routing_department_id || request.department_id);
        if (effectiveDeptId !== Number(request.approver_dept)) {
          throw new Error('You can only approve departmental-stage requests from your own department');
        }
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
        message: 'Request approved by Head of Department - sent to Finance for final approval',
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
  async approveAsFinance(requestId, approverId, comments, expectedVersion, ipAddress, approverRole) {
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
        [requestId, approverId, approverRole || ROLES.FINANCE_CLERK, REQUEST_STATUS.PENDING_FINANCE_APPROVAL,
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
    const deptCode = filters.departmentCode || '';

    switch (role) {
      case ROLES.PROGRAM_LEAD:
        useInClause = true;
        if (filters.isFinanceManager) {
          // Finance Lead (FOS): ALL pending stages visible (PENDING_LEAD_APPROVAL from any dept + Finance stage).
          // PENDING_ADMIN_APPROVAL is AHR's domain — Finance Lead must not see or action those.
          // Approval restriction enforced in approveAsLead (FOS dept only at dept level).
          statusFilter = [REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_FINANCE_APPROVAL];
          departmentFilter = '';
        } else if (deptCode === 'AHR') {
          // Admin/HR Lead: own dept + ALL Admin-type donor requests (any pending status)
          statusFilter = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL];
          departmentFilter = `AND (
            (r.routing_department_id IS NULL AND r.department_id = ?)
            OR r.routing_department_id = ?
            OR EXISTS (
              SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'
            )
          )`;
        } else {
          // CPJS/HSD Lead: own dept requests only
          statusFilter = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL];
          departmentFilter = `AND (
            (r.routing_department_id IS NULL AND r.department_id = ?)
            OR r.routing_department_id = ?
          )`;
        }
        break;

      case ROLES.HEAD_OF_PROGRAMS:
        useInClause = true;
        if (filters.isFinanceManager) {
          // Finance HOP (FOS): all pending stages except PENDING_ADMIN_APPROVAL (AHR's domain)
          statusFilter = [REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL, REQUEST_STATUS.PENDING_FINANCE_APPROVAL];
          departmentFilter = '';
        } else if (deptCode === 'AHR') {
          // Admin/HR HOP: own dept + ALL Admin-type donor requests (any pending status)
          statusFilter = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
          departmentFilter = `AND (
            (r.routing_department_id IS NULL AND r.department_id = ?)
            OR r.routing_department_id = ?
            OR EXISTS (
              SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'
            )
          )`;
        } else {
          // CPJS/HSD HOP: own dept only, no Finance stage
          statusFilter = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
          departmentFilter = `AND (
            (r.routing_department_id IS NULL AND r.department_id = ?)
            OR r.routing_department_id = ?
          )`;
        }
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
    
    // Push dept params for roles that have a dept filter with ? placeholders
    if ([ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(role) && departmentFilter.includes('?')) {
      // Count placeholders needed — currently all filters above use exactly 2 dept ? params
      // except the AHR filter which has 2 dept ? params (the EXISTS subquery has its own closure)
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
      LEFT JOIN departments d ON r.department_id = d.id
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
        u.job_title as actor_job_title,
        CONCAT(u.first_name, ' ', u.last_name) as actor_name,
        al.approver_role as actor_role,
        al.comments as comment,
        d.department_code as actor_department_code
       FROM approval_logs al
       JOIN users u ON al.approver_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
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
   * Finance force-reject: allows Finance Clerk / Finance HOP/LEAD / Admin to
   * reject a request that is in APPROVED or DISPATCHED status, even after the
   * 12-hour reversal window has passed.  The budget deductions are reversed and
   * the request is moved to REJECTED status.
   */
  async financeForceReject(requestId, approverId, approverRole, comments, ipAddress) {
    comments = comments || null;
    const result = await transaction(async (connection) => {
      const [requests] = await connection.execute(
        'SELECT * FROM requests WHERE id = ? FOR UPDATE',
        [requestId]
      );

      if (requests.length === 0) {
        throw new Error('Request not found');
      }

      const request = requests[0];

      if (![REQUEST_STATUS.APPROVED, 'DISPATCHED'].includes(request.status)) {
        throw new Error(`Cannot force-reject a request with status: ${request.status}. Only APPROVED or DISPATCHED requests can be force-rejected.`);
      }

      // Reverse every budget deduction tied to this request
      const [transactions] = await connection.execute(
        `SELECT bt.*, bl.donor_id FROM budget_transactions bt
         JOIN budget_lines bl ON bt.budget_line_id = bl.id
         WHERE bt.request_id = ? AND bt.transaction_type = 'DEDUCTION'`,
        [requestId]
      );

      const donorReversals = new Map();

      for (const trans of transactions) {
        await connection.execute(
          `UPDATE budget_lines SET spent_amount = spent_amount - ?, updated_at = NOW() WHERE id = ?`,
          [trans.amount, trans.budget_line_id]
        );

        if (trans.donor_id) {
          if (!donorReversals.has(trans.donor_id)) donorReversals.set(trans.donor_id, 0);
          donorReversals.set(trans.donor_id, donorReversals.get(trans.donor_id) + parseFloat(trans.amount));
        }

        const [bl] = await connection.execute(
          'SELECT (allocated_amount - spent_amount) as balance FROM budget_lines WHERE id = ?',
          [trans.budget_line_id]
        );

        await connection.execute(
          `INSERT INTO budget_transactions
           (budget_line_id, request_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
           VALUES (?, ?, 'REVERSAL', ?, ?, ?, ?, ?)`,
          [
            trans.budget_line_id, requestId, trans.amount,
            bl[0].balance - trans.amount, bl[0].balance,
            `Budget reversal for request #${request.request_code} — Finance force-rejected`,
            approverId
          ]
        );
      }

      for (const [donorId, reversalAmount] of donorReversals) {
        await connection.execute(
          `UPDATE donors SET total_spent = total_spent - ?, updated_at = NOW() WHERE id = ?`,
          [reversalAmount, donorId]
        );
      }

      // Clear finance approval timestamps and move to REJECTED
      await connection.execute(
        `UPDATE requests
         SET status = ?, finance_approved_at = NULL, completed_at = NULL, dispatched_at = NULL,
             updated_at = NOW(), version = version + 1
         WHERE id = ?`,
        [REQUEST_STATUS.REJECTED, requestId]
      );

      await connection.execute(
        `INSERT INTO approval_logs
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
         VALUES (?, ?, ?, 'REJECTED', ?, ?, ?, ?)`,
        [requestId, approverId, approverRole, request.status, REQUEST_STATUS.REJECTED, comments, ipAddress]
      );

      return {
        success: true,
        message: 'Request has been rejected and budget reversed.',
        newStatus: REQUEST_STATUS.REJECTED,
        _notif: { requestCode: request.request_code, requesterId: request.requester_id, approverId, reason: comments }
      };
    });

    if (result._notif) {
      const n = result._notif; delete result._notif;
      const approver = await query('SELECT first_name, last_name FROM users WHERE id = ?', [n.approverId]).catch(() => [{}]);
      const approverName = approver[0] ? `${approver[0].first_name} ${approver[0].last_name}` : 'Finance';
      notificationService.onRequestRejected(requestId, n.requestCode, n.requesterId, approverName, n.reason).catch(() => {});
    }
    return result;
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

    // Finance HOP/Lead sees all history; non-Finance HOP and Leads see own dept only.
    // AHR Lead/HOP: no extra dept filter — they approve Admin-donor requests from any
    // department, so scoping by approver_id alone is the correct boundary.
    if (role === ROLES.PROGRAM_LEAD && !filters.isFinanceManager) {
      if (filters.departmentCode !== 'AHR') {
        departmentFilter = 'AND (r.department_id = ? OR r.routing_department_id = ?)';
        params.push(departmentId, departmentId);
      }
    } else if (role === ROLES.HEAD_OF_PROGRAMS && !filters.isFinanceManager) {
      if (filters.departmentCode !== 'AHR') {
        departmentFilter = 'AND (r.department_id = ? OR r.routing_department_id = ?)';
        params.push(departmentId, departmentId);
      }
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
      LEFT JOIN departments d ON r.department_id = d.id
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

    // Finance HOP/Lead and Admin see all; non-Finance HOP and Leads see own dept.
    // AHR Lead/HOP: also include Admin-type donor requests (ADMININT) from any dept —
    // those requests have routing_department_id = NULL after Admin-stage approval so
    // the plain dept check would miss them once they advance past PENDING_ADMIN_APPROVAL.
    if (role === ROLES.PROGRAM_LEAD && !filters.isFinanceManager) {
      if (filters.departmentCode === 'AHR') {
        departmentFilter = `AND (r.department_id = ? OR r.routing_department_id = ? OR EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'))`;
      } else {
        departmentFilter = 'AND (r.department_id = ? OR r.routing_department_id = ?)';
      }
      params.push(departmentId, departmentId);
    } else if (role === ROLES.HEAD_OF_PROGRAMS && !filters.isFinanceManager) {
      if (filters.departmentCode === 'AHR') {
        departmentFilter = `AND (r.department_id = ? OR r.routing_department_id = ? OR EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'))`;
      } else {
        departmentFilter = 'AND (r.department_id = ? OR r.routing_department_id = ?)';
      }
      params.push(departmentId, departmentId);
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
      LEFT JOIN departments d ON r.department_id = d.id
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

    // Finance HOP/Lead and Admin see all rejected; CPJS/HSD see own dept only.
    // AHR Lead/HOP: also include Admin-type donor (ADMININT) rejected requests.
    if (role === ROLES.PROGRAM_LEAD && !filters.isFinanceManager) {
      if (filters.departmentCode === 'AHR') {
        departmentFilter = `AND (r.department_id = ? OR r.routing_department_id = ? OR EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'))`;
      } else {
        departmentFilter = 'AND (r.department_id = ? OR r.routing_department_id = ?)';
      }
      params.push(departmentId, departmentId);
    } else if (role === ROLES.HEAD_OF_PROGRAMS && !filters.isFinanceManager) {
      if (filters.departmentCode === 'AHR') {
        departmentFilter = `AND (r.department_id = ? OR r.routing_department_id = ? OR EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'))`;
      } else {
        departmentFilter = 'AND (r.department_id = ? OR r.routing_department_id = ?)';
      }
      params.push(departmentId, departmentId);
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
      LEFT JOIN departments d ON r.department_id = d.id
      WHERE r.status = 'REJECTED' ${departmentFilter}
      ORDER BY r.updated_at DESC
    `;

    return await query(sql, params);
  }

  /**
   * Get dashboard statistics for an approver
   */
  async getApproverStats(role, userId, departmentId, isFinanceManager = false, departmentCode = '') {
    let pendingStatus;
    let departmentFilter = '';
    const baseParams = [];
    let useInClause = false;

    switch (role) {
      case ROLES.PROGRAM_LEAD:
        useInClause = true;
        if (isFinanceManager) {
          // Finance Lead (FOS): ALL pending stages except PENDING_ADMIN_APPROVAL (AHR domain).
          // Finance Lead can view all dept-level requests; approval restriction is enforced separately.
          pendingStatus = [REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_FINANCE_APPROVAL];
          departmentFilter = '';
          // No dept params needed — baseParams push is skipped below for Finance Lead
        } else if (departmentCode === 'AHR') {
          // Admin/HR Lead: own dept + ALL Admin donor requests (any pending status)
          pendingStatus = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL];
          departmentFilter = `AND ((r.routing_department_id IS NULL AND r.department_id = ?) OR r.routing_department_id = ? OR EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'))`;
          baseParams.push(departmentId, departmentId);
        } else {
          // CPJS/HSD Lead: own dept only (routing_department_id must be NULL for dept match)
          pendingStatus = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL];
          departmentFilter = `AND ((r.routing_department_id IS NULL AND r.department_id = ?) OR r.routing_department_id = ?)`;
          baseParams.push(departmentId, departmentId);
        }
        // NOTE: Finance Lead case does not push dept params (no dept filter).
        break;

      case ROLES.HEAD_OF_PROGRAMS:
        useInClause = true;
        if (isFinanceManager) {
          // Finance HOP: all pending except PENDING_ADMIN_APPROVAL (AHR domain), no dept filter
          pendingStatus = [REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL, REQUEST_STATUS.PENDING_FINANCE_APPROVAL];
          departmentFilter = '';
        } else if (departmentCode === 'AHR') {
          // Admin/HR HOP: own dept + ALL Admin donor requests (any pending status)
          pendingStatus = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
          departmentFilter = `AND ((r.routing_department_id IS NULL AND r.department_id = ?) OR r.routing_department_id = ? OR EXISTS (SELECT 1 FROM donors don WHERE don.id = r.donor_id AND don.donor_type = 'ADMIN'))`;
          baseParams.push(departmentId, departmentId);
        } else {
          // CPJS/HSD HOP: own dept only (routing_department_id must be NULL for dept match)
          pendingStatus = [REQUEST_STATUS.PENDING_ADMIN_APPROVAL, REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
          departmentFilter = `AND ((r.routing_department_id IS NULL AND r.department_id = ?) OR r.routing_department_id = ?)`;
          baseParams.push(departmentId, departmentId);
        }
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
      `SELECT COUNT(DISTINCT r.id) as count FROM requests r WHERE r.status IN ('APPROVED', 'DISPATCHED', 'RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE', 'RECONCILED') ${departmentFilter}`,
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
