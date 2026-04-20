/**
 * Main Application Component
 * Sets up routing with role-based access control
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Components
import Navigation from './components/layout/Navigation';
import ProtectedRoute from './components/common/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RequestsListPage from './pages/RequestsListPage';
import RequestForm from './components/requests/RequestForm';
import RequestDetailPage from './pages/RequestDetailPage';
import ApprovalsPage from './pages/ApprovalsPage';
import BudgetListPage from './pages/BudgetListPage';
import BudgetManagement from './components/budgets/BudgetManagement';
import DispatchDesk from './components/dispatch/DispatchDesk';
import UnauthorizedPage from './pages/UnauthorizedPage';

// Types
import { UserRole } from './types';

// Create theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#e3f2fd',
      dark: '#1565c0'
    },
    secondary: {
      main: '#9c27b0'
    },
    success: {
      main: '#2e7d32',
      light: '#e8f5e9'
    },
    error: {
      main: '#d32f2f',
      light: '#ffebee'
    },
    warning: {
      main: '#ed6c02',
      light: '#fff3e0'
    },
    background: {
      default: '#f5f5f5'
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h5: {
      fontWeight: 600
    },
    h6: {
      fontWeight: 600
    }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8
        }
      }
    }
  }
});

// Query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

// Role constants
const APPROVER_ROLES: UserRole[] = ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK'];
const EXPORT_ROLES: UserRole[] = ['FINANCE_CLERK']; // Only Finance team can access Dispatch Desk

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            {/* Protected Routes */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Navigation>
                    <Routes>
                      {/* Dashboard - All authenticated users */}
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />

                      {/* Requests - Users who can create requests */}
                      <Route
                        path="/requests"
                        element={
                          <ProtectedRoute requiredPermission="view_own_requests">
                            <RequestsListPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/requests/create"
                        element={
                          <ProtectedRoute requiredPermission="create_request">
                            <RequestForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/requests/:requestId"
                        element={<RequestDetailPage />}
                      />

                      {/* Approvals - Approvers only */}
                      <Route
                        path="/approvals"
                        element={
                          <ProtectedRoute allowedRoles={APPROVER_ROLES}>
                            <ApprovalsPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* Budgets - View for all, manage for Finance */}
                      <Route
                        path="/budgets"
                        element={
                          <ProtectedRoute requiredPermission="view_budget_lines">
                            <BudgetListPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/budgets/manage"
                        element={
                          <ProtectedRoute allowedRoles={['FINANCE_CLERK']}>
                            <BudgetManagement />
                          </ProtectedRoute>
                        }
                      />

                      {/* Dispatch - HOP and Finance only */}
                      <Route
                        path="/dispatch"
                        element={
                          <ProtectedRoute allowedRoles={EXPORT_ROLES}>
                            <DispatchDesk />
                          </ProtectedRoute>
                        }
                      />

                      {/* 404 */}
                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </Navigation>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
