/**
 * Timesheet route guards.
 *
 * Role alone is not enough here, for the same reason it is not in HR: the
 * HOP/Lead of Admin & HR is the HR Office and sees the organisation, while the
 * HOP/Lead of another department sees only their own. These gate on the access
 * level rather than the role, so nobody reaches a page the API would refuse.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore } from '../../store/authStore';
import { hasOrgTimesheetAccess, hasTeamTimesheetAccess } from '../../utils/timesheetAccess';

const Loading: React.FC = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
    <CircularProgress />
  </Box>
);

/** Super Admin, or the HOP/Lead of Admin & HR. */
export const TimesheetOfficeRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasOrgTimesheetAccess(user)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
};

/** Anyone with oversight — the HR Office, or a department Head/Lead. */
export const TimesheetOversightRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasTeamTimesheetAccess(user)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
};
