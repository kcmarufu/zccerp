/**
 * Vendor database access — the client-side mirror of canViewVendorDatabase /
 * canManageVendors in backend/src/config/roles.js.
 *
 * The API is the authority; this only decides what to render. The Leads and
 * Heads of Department of the programme departments (CPJS, HSD) do not see the
 * vendor database at all.
 */

import { User, UserRole } from '../types';

const VENDOR_DB_EXCLUDED_DEPT_CODES = ['CPJS', 'HSD'];

const OVERSIGHT_ROLES: UserRole[] = ['HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'];
const VENDOR_DB_ROLES: UserRole[] = ['ADMIN', 'PROCUREMENT_OFFICER', 'FINANCE_CLERK'];

export const canViewVendorDatabase = (user?: User | null): boolean => {
  if (!user || !user.role) return false;
  if (OVERSIGHT_ROLES.includes(user.role)) {
    return !VENDOR_DB_EXCLUDED_DEPT_CODES.includes(user.department_code || '');
  }
  return VENDOR_DB_ROLES.includes(user.role);
};

/** Adding, editing and deactivating vendors. Finance Clerks only read. */
export const canManageVendors = (user?: User | null): boolean =>
  canViewVendorDatabase(user) && user?.role !== 'FINANCE_CLERK';
