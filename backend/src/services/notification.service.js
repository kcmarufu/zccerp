/**
 * Notification Service
 * Creates, fetches and marks notifications for all workflow events.
 */

const { query, pool } = require('../config/database');
const { FINANCE_DEPT_CODE } = require('../config/roles');
const workflowEmail = require('./workflowEmail.service');

class NotificationService {

  /**
   * Internal helper — insert one notification row.
   * Silent: never throws; logs on error.
   */
  async _create(userId, title, message, type = 'info', entityType = null, entityId = null, link = null) {
    try {
      await query(
        `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id, link, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [userId, title, message, type, entityType, entityId, link]
      );
    } catch (err) {
      console.error('[NotificationService] Failed to create notification:', err.message);
    }
  }

  /** Email goes out in the background; a failure is logged and goes no further. */
  _email(sending) {
    sending.catch((err) => console.error('[NotificationService] email error:', err.message));
  }

  /**
   * Notify all active users who have one of the given roles.
   * Optionally exclude excludeUserId.
   */
  async _notifyByRole(roles, title, message, type, entityType, entityId, link, excludeUserId = null) {
    try {
      const placeholders = roles.map(() => '?').join(', ');
      const params = [...roles];
      let sql = `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.role_name IN (${placeholders}) AND u.is_active = 1`;
      if (excludeUserId) {
        sql += ' AND u.id != ?';
        params.push(excludeUserId);
      }
      const recipients = await query(sql, params);
      for (const r of recipients) {
        await this._create(r.id, title, message, type, entityType, entityId, link);
      }
    } catch (err) {
      console.error('[NotificationService] Failed to notify by role:', err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // REQUEST WORKFLOW NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────

  /** Requester submitted a request — notify Program Leads of the approving dept + HOP */
  async onRequestSubmitted(requestId, requestCode, requesterId, departmentId, routingDepartmentId = null) {
    const link = `/finance/approvals`;
    const title = `New Float Request: ${requestCode}`;
    const isCrossDept = Boolean(routingDepartmentId && routingDepartmentId !== departmentId);
    const message = isCrossDept
      ? `A cross-department float request requires your approval (project assigned to your department).`
      : `A new float request requires your approval.`;
    // Notify Program Leads in the approving department
    // For cross-dept: use routing dept (project-owner's dept); otherwise requester's dept
    const notifyDeptId = (isCrossDept ? routingDepartmentId : departmentId);
    try {
      const leads = await query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.role_name = 'PROGRAM_LEAD' AND u.department_id = ? AND u.is_active = 1 AND u.id != ?`,
        [notifyDeptId, requesterId]
      );
      for (const u of leads) {
        await this._create(u.id, title, message, 'approval_pending', 'request', requestId, link);
      }
      // Notify HOP and Admin too
      await this._notifyByRole(
        ['HEAD_OF_PROGRAMS', 'ADMIN'],
        title, message, 'approval_pending', 'request', requestId, link, requesterId
      );
    } catch (err) {
      console.error('[NotificationService] onRequestSubmitted error:', err.message);
    }
  }

  /**
   * A Head of Department's float, purchase request or reconciliation is waiting
   * on the General Secretary. Only Super Admin accounts are told — no
   * departmental desk is involved at this stage.
   *
   * @param {'request'|'proc_request'|'reconciliation'} kind
   */
  async onRequestAwaitingGs(requestId, requestCode, requesterId, kind = 'request') {
    const copy = {
      request: {
        title: `Float Request for GS Approval: ${requestCode}`,
        message: 'A Head of Department has submitted a float request that requires your approval.',
        entityType: 'request', link: '/finance/approvals'
      },
      proc_request: {
        title: `Purchase Request for GS Approval: ${requestCode}`,
        message: 'A Head of Department has submitted a purchase request that requires your approval.',
        entityType: 'proc_request', link: `/procurement/requests/${requestId}`
      },
      reconciliation: {
        title: `Reconciliation for GS Review: ${requestCode}`,
        message: 'A Head of Department has submitted a reconciliation that requires your review.',
        entityType: 'request', link: '/finance/reconciliation'
      }
    }[kind];
    await this._notifyByRole(
      ['ADMIN'], copy.title, copy.message,
      kind === 'reconciliation' ? 'reconciliation_pending' : 'approval_pending',
      copy.entityType, requestId, copy.link, requesterId
    );
    // A purchase request is emailed from procurementStepTaken with its other steps.
    if (kind !== 'proc_request') {
      this._email(workflowEmail.floatSubmitted(kind === 'reconciliation' ? 'reconciliation' : 'float', requestId));
    }
  }

  /**
   * Requester amended a request that is already awaiting approval — tell the desk
   * holding it, so nobody approves a version they have not seen. Same routing as
   * onRequestSubmitted: the project-owning department for cross-department
   * requests, otherwise the requester's own department.
   */
  async onRequestAmended(requestId, requestCode, requesterId, departmentId, routingDepartmentId = null, gsOnly = false) {
    const link = `/finance/approvals`;
    const title = `Request Amended: ${requestCode}`;
    const message = `The requester has changed this float request while it is awaiting your approval. Please re-check the details before approving.`;
    const isCrossDept = Boolean(routingDepartmentId && routingDepartmentId !== departmentId);
    const notifyDeptId = (isCrossDept ? routingDepartmentId : departmentId);
    if (gsOnly) {
      // Awaiting the General Secretary — no departmental desk holds it.
      await this._notifyByRole(['ADMIN'], title, message, 'approval_pending', 'request', requestId, link, requesterId);
      return;
    }
    try {
      const leads = await query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.role_name = 'PROGRAM_LEAD' AND u.department_id = ? AND u.is_active = 1 AND u.id != ?`,
        [notifyDeptId, requesterId]
      );
      for (const u of leads) {
        await this._create(u.id, title, message, 'approval_pending', 'request', requestId, link);
      }
      await this._notifyByRole(
        ['HEAD_OF_PROGRAMS', 'ADMIN'],
        title, message, 'approval_pending', 'request', requestId, link, requesterId
      );
    } catch (err) {
      console.error('[NotificationService] onRequestAmended error:', err.message);
    }
  }

  /** Lead/HOP approved — notify requester + Finance */
  async onRequestLeadApproved(requestId, requestCode, requesterId, approverName) {
    const requesterLink = `/finance/requests`;
    const financeLink = `/finance/approvals`;
    await this._create(
      requesterId,
      `Request Approved: ${requestCode}`,
      `Your float request was approved by ${approverName} and is now with Finance.`,
      'success', 'request', requestId, requesterLink
    );
    await this._notifyByRole(
      ['FINANCE_CLERK', 'ADMIN'],
      `Float Request Ready: ${requestCode}`,
      `A float request has been approved and requires finance approval.`,
      'approval_pending', 'request', requestId, financeLink
    );
    this._email(workflowEmail.floatGsApproved('float', requestId, approverName));
  }

  /** Finance approved — notify requester + Admin */
  async onRequestFinanceApproved(requestId, requestCode, requesterId, approverName) {
    await this._create(
      requesterId,
      `Request Fully Approved: ${requestCode}`,
      `Your float request has been fully approved by Finance (${approverName}) and will be dispatched soon.`,
      'success', 'request', requestId, `/finance/requests`
    );
    await this._notifyByRole(
      ['ADMIN'],
      `Request Finance-Approved: ${requestCode}`,
      `Float request ${requestCode} has been fully approved by Finance (${approverName}).`,
      'success', 'request', requestId, `/finance/approvals`, requesterId
    );
    this._email(workflowEmail.floatDecided('float', requestId, { approved: true, decidedBy: approverName }));
  }

  /** Request rejected — notify requester + Admin */
  async onRequestRejected(requestId, requestCode, requesterId, rejectedBy, reason) {
    const msg = reason
      ? `Your float request was rejected by ${rejectedBy}. Reason: ${reason}`
      : `Your float request was rejected by ${rejectedBy}.`;
    await this._create(
      requesterId,
      `Request Rejected: ${requestCode}`,
      msg,
      'error', 'request', requestId, `/finance/requests`
    );
    await this._notifyByRole(
      ['ADMIN'],
      `Request Rejected: ${requestCode}`,
      `Float request ${requestCode} was rejected by ${rejectedBy}.`,
      'error', 'request', requestId, `/finance/approvals`, requesterId
    );
    this._email(workflowEmail.floatDecided('float', requestId, { approved: false, decidedBy: rejectedBy, reason }));
  }

  /** Request dispatched — notify requester + Admin */
  async onRequestDispatched(requestId, requestCode, requesterId) {
    await this._create(
      requesterId,
      `Float Dispatched: ${requestCode}`,
      `Your float has been dispatched. Please submit your reconciliation within 5 working days.`,
      'info', 'request', requestId, `/finance/reconciliation`
    );
    await this._notifyByRole(
      ['ADMIN'],
      `Float Dispatched: ${requestCode}`,
      `Float request ${requestCode} has been dispatched to the requester.`,
      'info', 'request', requestId, `/finance/approvals`, requesterId
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RECONCILIATION WORKFLOW NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────

  /** Requester submitted reconciliation — notify Finance + Program Leads + HOP */
  async onReconciliationSubmitted(requestId, requestCode, requesterId, departmentId, timeliness, routingDepartmentId = null) {
    const link = `/finance/reconciliation`;
    const lateNote = timeliness === 'LATE' ? ' (Late Submission)' : '';
    const title = `Reconciliation Submitted: ${requestCode}${lateNote}`;
    const message = `A reconciliation has been submitted and requires your review.`;
    const type = timeliness === 'LATE' ? 'error' : 'reconciliation_pending';
    // For cross-dept requests, notify leads of the project-owning department
    const isCrossDept = Boolean(routingDepartmentId && routingDepartmentId !== departmentId);
    const notifyDeptId = isCrossDept ? routingDepartmentId : departmentId;

    // Notify Program Leads in the approving department
    try {
      const leads = await query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.role_name = 'PROGRAM_LEAD' AND u.department_id = ? AND u.is_active = 1 AND u.id != ?`,
        [notifyDeptId, requesterId]
      );
      for (const u of leads) {
        await this._create(u.id, title, message, type, 'request', requestId, link);
      }
    } catch (err) { console.error('[NotificationService] recon leads error:', err.message); }

    // Notify HOP, Finance, Admin
    await this._notifyByRole(
      ['HEAD_OF_PROGRAMS', 'FINANCE_CLERK', 'ADMIN'],
      title, message, type, 'request', requestId, link, requesterId
    );
  }

  /** Lead approved reconciliation — notify requester + Finance */
  async onReconciliationLeadApproved(requestId, requestCode, requesterId, approverName) {
    await this._create(
      requesterId,
      `Reconciliation Under Finance Review: ${requestCode}`,
      `Your reconciliation was approved by ${approverName} and is now with Finance.`,
      'success', 'request', requestId, `/finance/reconciliation`
    );
    await this._notifyByRole(
      ['FINANCE_CLERK', 'ADMIN'],
      `Reconciliation Ready for Finance: ${requestCode}`,
      `A reconciliation has passed lead review and requires finance approval.`,
      'reconciliation_pending', 'request', requestId, `/finance/reconciliation`
    );
    this._email(workflowEmail.floatGsApproved('reconciliation', requestId, approverName));
  }

  /**
   * A reconciliation approval was undone. The requester is told because the
   * record they thought was settled is live again, and the desk it has landed
   * back on is told because it now has work it did not have a moment ago.
   */
  async onReconciliationReversed(requestId, requestCode, requesterId, approverName, stage) {
    const backWithFinance = stage === 'FINANCE';
    await this._create(
      requesterId,
      `Reconciliation Approval Undone: ${requestCode}`,
      `${approverName} undid an approval on your reconciliation. It is back with ${backWithFinance ? 'Finance' : 'your Department Lead'} for review.`,
      'warning', 'request', requestId, `/finance/reconciliation`
    );
    await this._notifyByRole(
      backWithFinance ? ['FINANCE_CLERK', 'ADMIN'] : ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'ADMIN'],
      `Reconciliation Returned for Review: ${requestCode}`,
      `An approval was undone by ${approverName}; this reconciliation needs reviewing again.`,
      'reconciliation_pending', 'request', requestId, `/finance/reconciliation`
    );
  }

  /** Reconciliation fully approved — notify requester + Admin */
  async onReconciliationApproved(requestId, requestCode, requesterId, approverName) {
    await this._create(
      requesterId,
      `Reconciliation Approved: ${requestCode}`,
      `Your reconciliation has been fully approved by ${approverName}. The process is complete.`,
      'success', 'request', requestId, `/finance/reconciliation`
    );
    await this._notifyByRole(
      ['ADMIN'],
      `Reconciliation Approved: ${requestCode}`,
      `Reconciliation for ${requestCode} has been fully approved by ${approverName}.`,
      'success', 'request', requestId, `/finance/reconciliation`, requesterId
    );
    this._email(workflowEmail.floatDecided('reconciliation', requestId, { approved: true, decidedBy: approverName }));
  }

  /** Reconciliation rejected — notify requester + Admin */
  async onReconciliationRejected(requestId, requestCode, requesterId, rejectedBy, reason) {
    const msg = reason
      ? `Your reconciliation was rejected by ${rejectedBy}. Reason: ${reason}`
      : `Your reconciliation was rejected by ${rejectedBy}. Please review and resubmit.`;
    await this._create(
      requesterId,
      `Reconciliation Rejected: ${requestCode}`,
      msg,
      'error', 'request', requestId, `/finance/reconciliation`
    );
    await this._notifyByRole(
      ['ADMIN'],
      `Reconciliation Rejected: ${requestCode}`,
      `Reconciliation for ${requestCode} was rejected by ${rejectedBy}.`,
      'error', 'request', requestId, `/finance/reconciliation`, requesterId
    );
    this._email(workflowEmail.floatDecided('reconciliation', requestId, { approved: false, decidedBy: rejectedBy, reason }));
  }

  // ─────────────────────────────────────────────────────────────────
  // PROCUREMENT WORKFLOW NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────

  /** Procurement request submitted for dept-level approval */
  async onProcurementSubmitted(requestId, requestCode, requesterId, departmentId, routingDepartmentId = null) {
    const link = `/procurement/requests/${requestId}`;
    const isCrossDept = Boolean(routingDepartmentId && routingDepartmentId !== departmentId);
    const title = `New Procurement Request: ${requestCode}`;
    const message = isCrossDept
      ? `A cross-department procurement request requires your approval (project assigned to your department).`
      : `A new procurement request requires your approval.`;
    const notifyDeptId = isCrossDept ? routingDepartmentId : departmentId;
    try {
      const leads = await query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.role_name = 'PROGRAM_LEAD' AND u.department_id = ? AND u.is_active = 1 AND u.id != ?`,
        [notifyDeptId, requesterId]
      );
      for (const u of leads) {
        await this._create(u.id, title, message, 'approval_pending', 'proc_request', requestId, link);
      }
      await this._notifyByRole(
        ['HEAD_OF_PROGRAMS', 'ADMIN'],
        title, message, 'approval_pending', 'proc_request', requestId, link, requesterId
      );
    } catch (err) {
      console.error('[NotificationService] onProcurementSubmitted error:', err.message);
    }
  }

  /**
   * A high-value procurement request has been recommended by the committee and
   * now needs both of its seats to approve: the Super Admin, and Finance's own
   * Lead / Head of Department. Both are notified at once — they approve
   * independently, in either order.
   *
   * The second seat used to follow the department that owned the project, so
   * the owning department id is no longer read.
   */
  /**
   * The Committee's award is in; the department that owns the project confirms
   * it before Finance. A Head of Department's request goes to the General
   * Secretary instead.
   */
  async onProcurementAwaitingDeptConfirmation(requestId, requestCode, requesterId, departmentId, gsTrack = false) {
    const link = `/procurement/requests/${requestId}`;
    const title = `Confirm Purchase Award: ${requestCode}`;
    const message = 'Procurement has awarded this purchase request. Check the award against what was requested and confirm it, or send it back.';
    try {
      if (gsTrack) {
        await this._notifyByRole(['ADMIN'], title, message, 'approval_pending', 'proc_request', requestId, link);
        return;
      }
      const approvers = await query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
          WHERE r.role_name IN ('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS') AND u.department_id = ? AND u.is_active = 1 AND u.id != ?`,
        [departmentId, requesterId]
      );
      for (const u of approvers) {
        await this._create(u.id, title, message, 'approval_pending', 'proc_request', requestId, link);
      }
    } catch (err) {
      console.error('[NotificationService] onProcurementAwaitingDeptConfirmation error:', err.message);
    }
  }

  /** A request sent back after the Committee, to Procurement or to its requester. */
  async onProcurementReturned(requestId, requestCode, requesterId, toProcurement, stage, reason) {
    const link = `/procurement/requests/${requestId}`;
    const title = `Purchase Request Returned: ${requestCode}`;
    const message = `Returned at ${stage} for amendment: ${String(reason || '').slice(0, 200)}. `
      + `Once resubmitted it comes back to ${stage}.`;
    try {
      if (toProcurement) {
        await this._notifyByRole(['PROCUREMENT_OFFICER'], title, message, 'request_rejected', 'proc_request', requestId, link);
      } else {
        await this._create(requesterId, title, message, 'request_rejected', 'proc_request', requestId, link);
      }
    } catch (err) {
      console.error('[NotificationService] onProcurementReturned error:', err.message);
    }
  }

  /** Finance has paid (part of) a purchase request; its float requisition is generated. */
  async onProcurementPaid(requestId, requestCode, requesterId, floatCode, completed) {
    const link = `/procurement/requests/${requestId}`;
    const title = completed ? `Purchase Request Paid: ${requestCode}` : `Payment Recorded: ${requestCode}`;
    const message = completed
      ? `Payment is complete. Float requisition ${floatCode || ''} has been generated and closed — no reconciliation is needed.`
      : `A payment batch has been recorded against float requisition ${floatCode || ''}. The balance will be paid in further batches.`;
    try {
      await this._create(requesterId, title, message, 'request_approved', 'proc_request', requestId, link);
    } catch (err) {
      console.error('[NotificationService] onProcurementPaid error:', err.message);
    }
  }

  async onProcurementHighValuePending(requestId, requestCode, amount) {
    const link = `/procurement/requests/${requestId}`;
    const title = `High-Value Approval Needed: ${requestCode}`;
    const message = `The Procurement Committee has recommended this USD ${Number(amount || 0).toFixed(2)} request. ` +
                    `It needs approval from both the Super Admin and the Finance Head of Department.`;
    try {
      await this._notifyByRole(['ADMIN'], title, message, 'approval_pending', 'proc_request', requestId, link);
      const financeApprovers = await query(
        `SELECT u.id FROM users u
           JOIN roles r ON u.role_id = r.id
           JOIN departments d ON u.department_id = d.id
          WHERE r.role_name = 'HEAD_OF_PROGRAMS'
            AND d.department_code = ? AND u.is_active = 1`,
        [FINANCE_DEPT_CODE]
      );
      for (const u of financeApprovers) {
        await this._create(u.id, title, message, 'approval_pending', 'proc_request', requestId, link);
      }
    } catch (err) {
      console.error('[NotificationService] onProcurementHighValuePending error:', err.message);
    }
  }

  /**
   * The requester changed a purchase request while it waits at the first
   * approval desk. The desk is told so it re-checks before approving.
   */
  async onProcurementAmended(requestId, requestCode, requesterId, departmentId, routingDepartmentId = null, gsOnly = false) {
    const link = `/procurement/requests/${requestId}`;
    const title = `Purchase Request Amended: ${requestCode}`;
    const message = 'The requester has changed this purchase request while it is awaiting your approval. Please re-check the details before approving.';
    try {
      if (gsOnly) {
        await this._notifyByRole(['ADMIN'], title, message, 'approval_pending', 'proc_request', requestId, link, requesterId);
        return;
      }
      const notifyDeptId = routingDepartmentId || departmentId;
      const managers = await query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
          WHERE r.role_name IN ('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS') AND u.department_id = ? AND u.is_active = 1 AND u.id != ?`,
        [notifyDeptId, requesterId]
      );
      for (const u of managers) {
        await this._create(u.id, title, message, 'approval_pending', 'proc_request', requestId, link);
      }
    } catch (err) {
      console.error('[NotificationService] onProcurementAmended error:', err.message);
    }
  }

  /**
   * Finance approved a purchase request for payment. The requester learns the
   * funds are reserved; the approver is reminded the proof of payment is due.
   */
  async onProcurementApprovedForPayment(requestId, requestCode, requesterId, approverId, popDueAt, reservedUntil) {
    const link = `/procurement/requests/${requestId}`;
    const due = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    try {
      await this._create(
        requesterId, `Approved for Payment: ${requestCode}`,
        `Finance has approved your purchase request. The funds are reserved on the budget until ${due(reservedUntil)} while Finance processes the payment.`,
        'request_approved', 'proc_request', requestId, link
      );
      if (approverId && Number(approverId) !== Number(requesterId)) {
        await this._create(
          approverId, `Proof of Payment Due: ${requestCode}`,
          `You approved this purchase request. Attach the proof of payment by ${due(popDueAt)} (5 working days) — until you do, you cannot approve other purchase requests after that date.`,
          'approval_pending', 'proc_request', requestId, link
        );
      }
    } catch (err) {
      console.error('[NotificationService] onProcurementApprovedForPayment error:', err.message);
    }
  }

  /**
   * An approved request was not dispatched / paid within its 10-working-day
   * reservation: it was rejected automatically and the funds released.
   * kind = 'request' (float) or 'proc_request'.
   */
  async onReservationExpired(requestId, requestCode, requesterId, kind = 'request', approverId = null) {
    const link = kind === 'proc_request' ? `/procurement/requests/${requestId}` : `/finance/requests/${requestId}`;
    const what = kind === 'proc_request' ? 'purchase request' : 'float requisition';
    const title = `Automatically Rejected: ${requestCode}`;
    const message = `Your ${what} was approved but not ${kind === 'proc_request' ? 'paid' : 'dispatched'} within 10 working days, so it was rejected automatically and its reserved funds were released. You can amend and resubmit it.`;
    try {
      await this._create(requesterId, title, message, 'request_rejected', kind, requestId, link);
      if (approverId && Number(approverId) !== Number(requesterId)) {
        await this._create(
          approverId, title,
          `The ${what} you approved was not ${kind === 'proc_request' ? 'paid' : 'dispatched'} within 10 working days. It was rejected automatically and its reserved funds released.`,
          'request_rejected', kind, requestId, link
        );
      }
    } catch (err) {
      console.error('[NotificationService] onReservationExpired error:', err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // QUERY METHODS
  // ─────────────────────────────────────────────────────────────────

  /** Get recent notifications for a user (latest 50, unread first) */
  async getForUser(userId) {
    return await query(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY is_read ASC, created_at DESC LIMIT 50`,
      [userId]
    );
  }

  /** Count unread notifications for a user */
  async getUnreadCount(userId) {
    const rows = await query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
    return rows[0]?.count || 0;
  }

  /** Mark a single notification as read */
  async markRead(notifId, userId) {
    await query(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [notifId, userId]
    );
  }

  /** Mark all notifications as read for a user */
  async markAllRead(userId) {
    await query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
  }
}

module.exports = new NotificationService();
