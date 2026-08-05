/**
 * Procurement Service
 * Business logic for the full procurement lifecycle:
 * Draft → Dept Approval (HOP/Lead) → Procurement (upload quotations) → Committee (3 seats) → Final Finance → Completed
 */

const { query, transaction } = require('../config/database');
const { ROLES, isAdminHrManager } = require('../config/roles');
const notificationService = require('./notification.service');

const PROC_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_DEPT_APPROVAL: 'PENDING_DEPT_APPROVAL',
  PENDING_FINANCE_APPROVAL: 'PENDING_FINANCE_APPROVAL',
  PENDING_PROCUREMENT: 'PENDING_PROCUREMENT',
  PENDING_COMMITTEE: 'PENDING_COMMITTEE',
  PENDING_HIGH_VALUE_APPROVAL: 'PENDING_HIGH_VALUE_APPROVAL',
  PENDING_FINAL_FINANCE: 'PENDING_FINAL_FINANCE',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
};

// ── High-value procurement rule ──────────────────────────────────────────────
// When the SELECTED quotation is at or above this USD amount, the Procurement
// Committee does not decide the request — it recommends it. The request then
// needs two further approvals, granted independently and in either order:
//
//   SUPER_ADMIN  — any ADMIN account
//   DEPARTMENT   — the Lead OR Head of Programs of the department that owns the
//                  selected project (routing_department_id); either one suffices
//
// Only when BOTH have approved does it move to Finance. A rejection by either
// sends it back to be amended; on resubmission it returns to this same stage.
//
// Everything below the threshold keeps the ordinary "any 3 committee members"
// flow, decided by the committee alone.
const HIGH_VALUE_THRESHOLD_USD = 5000;

// Approving committee votes required to recommend a request onward. Applies to
// both the ordinary flow and the high-value recommendation stage.
const COMMITTEE_APPROVALS_REQUIRED = 3;

const HV_SEAT = { SUPER_ADMIN: 'SUPER_ADMIN', DEPARTMENT: 'DEPARTMENT' };

class ProcurementService {

  /**
   * Returns the selected quotation's value and whether it crosses the
   * high-value threshold. Only USD quotations are evaluated; anything else
   * falls back to the normal committee flow.
   */
  async isHighValueRequest(requestId) {
    const rows = await query(
      `SELECT total_amount, currency FROM proc_quotations
        WHERE request_id = ? AND is_selected = TRUE LIMIT 1`,
      [requestId]
    );
    if (!rows.length) return { isHighValue: false, amount: 0, currency: null };
    const amount = parseFloat(rows[0].total_amount) || 0;
    const currency = rows[0].currency || 'USD';
    return {
      isHighValue: currency === 'USD' && amount >= HIGH_VALUE_THRESHOLD_USD,
      amount,
      currency
    };
  }

  // ============================================================
  // PURCHASE REQUESTS
  // ============================================================

  /**
   * Resolve the department that owns the selected project. This — not the
   * requester's department — decides which Lead/HOD gives the first approval.
   *
   * Falls back to the department on the request's budget lines for older
   * projects that were created before projects.department_id existed, and
   * finally to the requester's own department so a request is never left
   * without an approver.
   */
  async _resolveOwningDepartmentId(conn, projectId, requestId, fallbackDepartmentId) {
    const run = conn ? (sql, p) => conn.execute(sql, p).then(r => r[0]) : query;

    const projRows = await run(
      'SELECT department_id FROM projects WHERE id = ?',
      [projectId]
    );
    if (projRows.length && projRows[0].department_id) {
      return projRows[0].department_id;
    }

    if (requestId) {
      const blRows = await run(
        `SELECT bl.department_id
         FROM proc_request_items pri
         JOIN budget_lines bl ON bl.id = pri.budget_line_id
         WHERE pri.request_id = ? AND bl.department_id IS NOT NULL
         LIMIT 1`,
        [requestId]
      );
      if (blRows.length && blRows[0].department_id) {
        return blRows[0].department_id;
      }
    }

    return fallbackDepartmentId || null;
  }

  /**
   * Donor and Project are mandatory on a purchase request — the project is what
   * determines the approval route, so a request cannot exist without one.
   */
  async _validateDonorAndProject(conn, donorId, projectId) {
    const run = conn ? (sql, p) => conn.execute(sql, p).then(r => r[0]) : query;

    if (!donorId) throw new Error('Donor is required');
    if (!projectId) throw new Error('Project is required');

    const projRows = await run(
      'SELECT id, donor_id FROM projects WHERE id = ?',
      [projectId]
    );
    if (!projRows.length) throw new Error('Selected project does not exist');
    if (Number(projRows[0].donor_id) !== Number(donorId)) {
      throw new Error('Selected project does not belong to the selected donor');
    }
  }

  async createPurchaseRequest(data, user) {
    return transaction(async (conn) => {
      await this._validateDonorAndProject(conn, data.donor_id, data.project_id);

      const year = new Date().getFullYear();
      const [seq] = await conn.execute(
        'SELECT COUNT(*) + 1 AS seq FROM proc_requests WHERE YEAR(created_at) = ?',
        [year]
      );
      const requestCode = `PR-${year}-${String(seq[0].seq).padStart(5, '0')}`;

      const totalEstimated = (data.items || []).reduce((sum, item) => {
        return sum + ((item.quantity || 1) * (item.estimated_unit_price || 0));
      }, 0);

      // Approval routing is always driven by the department that owns the selected
      // project, regardless of which department the requester belongs to.
      const routingDepartmentId = await this._resolveOwningDepartmentId(
        conn, data.project_id, null, user.department_id
      );

      const [result] = await conn.execute(
        `INSERT INTO proc_requests 
          (request_code, requester_id, department_id, donor_id, project_id, title, justification, 
           expected_delivery_date, priority, total_estimated_amount, routing_department_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NOW(), NOW())`,
        [
          requestCode,
          user.id,
          user.department_id,
          data.donor_id || null,
          data.project_id || null,
          data.title,
          data.justification,
          data.expected_delivery_date || null,
          data.priority || 'MEDIUM',
          totalEstimated,
          routingDepartmentId
        ]
      );

      const requestId = result.insertId;

      // Insert items
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          await conn.execute(
            `INSERT INTO proc_request_items 
              (request_id, budget_line_id, item_description, specifications, quantity, 
               unit_of_measure, estimated_unit_price, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              requestId,
              item.budget_line_id || null,
              item.item_description,
              item.specifications || null,
              item.quantity || 1,
              item.unit_of_measure || 'unit',
              item.estimated_unit_price || 0,
              item.notes || null
            ]
          );
        }
      }

      // Projects created before projects.department_id existed resolve their owner
      // from the budget lines, which are only known once the items are inserted.
      const resolvedRoutingId = await this._resolveOwningDepartmentId(
        conn, data.project_id, requestId, user.department_id
      );
      if (Number(resolvedRoutingId) !== Number(routingDepartmentId)) {
        await conn.execute(
          'UPDATE proc_requests SET routing_department_id = ? WHERE id = ?',
          [resolvedRoutingId, requestId]
        );
      }

      // Log creation
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'SUBMITTED', NULL, 'DRAFT', 'Purchase request created')`,
        [requestId, user.id, user.role]
      );

      return { requestId, requestCode };
    });
  }

  async getPurchaseRequests(user, filters = {}) {
    let where = '';
    const params = [];

    // Role-based visibility
    if (user.role === ROLES.GENERAL_USER) {
      where = 'WHERE pr.requester_id = ?';
      params.push(user.id);
    } else if ([ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(user.role)) {
      if (isAdminHrManager(user)) {
        // Admin/HR LEAD/HOD sees all PRs org-wide (same visibility as procurement officer / admin),
        // except at the dept-approval stage, which belongs to the project-owning department.
        where = `WHERE (
          pr.status <> 'PENDING_DEPT_APPROVAL' OR
          COALESCE(pr.routing_department_id, pr.department_id) = ?
        )`;
        params.push(user.department_id);
      } else {
        // HOPs and Program Leads see:
        //   1. Requests awaiting dept approval ONLY where their department owns the
        //      selected project — this is the queue they can actually act on
        //   2. At every other stage, requests originating from their own department
        //      or routed to it (for follow-up and reporting)
        //   3. Any request they have personally acted on (history)
        where = `WHERE (
          (pr.status = 'PENDING_DEPT_APPROVAL' AND COALESCE(pr.routing_department_id, pr.department_id) = ?) OR
          (pr.status <> 'PENDING_DEPT_APPROVAL' AND (pr.department_id = ? OR pr.routing_department_id = ?)) OR
          pr.id IN (SELECT DISTINCT pal.request_id FROM proc_approval_logs pal WHERE pal.actor_id = ?)
        )`;
        params.push(user.department_id, user.department_id, user.department_id, user.id);
      }
    } else if (user.role === ROLES.PROCUREMENT_OFFICER) {
      // Procurement officer sees everything from finance-approved stage onwards + rejected
      where = "WHERE pr.status IN ('PENDING_PROCUREMENT','PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL','PENDING_FINAL_FINANCE','COMPLETED','REJECTED')";
    } else if (user.role === ROLES.PROCUREMENT_COMMITTEE) {
      // Committee sees requests sent to them + completed/rejected for reference
      where = "WHERE pr.status IN ('PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL','PENDING_FINAL_FINANCE','COMPLETED','REJECTED')";
    } else {
      // ADMIN, FINANCE_CLERK see all
      where = 'WHERE 1=1';
    }

    if (filters.status) {
      where += ` AND pr.status = ?`;
      params.push(filters.status);
    }
    if (filters.priority) {
      where += ` AND pr.priority = ?`;
      params.push(filters.priority);
    }
    if (filters.search) {
      where += ` AND (pr.request_code LIKE ? OR pr.title LIKE ? OR CONCAT(u.first_name,' ',u.last_name) LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    const sql = `
      SELECT pr.*,
        u.first_name, u.last_name, u.email AS requester_email,
        d.department_name, d.department_code,
        dn.donor_name, dn.donor_code,
        (SELECT COUNT(*) FROM proc_quotations q WHERE q.request_id = pr.id) AS quotation_count,
        (SELECT q.total_amount FROM proc_quotations q
          WHERE q.request_id = pr.id AND q.is_selected = TRUE LIMIT 1) AS selected_quotation_amount,
        (SELECT CASE WHEN q.currency = 'USD' AND q.total_amount >= ${HIGH_VALUE_THRESHOLD_USD} THEN 1 ELSE 0 END
           FROM proc_quotations q
          WHERE q.request_id = pr.id AND q.is_selected = TRUE LIMIT 1) AS is_high_value
      FROM proc_requests pr
      JOIN users u ON pr.requester_id = u.id
      LEFT JOIN departments d ON pr.department_id = d.id
      LEFT JOIN donors dn ON pr.donor_id = dn.id
      ${where}
      ORDER BY pr.created_at DESC
      LIMIT ${parseInt(filters.limit) || 50} OFFSET ${parseInt(filters.offset) || 0}
    `;

    return query(sql, params);
  }

  async getPurchaseRequestById(requestId) {
    const [requests] = await Promise.all([
      query(
        `SELECT pr.*,
          u.first_name, u.last_name, u.email AS requester_email,
          d.department_name, d.department_code,
          dn.donor_name, dn.donor_code,
          p.project_name, p.project_code
         FROM proc_requests pr
         JOIN users u ON pr.requester_id = u.id
         LEFT JOIN departments d ON pr.department_id = d.id
         LEFT JOIN donors dn ON pr.donor_id = dn.id
         LEFT JOIN projects p ON pr.project_id = p.id
         WHERE pr.id = ?`,
        [requestId]
      )
    ]);

    if (!requests.length) return null;

    const request = requests[0];

    // Flag high-value requests so the UI can mark them for special approval.
    const highValue = await this.isHighValueRequest(requestId);
    request.is_high_value = highValue.isHighValue ? 1 : 0;
    request.selected_quotation_amount = highValue.amount || null;
    request.high_value_threshold = HIGH_VALUE_THRESHOLD_USD;
    // Who must approve a high-value request, and what each has decided so far.
    request.high_value_approvals = highValue.isHighValue
      ? await this.getHighValueApprovals(requestId)
      : [];

    const [items, logs, quotations] = await Promise.all([
      query(
        `SELECT pri.*, bl.budget_code, bl.budget_name, 
          (bl.allocated_amount - bl.spent_amount) AS budget_balance
         FROM proc_request_items pri
         LEFT JOIN budget_lines bl ON pri.budget_line_id = bl.id
         WHERE pri.request_id = ?`,
        [requestId]
      ),
      query(
        `SELECT pal.*,
          u.first_name AS actor_first_name, u.last_name AS actor_last_name
         FROM proc_approval_logs pal
         JOIN users u ON pal.actor_id = u.id
         WHERE pal.request_id = ?
         ORDER BY pal.created_at ASC`,
        [requestId]
      ),
      query(
        `SELECT pq.*,
          v.company_name AS vendor_company, v.is_prequalified,
          u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
         FROM proc_quotations pq
         LEFT JOIN proc_vendors v ON pq.vendor_id = v.id
         LEFT JOIN users u ON pq.created_by = u.id
         WHERE pq.request_id = ?
         ORDER BY pq.total_amount ASC`,
        [requestId]
      )
    ]);

    // Fetch committee votes for vote-progress display
    let committeeVotes = [];
    try {
      committeeVotes = await query(
        `SELECT cv.id, cv.committee_seat, cv.vote, cv.justification, cv.voted_at,
           u.first_name, u.last_name
         FROM proc_committee_votes cv
         JOIN users u ON cv.voter_id = u.id
         WHERE cv.request_id = ?
         ORDER BY cv.voted_at ASC`,
        [requestId]
      );
    } catch (_) { /* table may not exist yet — safe to ignore */ }

    return { ...request, items, approvalTrail: logs, quotations, committeeVotes };
  }

  async updatePurchaseRequest(requestId, data, user) {
    const existing = await this.getPurchaseRequestById(requestId);
    if (!existing) throw new Error('Request not found');
    // Editable until the Procurement Committee unanimously approves (which moves status
    // to PENDING_FINAL_FINANCE). Everything before that stage is still open to amendment.
    if (!['DRAFT', 'REJECTED', 'PENDING_DEPT_APPROVAL', 'PENDING_PROCUREMENT', 'PENDING_COMMITTEE'].includes(existing.status)) {
      throw new Error('Requests can only be edited before the Procurement Committee has approved');
    }
    if (existing.requester_id !== user.id && user.role !== ROLES.ADMIN) {
      throw new Error('You can only edit your own requests');
    }

    const donorId = data.donor_id || existing.donor_id;
    const projectId = data.project_id || existing.project_id;

    return transaction(async (conn) => {
      await this._validateDonorAndProject(conn, donorId, projectId);

      const totalEstimated = (data.items || []).reduce((sum, item) => {
        return sum + ((item.quantity || 1) * (item.estimated_unit_price || 0));
      }, 0);

      await conn.execute(
        `UPDATE proc_requests SET title=?, justification=?, donor_id=?, project_id=?, expected_delivery_date=?,
          priority=?, total_estimated_amount=?, updated_at=NOW() WHERE id=?`,
        [
          data.title || existing.title,
          data.justification || existing.justification,
          donorId,
          projectId,
          data.expected_delivery_date || existing.expected_delivery_date,
          data.priority || existing.priority,
          totalEstimated || existing.total_estimated_amount,
          requestId
        ]
      );

      if (data.items && data.items.length > 0) {
        await conn.execute('DELETE FROM proc_request_items WHERE request_id = ?', [requestId]);
        for (const item of data.items) {
          await conn.execute(
            `INSERT INTO proc_request_items 
              (request_id, budget_line_id, item_description, specifications, quantity, unit_of_measure, estimated_unit_price, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [requestId, item.budget_line_id || null, item.item_description, item.specifications || null,
             item.quantity || 1, item.unit_of_measure || 'unit', item.estimated_unit_price || 0, item.notes || null]
          );
        }
      }

      // Re-resolve routing: changing the project changes which Lead/HOD approves.
      const routingDepartmentId = await this._resolveOwningDepartmentId(
        conn, projectId, requestId, existing.department_id
      );
      await conn.execute(
        'UPDATE proc_requests SET routing_department_id = ? WHERE id = ?',
        [routingDepartmentId, requestId]
      );

      return { success: true };
    });
  }

  async submitPurchaseRequest(requestId, user) {
    const existing = await this.getPurchaseRequestById(requestId);
    if (!existing) throw new Error('Request not found');
    if (!['DRAFT', 'REJECTED'].includes(existing.status)) throw new Error('Only DRAFT or REJECTED requests can be submitted');
    if (existing.requester_id !== user.id && user.role !== ROLES.ADMIN) {
      throw new Error('You can only submit your own requests');
    }
    if (!existing.items || existing.items.length === 0) {
      throw new Error('At least one item is required before submitting');
    }

    const isResubmission = existing.status === 'REJECTED';

    return transaction(async (conn) => {
      await this._validateDonorAndProject(conn, existing.donor_id, existing.project_id);

      // Recompute the owning department at submission so routing reflects the
      // project selected right now, not whatever was on the request when drafted.
      const routingDepartmentId = await this._resolveOwningDepartmentId(
        conn, existing.project_id, requestId, existing.department_id
      );

      // A resubmission returns to the desk that rejected it — a request rejected by
      // Finance goes back to Finance, not through the whole pipeline again. Only a
      // first-time submission starts at department approval.
      let targetStatus = PROC_STATUS.PENDING_DEPT_APPROVAL;
      if (isResubmission) {
        // rejected_from_status is recorded when a high-value approver rejects;
        // fall back to the approval trail for rejections logged before it existed.
        let rejectedFrom = existing.rejected_from_status;
        if (!rejectedFrom) {
          const [rejectionLogs] = await conn.execute(
            `SELECT previous_status FROM proc_approval_logs
             WHERE request_id = ? AND action IN ('REJECTED', 'HIGH_VALUE_REJECTED')
             ORDER BY created_at DESC, id DESC LIMIT 1`,
            [requestId]
          );
          rejectedFrom = rejectionLogs[0]?.previous_status;
        }
        const resumable = [
          PROC_STATUS.PENDING_DEPT_APPROVAL,
          PROC_STATUS.PENDING_PROCUREMENT,
          PROC_STATUS.PENDING_COMMITTEE,
          PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
          PROC_STATUS.PENDING_FINAL_FINANCE
        ];
        if (resumable.includes(rejectedFrom)) {
          targetStatus = rejectedFrom;
        }

        // Returning to the high-value stage means both approvers assess the
        // amended request afresh — an approval given for the old version says
        // nothing about the new one. If the revision dropped the selected
        // quotation below the threshold, it is no longer a high-value request
        // and rejoins the ordinary flow at Finance.
        if (targetStatus === PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL) {
          await conn.execute('DELETE FROM proc_high_value_approvals WHERE request_id = ?', [requestId]);
          const stillHighValue = await this.isHighValueRequest(requestId);
          if (!stillHighValue.isHighValue) {
            targetStatus = PROC_STATUS.PENDING_FINAL_FINANCE;
          }
        }
      }

      await conn.execute(
        `UPDATE proc_requests SET status=?, routing_department_id=?, submitted_at=IF(submitted_at IS NULL, NOW(), submitted_at), rejection_reason=NULL, rejected_from_status=NULL, updated_at=NOW() WHERE id=?`,
        [targetStatus, routingDepartmentId, requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [requestId, user.id, user.role,
          isResubmission ? 'RESUBMITTED' : 'SUBMITTED',
          existing.status,
          targetStatus,
          isResubmission ? 'Request resubmitted after revision' : 'Request submitted for approval'
        ]
      );
      return { success: true, status: targetStatus, _notif: { requestCode: existing.request_code, requesterId: user.id, deptId: existing.department_id, routingDeptId: routingDepartmentId, targetStatus } };
    }).then(result => {
      if (result._notif) {
        const n = result._notif; delete result._notif;
        // Only the department-approval stage notifies department Leads; a resubmission
        // that resumes further down the pipeline must not ping them again.
        if (n.targetStatus === PROC_STATUS.PENDING_DEPT_APPROVAL) {
          notificationService.onProcurementSubmitted(requestId, n.requestCode, n.requesterId, n.deptId, n.routingDeptId).catch(() => {});
        }
      }
      return result;
    });
  }

  // ============================================================
  // APPROVAL ACTIONS
  // ============================================================

  async approveDeptLevel(requestId, user, comments = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_DEPT_APPROVAL') {
      throw new Error('Request is not pending department approval');
    }
    if (![ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Program Lead or Head of Programs can approve at this stage');
    }

    // The first approval belongs to the Lead/HOD of the department that owns the
    // selected project — never the requester's own department Lead/HOD.
    // routing_department_id is set from the project; department_id is only a
    // fallback for legacy requests created before project-based routing.
    if (user.role !== ROLES.ADMIN) {
      const owningDepartmentId = Number(req.routing_department_id || req.department_id);
      if (owningDepartmentId !== Number(user.department_id)) {
        throw new Error('This request must be approved by the Lead/HOD of the department that owns the selected project');
      }
    }

    return transaction(async (conn) => {
      // New flow: dept approval goes directly to PENDING_PROCUREMENT (no intermediate finance step)
      await conn.execute(
        `UPDATE proc_requests SET status='PENDING_PROCUREMENT', dept_approved_at=NOW(), updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'APPROVED', 'PENDING_DEPT_APPROVAL', 'PENDING_PROCUREMENT', ?)`,
        [requestId, user.id, user.role, comments || 'Approved by department — forwarded to procurement']
      );
      return { success: true };
    });
  }

  async reverseDeptApproval(requestId, user) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_PROCUREMENT') {
      throw new Error('Can only reverse department approval when request is at Pending Procurement stage');
    }
    if (![ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only the approving role (Program Lead, Head of Programs, or Admin) can reverse a department approval');
    }
    // Enforce 12-hour reversal window
    if (req.dept_approved_at) {
      const hoursSince = (Date.now() - new Date(req.dept_approved_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince > 12) {
        throw new Error('Reversal window has expired (12 hours after department approval)');
      }
    }
    // Prevent reversal if quotations have already been added
    const quotations = await query('SELECT id FROM proc_quotations WHERE request_id = ?', [requestId]);
    if (quotations.length > 0) {
      throw new Error('Cannot reverse — the Procurement team has already added quotations. Contact an Admin.');
    }
    await query(
      `UPDATE proc_requests SET status='PENDING_DEPT_APPROVAL', dept_approved_at=NULL, updated_at=NOW() WHERE id=?`,
      [requestId]
    );
    await query(
      `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
       VALUES (?, ?, ?, 'REVERSED', 'PENDING_PROCUREMENT', 'PENDING_DEPT_APPROVAL', 'Department approval reversed')`,
      [requestId, user.id, user.role]
    );
    return { success: true };
  }

  async approveFinanceLevel(requestId, user, comments = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_FINANCE_APPROVAL') {
      throw new Error('Request is not pending finance approval');
    }
    if (![ROLES.FINANCE_CLERK, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Finance Clerk can approve at this stage');
    }

    return transaction(async (conn) => {
      await conn.execute(
        `UPDATE proc_requests SET status='PENDING_PROCUREMENT', finance_approved_at=NOW(), updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'APPROVED', 'PENDING_FINANCE_APPROVAL', 'PENDING_PROCUREMENT', ?)`,
        [requestId, user.id, user.role, comments || 'Approved by finance']
      );
      return { success: true };
    });
  }

  async rejectRequest(requestId, user, comments = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');

    const allowedStatuses = [
      'PENDING_DEPT_APPROVAL',
      'PENDING_PROCUREMENT', 'PENDING_FINAL_FINANCE'
    ];
    if (!allowedStatuses.includes(req.status)) {
      if (req.status === 'PENDING_COMMITTEE') {
        throw new Error('At committee stage, use the Committee Vote action to record a rejection — not the Reject button');
      }
      throw new Error('Request cannot be rejected at this stage');
    }

    // The dept-approval decision — approve or reject — belongs to the Lead/HOD of the
    // department that owns the selected project.
    if (
      req.status === 'PENDING_DEPT_APPROVAL' &&
      [ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(user.role)
    ) {
      const owningDepartmentId = Number(req.routing_department_id || req.department_id);
      if (owningDepartmentId !== Number(user.department_id)) {
        throw new Error('This request must be actioned by the Lead/HOD of the department that owns the selected project');
      }
    }

    return transaction(async (conn) => {
      const prev = req.status;
      await conn.execute(
        `UPDATE proc_requests SET status='REJECTED', rejection_reason=?, updated_at=NOW() WHERE id=?`,
        [comments, requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'REJECTED', ?, 'REJECTED', ?)`,
        [requestId, user.id, user.role, prev, comments || 'Rejected']
      );
      return { success: true };
    });
  }

  // ============================================================
  // PROCUREMENT TEAM ACTIONS
  // ============================================================

  async submitToCommittee(requestId, selectedQuotationId, user, comments = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_PROCUREMENT') {
      throw new Error('Request is not in procurement stage');
    }
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can submit to committee');
    }

    // Check quotation exists
    const quotations = await query('SELECT id FROM proc_quotations WHERE request_id = ?', [requestId]);
    if (!quotations.length) {
      throw new Error('At least one quotation must be uploaded before submitting to committee');
    }

    // Check if the selected quotation value is below the USD 500 threshold
    let bypassCommittee = false;
    let selectedQuotationAmount = null;
    if (selectedQuotationId) {
      const quotDetails = await query(
        'SELECT total_amount, currency FROM proc_quotations WHERE id = ? AND request_id = ?',
        [selectedQuotationId, requestId]
      );
      if (quotDetails.length) {
        const currency = quotDetails[0].currency || 'USD';
        selectedQuotationAmount = parseFloat(quotDetails[0].total_amount);
        if (currency === 'USD' && selectedQuotationAmount < 500) {
          bypassCommittee = true;
        }
      }
    }

    return transaction(async (conn) => {
      // Mark the selected quotation
      if (selectedQuotationId) {
        await conn.execute('UPDATE proc_quotations SET is_selected=FALSE WHERE request_id=?', [requestId]);
        await conn.execute(
          'UPDATE proc_quotations SET is_selected=TRUE, selected_at=NOW(), selected_by=? WHERE id=? AND request_id=?',
          [user.id, selectedQuotationId, requestId]
        );
      }

      if (bypassCommittee) {
        // Quotation is below USD 500 — skip committee and forward directly to Finance
        await conn.execute(
          `UPDATE proc_requests SET status='PENDING_FINAL_FINANCE', procurement_assigned_at=NOW(), committee_reviewed_at=NOW(), updated_at=NOW() WHERE id=?`,
          [requestId]
        );
        await conn.execute(
          `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, 'COMMITTEE_BYPASSED', 'PENDING_PROCUREMENT', 'PENDING_FINAL_FINANCE', ?)`,
          [requestId, user.id, user.role,
           `Quotation total (USD ${selectedQuotationAmount.toFixed(2)}) is below the USD 500 threshold — Committee review bypassed, forwarded directly to Finance`]
        );
        return { success: true, bypassed: true, status: 'PENDING_FINAL_FINANCE' };
      }

      // Standard flow — send to committee
      await conn.execute(
        `UPDATE proc_requests SET status='PENDING_COMMITTEE', procurement_assigned_at=NOW(), updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'SUBMITTED_TO_COMMITTEE', 'PENDING_PROCUREMENT', 'PENDING_COMMITTEE', ?)`,
        [requestId, user.id, user.role, comments || 'Submitted to procurement committee']
      );
      return { success: true, bypassed: false };
    });
  }

  // ============================================================
  // COMMITTEE ACTIONS
  // ============================================================

  async committeeDecision(requestId, decision, selectedQuotationId, user, justification = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_COMMITTEE') {
      throw new Error('Request is not pending committee review');
    }
    if (![ROLES.PROCUREMENT_COMMITTEE, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Committee members can make this decision');
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new Error('Decision must be APPROVED or REJECTED');
    }

    // Fetch user's department code for informational/audit purposes only
    const [userRow] = await query(
      `SELECT d.department_code FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [user.id]
    );
    const seat = userRow?.department_code || null;

    // High-value requests are no longer decided here — the committee recommends
    // them onward to the Super Admin and the owning department's Lead/HOP. Every
    // committee member may therefore vote regardless of the amount.
    const highValue = await this.isHighValueRequest(requestId);

    return transaction(async (conn) => {
      // Check if this voter has already cast a vote on this request
      const [existingVote] = await conn.execute(
        'SELECT id FROM proc_committee_votes WHERE request_id = ? AND voter_id = ?',
        [requestId, user.id]
      );

      if (existingVote.length > 0) {
        // Same voter — allow updating their own vote
        await conn.execute(
          `UPDATE proc_committee_votes SET vote = ?, justification = ?, voted_at = NOW()
           WHERE request_id = ? AND voter_id = ?`,
          [decision, justification || null, requestId, user.id]
        );
      } else {
        // First vote from this member — insert
        await conn.execute(
          `INSERT INTO proc_committee_votes (request_id, voter_id, committee_seat, vote, justification)
           VALUES (?, ?, ?, ?, ?)`,
          [requestId, user.id, seat, decision, justification || null]
        );
      }

      // Log in approval trail
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, ?, 'PENDING_COMMITTEE', 'PENDING_COMMITTEE', ?)`,
        [requestId, user.id, user.role,
         decision === 'APPROVED' ? 'COMMITTEE_VOTE_APPROVED' : 'COMMITTEE_VOTE_REJECTED',
         `[${seat || 'N/A'}] ${decision}${justification ? ': ' + justification : ''}`]
      );

      // Now check the current vote tally for this request
      const [allVotes] = await conn.execute(
        `SELECT voter_id, vote FROM proc_committee_votes WHERE request_id = ?`,
        [requestId]
      );

      const totalApproved = allVotes.filter(v => v.vote === 'APPROVED').length;
      const totalRejected = allVotes.filter(v => v.vote === 'REJECTED').length;
      const totalVotes = allVotes.length;

      // Where the request goes once the committee has spoken. Below the
      // threshold the committee's approval is the decision, so it goes straight
      // to Finance. At or above it, the committee only recommends: the request
      // still needs the Super Admin and the owning department's Lead/HOP.
      const onwardStatus = highValue.isHighValue
        ? PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL
        : PROC_STATUS.PENDING_FINAL_FINANCE;

      const advance = async (logComment, resultMessage) => {
        await conn.execute(
          `UPDATE proc_requests SET status=?, committee_reviewed_at=NOW(), updated_at=NOW() WHERE id=?`,
          [onwardStatus, requestId]
        );
        await conn.execute(
          `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, ?, 'PENDING_COMMITTEE', ?, ?)`,
          [requestId, user.id, user.role,
           highValue.isHighValue ? 'COMMITTEE_RECOMMENDED' : 'COMMITTEE_APPROVED',
           onwardStatus, logComment]
        );
        if (highValue.isHighValue) {
          // Fire-and-forget: a notification failure must not roll back the vote.
          notificationService.onProcurementHighValuePending(
            requestId, req.request_code, highValue.amount,
            req.routing_department_id || req.department_id
          ).catch(() => {});
        }
        return { success: true, status: onwardStatus, highValue: highValue.isHighValue, message: resultMessage };
      };

      const onwardLabel = highValue.isHighValue
        ? 'the Super Admin and the owning department Lead/HOP for approval'
        : 'Finance for final approval';

      // An ADMIN acting at the committee stage carries the committee outright.
      if (user.role === ROLES.ADMIN && decision === 'APPROVED') {
        return advance(
          `Admin override — forwarded to ${onwardLabel}`,
          `Admin override approved. Forwarded to ${onwardLabel}.`
        );
      }

      if (totalApproved >= COMMITTEE_APPROVALS_REQUIRED) {
        return advance(
          `${COMMITTEE_APPROVALS_REQUIRED} Procurement Committee votes received — forwarded to ${onwardLabel}`,
          highValue.isHighValue
            ? `${COMMITTEE_APPROVALS_REQUIRED} Procurement Committee approvals received. This request is USD ${highValue.amount.toFixed(2)} — recommended for approval and forwarded to the Super Admin and the owning department Lead/HOP.`
            : `${COMMITTEE_APPROVALS_REQUIRED} Procurement Committee approvals received. Request forwarded to Finance for final approval.`
        );
      }

      // Not enough approvals yet — stay at PENDING_COMMITTEE
      const remaining = COMMITTEE_APPROVALS_REQUIRED - totalApproved;
      return {
        success: true,
        status: PROC_STATUS.PENDING_COMMITTEE,
        highValue: highValue.isHighValue,
        votedCount: totalApproved,
        totalRequired: COMMITTEE_APPROVALS_REQUIRED,
        totalVotes,
        totalRejected,
        message: decision === 'REJECTED'
          ? `Vote recorded as REJECTED. You may update your vote to Approve when ready. (${totalApproved}/${COMMITTEE_APPROVALS_REQUIRED} approved)`
          : `Vote recorded (${totalApproved}/${COMMITTEE_APPROVALS_REQUIRED} approved). ${remaining} more approval${remaining > 1 ? 's' : ''} needed.`
      };
    });
  }

  // ============================================================
  // HIGH-VALUE DUAL APPROVAL (Super Admin + owning department Lead/HOP)
  // ============================================================

  /**
   * Which seat, if any, this user occupies for the given request.
   * Returns null when the user has no standing to act at this stage.
   */
  _highValueSeatFor(user, request) {
    if (user.role === ROLES.ADMIN) return HV_SEAT.SUPER_ADMIN;

    if ([ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(user.role)) {
      // Either the Lead or the Head of Programs may fill the department seat —
      // whichever acts first settles it.
      const owningDepartmentId = Number(request.routing_department_id || request.department_id);
      if (owningDepartmentId && Number(user.department_id) === owningDepartmentId) {
        return HV_SEAT.DEPARTMENT;
      }
    }
    return null;
  }

  async getHighValueApprovals(requestId) {
    return query(
      `SELECT a.*, u.first_name, u.last_name, u.email, d.department_code
         FROM proc_high_value_approvals a
         JOIN users u ON u.id = a.approver_id
         LEFT JOIN departments d ON d.id = a.department_id
        WHERE a.request_id = ?
        ORDER BY a.created_at ASC`,
      [requestId]
    );
  }

  /**
   * Record one of the two parallel high-value approvals.
   * Both seats must approve before the request reaches Finance; a rejection by
   * either sends it back to be amended and resubmitted.
   */
  async highValueDecision(requestId, decision, user, comments = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL) {
      throw new Error('Request is not pending high-value approval');
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new Error('Decision must be APPROVED or REJECTED');
    }

    const seat = this._highValueSeatFor(user, req);
    if (!seat) {
      throw new Error(
        'Only the Super Admin or the Lead/Head of Programs of the department that owns the selected project may approve this request'
      );
    }
    if (decision === 'REJECTED' && !String(comments || '').trim()) {
      throw new Error('A reason is required when rejecting');
    }

    return transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO proc_high_value_approvals
           (request_id, seat, approver_id, approver_role, department_id, decision, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           approver_id=VALUES(approver_id), approver_role=VALUES(approver_role),
           department_id=VALUES(department_id), decision=VALUES(decision),
           comments=VALUES(comments), updated_at=NOW()`,
        [requestId, seat, user.id, user.role, user.department_id || null, decision, comments || null]
      );

      const seatLabel = seat === HV_SEAT.SUPER_ADMIN ? 'Super Admin' : 'Department Lead/HOP';

      // ── Rejection: stop here. The request goes back to be amended. ──────────
      if (decision === 'REJECTED') {
        await conn.execute(
          `UPDATE proc_requests
              SET status=?, rejection_reason=?, rejected_from_status=?, updated_at=NOW()
            WHERE id=?`,
          [PROC_STATUS.REJECTED, comments, PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL, requestId]
        );
        await conn.execute(
          `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, 'HIGH_VALUE_REJECTED', ?, 'REJECTED', ?)`,
          [requestId, user.id, user.role, PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
           `${seatLabel} rejected: ${comments}`]
        );
        return {
          success: true,
          status: PROC_STATUS.REJECTED,
          message: 'Request rejected and returned for amendment. Once corrected and resubmitted it will come back to this approval stage.'
        };
      }

      // ── Approval: advance only when BOTH seats have approved. ──────────────
      const [rows] = await conn.execute(
        `SELECT seat, decision FROM proc_high_value_approvals WHERE request_id = ?`,
        [requestId]
      );
      const approvedSeats = new Set(rows.filter(r => r.decision === 'APPROVED').map(r => r.seat));
      const bothApproved = approvedSeats.has(HV_SEAT.SUPER_ADMIN) && approvedSeats.has(HV_SEAT.DEPARTMENT);

      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'HIGH_VALUE_APPROVED', ?, ?, ?)`,
        [requestId, user.id, user.role, PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
         bothApproved ? PROC_STATUS.PENDING_FINAL_FINANCE : PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
         `${seatLabel} approved${comments ? `: ${comments}` : ''}`]
      );

      if (!bothApproved) {
        const waitingOn = approvedSeats.has(HV_SEAT.SUPER_ADMIN)
          ? 'the department Lead/Head of Programs'
          : 'the Super Admin';
        return {
          success: true,
          status: PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
          approvedSeats: [...approvedSeats],
          message: `Approval recorded. Still awaiting ${waitingOn}.`
        };
      }

      await conn.execute(
        `UPDATE proc_requests SET status=?, updated_at=NOW() WHERE id=?`,
        [PROC_STATUS.PENDING_FINAL_FINANCE, requestId]
      );
      return {
        success: true,
        status: PROC_STATUS.PENDING_FINAL_FINANCE,
        approvedSeats: [...approvedSeats],
        message: 'Both the Super Admin and the department Lead/HOP have approved. Forwarded to Finance for final approval.'
      };
    });
  }

  async getCommitteeVotes(requestId) {
    return query(
      `SELECT cv.id, cv.committee_seat, cv.vote, cv.justification, cv.voted_at,
         u.first_name, u.last_name, u.email
       FROM proc_committee_votes cv
       JOIN users u ON cv.voter_id = u.id
       WHERE cv.request_id = ?
       ORDER BY cv.voted_at ASC`,
      [requestId]
    );
  }

  // ============================================================
  // FINAL FINANCE APPROVAL
  // ============================================================

  /**
   * Final finance approval.
   *
   * `popFiles` is a list of uploaded Proof of Payment documents — payments are
   * often settled in batches, so more than one may be attached here, and further
   * batches can be added afterwards via addProofOfPayment().
   */
  async finalFinanceApproval(requestId, user, comments = '', popFiles = []) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_FINAL_FINANCE') {
      throw new Error('Request is not pending final finance approval');
    }
    if (![ROLES.FINANCE_CLERK, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Finance Clerk can give final approval');
    }
    if (!popFiles.length) {
      throw new Error('At least one Proof of Payment (POP) document must be uploaded before final approval');
    }

    return transaction(async (conn) => {
      // The legacy single-POP columns still mirror the first document so older
      // reads (the /pop/download endpoint, exports) keep working unchanged.
      const [first] = popFiles;
      await conn.execute(
        `UPDATE proc_requests SET status='COMPLETED', final_finance_approved_at=NOW(), completed_at=NOW(),
          pop_file_path=?, pop_file_name=?, pop_file_size=?, updated_at=NOW() WHERE id=?`,
        [first.path, first.originalname, first.size, requestId]
      );
      for (const f of popFiles) {
        await conn.execute(
          `INSERT INTO proc_request_pops (request_id, file_path, file_name, file_size, uploaded_by)
           VALUES (?, ?, ?, ?, ?)`,
          [requestId, f.path, f.originalname, f.size, user.id]
        );
      }
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'FINAL_APPROVED', 'PENDING_FINAL_FINANCE', 'COMPLETED', ?)`,
        [requestId, user.id, user.role, comments || 'Final finance approval granted. Payment authorised.']
      );

      // Auto-update vendor rating: increment by 1 (max 5) for the selected quotation's vendor
      const selectedQuotations = await conn.execute(
        `SELECT vendor_id FROM proc_quotations WHERE request_id = ? AND is_selected = TRUE AND vendor_id IS NOT NULL LIMIT 1`,
        [requestId]
      );
      if (selectedQuotations[0] && selectedQuotations[0].length > 0) {
        const vendorId = selectedQuotations[0][0].vendor_id;
        await conn.execute(
          `UPDATE proc_vendors SET rating = LEAST(5.0, COALESCE(rating, 0) + 1.0), updated_at=NOW() WHERE id=?`,
          [vendorId]
        );
      }

      return { success: true };
    });
  }

  // ============================================================
  // PROOF OF PAYMENT (multiple documents per request)
  // ============================================================

  async getProofOfPayments(requestId) {
    return query(
      `SELECT p.*, u.first_name, u.last_name
       FROM proc_request_pops p
       LEFT JOIN users u ON u.id = p.uploaded_by
       WHERE p.request_id = ?
       ORDER BY p.created_at ASC, p.id ASC`,
      [requestId]
    );
  }

  /**
   * Attach further POP documents after final approval — used when a payment is
   * settled in batches and the later instalments are paid separately.
   */
  async addProofOfPayment(requestId, user, files = [], note = null) {
    if (![ROLES.FINANCE_CLERK, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Finance Clerk or Admin can attach proof of payment');
    }
    if (!files.length) throw new Error('No files were uploaded');

    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (!['PENDING_FINAL_FINANCE', 'COMPLETED'].includes(req.status)) {
      throw new Error('Proof of payment can only be attached once a request has reached final finance approval');
    }

    return transaction(async (conn) => {
      for (const f of files) {
        await conn.execute(
          `INSERT INTO proc_request_pops (request_id, file_path, file_name, file_size, note, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [requestId, f.path, f.originalname, f.size, note || null, user.id]
        );
      }
      // Keep the legacy mirror populated if it was empty.
      await conn.execute(
        `UPDATE proc_requests SET pop_file_path=COALESCE(pop_file_path, ?),
           pop_file_name=COALESCE(pop_file_name, ?), pop_file_size=COALESCE(pop_file_size, ?),
           updated_at=NOW() WHERE id=?`,
        [files[0].path, files[0].originalname, files[0].size, requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'POP_ATTACHED', ?, ?, ?)`,
        [requestId, user.id, user.role, req.status, req.status,
         `${files.length} proof of payment document(s) attached${note ? `: ${note}` : ''}`]
      );
      return { success: true, added: files.length };
    });
  }

  async deleteProofOfPayment(requestId, popId, user) {
    if (![ROLES.FINANCE_CLERK, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Finance Clerk or Admin can remove proof of payment');
    }
    const rows = await query(
      'SELECT * FROM proc_request_pops WHERE id = ? AND request_id = ?', [popId, requestId]
    );
    if (!rows.length) throw new Error('Proof of payment not found');

    const remaining = await query(
      'SELECT COUNT(*) AS cnt FROM proc_request_pops WHERE request_id = ?', [requestId]
    );
    const req = await this.getPurchaseRequestById(requestId);
    if (req && req.status === 'COMPLETED' && Number(remaining[0].cnt) <= 1) {
      throw new Error('A completed request must keep at least one proof of payment');
    }

    await query('DELETE FROM proc_request_pops WHERE id = ?', [popId]);

    // If the legacy mirror pointed at the deleted file, repoint it at whatever remains.
    const [next] = await this.getProofOfPayments(requestId);
    await query(
      `UPDATE proc_requests SET pop_file_path=?, pop_file_name=?, pop_file_size=?, updated_at=NOW()
       WHERE id=? AND pop_file_path=?`,
      [next?.file_path ?? null, next?.file_name ?? null, next?.file_size ?? null, requestId, rows[0].file_path]
    );
    return { success: true };
  }

  async reverseFinalApproval(requestId, user, reason = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'COMPLETED') {
      throw new Error('Only COMPLETED requests can have their final approval reversed');
    }
    if (![ROLES.FINANCE_CLERK, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Finance Clerk or Admin can reverse final approval');
    }
    await query(
      `UPDATE proc_requests SET status='PENDING_FINAL_FINANCE', final_finance_approved_at=NULL, completed_at=NULL,
        pop_file_path=NULL, pop_file_name=NULL, pop_file_size=NULL, updated_at=NOW() WHERE id=?`,
      [requestId]
    );
    // The uploaded documents themselves are kept: reversing an approval does not
    // unmake a payment that was already proven, and Finance needs the history.
    await query(
      `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
       VALUES (?, ?, ?, 'REVERSED', 'COMPLETED', 'PENDING_FINAL_FINANCE', ?)`,
      [requestId, user.id, user.role, reason || 'Final approval reversed']
    );
    return { success: true };
  }

  // ============================================================
  // QUOTATIONS
  // ============================================================

  async addQuotation(requestId, data, user) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (!['PENDING_PROCUREMENT', 'PENDING_COMMITTEE'].includes(req.status)) {
      throw new Error('Quotations can only be added when request is in procurement or committee review stage');
    }

    const result = await query(
      `INSERT INTO proc_quotations 
        (request_id, vendor_id, vendor_name, vendor_email, vendor_phone, quotation_number,
         total_amount, currency, validity_date, delivery_timeline, terms_and_conditions,
         notes, file_path, file_name, file_size, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        requestId,
        data.vendor_id || null,
        data.vendor_name,
        data.vendor_email || null,
        data.vendor_phone || null,
        data.quotation_number || null,
        data.total_amount,
        data.currency || 'USD',
        data.validity_date || null,
        data.delivery_timeline || null,
        data.terms_and_conditions || null,
        data.notes || null,
        data.file_path || null,
        data.file_name || null,
        data.file_size || null,
        user.id
      ]
    );

    return { quotationId: result.insertId };
  }

  async getQuotations(requestId) {
    return query(
      `SELECT pq.*,
        v.company_name AS vendor_company, v.is_prequalified, v.rating AS vendor_rating,
        u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
       FROM proc_quotations pq
       LEFT JOIN proc_vendors v ON pq.vendor_id = v.id
       LEFT JOIN users u ON pq.created_by = u.id
       WHERE pq.request_id = ?
       ORDER BY pq.total_amount ASC`,
      [requestId]
    );
  }

  async deleteQuotation(quotationId, user) {
    const rows = await query('SELECT * FROM proc_quotations WHERE id = ?', [quotationId]);
    if (!rows.length) throw new Error('Quotation not found');
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can delete quotations');
    }
    await query('DELETE FROM proc_quotations WHERE id = ?', [quotationId]);
    return { success: true };
  }

  async updateQuotation(quotationId, data, user) {
    const rows = await query('SELECT pq.*, pr.status as request_status FROM proc_quotations pq JOIN proc_requests pr ON pq.request_id = pr.id WHERE pq.id = ?', [quotationId]);
    if (!rows.length) throw new Error('Quotation not found');
    const quot = rows[0];
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can edit quotations');
    }
    if (!['PENDING_PROCUREMENT', 'PENDING_COMMITTEE'].includes(quot.request_status)) {
      throw new Error('Quotations can only be edited while the request is in the procurement or committee-review stage');
    }
    // Build dynamic update — include file fields only when a new file is provided
    const hasNewFile = data.file_path != null;
    const sql = hasNewFile
      ? `UPDATE proc_quotations SET
          vendor_name=COALESCE(?,vendor_name), vendor_email=COALESCE(?,vendor_email), vendor_phone=COALESCE(?,vendor_phone),
          quotation_number=COALESCE(?,quotation_number), total_amount=COALESCE(?,total_amount),
          currency=COALESCE(?,currency), validity_date=COALESCE(?,validity_date),
          delivery_timeline=COALESCE(?,delivery_timeline), notes=COALESCE(?,notes),
          file_path=?, file_name=?, file_size=?, updated_at=NOW()
         WHERE id=?`
      : `UPDATE proc_quotations SET
          vendor_name=COALESCE(?,vendor_name), vendor_email=COALESCE(?,vendor_email), vendor_phone=COALESCE(?,vendor_phone),
          quotation_number=COALESCE(?,quotation_number), total_amount=COALESCE(?,total_amount),
          currency=COALESCE(?,currency), validity_date=COALESCE(?,validity_date),
          delivery_timeline=COALESCE(?,delivery_timeline), notes=COALESCE(?,notes), updated_at=NOW()
         WHERE id=?`;

    const params = [
      data.vendor_name || null, data.vendor_email || null, data.vendor_phone || null,
      data.quotation_number || null, data.total_amount ? parseFloat(data.total_amount) : null,
      data.currency || null, data.validity_date || null, data.delivery_timeline || null,
      data.notes || null,
      ...(hasNewFile ? [data.file_path, data.file_name || null, data.file_size || null] : []),
      quotationId
    ];

    await query(sql, params);
    return { success: true };
  }

  async resubmitToCommittee(requestId, selectedQuotationId, user, comments = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_COMMITTEE') {
      throw new Error('Only requests currently under committee review can be resubmitted');
    }
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can resubmit to the committee');
    }

    // Check at least one quotation exists
    const quotations = await query('SELECT id FROM proc_quotations WHERE request_id = ?', [requestId]);
    if (!quotations.length) {
      throw new Error('At least one quotation must exist before resubmitting');
    }

    return transaction(async (conn) => {
      // Reset existing committee votes so members can vote afresh on the revised quotations
      await conn.execute('DELETE FROM proc_committee_votes WHERE request_id = ?', [requestId]);

      // Update selected quotation if specified
      if (selectedQuotationId) {
        await conn.execute('UPDATE proc_quotations SET is_selected=FALSE WHERE request_id=?', [requestId]);
        await conn.execute(
          'UPDATE proc_quotations SET is_selected=TRUE, selected_at=NOW(), selected_by=? WHERE id=? AND request_id=?',
          [user.id, selectedQuotationId, requestId]
        );
      }

      // Keep status as PENDING_COMMITTEE but log the amendment
      await conn.execute(
        `UPDATE proc_requests SET updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'RESUBMITTED_TO_COMMITTEE', 'PENDING_COMMITTEE', 'PENDING_COMMITTEE', ?)`,
        [requestId, user.id, user.role, comments || 'Quotations amended and resubmitted to committee for review']
      );
      return { success: true };
    });
  }

  // ============================================================
  // VENDORS
  // ============================================================

  async getVendors(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.search) {
      where += ' AND (v.company_name LIKE ? OR v.vendor_code LIKE ? OR v.contact_person LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }
    if (filters.category) {
      where += ' AND v.category = ?';
      params.push(filters.category);
    }
    if (filters.is_prequalified !== undefined) {
      where += ' AND v.is_prequalified = ?';
      params.push(filters.is_prequalified === 'true' ? 1 : 0);
    }
    if (filters.is_active !== undefined) {
      where += ' AND v.is_active = ?';
      params.push(filters.is_active === 'false' ? 0 : 1);
    } else {
      where += ' AND v.is_active = 1';
    }

    return query(
      `SELECT v.*,
        (SELECT COUNT(*) FROM proc_quotations pq WHERE pq.vendor_id = v.id) AS quotation_count,
        u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
       FROM proc_vendors v
       LEFT JOIN users u ON v.created_by = u.id
       ${where}
       ORDER BY v.company_name ASC
       LIMIT ${parseInt(filters.limit) || 100}`,
      params
    );
  }

  async createVendor(data, user) {
    // Auto-generate vendor code
    const seqRows = await query('SELECT COUNT(*) + 1 AS seq FROM proc_vendors');
    const vendorCode = `VND-${String(seqRows[0].seq).padStart(3, '0')}`;

    const result = await query(
      `INSERT INTO proc_vendors 
        (vendor_code, company_name, contact_person, email, phone, address, tin_number,
         registration_number, category, is_prequalified, prequalification_expiry, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        vendorCode,
        data.company_name,
        data.contact_person || null,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.tin_number || null,
        data.registration_number || null,
        data.category || null,
        data.is_prequalified ? 1 : 0,
        data.prequalification_expiry || null,
        data.notes || null,
        user.id
      ]
    );

    return { vendorId: result.insertId, vendorCode };
  }

  async updateVendor(vendorId, data) {
    const vendors = await query('SELECT id FROM proc_vendors WHERE id = ?', [vendorId]);
    if (!vendors.length) throw new Error('Vendor not found');

    await query(
      `UPDATE proc_vendors SET
        company_name=?, contact_person=?, email=?, phone=?, address=?, tin_number=?,
        registration_number=?, category=?, is_prequalified=?, prequalification_expiry=?,
        notes=?, is_active=?, updated_at=NOW()
       WHERE id=?`,
      [
        data.company_name,
        data.contact_person || null,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.tin_number || null,
        data.registration_number || null,
        data.category || null,
        data.is_prequalified ? 1 : 0,
        data.prequalification_expiry || null,
        data.notes || null,
        data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
        vendorId
      ]
    );

    return { success: true };
  }

  async getVendorById(vendorId) {
    const vendors = await query(
      `SELECT v.*,
        u.first_name AS created_by_first_name, u.last_name AS created_by_last_name,
        (SELECT COUNT(*) FROM proc_quotations pq WHERE pq.vendor_id = v.id) AS quotation_count,
        (SELECT SUM(pq.total_amount) FROM proc_quotations pq 
         JOIN proc_requests pr ON pq.request_id = pr.id
         WHERE pq.vendor_id = v.id AND pq.is_selected = TRUE AND pr.status = 'COMPLETED') AS total_awarded
       FROM proc_vendors v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.id = ?`,
      [vendorId]
    );
    return vendors[0] || null;
  }

  async deleteVendor(vendorId, user) {
    const vendors = await query('SELECT id FROM proc_vendors WHERE id = ?', [vendorId]);
    if (!vendors.length) throw new Error('Vendor not found');
    // Check if vendor is linked to any active/in-progress procurement requests
    const activeLinks = await query(
      `SELECT COUNT(*) AS cnt FROM proc_quotations pq
       JOIN proc_requests pr ON pq.request_id = pr.id
       WHERE pq.vendor_id = ? AND pr.status NOT IN ('COMPLETED','REJECTED','CANCELLED')`,
      [vendorId]
    );
    if (activeLinks[0].cnt > 0) {
      throw new Error('Cannot delete vendor: they are linked to active procurement requests');
    }
    // Soft delete
    await query(`UPDATE proc_vendors SET is_active=0, updated_at=NOW() WHERE id=?`, [vendorId]);
    return { success: true };
  }

  // ============================================================
  // DASHBOARD STATS
  // ============================================================

  async getDashboardStats(user) {
    let requestFilter = '';
    const params = [];

    if (user.role === ROLES.GENERAL_USER) {
      requestFilter = 'WHERE pr.requester_id = ?';
      params.push(user.id);
    } else if ([ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(user.role)) {
      if (isAdminHrManager(user)) {
        // Admin/HR LEAD/HOD sees full org-wide stats
        requestFilter = 'WHERE 1=1';
      } else {
        // Include own-dept requests AND cross-dept requests explicitly routed to their dept
        requestFilter = 'WHERE (pr.department_id = ? OR pr.routing_department_id = ?)';
        params.push(user.department_id, user.department_id);
      }
    } else if (user.role === ROLES.PROCUREMENT_OFFICER) {
      requestFilter = "WHERE pr.status IN ('PENDING_PROCUREMENT','PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL','PENDING_FINAL_FINANCE','COMPLETED')";
    } else if (user.role === ROLES.PROCUREMENT_COMMITTEE) {
      requestFilter = "WHERE pr.status IN ('PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL','COMPLETED')";
    } else {
      requestFilter = 'WHERE 1=1';
    }

    const [statusCounts] = await Promise.all([
      query(
        `SELECT status, COUNT(*) AS count 
         FROM proc_requests pr 
         ${requestFilter}
         GROUP BY status`,
        params
      )
    ]);

    const statusMap = {};
    statusCounts.forEach(r => { statusMap[r.status] = parseInt(r.count); });

    const [totalSpend] = await query(
      `SELECT COALESCE(SUM(pq.total_amount),0) AS total
       FROM proc_quotations pq
       JOIN proc_requests pr ON pq.request_id = pr.id
       WHERE pq.is_selected = TRUE AND pr.status = 'COMPLETED'
       ${requestFilter.replace('WHERE', 'AND')}`,
      params
    );

    // Only count requests this department actually approves — i.e. those whose
    // selected project is owned by it.
    const [pendingMine] = await query(
      `SELECT COUNT(*) AS count FROM proc_requests pr
       WHERE pr.status = 'PENDING_DEPT_APPROVAL'
         AND COALESCE(pr.routing_department_id, pr.department_id) = ?`,
      [user.department_id]
    );

    const recentRequests = await query(
      `SELECT pr.id, pr.request_code, pr.title, pr.status, pr.priority, pr.total_estimated_amount, pr.created_at,
        u.first_name, u.last_name
       FROM proc_requests pr
       JOIN users u ON pr.requester_id = u.id
       ${requestFilter}
       ORDER BY pr.created_at DESC LIMIT 5`,
      params
    );

    return {
      statusSummary: statusMap,
      totalCompleted: statusMap['COMPLETED'] || 0,
      totalPending: (statusMap['PENDING_DEPT_APPROVAL'] || 0) + (statusMap['PENDING_FINANCE_APPROVAL'] || 0),
      totalInProcurement: statusMap['PENDING_PROCUREMENT'] || 0,
      totalAwaitingCommittee: statusMap['PENDING_COMMITTEE'] || 0,
      totalFinalFinance: statusMap['PENDING_FINAL_FINANCE'] || 0,
      totalRejected: statusMap['REJECTED'] || 0,
      totalSpend: parseFloat(totalSpend?.total || 0),
      pendingDeptApproval: parseInt(pendingMine?.count || 0),
      recentRequests
    };
  }
}

module.exports = new ProcurementService();
module.exports.PROC_STATUS = PROC_STATUS;
