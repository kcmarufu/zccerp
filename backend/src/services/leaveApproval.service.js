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
 * There is no override: the HR Office (Admin & HR HOD/Lead) and the Super
 * Admin follow the same table as everyone else (user decision 2026-11-17).
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
 *
 * One routing table, applied to everyone (user decision 2026-11-17 — there is
 * no HR Office override any more):
 *   staff  → the Lead or HOD of their own department
 *   Lead   → the HOD of their own department only
 *   HOD    → a Super Admin
 *   Admin  → another Super Admin
 *   (a department with nobody to approve falls back to a Super Admin)
 */
async function assertCanApprove(approver, requester) {
  if (!approver || !approver.role) {
    throw new Error('Authentication required');
  }
  if (!requester) {
    throw new Error('Requester context is required');
  }
  if (approver.id && requester.userId && Number(approver.id) === Number(requester.userId)) {
    throw new Error('You cannot approve your own leave request');
  }

  const target = await resolveApprover(requester);

  // Approver must hold one of the required roles.
  if (!target.approverRoles.includes(approver.role)) {
    throw new Error(
      `This request requires approval by ${humanRoles(target.approverRoles)}`
    );
  }

  // Department match (a Lead/HOD approves only their own department).
  if (target.approverDepartmentId
      && Number(approver.department_id) !== Number(target.approverDepartmentId)) {
    throw new Error('You can only approve leave from your own department');
  }

  // Self-exclusion (ADMIN approving another ADMIN).
  if (target.excludeUserId && Number(approver.id) === Number(target.excludeUserId)) {
    throw new Error('You cannot approve your own leave request');
  }
}

/**
 * Build a parameterised WHERE fragment + params for "PENDING requests that
 * this approver can act on". Returns { sql, params }. Mirrors
 * resolveApprover/assertCanApprove exactly, so the queue never offers a
 * request the approve call would refuse. `scope` is accepted for backward
 * compatibility and ignored: nobody approves outside the routing table.
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

  const reqRole = 'COALESCE(req_r.role_name, ?)';   // no user link → ordinary staff
  const notMe   = '(req_u.id IS NULL OR req_u.id <> ?)';

  // ── Department Lead: own department's staff (not Leads, HODs or Admins) ──
  if (approver.role === ROLES.PROGRAM_LEAD) {
    if (!approver.department_id) return { sql: '1 = 0', params: [] };
    return {
      sql: `(e.department_id = ? AND ${reqRole} NOT IN (?, ?, ?) AND ${notMe})`,
      params: [
        approver.department_id, ROLES.GENERAL_USER,
        ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN,
        approver.id,
      ],
    };
  }

  // ── Head of Department: own department's staff and Leads ────────────────
  if (approver.role === ROLES.HEAD_OF_PROGRAMS) {
    if (!approver.department_id) return { sql: '1 = 0', params: [] };
    return {
      sql: `(e.department_id = ? AND ${reqRole} NOT IN (?, ?) AND ${notMe})`,
      params: [
        approver.department_id, ROLES.GENERAL_USER,
        ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN,
        approver.id,
      ],
    };
  }

  // ── Super Admin: every HOD, other Super Admins, and the fallback cases ──
  if (approver.role === ROLES.ADMIN) {
    const noOneInDept = (roles) => `NOT EXISTS (
            SELECT 1 FROM users u2
            JOIN roles r2 ON u2.role_id = r2.id
            WHERE u2.department_id = e.department_id
              AND r2.role_name IN (${roles.map(() => '?').join(', ')})
              AND u2.is_active = TRUE
          )`;
    return {
      sql: `(
        req_r.role_name = ?
        OR (req_r.role_name = ? AND req_u.id <> ?)
        OR (req_r.role_name = ? AND ${noOneInDept([ROLES.HEAD_OF_PROGRAMS])})
        OR (${reqRole} NOT IN (?, ?, ?)
            AND ${noOneInDept([ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS])})
      )`,
      params: [
        ROLES.HEAD_OF_PROGRAMS,
        ROLES.ADMIN, approver.id,
        ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS,
        ROLES.GENERAL_USER, ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN,
        ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS,
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
