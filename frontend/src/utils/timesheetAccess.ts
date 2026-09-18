/**
 * Timesheet module access — the client-side mirror of the TIMESHEET_ACCESS
 * ladder in backend/src/config/roles.js.
 *
 * The API is the authority; this only decides what to render, so nobody is
 * shown a page or a button that would answer "Access Denied".
 *
 *   ORGANISATION — Super Admin, and the HOP/Lead of Admin & HR (the HR Office).
 *                  Every department, plus the LOE register and public holidays.
 *   DEPARTMENT   — HOP/Lead of CPJS, FOS or HSD. Their own department's
 *                  timesheets and allocations, read-only on the allocations.
 *   SELF         — everyone else, Finance Clerks included. Their own only.
 */

import { User } from '../types';
import { hrAccessLevel } from './hrAccess';

/**
 * The Timesheet module is built but switched off until the organisation is
 * ready to use it: its menu section is hidden and its pages show "Coming soon".
 * Keep in step with TIMESHEETS_ENABLED in backend/src/routes/index.js.
 */
export const TIMESHEETS_ENABLED = false;

export type TimesheetAccess = 'ORGANISATION' | 'DEPARTMENT' | 'SELF';

export const timesheetAccessLevel = (user?: User | null): TimesheetAccess => {
  const level = hrAccessLevel(user);
  if (level === 'FULL') return 'ORGANISATION';
  if (level === 'DEPARTMENT') return 'DEPARTMENT';
  return 'SELF';
};

/** Sees every department. */
export const hasOrgTimesheetAccess = (user?: User | null) =>
  timesheetAccessLevel(user) === 'ORGANISATION';

/** Sees beyond their own timesheets — a department head, or the HR Office. */
export const hasTeamTimesheetAccess = (user?: User | null) =>
  timesheetAccessLevel(user) !== 'SELF';

/**
 * May change an employee's LOE. HR-controlled, so the HR Office and the Super
 * Admin only — a department head reads their department's allocations but does
 * not edit them.
 */
export const canManageLoe = (user?: User | null) => hasOrgTimesheetAccess(user);

/** May maintain the public holiday calendar. */
export const canManageHolidays = (user?: User | null) => hasOrgTimesheetAccess(user);

/**
 * Must this person complete a monthly timesheet?
 * Everyone except the Super Admin, who approves but never submits.
 */
export const requiresTimesheet = (user?: User | null) =>
  Boolean(user) && user?.role !== 'ADMIN';

/** May act on somebody else's submitted timesheet. */
export const canApproveTimesheets = (user?: User | null) => hasTeamTimesheetAccess(user);
