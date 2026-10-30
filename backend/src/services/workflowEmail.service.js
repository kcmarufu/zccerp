/**
 * Workflow Email Service
 * Who is emailed when. Email is reserved for approvals that involve the Heads
 * of Department and the General Secretary:
 *
 *   A Head of Department's float, purchase request, leave or reconciliation
 *     - submitted               → General Secretary
 *     - General Secretary approves → the Head of Department, and Finance's Head
 *                                 of Department for a float or reconciliation
 *     - resubmitted to Finance after Finance rejected it → Finance's Head of Department
 *     - reaches Finance's final approval (purchase request) → Finance's Head of Department
 *     - final approval or rejection → the Head of Department who raised it
 *
 *   A high-value purchase request, whoever raised it
 *     - awaiting approval       → General Secretary and Finance's Head of Department
 *     - one of them approves    → the other
 *     - one of them rejects     → the other
 *     - both approve            → Finance's Head of Department
 *
 * Everyone else keeps the in-app notifications only. Nobody is asked to act on
 * a request they raised or told about a decision they just made themselves.
 */

const { query } = require('../config/database');
const { ROLES, FINANCE_DEPT_CODE, isGsTrackRole } = require('../config/roles');
const emailService = require('./email.service');

const GS_JOB_TITLE = 'General Secretary';
const HIGH_VALUE = 'PENDING_HIGH_VALUE_APPROVAL';

const KINDS = {
  float: { label: 'float request', approvalsLink: '/finance/approvals', requesterLink: '/finance/requests' },
  reconciliation: { label: 'reconciliation', approvalsLink: '/finance/reconciliation', requesterLink: '/finance/reconciliation' }
};

const money = (amount) => `USD ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fullName = (row) => `${row.first_name} ${row.last_name}`;
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

class WorkflowEmailService {

  // ─────────────────────────────────────────────────────────────────
  // PEOPLE AND RECORDS
  // ─────────────────────────────────────────────────────────────────

  /**
   * The General Secretary is the Super Admin account titled as such; the other
   * Super Admin accounts are system and IT logins and get no workflow mail.
   */
  async _generalSecretary() {
    const rows = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email
         FROM users u JOIN roles r ON u.role_id = r.id
        WHERE r.role_name = ? AND u.job_title = ? AND u.is_active = 1`,
      [ROLES.ADMIN, GS_JOB_TITLE]
    );
    if (!rows.length) console.error('[WorkflowEmail] No active user is titled General Secretary');
    return rows;
  }

  async _financeHod() {
    const rows = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN departments d ON u.department_id = d.id
        WHERE r.role_name = ? AND d.department_code = ? AND u.is_active = 1`,
      [ROLES.HEAD_OF_PROGRAMS, FINANCE_DEPT_CODE]
    );
    if (!rows.length) console.error('[WorkflowEmail] Finance has no active Head of Department');
    return rows;
  }

  async _loadFloat(requestId) {
    const rows = await query(
      `SELECT r.request_code AS code, r.total_amount AS amount, r.justification AS purpose,
              u.id AS requester_id, u.first_name, u.last_name, u.email, rr.role_name AS requester_role,
              d.department_name
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN roles rr ON u.role_id = rr.id
         LEFT JOIN departments d ON r.department_id = d.id
        WHERE r.id = ?`,
      [requestId]
    );
    return rows[0] || null;
  }

  async _loadProcurement(requestId) {
    const rows = await query(
      `SELECT pr.request_code AS code, pr.total_estimated_amount AS amount, pr.title AS purpose,
              pr.status, pr.rejection_reason,
              (SELECT SUM(COALESCE(q.awarded_amount, q.total_amount)) FROM proc_quotations q
                WHERE q.request_id = pr.id AND q.is_selected = 1) AS awarded_amount,
              u.id AS requester_id, u.first_name, u.last_name, u.email, rr.role_name AS requester_role,
              d.department_name
         FROM proc_requests pr
         JOIN users u ON pr.requester_id = u.id
         JOIN roles rr ON u.role_id = rr.id
         LEFT JOIN departments d ON pr.department_id = d.id
        WHERE pr.id = ?`,
      [requestId]
    );
    return rows[0] || null;
  }

  async _loadLeave(leaveRequestId) {
    const rows = await query(
      `SELECT lr.status, lr.days_requested, lr.rejection_reason, lt.leave_name,
              DATE_FORMAT(lr.start_date, '%d %b %Y') AS start_date,
              DATE_FORMAT(lr.end_date, '%d %b %Y') AS end_date,
              u.id AS requester_id, u.first_name, u.last_name, u.email, rr.role_name AS requester_role,
              d.department_name,
              CONCAT(a.first_name, ' ', a.last_name) AS approver_name
         FROM hr_leave_requests lr
         JOIN hr_employees e ON lr.employee_id = e.id
         JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
         JOIN users u ON e.user_id = u.id
         JOIN roles rr ON u.role_id = rr.id
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN users a ON lr.approved_by = a.id
        WHERE lr.id = ?`,
      [leaveRequestId]
    );
    return rows[0] || null;
  }

  _baseDetails(record, kindLabel) {
    return [
      ['Type', capitalise(kindLabel)],
      ['Reference', record.code],
      ['Raised by', fullName(record)],
      ['Department', record.department_name],
      ['Amount', money(record.amount)],
      ['Purpose', record.purpose]
    ];
  }

  async _sendToAll(recipients, mail, excludeIds = []) {
    for (const person of recipients) {
      if (excludeIds.includes(person.id)) continue;
      await emailService.send({ ...mail, to: person.email });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // FLOATS AND RECONCILIATIONS
  // ─────────────────────────────────────────────────────────────────

  /** A Head of Department's float or reconciliation now waits on the General Secretary. */
  async floatSubmitted(kind, requestId) {
    const copy = KINDS[kind];
    const record = await this._loadFloat(requestId);
    if (!record || !isGsTrackRole(record.requester_role)) return;
    await this._sendToAll(await this._generalSecretary(), {
      subject: `For your approval: ${copy.label} ${record.code} from ${fullName(record)}`,
      heading: `A ${copy.label} needs your attention`,
      intro: `${fullName(record)} has submitted a ${copy.label} that seeks your attention. Please review it, then approve or reject it.`,
      details: this._baseDetails(record, copy.label),
      link: copy.approvalsLink
    }, [record.requester_id]);
  }

  /** The General Secretary approved: Finance's Head of Department is asked to act next. */
  async floatGsApproved(kind, requestId, approverName) {
    const copy = KINDS[kind];
    const record = await this._loadFloat(requestId);
    if (!record || !isGsTrackRole(record.requester_role)) return;
    await this._sendToAll(await this._financeHod(), {
      subject: `Approved by the General Secretary: ${copy.label} ${record.code}`,
      heading: `A ${copy.label} is ready for Finance`,
      intro: `${approverName} has approved this ${copy.label} at the General Secretary stage. Please check it, then approve or reject it.`,
      details: this._baseDetails(record, copy.label),
      link: copy.approvalsLink
    }, [record.requester_id]);
    await emailService.send({
      to: record.email,
      subject: `Your ${copy.label} ${record.code} was approved by the General Secretary`,
      heading: 'Approved by the General Secretary',
      intro: `${approverName} approved your ${copy.label}. It is now with Finance.`,
      details: this._baseDetails(record, copy.label),
      link: copy.requesterLink
    });
  }

  /** Finance rejected it, and the Head of Department amended it and sent it straight back. */
  async floatResubmittedToFinance(kind, requestId) {
    const copy = KINDS[kind];
    const record = await this._loadFloat(requestId);
    if (!record || !isGsTrackRole(record.requester_role)) return;
    await this._sendToAll(await this._financeHod(), {
      subject: `Resubmitted to Finance: ${copy.label} ${record.code}`,
      heading: `A ${copy.label} is back with Finance`,
      intro: `${fullName(record)} has amended and resubmitted this ${copy.label}. Please check it, then approve or reject it.`,
      details: this._baseDetails(record, copy.label),
      link: copy.approvalsLink
    }, [record.requester_id]);
  }

  /** Final decision, or a rejection at any stage: the Head of Department who raised it is told. */
  async floatDecided(kind, requestId, { approved, decidedBy, reason = null }) {
    const copy = KINDS[kind];
    const record = await this._loadFloat(requestId);
    if (!record || !isGsTrackRole(record.requester_role)) return;
    const outcome = approved ? 'approved' : 'rejected';
    await emailService.send({
      to: record.email,
      subject: `Your ${copy.label} ${record.code} was ${outcome}`,
      heading: `${capitalise(copy.label)} ${outcome}`,
      intro: `${decidedBy} ${outcome} your ${copy.label}.`,
      details: [...this._baseDetails(record, copy.label), ['Reason', reason]],
      link: copy.requesterLink
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // LEAVE
  // ─────────────────────────────────────────────────────────────────

  _leaveDetails(record) {
    return [
      ['Type', record.leave_name],
      ['Raised by', fullName(record)],
      ['Department', record.department_name],
      ['Dates', `${record.start_date} to ${record.end_date}`],
      ['Days', Number(record.days_requested)]
    ];
  }

  async leaveSubmitted(leaveRequestId) {
    const record = await this._loadLeave(leaveRequestId);
    if (!record || !isGsTrackRole(record.requester_role)) return;
    await this._sendToAll(await this._generalSecretary(), {
      subject: `For your approval: leave request from ${fullName(record)}`,
      heading: 'A leave request needs your attention',
      intro: `${fullName(record)} has submitted a leave request that seeks your attention. Please review it, then approve or reject it.`,
      details: this._leaveDetails(record),
      link: '/hr/leave'
    }, [record.requester_id]);
  }

  async leaveDecided(leaveRequestId) {
    const record = await this._loadLeave(leaveRequestId);
    if (!record || !isGsTrackRole(record.requester_role)) return;
    const outcome = record.status === 'APPROVED' ? 'approved' : 'rejected';
    await emailService.send({
      to: record.email,
      subject: `Your leave request was ${outcome}`,
      heading: `Leave request ${outcome}`,
      intro: `${record.approver_name} ${outcome} your leave request.`,
      details: [...this._leaveDetails(record), ['Reason', record.rejection_reason]],
      link: '/hr/leave'
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // PURCHASE REQUESTS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Called after any step on a purchase request, with the status it held before.
   * The status is what decides, because several routes lead to each stage: a
   * Committee vote, a Committee bypass and a resubmission all reach Finance.
   */
  async procurementStepTaken(requestId, previousStatus) {
    const record = await this._loadProcurement(requestId);
    if (!record) return;
    const [lastStep] = await query(
      `SELECT l.actor_id, l.action, l.comments, u.first_name, u.last_name
         FROM proc_approval_logs l JOIN users u ON l.actor_id = u.id
        WHERE l.request_id = ? ORDER BY l.id DESC LIMIT 1`,
      [requestId]
    );
    const actorId = lastStep?.actor_id;
    const actorName = lastStep ? fullName(lastStep) : 'The approver';
    const hodRequest = isGsTrackRole(record.requester_role);
    const wasHighValue = previousStatus === HIGH_VALUE;
    const label = wasHighValue || record.status === HIGH_VALUE ? 'high-value purchase request' : 'purchase request';
    const link = `/procurement/requests/${requestId}`;
    // Once a supplier is chosen the awarded value is the real amount; a split
    // award has several selected quotations, already summed by _loadProcurement.
    const details = this._baseDetails({ ...record, amount: record.awarded_amount ?? record.amount }, label);

    if (record.status === HIGH_VALUE && wasHighValue) {
      if (lastStep?.action === 'HIGH_VALUE_APPROVED') await this._highValueSeatApproved(requestId, record, actorName, actorId, details, link);
      return;
    }
    if (record.status === previousStatus) return;

    switch (record.status) {
      case 'PENDING_GS_APPROVAL':
        await this._sendToAll(await this._generalSecretary(), {
          subject: `For your approval: purchase request ${record.code} from ${fullName(record)}`,
          heading: 'A purchase request needs your attention',
          intro: `${fullName(record)} has submitted a purchase request that seeks your attention. Please review it, then approve or reject it.`,
          details, link
        }, [record.requester_id]);
        break;

      case 'PENDING_PROCUREMENT':
        if (previousStatus === 'PENDING_GS_APPROVAL') {
          await emailService.send({
            to: record.email,
            subject: `Your purchase request ${record.code} was approved by the General Secretary`,
            heading: 'Approved by the General Secretary',
            intro: `${actorName} approved your purchase request. It is now with Procurement.`,
            details, link
          });
        }
        break;

      case HIGH_VALUE: {
        const seats = [...await this._generalSecretary(), ...await this._financeHod()];
        await this._sendToAll(seats, {
          subject: `High-value approval needed: ${record.code}`,
          heading: 'A high-value purchase request needs your approval',
          intro: 'The Procurement Committee has recommended this request. It needs approval from both the General Secretary and Finance. Please review it, then approve or reject it.',
          details, link
        }, [record.requester_id]);
        break;
      }

      case 'PENDING_FINAL_FINANCE':
        if (hodRequest || wasHighValue) {
          await this._sendToAll(await this._financeHod(), {
            subject: `Ready for Finance: purchase request ${record.code}`,
            heading: 'A purchase request is ready for Finance',
            intro: wasHighValue
              ? 'The General Secretary and Finance have both approved this high-value request. Please check it, then give final approval or reject it.'
              : 'This Head of Department\'s purchase request has cleared Procurement. Please check it, then give final approval or reject it.',
            details, link
          }, [record.requester_id, actorId]);
        }
        if (hodRequest) {
          await emailService.send({
            to: record.email,
            subject: `Your purchase request ${record.code} is with Finance`,
            heading: 'Now with Finance',
            intro: 'Your purchase request has reached Finance for final approval.',
            details, link
          });
        }
        break;

      case 'COMPLETED':
        if (hodRequest) {
          await emailService.send({
            to: record.email,
            subject: `Your purchase request ${record.code} was approved`,
            heading: 'Purchase request approved',
            intro: `${actorName} gave final approval to your purchase request.`,
            details, link
          });
        }
        break;

      case 'REJECTED':
        await this._procurementRejected(record, { actorId, actorName, wasHighValue, hodRequest, details, link });
        break;

      default:
        break;
    }
  }

  async _highValueSeatApproved(requestId, record, actorName, actorId, details, link) {
    const approved = await query(
      `SELECT seat FROM proc_high_value_approvals WHERE request_id = ? AND decision = 'APPROVED'`,
      [requestId]
    );
    const gsHasApproved = approved.some((row) => row.seat === 'SUPER_ADMIN');
    await this._sendToAll(gsHasApproved ? await this._financeHod() : await this._generalSecretary(), {
      subject: `Your approval is still needed: ${record.code}`,
      heading: 'A high-value purchase request needs your approval',
      intro: `${actorName} has approved this high-value request. It cannot go further without your decision.`,
      details, link
    }, [actorId, record.requester_id]);
  }

  async _procurementRejected(record, { actorId, actorName, wasHighValue, hodRequest, details, link }) {
    const withReason = [...details, ['Reason', record.rejection_reason]];
    if (wasHighValue) {
      const seats = [...await this._generalSecretary(), ...await this._financeHod()];
      await this._sendToAll(seats, {
        subject: `High-value request rejected: ${record.code}`,
        heading: 'A high-value purchase request was rejected',
        intro: `${actorName} rejected this high-value request. No further approval is needed unless it is amended and resubmitted.`,
        details: withReason, link
      }, [actorId, record.requester_id]);
    }
    if (hodRequest) {
      await emailService.send({
        to: record.email,
        subject: `Your purchase request ${record.code} was rejected`,
        heading: 'Purchase request rejected',
        intro: `${actorName} rejected your purchase request.`,
        details: withReason, link
      });
    }
  }
}

module.exports = new WorkflowEmailService();
