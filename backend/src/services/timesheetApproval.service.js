/**
 * Timesheet Approval Service
 *
 * Single-stage, role-based routing — the same shape as leaveApproval.service.js,
 * but the chain the brief asks for climbs one rung at a time:
 *
 *   General user (and Finance Clerk, Procurement)
 *        -> PROGRAM_LEAD of their department
 *        -> falls back to HEAD_OF_PROGRAMS of that department
 *        -> falls back to any ADMIN
 *   PROGRAM_LEAD (Department Lead)
 *        -> HEAD_OF_PROGRAMS of their department
 *        -> falls back to any ADMIN
 *   HEAD_OF_PROGRAMS (Head of Department)
 *        -> ADMIN (Super Admin)
 *   ADMIN
 *        -> does not submit a timesheet at all
 *
 * The HR Office (the HOP/Lead of Admin & HR) and the Super Admin may act on any
 * timesheet in the organisation. That mirrors how leave already behaves, so
 * nothing stalls when a department head is away.
 *
 * Exposes:
 *   resolveApprover(owner)              — who must act next
 *   assertCanApprove(approver, owner)   — guard at action time
 *   pendingForApproverWhereClause(u)    — SQL fragment for approval queues
 */

const { query } = require('../config/database');
const { ROLES, hasOrgTimesheetAccess } = require('../config/roles');

/**
 * Does this department have at least one active holder of the given role?
 */
async function departmentHasRole(departmentId, roleName) {
  if (!departmentId) return false;
  const rows = await query(
    `SELECT 1
       FROM users u
       JOIN roles r ON u.role_id = r.id
      WHERE u.department_id = ?
        AND r.role_name = ?
        AND u.is_active = TRUE
      LIMIT 1`,
    [departmentId, roleName]
  );
  return rows.length > 0;
}

/**
 * Who must approve the timesheet of this person?
 *
 * `owner` is { userId, role, departmentId } — the person the timesheet belongs
 * to, not the person asking.
 *
 * Returns { approverRole, approverDepartmentId, excludeUserId, isFallback }.
 */
async function resolveApprover({ userId, role, departmentId }) {
  // The Super Admin never submits, so this is only reached defensively.
  if (role === ROLES.ADMIN) {
    return {
      approverRole: ROLES.ADMIN,
      approverDepartmentId: null,
      excludeUserId: userId,
      isFallback: false,
    };
  }

  // Head of Department -> Super Admin.
  if (role === ROLES.HEAD_OF_PROGRAMS) {
    return {
      approverRole: ROLES.ADMIN,
      approverDepartmentId: null,
      excludeUserId: userId,
      isFallback: false,
    };
  }

  // Department Lead -> Head of their own department.
  if (role === ROLES.PROGRAM_LEAD) {
    if (departmentId && (await departmentHasRole(departmentId, ROLES.HEAD_OF_PROGRAMS))) {
      return {
        approverRole: ROLES.HEAD_OF_PROGRAMS,
        approverDepartmentId: departmentId,
        excludeUserId: userId,
        isFallback: false,
      };
    }
    return {
      approverRole: ROLES.ADMIN,
      approverDepartmentId: null,
      excludeUserId: userId,
      isFallback: true,
    };
  }

  // Everyone else -> their department's Lead, then its Head, then Super Admin.
  if (departmentId && (await departmentHasRole(departmentId, ROLES.PROGRAM_LEAD))) {
    return {
      approverRole: ROLES.PROGRAM_LEAD,
      approverDepartmentId: departmentId,
      excludeUserId: userId,
      isFallback: false,
    };
  }
  if (departmentId && (await departmentHasRole(departmentId, ROLES.HEAD_OF_PROGRAMS))) {
    return {
      approverRole: ROLES.HEAD_OF_PROGRAMS,
      approverDepartmentId: departmentId,
      excludeUserId: userId,
      isFallback: true,
    };
  }
  return {
    approverRole: ROLES.ADMIN,
    approverDepartmentId: null,
    excludeUserId: userId,
    isFallback: true,
  };
}

/**
 * Guard at approve / reject / return time. Throws with a readable message.
 */
async function assertCanApprove(approver, owner) {
  if (!approver || !approver.role) throw new Error('Authentication required');
  if (!owner) throw new Error('Timesheet owner context is required');

  if (approver.id && owner.userId && Number(approver.id) === Number(owner.userId)) {
    throw new Error('You cannot approve your own timesheet');
  }

  // HR Office and Super Admin may act anywhere.
  if (hasOrgTimesheetAccess(approver)) return;

  const target = await resolveApprover(owner);

  if (approver.role !== target.approverRole) {
    throw new Error(`This timesheet requires approval by ${humanRole(target.approverRole)}`);
  }

  if (target.approverDepartmentId
      && Number(approver.department_id) !== Number(target.approverDepartmentId)) {
    throw new Error('You can only approve timesheets from your own department');
  }
}

/**
 * WHERE fragment for "timesheets awaiting this approver". Append to an existing
 * clause that has already filtered on status.
 *
 * Required joins:
 *   hr_timesheets t
 *   JOIN hr_employees e   ON t.employee_id = e.id
 *   LEFT JOIN users own_u ON e.user_id     = own_u.id
 *   LEFT JOIN roles own_r ON own_u.role_id = own_r.id
 *
 * `scope` of 'all' widens the HR Office view from their own department to the
 * whole organisation.
 */
function pendingForApproverWhereClause(approver, scope = 'all') {
  if (!approver || !approver.role) return { sql: '1 = 0', params: [] };

  if (hasOrgTimesheetAccess(approver)) {
    if (scope === 'department') {
      return {
        sql: '(e.department_id = ? AND (own_u.id IS NULL OR own_u.id <> ?))',
        params: [approver.department_id, approver.id],
      };
    }
    return {
      sql: '(own_u.id IS NULL OR own_u.id <> ?)',
      params: [approver.id],
    };
  }

  // Head of Department: everyone in the department below them — that is, Leads
  // and general staff, but not another Head and not the Super Admin.
  if (approver.role === ROLES.HEAD_OF_PROGRAMS) {
    return {
      sql: `(
        e.department_id = ?
        AND COALESCE(own_r.role_name, ?) NOT IN (?, ?)
        AND (own_u.id IS NULL OR own_u.id <> ?)
      )`,
      params: [
        approver.department_id,
        ROLES.GENERAL_USER,
        ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN,
        approver.id,
      ],
    };
  }

  // Department Lead: general staff of their department only. A Lead's own
  // timesheet goes to the Head, so Leads are excluded here too.
  if (approver.role === ROLES.PROGRAM_LEAD) {
    return {
      sql: `(
        e.department_id = ?
        AND COALESCE(own_r.role_name, ?) NOT IN (?, ?, ?)
        AND (own_u.id IS NULL OR own_u.id <> ?)
      )`,
      params: [
        approver.department_id,
        ROLES.GENERAL_USER,
        ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN,
        approver.id,
      ],
    };
  }

  return { sql: '1 = 0', params: [] };
}

function humanRole(role) {
  switch (role) {
    case ROLES.PROGRAM_LEAD:     return 'the Department Lead of your department';
    case ROLES.HEAD_OF_PROGRAMS: return 'the Head of Department of your department';
    case ROLES.ADMIN:            return 'the Super Admin';
    default:                     return role;
  }
}

module.exports = {
  departmentHasRole,
  resolveApprover,
  assertCanApprove,
  pendingForApproverWhereClause,
  humanRole,
};
