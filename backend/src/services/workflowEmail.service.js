/**
 * Workflow Email Service
 * Who is emailed when. Emails go to the people who must act on a request, and
 * to the person who raised it when it is decided. The in-app notifications
 * reach wider audiences; email deliberately does not, to keep within the
 * monthly sending allowance (see email.service for the caps).
 *
 * Approvers — "a request is on your desk"
 *   - Float, reconciliation, purchase request or purchase award waiting at the
 *     department stage → the Department Lead(s) and Head of Department of the
 *     department that owns it (the project's department for cross-department work)
 *   - Leave → whoever the leave routing names (Lead/HOD of the department, or
 *     the General Secretary)
 *   - A Head of Department's work → the General Secretary, then Finance's HOD
 *   - High-value purchase requests → the General Secretary and Finance's HOD
 *   The Finance and Procurement desks keep in-app notifications only.
 *
 * Requesters — "your request was decided"
 *   - Float: finally approved, rejected, dispatched, or auto-rejected unpaid
 *   - Reconciliation: approved or rejected
 *   - Leave: approved or rejected
 *   - Purchase request: rejected / returned, approved for payment, paid
 *
 * Nobody is asked to act on a request they raised or told about a decision
 * they just made themselves.
 */

const { query } = require('../config/database');
const { ROLES, FINANCE_DEPT_CODE, isGsTrackRole } = require('../config/roles');
const leaveApproval = require('./leaveApproval.service');
const emailService = require('./email.service');

const GS_JOB_TITLE = 'General Secretary';
const HIGH_VALUE = 'PENDING_HIGH_VALUE_APPROVAL';
const DEPT_DESK_ROLES = [ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS];

// Float statuses at which the department (Lead / HOD) holds the request.
const FLOAT_DEPT_DESK = ['PENDING_LEAD_APPROVAL', 'PENDING_ADMIN_APPROVAL', 'PENDING_HOP_APPROVAL'];
const RECON_DEPT_DESK = ['RECON_PENDING_LEAD'];

const KINDS = {
  float: { label: 'float request', approvalsLink: '/finance/approvals', requesterLink: (id) => `/finance/requests/${id}` },
  reconciliation: { label: 'reconciliation', approvalsLink: '/finance/reconciliation', requesterLink: () => '/finance/reconciliation' }
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

  /** Active users of a department holding one of the given roles. */
  async _departmentDesk(departmentId, roles = DEPT_DESK_ROLES) {
    if (!departmentId || !roles.length) return [];
    return query(
      `SELECT u.id, u.first_name, u.last_name, u.email
         FROM users u JOIN roles r ON u.role_id = r.id
        WHERE u.department_id = ? AND r.role_name IN (${roles.map(() => '?').join(', ')}) AND u.is_active = 1`,
      [departmentId, ...roles]
    );
  }

  async _loadFloat(requestId) {
    const rows = await query(
      `SELECT r.id, r.request_code AS code, r.total_amount AS amount, r.justification AS purpose,
              r.status, r.department_id, r.routing_department_id, r.source_proc_request_id,
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
      `SELECT pr.id, pr.request_code AS code, pr.total_estimated_amount AS amount, pr.title AS purpose,
              pr.status, pr.rejection_reason, pr.returned_to, pr.department_id, pr.routing_department_id,
              (SELECT SUM(COALESCE(q.awarded_amount, q.total_amount)) FROM proc_quotations q
                WHERE q.request_id = pr.id AND q.is_selected = 1) AS awarded_amount,
              (SELECT GROUP_CONCAT(DISTINCT q.vendor_name ORDER BY q.vendor_name SEPARATOR ', ') FROM proc_quotations q
                WHERE q.request_id = pr.id AND q.is_selected = 1) AS suppliers,
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
              e.department_id AS employee_department_id,
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

  /** One email per person, however many of the lists they appear on. */
  async _sendToAll(recipients, mail, excludeIds = []) {
    const seen = new Set(excludeIds.filter(Boolean).map(Number));
    for (const person of recipients) {
      if (seen.has(Number(person.id))) continue;
      seen.add(Number(person.id));
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
      tone: 'action',
      intro: `${fullName(record)} has submitted a ${copy.label} that seeks your attention. Please review it, then approve or reject it.`,
      details: this._baseDetails(record, copy.label),
      link: copy.approvalsLink
    }, [record.requester_id]);
  }

  /**
   * A staff member's float or reconciliation is waiting at the department
   * stage: its Lead(s) and Head of Department are asked to act. Read after the
   * submission commits, so the status says which desk really holds it.
   */
  async floatAtDepartmentDesk(kind, requestId) {
    const copy = KINDS[kind];
    const record = await this._loadFloat(requestId);
    if (!record || record.source_proc_request_id || isGsTrackRole(record.requester_role)) return;
    const deskStatuses = kind === 'reconciliation' ? RECON_DEPT_DESK : FLOAT_DEPT_DESK;
    if (!deskStatuses.includes(record.status)) return;
    const desk = await this._departmentDesk(record.routing_department_id || record.department_id);
    await this._sendToAll(desk, {
      subject: `For your approval: ${copy.label} ${record.code} from ${fullName(record)}`,
      heading: `A ${copy.label} is on your desk`,
      tone: 'action',
      intro: `${fullName(record)} has submitted a ${copy.label} that is waiting for your department's approval. Please review it, then approve or reject it.`,
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
      tone: 'action',
      intro: `${approverName} has approved this ${copy.label} at the General Secretary stage. Please check it, then approve or reject it.`,
      details: this._baseDetails(record, copy.label),
      link: copy.approvalsLink
    }, [record.requester_id]);
    await emailService.send({
      to: record.email,
      subject: `Your ${copy.label} ${record.code} was approved by the General Secretary`,
      heading: 'Approved by the General Secretary',
      tone: 'approved',
      intro: `${approverName} approved your ${copy.label}. It is now with Finance.`,
      details: this._baseDetails(record, copy.label),
      link: copy.requesterLink(requestId)
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
      tone: 'action',
      intro: `${fullName(record)} has amended and resubmitted this ${copy.label}. Please check it, then approve or reject it.`,
      details: this._baseDetails(record, copy.label),
      link: copy.approvalsLink
    }, [record.requester_id]);
  }

  /** Final approval, or a rejection at any stage: whoever raised it is told. */
  async floatDecided(kind, requestId, { approved, decidedBy, reason = null }) {
    const copy = KINDS[kind];
    const record = await this._loadFloat(requestId);
    // A float generated from a purchase request is reported through the purchase request.
    if (!record || record.source_proc_request_id) return;
    const outcome = approved ? 'approved' : 'rejected';
    const next = !approved
      ? (kind === 'reconciliation'
        ? ' Please correct it and resubmit it. A rejected reconciliation left uncorrected for more than 3 working days blocks new float and purchase requests.'
        : ' You can amend it and resubmit it.')
      : (kind === 'float' ? ' Finance will dispatch it shortly.' : ' The process is complete.');
    await emailService.send({
      to: record.email,
      subject: `Your ${copy.label} ${record.code} was ${outcome}`,
      heading: `${capitalise(copy.label)} ${outcome}`,
      tone: approved ? 'approved' : 'rejected',
      intro: `${decidedBy} ${outcome} your ${copy.label}.${next}`,
      details: [...this._baseDetails(record, copy.label), ['Reason', reason]],
      link: copy.requesterLink(requestId)
    });
  }

  /** Finance dispatched the float: the requester is told, with the reconciliation deadline. */
  async floatDispatched(requestId) {
    const record = await this._loadFloat(requestId);
    if (!record || record.source_proc_request_id) return;
    await emailService.send({
      to: record.email,
      subject: `Your float ${record.code} has been dispatched`,
      heading: 'Float dispatched',
      tone: 'info',
      intro: 'Finance has dispatched your float. Please submit your reconciliation within 5 working days.',
      details: this._baseDetails(record, 'float request'),
      link: '/finance/reconciliation'
    });
  }

  /** An approved float or purchase request was not paid in time and was rejected automatically. */
  async reservationExpired(kind, requestId) {
    const isProc = kind === 'proc_request';
    const record = isProc ? await this._loadProcurement(requestId) : await this._loadFloat(requestId);
    if (!record || (!isProc && record.source_proc_request_id)) return;
    const label = isProc ? 'purchase request' : 'float request';
    await emailService.send({
      to: record.email,
      subject: `Your ${label} ${record.code} was rejected automatically`,
      heading: `${capitalise(label)} rejected automatically`,
      tone: 'rejected',
      intro: `Your ${label} was approved but not ${isProc ? 'paid' : 'dispatched'} within 10 working days, so it was rejected automatically and its reserved funds were released. You can amend it and resubmit it.`,
      details: this._baseDetails(record, label),
      link: isProc ? `/procurement/requests/${requestId}` : `/finance/requests/${requestId}`
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

  /** Whoever the leave routing names as approver: department Lead/HOD, or the General Secretary. */
  async _leaveApprovers(record) {
    if (isGsTrackRole(record.requester_role)) return this._generalSecretary();
    const target = await leaveApproval.resolveApprover({
      userId: record.requester_id,
      role: record.requester_role,
      departmentId: record.employee_department_id
    });
    if (target.approverDepartmentId) return this._departmentDesk(target.approverDepartmentId, target.approverRoles);
    return target.approverRoles.includes(ROLES.ADMIN) ? this._generalSecretary() : [];
  }

  async leaveSubmitted(leaveRequestId) {
    const record = await this._loadLeave(leaveRequestId);
    if (!record) return;
    await this._sendToAll(await this._leaveApprovers(record), {
      subject: `For your approval: leave request from ${fullName(record)}`,
      heading: 'A leave request is on your desk',
      tone: 'action',
      intro: `${fullName(record)} has submitted a leave request that is waiting for your approval. Please review it, then approve or reject it.`,
      details: this._leaveDetails(record),
      link: '/hr/leave'
    }, [record.requester_id]);
  }

  async leaveDecided(leaveRequestId) {
    const record = await this._loadLeave(leaveRequestId);
    if (!record || !['APPROVED', 'REJECTED'].includes(record.status)) return;
    const outcome = record.status === 'APPROVED' ? 'approved' : 'rejected';
    await emailService.send({
      to: record.email,
      subject: `Your leave request was ${outcome}`,
      heading: `Leave request ${outcome}`,
      tone: record.status === 'APPROVED' ? 'approved' : 'rejected',
      intro: `${record.approver_name || 'Your approver'} ${outcome} your leave request.`,
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
    const ownerDeptId = record.routing_department_id || record.department_id;
    // Once a supplier is chosen the awarded value is the real amount; a split
    // award has several selected quotations, already summed by _loadProcurement.
    const details = [
      ...this._baseDetails({ ...record, amount: record.awarded_amount ?? record.amount }, label),
      ['Supplier', record.suppliers]
    ];

    if (record.status === HIGH_VALUE && wasHighValue) {
      if (lastStep?.action === 'HIGH_VALUE_APPROVED') await this._highValueSeatApproved(requestId, record, actorName, actorId, details, link);
      return;
    }
    if (record.status === previousStatus) return;

    switch (record.status) {
      case 'PENDING_DEPT_APPROVAL':
        await this._sendToAll(await this._departmentDesk(ownerDeptId), {
          subject: `For your approval: purchase request ${record.code} from ${fullName(record)}`,
          heading: 'A purchase request is on your desk',
          tone: 'action',
          intro: `${fullName(record)} has submitted a purchase request that is waiting for your department's approval. Please review it, then approve or reject it.`,
          details, link
        }, [record.requester_id]);
        break;

      case 'PENDING_GS_APPROVAL':
        await this._sendToAll(await this._generalSecretary(), {
          subject: `For your approval: purchase request ${record.code} from ${fullName(record)}`,
          heading: 'A purchase request needs your attention',
          tone: 'action',
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
            tone: 'approved',
            intro: `${actorName} approved your purchase request. It is now with Procurement.`,
            details, link
          });
        }
        break;

      case 'PENDING_DEPT_CONFIRMATION':
        await this._sendToAll(hodRequest ? await this._generalSecretary() : await this._departmentDesk(ownerDeptId), {
          subject: `Confirm the purchase award: ${record.code}`,
          heading: 'A purchase award is waiting for your confirmation',
          tone: 'action',
          intro: 'Procurement has awarded this purchase request. Please check the award against what was requested, then confirm it or send it back.',
          details, link
        }, [record.requester_id, actorId]);
        break;

      case HIGH_VALUE: {
        const seats = [...await this._generalSecretary(), ...await this._financeHod()];
        await this._sendToAll(seats, {
          subject: `High-value approval needed: ${record.code}`,
          heading: 'A high-value purchase request needs your approval',
          tone: 'action',
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
            tone: 'action',
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
            tone: 'info',
            intro: 'Your purchase request has reached Finance for final approval.',
            details, link
          });
        }
        break;

      case 'PENDING_PAYMENT':
        if (previousStatus === 'PENDING_FINAL_FINANCE') {
          await emailService.send({
            to: record.email,
            subject: `Your purchase request ${record.code} was approved for payment`,
            heading: 'Approved for payment',
            tone: 'approved',
            intro: `${actorName} approved your purchase request for payment. Finance will now pay the supplier.`,
            details, link
          });
        }
        break;

      case 'COMPLETED':
        await emailService.send({
          to: record.email,
          subject: previousStatus === 'PENDING_PAYMENT'
            ? `Your purchase request ${record.code} has been paid`
            : `Your purchase request ${record.code} was approved and paid`,
          heading: previousStatus === 'PENDING_PAYMENT' ? 'Supplier paid' : 'Purchase request approved',
          tone: 'approved',
          intro: (previousStatus === 'PENDING_PAYMENT'
            ? 'Finance has completed payment for your purchase request.'
            : `${actorName} gave final approval to your purchase request and the supplier has been paid.`)
            + ' Once you have received the goods or service, please rate the supplier on the request page.',
          details, link
        });
        break;

      case 'REJECTED':
        await this._procurementRejected(record, { actorId, actorName, wasHighValue, details, link });
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
      tone: 'action',
      intro: `${actorName} has approved this high-value request. It cannot go further without your decision.`,
      details, link
    }, [actorId, record.requester_id]);
  }

  async _procurementRejected(record, { actorId, actorName, wasHighValue, details, link }) {
    const withReason = [...details, ['Reason', record.rejection_reason]];
    if (wasHighValue) {
      const seats = [...await this._generalSecretary(), ...await this._financeHod()];
      await this._sendToAll(seats, {
        subject: `High-value request rejected: ${record.code}`,
        heading: 'A high-value purchase request was rejected',
        tone: 'rejected',
        intro: `${actorName} rejected this high-value request. No further approval is needed unless it is amended and resubmitted.`,
        details: withReason, link
      }, [actorId, record.requester_id]);
    }
    if (Number(actorId) === Number(record.requester_id)) return;
    const returned = record.returned_to === 'REQUESTER';
    await emailService.send({
      to: record.email,
      subject: returned
        ? `Your purchase request ${record.code} was returned to you`
        : `Your purchase request ${record.code} was rejected`,
      heading: returned ? 'Purchase request returned for amendment' : 'Purchase request rejected',
      tone: 'rejected',
      intro: returned
        ? `${actorName} sent your purchase request back to you to amend. Once you resubmit it, it returns to the same stage.`
        : `${actorName} rejected your purchase request. You can amend it and resubmit it.`,
      details: withReason, link
    });
  }
}

module.exports = new WorkflowEmailService();
