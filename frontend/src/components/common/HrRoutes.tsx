/**
 * HR route guards.
 *
 * Role alone is not enough in the HR module: a HOP of Admin & HR is the HR
 * Office and sees everything, while a HOP of CPJS, FOS or HSD sees only their
 * own department. These wrappers gate on the access level rather than the role,
 * so nobody is shown a page the API would only refuse.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore } from '../../store/authStore';
import { hasFullHrAccess, hasHrOversight } from '../../utils/hrAccess';

const Loading: React.FC = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
    <CircularProgress />
  </Box>
);

/** Super Admin, or the HOP/Lead of Admin & HR. */
export const HrOfficeRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasFullHrAccess(user)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
};

/** Anyone with oversight — the HR Office, or a department head/lead. */
export const HrOversightRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  if (isLoading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasHrOversight(user)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
};
