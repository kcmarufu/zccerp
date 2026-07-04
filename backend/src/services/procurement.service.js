/**
 * Procurement Service
 * Business logic for the full procurement lifecycle:
 * Draft → Dept Approval (HOP/Lead) → Procurement (upload quotations) → Committee (3 seats) → Final Finance → Completed
 */

const { query, transaction } = require('../config/database');
const { ROLES } = require('../config/roles');
const notificationService = require('./notification.service');

const PROC_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_DEPT_APPROVAL: 'PENDING_DEPT_APPROVAL',
  PENDING_FINANCE_APPROVAL: 'PENDING_FINANCE_APPROVAL',
  PENDING_PROCUREMENT: 'PENDING_PROCUREMENT',
  PENDING_COMMITTEE: 'PENDING_COMMITTEE',
  PENDING_FINAL_FINANCE: 'PENDING_FINAL_FINANCE',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
};

class ProcurementService {

  // ============================================================
  // PURCHASE REQUESTS
  // ============================================================

  async createPurchaseRequest(data, user) {
    return transaction(async (conn) => {
      const year = new Date().getFullYear();
      const [seq] = await conn.execute(
        'SELECT COUNT(*) + 1 AS seq FROM proc_requests WHERE YEAR(created_at) = ?',
        [year]
      );
      const requestCode = `PR-${year}-${String(seq[0].seq).padStart(5, '0')}`;

      const totalEstimated = (data.items || []).reduce((sum, item) => {
        return sum + ((item.quantity || 1) * (item.estimated_unit_price || 0));
      }, 0);

      // Cross-department routing: check if the selected project belongs to a different department
      let routingDepartmentId = null;
      if (data.project_id) {
        const [projRows] = await conn.execute(
          'SELECT department_id FROM projects WHERE id = ?',
          [data.project_id]
        );
        if (
          projRows.length > 0 &&
          projRows[0].department_id &&
          projRows[0].department_id !== user.department_id
        ) {
          routingDepartmentId = projRows[0].department_id;
        }
      }

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
      // HOPs and Program Leads see:
      //   1. Requests originating from their own department
      //   2. Cross-dept requests explicitly routed to their department (for approval)
      //   3. Any request they have personally acted on (history)
      where = `WHERE (
        pr.department_id = ? OR
        (pr.status = 'PENDING_DEPT_APPROVAL' AND pr.routing_department_id = ?) OR
        pr.id IN (SELECT DISTINCT pal.request_id FROM proc_approval_logs pal WHERE pal.actor_id = ?)
      )`;
      params.push(user.department_id, user.department_id, user.id);
    } else if (user.role === ROLES.PROCUREMENT_OFFICER) {
      // Procurement officer sees everything from finance-approved stage onwards + rejected
      where = "WHERE pr.status IN ('PENDING_PROCUREMENT','PENDING_COMMITTEE','PENDING_FINAL_FINANCE','COMPLETED','REJECTED')";
    } else if (user.role === ROLES.PROCUREMENT_COMMITTEE) {
      // Committee sees requests sent to them + completed/rejected for reference
      where = "WHERE pr.status IN ('PENDING_COMMITTEE','PENDING_FINAL_FINANCE','COMPLETED','REJECTED')";
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
        (SELECT COUNT(*) FROM proc_quotations q WHERE q.request_id = pr.id) AS quotation_count
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

    return transaction(async (conn) => {
      const totalEstimated = (data.items || []).reduce((sum, item) => {
        return sum + ((item.quantity || 1) * (item.estimated_unit_price || 0));
      }, 0);

      await conn.execute(
        `UPDATE proc_requests SET title=?, justification=?, donor_id=?, expected_delivery_date=?,
          priority=?, total_estimated_amount=?, updated_at=NOW() WHERE id=?`,
        [
          data.title || existing.title,
          data.justification || existing.justification,
          data.donor_id || existing.donor_id,
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
      await conn.execute(
        `UPDATE proc_requests SET status='PENDING_DEPT_APPROVAL', submitted_at=IF(submitted_at IS NULL, NOW(), submitted_at), rejection_reason=NULL, updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, ?, ?, 'PENDING_DEPT_APPROVAL', ?)`,
        [requestId, user.id, user.role,
          isResubmission ? 'RESUBMITTED' : 'SUBMITTED',
          existing.status,
          isResubmission ? 'Request resubmitted after revision' : 'Request submitted for approval'
        ]
      );
      return { success: true, _notif: { requestCode: existing.request_code, requesterId: user.id, deptId: existing.department_id, routingDeptId: existing.routing_department_id || null } };
    }).then(result => {
      if (result._notif) {
        const n = result._notif; delete result._notif;
        notificationService.onProcurementSubmitted(requestId, n.requestCode, n.requesterId, n.deptId, n.routingDeptId).catch(() => {});
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

    // Cross-department routing: enforce that the approver belongs to the project-owning department.
    if (user.role !== ROLES.ADMIN && req.routing_department_id) {
      if (req.routing_department_id !== user.department_id) {
        throw new Error('This cross-department request must be approved by the HOP/Lead of the project-owning department');
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

    return transaction(async (conn) => {
      // Mark the selected quotation
      if (selectedQuotationId) {
        await conn.execute('UPDATE proc_quotations SET is_selected=FALSE WHERE request_id=?', [requestId]);
        await conn.execute(
          'UPDATE proc_quotations SET is_selected=TRUE, selected_at=NOW(), selected_by=? WHERE id=? AND request_id=?',
          [user.id, selectedQuotationId, requestId]
        );
      }

      await conn.execute(
        `UPDATE proc_requests SET status='PENDING_COMMITTEE', procurement_assigned_at=NOW(), updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'SUBMITTED_TO_COMMITTEE', 'PENDING_PROCUREMENT', 'PENDING_COMMITTEE', ?)`,
        [requestId, user.id, user.role, comments || 'Submitted to procurement committee']
      );
      return { success: true };
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

    // Determine vote seat from user's department code (dept-based voting: one vote per dept)
    const [userRow] = await query(
      `SELECT d.department_code FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [user.id]
    );
    const seat = userRow?.department_code || null;

    // Required committee departments
    const REQUIRED_SEATS = ['HSD', 'CPJS', 'FOS'];

    if (user.role !== ROLES.ADMIN) {
      if (!seat) {
        throw new Error('Your account is not assigned to a department. Contact the system administrator.');
      }
      if (!REQUIRED_SEATS.includes(seat)) {
        throw new Error(`Only members of HSD, CPJS, or FOS departments are on the Procurement Committee.`);
      }
    }

    return transaction(async (conn) => {
      if (seat && REQUIRED_SEATS.includes(seat)) {
        // Check if this department has already voted (one vote per department)
        const [existingVote] = await conn.execute(
          'SELECT id, voter_id FROM proc_committee_votes WHERE request_id = ? AND committee_seat = ?',
          [requestId, seat]
        );

        if (existingVote.length > 0) {
          const originalVoterId = existingVote[0].voter_id;
          if (originalVoterId !== user.id) {
            // A different person from the same department already voted — block
            throw new Error(`Your department (${seat}) has already cast its vote. Each department gets one vote only.`);
          }
          // Same person — allow updating their own vote
          await conn.execute(
            `UPDATE proc_committee_votes SET vote = ?, justification = ?, voted_at = NOW()
             WHERE request_id = ? AND committee_seat = ?`,
            [decision, justification || null, requestId, seat]
          );
        } else {
          // First vote from this department — insert
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
           `[${seat}] ${decision}${justification ? ': ' + justification : ''}`]
        );
      }

      // Now check the current vote tally for this request
      const [allVotes] = await conn.execute(
        `SELECT committee_seat, vote FROM proc_committee_votes WHERE request_id = ?`,
        [requestId]
      );

      const voteMap = {};
      allVotes.forEach(v => { voteMap[v.committee_seat] = v.vote; });

      const votedSeats = Object.keys(voteMap);
      const approvedSeats = votedSeats.filter(s => voteMap[s] === 'APPROVED');
      const rejectedSeats = votedSeats.filter(s => voteMap[s] === 'REJECTED');
      const pendingSeats = REQUIRED_SEATS.filter(s => !voteMap[s]);

      // For ADMIN override — immediately advance
      if (user.role === ROLES.ADMIN && decision === 'APPROVED') {
        await conn.execute(
          `UPDATE proc_requests SET status='PENDING_FINAL_FINANCE', committee_reviewed_at=NOW(), updated_at=NOW() WHERE id=?`,
          [requestId]
        );
        await conn.execute(
          `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, 'COMMITTEE_APPROVED', 'PENDING_COMMITTEE', 'PENDING_FINAL_FINANCE', ?)`,
          [requestId, user.id, user.role, 'Admin override — forwarded to finance for final approval']
        );
        return { success: true, status: 'PENDING_FINAL_FINANCE', message: 'All committee members have approved. Forwarded to finance.' };
      }

      // All 3 required seats have voted APPROVED → advance to final finance
      const allApproved = REQUIRED_SEATS.every(s => voteMap[s] === 'APPROVED');
      if (allApproved) {
        await conn.execute(
          `UPDATE proc_requests SET status='PENDING_FINAL_FINANCE', committee_reviewed_at=NOW(), updated_at=NOW() WHERE id=?`,
          [requestId]
        );
        await conn.execute(
          `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, 'COMMITTEE_APPROVED', 'PENDING_COMMITTEE', 'PENDING_FINAL_FINANCE', ?)`,
          [requestId, user.id, user.role,
            'All 3 committee seats approved — forwarded to finance for final approval']
        );
        return {
          success: true,
          status: 'PENDING_FINAL_FINANCE',
          message: 'All 3 committee members have approved. Request forwarded to Finance for final approval.'
        };
      }

      // Not all approved yet — stay at PENDING_COMMITTEE
      // Build a status message showing who approved, who rejected, who hasn't voted
      const parts = [];
      if (approvedSeats.length) parts.push(`Approved: ${approvedSeats.join(', ')}`);
      if (rejectedSeats.length) parts.push(`Rejected: ${rejectedSeats.join(', ')} (can re-vote)`);
      if (pendingSeats.length) parts.push(`Pending: ${pendingSeats.join(', ')}`);

      return {
        success: true,
        status: 'PENDING_COMMITTEE',
        votedCount: approvedSeats.length,
        totalRequired: REQUIRED_SEATS.length,
        approvedSeats,
        rejectedSeats,
        pendingSeats,
        message: decision === 'REJECTED'
          ? `Vote recorded as REJECTED. The ${seat} seat can update this vote to Approve when ready. (${parts.join(' | ')})`
          : `Vote recorded (${approvedSeats.length}/3 approved). ${parts.join(' | ')}`
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

  async finalFinanceApproval(requestId, user, comments = '', popFilePath = null, popFileName = null, popFileSize = null) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_FINAL_FINANCE') {
      throw new Error('Request is not pending final finance approval');
    }
    if (![ROLES.FINANCE_CLERK, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Finance Clerk can give final approval');
    }
    if (!popFilePath) {
      throw new Error('Proof of Payment (POP) document must be uploaded before final approval');
    }

    return transaction(async (conn) => {
      await conn.execute(
        `UPDATE proc_requests SET status='COMPLETED', final_finance_approved_at=NOW(), completed_at=NOW(),
          pop_file_path=?, pop_file_name=?, pop_file_size=?, updated_at=NOW() WHERE id=?`,
        [popFilePath, popFileName, popFileSize, requestId]
      );
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
    if (req.status !== 'PENDING_PROCUREMENT') {
      throw new Error('Quotations can only be added when request is in procurement stage');
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
    if (rows[0].created_by !== user.id && user.role !== ROLES.ADMIN) {
      throw new Error('You can only delete your own quotations');
    }
    await query('DELETE FROM proc_quotations WHERE id = ?', [quotationId]);
    return { success: true };
  }

  async updateQuotation(quotationId, data, user) {
    const rows = await query('SELECT pq.*, pr.status as request_status FROM proc_quotations pq JOIN proc_requests pr ON pq.request_id = pr.id WHERE pq.id = ?', [quotationId]);
    if (!rows.length) throw new Error('Quotation not found');
    const quot = rows[0];
    if (quot.created_by !== user.id && user.role !== ROLES.ADMIN) {
      throw new Error('You can only edit your own quotations');
    }
    if (!['PENDING_PROCUREMENT', 'PENDING_COMMITTEE'].includes(quot.request_status)) {
      throw new Error('Quotations can only be edited while the request is in the procurement or committee-review stage');
    }
    await query(
      `UPDATE proc_quotations SET
        vendor_name=COALESCE(?,vendor_name), vendor_email=COALESCE(?,vendor_email), vendor_phone=COALESCE(?,vendor_phone),
        quotation_number=COALESCE(?,quotation_number), total_amount=COALESCE(?,total_amount),
        currency=COALESCE(?,currency), validity_date=COALESCE(?,validity_date),
        delivery_timeline=COALESCE(?,delivery_timeline), notes=COALESCE(?,notes), updated_at=NOW()
       WHERE id=?`,
      [
        data.vendor_name || null, data.vendor_email || null, data.vendor_phone || null,
        data.quotation_number || null, data.total_amount ? parseFloat(data.total_amount) : null,
        data.currency || null, data.validity_date || null, data.delivery_timeline || null,
        data.notes || null, quotationId
      ]
    );
    return { success: true };
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
      // Include own-dept requests AND cross-dept requests explicitly routed to their dept
      requestFilter = 'WHERE (pr.department_id = ? OR pr.routing_department_id = ?)';
      params.push(user.department_id, user.department_id);
    } else if (user.role === ROLES.PROCUREMENT_OFFICER) {
      requestFilter = "WHERE pr.status IN ('PENDING_PROCUREMENT','PENDING_COMMITTEE','PENDING_FINAL_FINANCE','COMPLETED')";
    } else if (user.role === ROLES.PROCUREMENT_COMMITTEE) {
      requestFilter = "WHERE pr.status IN ('PENDING_COMMITTEE','COMPLETED')";
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

    const [pendingMine] = await query(
      `SELECT COUNT(*) AS count FROM proc_requests pr
       WHERE pr.status = 'PENDING_DEPT_APPROVAL'
         AND (pr.department_id = ? OR pr.routing_department_id = ?)`,
      [user.department_id, user.department_id]
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
