/**
 * Request routing rules — which desk a request belongs on, and which
 * department that desk sits in.
 *
 * These live in one place because the answer is *derived* from the request's
 * current donor and project, and it has to be re-derived at three separate
 * moments in a request's life: when a draft is submitted, when a rejected
 * request is resubmitted, and when the requester reassigns the partner or
 * project of a request that is already sitting on somebody's desk.
 *
 * Each of those three points used to work it out for itself, and they drifted.
 * The failure that prompted this module: a request raised against the internal
 * Administration partner went to the Admin (AHR) desk, was rejected there, was
 * reassigned by the requester to an external partner, and was then *resubmitted
 * straight back to the Admin desk* — because resubmission replayed the desk
 * that had rejected it instead of re-deriving the desk from the new partner. A
 * later edit then cleared its AHR routing pin, because the edit path re-derived
 * routing from the project while leaving the status alone. The request ended up
 * at PENDING_ADMIN_APPROVAL with no AHR link of any kind: the AHR desk could not
 * see it (its queue matched on the partner type and the routing pin, both now
 * wrong), and the requester's own department could see it but was refused at
 * approval time, because only AHR may act at that stage. It was stuck with no
 * way forward for anyone below a system administrator.
 *
 * The invariant that was missing, and that alignDeskToDonor now enforces:
 *
 *   PENDING_ADMIN_APPROVAL is valid only while the request is charged to an
 *   ADMIN-type partner. Change the partner and the desk must change with it.
 */

const { REQUEST_STATUS, ADMIN_HR_DEPT_CODE, isGsTrackRole } = require('../config/roles');

const ADMIN_DONOR_TYPE = 'ADMIN';

/** True when the request is charged to an internal Administration partner. */
async function isAdminDonor(connection, donorId) {
  if (!donorId) return false;
  const [rows] = await connection.execute(
    'SELECT donor_type FROM donors WHERE id = ?',
    [donorId]
  );
  return rows.length > 0 && rows[0].donor_type === ADMIN_DONOR_TYPE;
}

/** The Admin & HR department's id, or null if it is not configured. */
async function getAdminHrDepartmentId(connection) {
  const [rows] = await connection.execute(
    'SELECT id FROM departments WHERE department_code = ? LIMIT 1',
    [ADMIN_HR_DEPT_CODE]
  );
  return rows[0]?.id ?? null;
}

/**
 * The first desk a request should reach when it enters the pipeline, from the
 * requester's role and the partner it is charged to.
 */
function firstDeskFor({ adminDonor, requesterRole }) {
  // A Head of Department's request skips the departmental desk entirely and
  // goes to the General Secretary, whoever the partner is.
  if (isGsTrackRole(requesterRole)) return REQUEST_STATUS.PENDING_GS_APPROVAL;
  // A Finance Clerk's own request always starts at the departmental desk, so it
  // can never route itself into the Finance stage it would then action.
  if (requesterRole === 'FINANCE_CLERK') return REQUEST_STATUS.PENDING_LEAD_APPROVAL;
  if (adminDonor) return REQUEST_STATUS.PENDING_ADMIN_APPROVAL;
  return REQUEST_STATUS.PENDING_LEAD_APPROVAL;
}

/**
 * Correct a pending status that the request's current partner no longer
 * supports, and return the status it should actually carry.
 *
 * Only the departmental stages are re-pointed. A request that has reached
 * PENDING_FINANCE_APPROVAL has already been approved at department level by
 * somebody, and reassigning its partner must not silently throw that approval
 * away — Finance sees the amendment on the trail and can reject it if the new
 * partner changes the picture. Statuses outside the pending set are returned
 * untouched.
 */
async function alignDeskToDonor(connection, { status, donorId, requesterRole }) {
  const adminDonor = await isAdminDonor(connection, donorId);
  const gsTrack = isGsTrackRole(requesterRole);

  // Parked at the Admin desk but no longer an Administration request: send it
  // to the desk the requester's own role and department imply.
  if (status === REQUEST_STATUS.PENDING_ADMIN_APPROVAL && !adminDonor) {
    return firstDeskFor({ adminDonor: false, requesterRole });
  }

  // The mirror case: moved *onto* an Administration partner while sitting on a
  // departmental desk. Left alone, the requester's own Lead or HOP would
  // approve spending that belongs to Admin & HR's budget and desk.
  const departmentalDesks = [REQUEST_STATUS.PENDING_LEAD_APPROVAL, REQUEST_STATUS.PENDING_HOP_APPROVAL];
  if (adminDonor && !gsTrack && departmentalDesks.includes(status)) {
    return REQUEST_STATUS.PENDING_ADMIN_APPROVAL;
  }

  return status;
}

/**
 * Which department should handle this request's departmental stage.
 *
 * Returns null to mean "the requester's own department" — the column stores
 * NULL in that case and every queue falls back to requests.department_id.
 *
 * Admin-partner requests pin to Admin & HR so the requester's own Lead/HOP does
 * not pick them up. Everything else follows the project's owning department,
 * falling back to the department on the request's first budget line for older
 * projects that carry no department_id of their own.
 */
async function resolveRoutingDepartmentId(connection, {
  adminDonor,
  requesterDeptId,
  projectId,
  firstBudgetLineId = 0
}) {
  if (adminDonor) {
    const ahrDeptId = await getAdminHrDepartmentId(connection);
    if (ahrDeptId && Number(requesterDeptId) !== Number(ahrDeptId)) return ahrDeptId;
    return null;
  }

  if (!projectId) return null;

  const [projRows] = await connection.execute(
    `SELECT COALESCE(
       p.department_id,
       (SELECT bl.department_id FROM budget_lines bl
        WHERE bl.id = ? AND bl.department_id IS NOT NULL LIMIT 1)
     ) AS effective_dept_id
     FROM projects p WHERE p.id = ?`,
    [firstBudgetLineId || 0, projectId]
  );
  const effectiveDeptId = projRows[0]?.effective_dept_id;
  if (effectiveDeptId && Number(effectiveDeptId) !== Number(requesterDeptId)) {
    return effectiveDeptId;
  }
  return null;
}

module.exports = {
  ADMIN_DONOR_TYPE,
  isAdminDonor,
  getAdminHrDepartmentId,
  firstDeskFor,
  alignDeskToDonor,
  resolveRoutingDepartmentId
};
