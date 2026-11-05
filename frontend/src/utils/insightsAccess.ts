/**
 * Who may open Rejection Insights — mirrors canViewRejectionInsights() in
 * backend/src/controllers/insights.controller.js (the API enforces it):
 * the Super Admin; the HOD and the Lead of Finance (FOS), HSD and CPJS; and
 * the Lead of Admin & HR (AHR).
 */
import { User } from '../types';

const HOD_AND_LEAD_DEPTS = ['FOS', 'HSD', 'CPJS'];
const LEAD_ONLY_DEPTS = ['AHR'];

export const canViewRejectionInsights = (user?: User | null): boolean => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const dept = user.department_code;
  if ((user.role === 'HEAD_OF_PROGRAMS' || user.role === 'PROGRAM_LEAD') && HOD_AND_LEAD_DEPTS.includes(dept)) return true;
  return user.role === 'PROGRAM_LEAD' && LEAD_ONLY_DEPTS.includes(dept);
};
