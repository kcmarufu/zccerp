/**
 * Who may open Rejection Insights — mirrors canViewRejectionInsights() in
 * backend/src/controllers/insights.controller.js (the API enforces it):
 * the Super Admin, and the HOD and the Lead of Finance (FOS), HSD, CPJS and
 * Admin & HR (AHR).
 */
import { User } from '../types';

const HOD_AND_LEAD_DEPTS = ['FOS', 'HSD', 'CPJS', 'AHR'];

export const canViewRejectionInsights = (user?: User | null): boolean => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const dept = user.department_code;
  return (user.role === 'HEAD_OF_PROGRAMS' || user.role === 'PROGRAM_LEAD') && HOD_AND_LEAD_DEPTS.includes(dept);
};
