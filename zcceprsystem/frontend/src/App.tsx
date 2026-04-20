/**
 * Main Application Component
 * ZCC ERP - Enterprise Resource Planning
 * Module-based routing with role-based access control
 */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Components
import Navigation from './components/layout/Navigation';
import ProtectedRoute from './components/common/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import DashboardPage from './pages/DashboardPage';
import RequestsListPage from './pages/RequestsListPage';
import RequestForm from './components/requests/RequestForm';
import RequestDetailPage from './pages/RequestDetailPage';
import ApprovalsPage from './pages/ApprovalsPage';
import BudgetListPage from './pages/BudgetListPage';
import BudgetManagement from './components/budgets/BudgetManagement';
import DonorManagementPage from './pages/DonorManagementPage';
import DispatchDesk from './components/dispatch/DispatchDesk';
import ReconciliationPage from './pages/ReconciliationPage';
import ComingSoonPage from './pages/ComingSoonPage';
import AssetRegisterPage from './pages/AssetRegisterPage';
import FinancialReportsPage from './pages/FinancialReportsPage';

// Module Pages
import ProjectsPage from './pages/modules/ProjectsPage';
import ProcurementPage from './pages/modules/ProcurementPage';
import CompliancePage from './pages/modules/CompliancePage';
import MonitoringEvalPage from './pages/modules/MonitoringEvalPage';
import GrantDonorPage from './pages/modules/GrantDonorPage';

// Admin Pages (lazy load when created)
const UserManagementPage = React.lazy(() => import('./pages/admin/UserManagementPage'));
const AccessControlPage = React.lazy(() => import('./pages/admin/AccessControlPage'));

// HR Module Pages (lazy load)
const HRDashboardPage = React.lazy(() => import('./pages/hr/HRDashboardPage'));
const EmployeeDirectoryPage = React.lazy(() => import('./pages/hr/EmployeeDirectoryPage'));
const LeaveManagementPage = React.lazy(() => import('./pages/hr/LeaveManagementPage'));
const TimesheetManagementPage = React.lazy(() => import('./pages/hr/TimesheetManagementPage'));
const PerformanceReviewPage = React.lazy(() => import('./pages/hr/PerformanceReviewPage'));
const TrainingRecordsPage = React.lazy(() => import('./pages/hr/TrainingRecordsPage'));
const PayrollPage = React.lazy(() => import('./pages/hr/PayrollPage'));
const DisciplinaryRecordsPage = React.lazy(() => import('./pages/hr/DisciplinaryRecordsPage'));
const ExitClearancePage = React.lazy(() => import('./pages/hr/ExitClearancePage'));

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
const FINANCE_ROLES: UserRole[] = ['FINANCE_CLERK'];
const ADMIN_ROLES: UserRole[] = ['ADMIN'];

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

            {/* Protected Routes - All under Navigation shell */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Navigation>
                    <Routes>
                      {/* ========== Dashboard ========== */}
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />

                      {/* ========== Finance & Procurement Module ========== */}
                      {/* Requests */}
                      <Route
                        path="/finance/requests"
                        element={
                          <ProtectedRoute requiredPermission="view_own_requests">
                            <RequestsListPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/finance/requests/create"
                        element={
                          <ProtectedRoute requiredPermission="create_request">
                            <RequestForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/finance/requests/:requestId"
                        element={<RequestDetailPage />}
                      />

                      {/* Approvals */}
                      <Route
                        path="/finance/approvals"
                        element={
                          <ProtectedRoute allowedRoles={APPROVER_ROLES}>
                            <ApprovalsPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* Reconciliation */}
                      <Route
                        path="/finance/reconciliation"
                        element={<ReconciliationPage />}
                      />

                      {/* Dispatch */}
                      <Route
                        path="/finance/dispatch"
                        element={
                          <ProtectedRoute allowedRoles={FINANCE_ROLES}>
                            <DispatchDesk />
                          </ProtectedRoute>
                        }
                      />

                      {/* Budgets */}
                      <Route
                        path="/finance/budgets"
                        element={
                          <ProtectedRoute requiredPermission="view_budget_lines">
                            <BudgetListPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/finance/budgets/manage"
                        element={
                          <ProtectedRoute allowedRoles={FINANCE_ROLES}>
                            <BudgetManagement />
                          </ProtectedRoute>
                        }
                      />

                      {/* Donors */}
                      <Route
                        path="/finance/donors"
                        element={
                          <ProtectedRoute allowedRoles={FINANCE_ROLES}>
                            <DonorManagementPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* ========== Asset Management Module ========== */}
                      <Route path="/assets" element={<AssetRegisterPage />} />
                      <Route path="/assets/tracking" element={<AssetRegisterPage />} />

                      {/* ========== Human Resources Module ========== */}
                      <Route path="/hr" element={
                        <Suspense fallback={<div>Loading...</div>}>
                          <HRDashboardPage />
                        </Suspense>
                      } />
                      <Route path="/hr/employees" element={
                        <Suspense fallback={<div>Loading...</div>}>
                          <EmployeeDirectoryPage />
                        </Suspense>
                      } />
                      <Route path="/hr/leave" element={
                        <Suspense fallback={<div>Loading...</div>}>
                          <LeaveManagementPage />
                        </Suspense>
                      } />
                      <Route path="/hr/timesheets" element={
                        <Suspense fallback={<div>Loading...</div>}>
                          <TimesheetManagementPage />
                        </Suspense>
                      } />
                      <Route path="/hr/performance" element={
                        <Suspense fallback={<div>Loading...</div>}>
                          <PerformanceReviewPage />
                        </Suspense>
                      } />
                      <Route path="/hr/training" element={
                        <Suspense fallback={<div>Loading...</div>}>
                          <TrainingRecordsPage />
                        </Suspense>
                      } />
                      <Route path="/hr/payroll" element={
                        <Suspense fallback={<div>Loading...</div>}>
                          <PayrollPage />
                        </Suspense>
                      } />
                      <Route path="/hr/disciplinary" element={
                        <Suspense fallback={<div>Loading...</div>}>
                          <DisciplinaryRecordsPage />
                        </Suspense>
                      } />
                      <Route path="/hr/exit" element={
                        <Suspense fallback={<div>Loading...</div>}>
                          <ExitClearancePage />
                        </Suspense>
                      } />

                      {/* ========== Reports & Analytics ========== */}
                      <Route path="/reports/finance" element={<FinancialReportsPage />} />
                      <Route path="/reports/budgets" element={<FinancialReportsPage />} />

                      {/* ========== Projects & Programs Module ========== */}
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/projects/milestones" element={<ProjectsPage />} />

                      {/* ========== Procurement Module ========== */}
                      <Route path="/procurement" element={<ProcurementPage />} />
                      <Route path="/procurement/vendors" element={<ProcurementPage />} />
                      <Route path="/procurement/tenders" element={<ProcurementPage />} />

                      {/* ========== Grants & Donor Management Module ========== */}
                      <Route path="/grants" element={<GrantDonorPage />} />
                      <Route path="/grants/donors" element={<GrantDonorPage />} />
                      <Route path="/grants/fund-tracking" element={<GrantDonorPage />} />

                      {/* ========== Compliance & Audit Module ========== */}
                      <Route path="/compliance" element={<CompliancePage />} />
                      <Route path="/compliance/audit" element={<CompliancePage />} />
                      <Route path="/compliance/documents" element={<CompliancePage />} />

                      {/* ========== Monitoring & Evaluation Module ========== */}
                      <Route path="/me" element={<MonitoringEvalPage />} />
                      <Route path="/me/indicators" element={<MonitoringEvalPage />} />

                      {/* ========== Administration Module ========== */}
                      <Route
                        path="/admin/users"
                        element={
                          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                            <Suspense fallback={<div>Loading...</div>}>
                              <UserManagementPage />
                            </Suspense>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/access-control"
                        element={
                          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                            <Suspense fallback={<div>Loading...</div>}>
                              <AccessControlPage />
                            </Suspense>
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/admin/settings" element={<ComingSoonPage module="System Settings" />} />

                      {/* Legacy route redirects */}
                      <Route path="/requests" element={<Navigate to="/finance/requests" replace />} />
                      <Route path="/requests/create" element={<Navigate to="/finance/requests/create" replace />} />
                      <Route path="/requests/:requestId" element={<Navigate to="/finance/requests/:requestId" replace />} />
                      <Route path="/approvals" element={<Navigate to="/finance/approvals" replace />} />
                      <Route path="/budgets" element={<Navigate to="/finance/budgets" replace />} />
                      <Route path="/budgets/manage" element={<Navigate to="/finance/budgets/manage" replace />} />
                      <Route path="/donors" element={<Navigate to="/finance/donors" replace />} />
                      <Route path="/dispatch" element={<Navigate to="/finance/dispatch" replace />} />

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
