/**
 * Leave Approval Service
 *
 * Single-stage role-based approval routing:
 *   GENERAL_USER / FINANCE_CLERK / PROCUREMENT_*
 *     → the Department Lead OR the Head of Department of the requester's department
 *   PROGRAM_LEAD
 *     → the Head of Department of their department (a Lead does not approve a fellow Lead)
 *   either of the above → fallback to ADMIN when the department has no one to approve
 *   HEAD_OF_PROGRAMS → any ADMIN
 *   ADMIN            → any other ADMIN (self-approval blocked)
 *
 * On top of this table the HR Office (Super Admin, and the HOD/Lead of Admin &
 * HR) may approve any request but their own.
 *
 * The service exposes:
 *   - resolveApprover(requester)         — for create-time validation / display
 *   - assertCanApprove(approver, ctx)    — for action-time guard
 *   - pendingForApproverWhereClause(...) — SQL fragment for list queries
 */

const { query } = require('../config/database');
const { ROLES, hasFullHrAccess, hasDepartmentHrAccess } = require('../config/roles');

const NON_PRIVILEGED_ROLES = [
  ROLES.GENERAL_USER,
  ROLES.PROGRAM_LEAD,
  ROLES.FINANCE_CLERK,
  ROLES.PROCUREMENT_OFFICER,
  ROLES.PROCUREMENT_COMMITTEE,
];

/**
 * Does the given department have at least one active user in one of `roles`?
 */
async function departmentHasRole(departmentId, roles) {
  if (!departmentId || !roles.length) return false;
  const rows = await query(
    `SELECT 1
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.department_id = ?
       AND r.role_name IN (${roles.map(() => '?').join(', ')})
       AND u.is_active = TRUE
     LIMIT 1`,
    [departmentId, ...roles]
  );
  return rows.length > 0;
}

/** Does the given department have at least one active HOP? */
const departmentHasHOP = (departmentId) =>
  departmentHasRole(departmentId, [ROLES.HEAD_OF_PROGRAMS]);

/**
 * Given the requester (role, dept), describe who must approve.
 * Returns: { approverRoles, approverDepartmentId, excludeUserId, isFallback }
 */
async function resolveApprover({ userId, role, departmentId }) {
  if (role === ROLES.ADMIN) {
    return {
      approverRoles: [ROLES.ADMIN],
      approverDepartmentId: null,
      excludeUserId: userId,
      isFallback: false,
    };
  }

  if (role === ROLES.HEAD_OF_PROGRAMS) {
    return {
      approverRoles: [ROLES.ADMIN],
      approverDepartmentId: null,
      excludeUserId: null,
      isFallback: false,
    };
  }

  // A Lead's leave goes to their Head of Department; everyone else's may be
  // approved by either the Lead or the Head of their department.
  const deptRoles = role === ROLES.PROGRAM_LEAD
    ? [ROLES.HEAD_OF_PROGRAMS]
    : [ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS];

  if (departmentId && (await departmentHasRole(departmentId, deptRoles))) {
    return {
      approverRoles: deptRoles,
      approverDepartmentId: departmentId,
      excludeUserId: userId,
      isFallback: false,
    };
  }

  // Nobody to approve in the dept (or no dept at all) → fall back to any ADMIN.
  return {
    approverRoles: [ROLES.ADMIN],
    approverDepartmentId: null,
    excludeUserId: userId,
    isFallback: true,
  };
}

/**
 * Guard at approve/reject time. Throws on failure.
 *   approver    : { id, role, department_id }   (from req.user)
 *   requester   : { userId, role, departmentId } of the leave requester
 */
async function assertCanApprove(approver, requester) {
  if (!approver || !approver.role) {
    throw new Error('Authentication required');
  }
  if (!requester) {
    throw new Error('Requester context is required');
  }
  if (approver.id && requester.userId && approver.id === requester.userId) {
    throw new Error('You cannot approve your own leave request');
  }

  // The HR Office — Super Admin, and the HOP/Lead of Admin & HR — may approve
  // leave for any department. Everyone else follows the routing table below.
  if (hasFullHrAccess(approver)) {
    return;
  }

  const target = await resolveApprover(requester);

  // Approver must hold one of the required roles.
  if (!target.approverRoles.includes(approver.role)) {
    throw new Error(
      `This request requires approval by ${humanRoles(target.approverRoles)}`
    );
  }

  // Department match (only relevant for a Lead/HOP approving their own staff).
  if (target.approverDepartmentId
      && Number(approver.department_id) !== Number(target.approverDepartmentId)) {
    throw new Error('You can only approve leave from your own department');
  }

  // Self-exclusion (ADMIN approving another ADMIN).
  if (target.excludeUserId && approver.id === target.excludeUserId) {
    throw new Error('You cannot approve your own leave request');
  }
}

/**
 * Build a parameterised WHERE fragment + params for "PENDING requests that
 * this approver can act on". Returns { sql, params }.
 *
 * Intended to be appended to an existing WHERE clause.
 *   joins required: hr_leave_requests lr
 *                   JOIN hr_employees e ON lr.employee_id = e.id
 *                   LEFT JOIN users  req_u ON e.user_id  = req_u.id
 *                   LEFT JOIN roles  req_r ON req_u.role_id = req_r.id
 */
function pendingForApproverWhereClause(approver, scope = 'department') {
  if (!approver || !approver.role) {
    return { sql: '1 = 0', params: [] };
  }

  // ── HR Office (Super Admin / Admin & HR HOP or Lead) ────────────────────
  // Their queue defaults to their own department so day-to-day work stays
  // focused; 'all' opens it to every pending request in the organisation,
  // which is how they approve on another department's behalf. Their own
  // request never appears in either view.
  if (hasFullHrAccess(approver)) {
    if (scope === 'all') {
      return {
        sql: '(req_u.id IS NULL OR req_u.id <> ?)',
        params: [approver.id],
      };
    }

    // The Super Admin / General Secretary is not a departmental desk: the
    // department they sit in is incidental. Their own desk is the Heads of
    // Department — every department's Head routes leave to the GS — so that is
    // exactly what this view holds, whichever department each Head belongs to.
    // Staff leave stays with the staff's own Head; anything else the Super
    // Admin may act on (another Super Admin, a department with no Head) is
    // under 'all'.
    if (approver.role === ROLES.ADMIN) {
      return {
        sql: '(req_r.role_name = ? AND req_u.id <> ?)',
        params: [ROLES.HEAD_OF_PROGRAMS, approver.id],
      };
    }

    // The Admin & HR Lead/HOP *is* their department's desk, so theirs is the
    // ordinary department queue.
    return {
      sql: '(e.department_id = ? AND (req_u.id IS NULL OR req_u.id <> ?))',
      params: [approver.department_id, approver.id],
    };
  }

  // ── Department HOP/Lead (CPJS, FOS, HSD) ────────────────────────────────
  // Their own department only. Requests raised by a HOP or Admin route upward
  // to the HR Office instead, so they are excluded here — and a Lead does not
  // see a fellow Lead's request, which belongs to the Head of Department.
  if (hasDepartmentHrAccess(approver)) {
    const routedElsewhere = approver.role === ROLES.PROGRAM_LEAD
      ? [ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN, ROLES.PROGRAM_LEAD]
      : [ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN];
    return {
      sql: `(
        e.department_id = ?
        AND COALESCE(req_r.role_name, ?) NOT IN (${routedElsewhere.map(() => '?').join(', ')})
        AND (req_u.id IS NULL OR req_u.id <> ?)
      )`,
      params: [
        approver.department_id,
        ROLES.GENERAL_USER,
        ...routedElsewhere,
        approver.id,
      ],
    };
  }

  if (approver.role === ROLES.HEAD_OF_PROGRAMS) {
    return {
      sql: `(
        e.department_id = ?
        AND COALESCE(req_r.role_name, ?) NOT IN (?, ?)
        AND (req_u.id IS NULL OR req_u.id <> ?)
      )`,
      params: [
        approver.department_id,
        ROLES.GENERAL_USER,                 // default when employee has no user link
        ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN,
        approver.id,
      ],
    };
  }

  if (approver.role === ROLES.ADMIN) {
    return {
      sql: `(
        req_r.role_name = ?
        OR (req_r.role_name = ? AND req_u.id <> ?)
        OR (
          COALESCE(req_r.role_name, ?) NOT IN (?, ?)
          AND NOT EXISTS (
            SELECT 1 FROM users u2
            JOIN roles r2 ON u2.role_id = r2.id
            WHERE u2.department_id = e.department_id
              AND r2.role_name = ?
              AND u2.is_active = TRUE
          )
        )
      )`,
      params: [
        ROLES.HEAD_OF_PROGRAMS,
        ROLES.ADMIN, approver.id,
        ROLES.GENERAL_USER,
        ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN,
        ROLES.HEAD_OF_PROGRAMS,
      ],
    };
  }

  // Other roles cannot approve leave.
  return { sql: '1 = 0', params: [] };
}

function humanRole(role) {
  switch (role) {
    case ROLES.HEAD_OF_PROGRAMS: return 'the Head of Department of your department';
    case ROLES.ADMIN:            return 'a Super Admin';
    case ROLES.PROGRAM_LEAD:     return 'the Department Lead';
    default:                     return role;
  }
}

function humanRoles(roles) {
  if (roles.includes(ROLES.PROGRAM_LEAD) && roles.includes(ROLES.HEAD_OF_PROGRAMS)) {
    return 'the Department Lead or Head of Department of your department';
  }
  return roles.map(humanRole).join(' or ');
}

module.exports = {
  NON_PRIVILEGED_ROLES,
  resolveApprover,
  assertCanApprove,
  pendingForApproverWhereClause,
  departmentHasHOP,
  departmentHasRole,
};
