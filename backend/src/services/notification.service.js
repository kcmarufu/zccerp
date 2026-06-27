/**
 * Notification Service
 * Creates, fetches and marks notifications for all workflow events.
 */

const { query, pool } = require('../config/database');

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
