/**
 * Role label formatting utility
 *
 * Role *codes* drive permissions and never change; these are only what a
 * person is called on screen and on generated PDFs:
 *   PROGRAM_LEAD     -> "Department Lead"
 *   HEAD_OF_PROGRAMS -> "Head of Department"
 *
 * A user may also carry a `job_title`. When set it replaces the role label
 * entirely - the General Secretary, for instance, holds the ADMIN role but
 * must never appear on paper as "Super Administrator". The title is purely
 * cosmetic; it grants and removes nothing.
 *
 * Keep this in step with backend/src/config/roleLabels.js.
 */

export const ROLE_TITLES: Record<string, string> = {
  ADMIN: 'Super Administrator',
  GENERAL_USER: 'General User',
  PROGRAM_LEAD: 'Department Lead',
  HEAD_OF_PROGRAMS: 'Head of Department',
  FINANCE_CLERK: 'Finance Clerk',
  PROCUREMENT_OFFICER: 'Procurement Officer',
  PROCUREMENT_COMMITTEE: 'Procurement Committee'
};

/**
 * @param role     role code, e.g. 'PROGRAM_LEAD'
 * @param jobTitle per-user override, e.g. 'General Secretary'
 */
export function formatRoleLabel(role: string | null | undefined, jobTitle?: string | null): string {
  if (jobTitle && jobTitle.trim()) return jobTitle.trim();
  if (!role) return '';
  return ROLE_TITLES[role] || role.replace(/_/g, ' ');
}

/** Inline alias kept for template literals in PDF/HTML string builders. */
export function formatRoleLabelInline(role: string | null | undefined, jobTitle?: string | null): string {
  return formatRoleLabel(role, jobTitle);
}
