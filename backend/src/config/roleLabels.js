/**
 * Human-readable titles for roles.
 *
 * Role *codes* in roles.js drive permissions and must never change; these are
 * only what a person is called on screen and on generated PDFs/spreadsheets:
 *   PROGRAM_LEAD     -> "Department Lead"
 *   HEAD_OF_PROGRAMS -> "Head of Department"
 *
 * A user may also carry a `job_title` (users.job_title). When set it replaces
 * the role label entirely - the General Secretary, for instance, holds the
 * ADMIN role but must never appear on paper as "Super Administrator". The
 * title is cosmetic; it grants and removes nothing.
 */

const ROLE_TITLES = {
  ADMIN: 'Super Administrator',
  GENERAL_USER: 'General User',
  PROGRAM_LEAD: 'Department Lead',
  HEAD_OF_PROGRAMS: 'Head of Department',
  FINANCE_CLERK: 'Finance Clerk',
  PROCUREMENT_OFFICER: 'Procurement Officer',
  PROCUREMENT_COMMITTEE: 'Procurement Committee'
};

/**
 * @param {string|null|undefined} role     role code, e.g. 'PROGRAM_LEAD'
 * @param {string|null|undefined} jobTitle per-user override, e.g. 'General Secretary'
 * @returns {string} the title to display
 */
function formatRoleLabel(role, jobTitle) {
  if (jobTitle && String(jobTitle).trim()) return String(jobTitle).trim();
  if (!role) return '';
  return ROLE_TITLES[role] || String(role).replace(/_/g, ' ');
}

module.exports = { ROLE_TITLES, formatRoleLabel };
