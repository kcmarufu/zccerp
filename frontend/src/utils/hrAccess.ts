/**
 * HR module access levels — the client-side mirror of backend/src/config/roles.js.
 *
 * The API is the authority; this only decides what to render, so a user is
 * never shown a tile or menu item that would answer "Access Denied".
 *
 *   FULL       — Super Admin, and the HOP/Lead of Admin & HR (the HR Office).
 *                Every department, plus the right to approve anywhere.
 *   DEPARTMENT — HOP/Lead of CPJS, FOS or HSD. Their own department only, and
 *                only Dashboard, Leave Management and Leave Analytics.
 *   SELF       — everyone else, Finance Clerks included. Their own leave only.
 */

import { User, UserRole } from '../types';

export type HrAccess = 'FULL' | 'DEPARTMENT' | 'SELF';

/** Department code of the Admin & HR unit, which acts as the HR Office. */
export const ADMIN_HR_DEPT_CODE = 'AHR';

const OVERSIGHT_ROLES: UserRole[] = ['HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'];

export const hrAccessLevel = (user?: User | null): HrAccess => {
  if (!user || !user.role) return 'SELF';
  if (user.role === 'ADMIN') return 'FULL';

  if (OVERSIGHT_ROLES.includes(user.role)) {
    return user.department_code === ADMIN_HR_DEPT_CODE ? 'FULL' : 'DEPARTMENT';
  }

  // FINANCE_CLERK and PROCUREMENT_* are ordinary staff inside the HR module.
  return 'SELF';
};

/** Sees and administers every department. */
export const hasFullHrAccess = (user?: User | null) => hrAccessLevel(user) === 'FULL';

/** Sees HR data, but only for their own department. */
export const hasDepartmentHrAccess = (user?: User | null) => hrAccessLevel(user) === 'DEPARTMENT';

/** Sees anything beyond their own records. */
export const hasHrOversight = (user?: User | null) => hrAccessLevel(user) !== 'SELF';

/** May approve leave (the API still enforces whose). */
export const canApproveLeave = (user?: User | null) => hasHrOversight(user);

/**
 * Areas of the HR module a department head may reach. Everything else is
 * reserved for the HR Office.
 */
export const DEPARTMENT_HR_PATHS = [
  '/hr',
  '/hr/dashboard',
  '/hr/leave',
  '/hr/leave-analytics',
];

/** Areas any member of staff may reach. */
export const SELF_HR_PATHS = [
  '/hr',
  '/hr/dashboard',
  '/hr/leave',
];

export const canAccessHrPath = (user: User | null | undefined, path: string): boolean => {
  const level = hrAccessLevel(user);
  if (level === 'FULL') return true;
  if (level === 'DEPARTMENT') return DEPARTMENT_HR_PATHS.includes(path);
  return SELF_HR_PATHS.includes(path);
};
