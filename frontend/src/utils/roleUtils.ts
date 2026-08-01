/**
 * Role label formatting utility
 *
 * Departments FOS and AHR (Admin & HR) use different leadership titles:
 *   PROGRAM_LEAD     → "Department Lead"   (instead of "Program Lead")
 *   HEAD_OF_PROGRAMS → "Head of Department" (instead of "Head of Programs")
 *
 * All other roles/departments fall back to the default underscore-to-space conversion.
 */

const DEPT_LEAD_DEPARTMENTS = ['FOS', 'AHR'];

export function formatRoleLabel(role: string | null | undefined, deptCode?: string | null): string {
  if (!role) return '';
  if (DEPT_LEAD_DEPARTMENTS.includes(deptCode || '')) {
    if (role === 'PROGRAM_LEAD') return 'Department Lead';
    if (role === 'HEAD_OF_PROGRAMS') return 'Head of Department';
  }
  return role.replace(/_/g, ' ');
}

/**
 * Inline version for template literals (PDF/HTML strings) where a function
 * call isn't available. Returns the correctly labelled role string.
 */
export function formatRoleLabelInline(role: string | null | undefined, deptCode: string | null | undefined): string {
  return formatRoleLabel(role, deptCode);
}
