/**
 * Leave Approval Service
 *
 * Single-stage role-based approval routing:
 *   GENERAL_USER / PROGRAM_LEAD / FINANCE_CLERK / PROCUREMENT_*
 *     → HEAD_OF_PROGRAMS of the requester's department
 *     → fallback to ADMIN when no HOP exists in that department
 *   HEAD_OF_PROGRAMS → any ADMIN
 *   ADMIN            → any other ADMIN (self-approval blocked)
 *
 * The service exposes:
 *   - resolveApprover(requester)         — for create-time validation / display
 *   - assertCanApprove(approver, ctx)    — for action-time guard
 *   - pendingForApproverWhereClause(...) — SQL fragment for list queries
 */

const { query } = require('../config/database');
const { ROLES } = require('../config/roles');

const NON_PRIVILEGED_ROLES = [
  ROLES.GENERAL_USER,
  ROLES.PROGRAM_LEAD,
  ROLES.FINANCE_CLERK,
  ROLES.PROCUREMENT_OFFICER,
  ROLES.PROCUREMENT_COMMITTEE,
];

/**
 * Does the given department have at least one active HOP?
 */
async function departmentHasHOP(departmentId) {
  if (!departmentId) return false;
  const rows = await query(
    `SELECT 1
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.department_id = ?
       AND r.role_name = ?
       AND u.is_active = TRUE
     LIMIT 1`,
    [departmentId, ROLES.HEAD_OF_PROGRAMS]
  );
  return rows.length > 0;
}

/**
 * Given the requester (role, dept), describe who must approve.
 * Returns: { approverRole, approverDepartmentId, excludeUserId, isFallback }
 */
async function resolveApprover({ userId, role, departmentId }) {
  if (role === ROLES.ADMIN) {
    return {
      approverRole: ROLES.ADMIN,
      approverDepartmentId: null,
      excludeUserId: userId,
      isFallback: false,
    };
  }

  if (role === ROLES.HEAD_OF_PROGRAMS) {
    return {
      approverRole: ROLES.ADMIN,
      approverDepartmentId: null,
      excludeUserId: null,
      isFallback: false,
    };
  }

  // All other roles route to HOP of their department.
  if (departmentId && (await departmentHasHOP(departmentId))) {
    return {
      approverRole: ROLES.HEAD_OF_PROGRAMS,
      approverDepartmentId: departmentId,
      excludeUserId: userId,
      isFallback: false,
    };
  }

  // No HOP in the dept (or no dept at all) → fall back to any ADMIN.
  return {
    approverRole: ROLES.ADMIN,
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

  const target = await resolveApprover(requester);

  // Approver must hold the required role.
  if (approver.role !== target.approverRole) {
    throw new Error(
      `This request requires approval by ${humanRole(target.approverRole)}`
    );
  }

  // Department match (only relevant for HOP approving non-privileged users).
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
function pendingForApproverWhereClause(approver) {
  if (!approver || !approver.role) {
    return { sql: '1 = 0', params: [] };
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
    case ROLES.HEAD_OF_PROGRAMS: return 'the Head of Programs of your department';
    case ROLES.ADMIN:            return 'a Super Admin';
    case ROLES.PROGRAM_LEAD:     return 'a Program Lead';
    default:                     return role;
  }
}

module.exports = {
  NON_PRIVILEGED_ROLES,
  resolveApprover,
  assertCanApprove,
  pendingForApproverWhereClause,
  departmentHasHOP,
};
