/**
 * Main Application Component
<<<<<<< HEAD
 * ZCC ERP - Enterprise Resource Planning
 * Module-based routing with role-based access control
 */

import React, { Suspense } from 'react';
=======
 * Sets up routing with role-based access control
 */

import React from 'react';
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Components
import Navigation from './components/layout/Navigation';
import ProtectedRoute from './components/common/ProtectedRoute';
<<<<<<< HEAD
import InactivityTimer from './components/common/InactivityTimer';

// Pages
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
=======
import LoginPage from './pages/LoginPage';
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
import DashboardPage from './pages/DashboardPage';
import RequestsListPage from './pages/RequestsListPage';
import RequestForm from './components/requests/RequestForm';
import RequestDetailPage from './pages/RequestDetailPage';
import ApprovalsPage from './pages/ApprovalsPage';
import BudgetListPage from './pages/BudgetListPage';
import BudgetManagement from './components/budgets/BudgetManagement';
<<<<<<< HEAD
import DonorManagementPage from './pages/DonorManagementPage';
import ProjectManagementPage from './pages/ProjectManagementPage';
import DispatchDesk from './components/dispatch/DispatchDesk';
import ReconciliationPage from './pages/ReconciliationPage';
import ComingSoonPage from './pages/ComingSoonPage';
import FinancialReportsPage from './pages/FinancialReportsPage';

// Procurement Module Pages
import ProcurementDashboard from './pages/procurement/ProcurementDashboard';
import PurchaseRequestList from './pages/procurement/PurchaseRequestList';
import PurchaseRequestForm from './pages/procurement/PurchaseRequestForm';
import PurchaseRequestDetail from './pages/procurement/PurchaseRequestDetail';
import VendorDatabase from './pages/procurement/VendorDatabase';
import ProcurementApprovalsPage from './pages/procurement/ProcurementApprovalsPage';

// Admin Pages (lazy load when created)
const UserManagementPage = React.lazy(() => import('./pages/admin/UserManagementPage'));
const AccessControlPage = React.lazy(() => import('./pages/admin/AccessControlPage'));
const OverallAdminPage = React.lazy(() => import('./pages/admin/OverallAdminPage'));
const DepartmentManagementPage = React.lazy(() => import('./pages/admin/DepartmentManagementPage'));
const SystemSettingsPage = React.lazy(() => import('./pages/admin/SystemSettingsPage'));

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
=======
import DispatchDesk from './components/dispatch/DispatchDesk';
import UnauthorizedPage from './pages/UnauthorizedPage';
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

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
<<<<<<< HEAD
const APPROVER_ROLES: UserRole[] = ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK', 'ADMIN'];
const FINANCE_ROLES: UserRole[] = ['FINANCE_CLERK'];
const ADMIN_ROLES: UserRole[] = ['ADMIN'];
// Roles that can manage partners/projects/budget lines (Finance HOP, Finance Lead, Super Admin)
const FINANCE_MANAGERS: UserRole[] = ['ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'];
// All roles that access finance pages (managers + clerks)
const ALL_FINANCE_ROLES: UserRole[] = ['ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD', 'FINANCE_CLERK'];
=======
const APPROVER_ROLES: UserRole[] = ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK'];
const EXPORT_ROLES: UserRole[] = ['FINANCE_CLERK']; // Only Finance team can access Dispatch Desk
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
<<<<<<< HEAD
          <InactivityTimer />
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

<<<<<<< HEAD
            {/* Protected Routes - All under Navigation shell */}
=======
            {/* Protected Routes */}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Navigation>
                    <Routes>
<<<<<<< HEAD
                      {/* ========== Dashboard ========== */}
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />

                      {/* ========== Finance & Procurement Module ========== */}
                      {/* Requests */}
                      <Route
                        path="/finance/requests"
=======
                      {/* Dashboard - All authenticated users */}
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />

                      {/* Requests - Users who can create requests */}
                      <Route
                        path="/requests"
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                        element={
                          <ProtectedRoute requiredPermission="view_own_requests">
                            <RequestsListPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
<<<<<<< HEAD
                        path="/finance/requests/create"
=======
                        path="/requests/create"
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                        element={
                          <ProtectedRoute requiredPermission="create_request">
                            <RequestForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
<<<<<<< HEAD
                        path="/finance/requests/:requestId/edit"
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
=======
                        path="/requests/:requestId"
                        element={<RequestDetailPage />}
                      />

                      {/* Approvals - Approvers only */}
                      <Route
                        path="/approvals"
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                        element={
                          <ProtectedRoute allowedRoles={APPROVER_ROLES}>
                            <ApprovalsPage />
                          </ProtectedRoute>
                        }
                      />

<<<<<<< HEAD
                      {/* Reconciliation */}
                      <Route
                        path="/finance/reconciliation"
                        element={<ReconciliationPage />}
                      />

                      {/* Dispatch — Finance Clerks + Admin */}
                      <Route
                        path="/finance/dispatch"
                        element={
                          <ProtectedRoute allowedRoles={['FINANCE_CLERK', 'ADMIN']}>
                            <DispatchDesk />
                          </ProtectedRoute>
                        }
                      />

                      {/* Budgets — all finance roles can view */}
                      <Route
                        path="/finance/budgets"
=======
                      {/* Budgets - View for all, manage for Finance */}
                      <Route
                        path="/budgets"
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                        element={
                          <ProtectedRoute requiredPermission="view_budget_lines">
                            <BudgetListPage />
                          </ProtectedRoute>
                        }
                      />
<<<<<<< HEAD
                      {/* Budget Management — only Finance HOP, Finance Lead, Admin */}
                      <Route
                        path="/finance/budgets/manage"
                        element={
                          <ProtectedRoute allowedRoles={FINANCE_MANAGERS}>
=======
                      <Route
                        path="/budgets/manage"
                        element={
                          <ProtectedRoute allowedRoles={['FINANCE_CLERK']}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                            <BudgetManagement />
                          </ProtectedRoute>
                        }
                      />

<<<<<<< HEAD
                      {/* Donors/Partners — all finance roles can view; editing gated inside page */}
                      <Route
                        path="/finance/donors"
                        element={
                          <ProtectedRoute allowedRoles={ALL_FINANCE_ROLES}>
                            <DonorManagementPage />
=======
                      {/* Dispatch - HOP and Finance only */}
                      <Route
                        path="/dispatch"
                        element={
                          <ProtectedRoute allowedRoles={EXPORT_ROLES}>
                            <DispatchDesk />
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                          </ProtectedRoute>
                        }
                      />

<<<<<<< HEAD
                      {/* Projects — all finance roles can view; deleting gated inside page */}
                      <Route
                        path="/finance/projects"
                        element={
                          <ProtectedRoute allowedRoles={ALL_FINANCE_ROLES}>
                            <ProjectManagementPage />
                          </ProtectedRoute>
                        }
                      />

                      {/* ========== Asset Management Module (Coming Soon) ========== */}
                      <Route path="/assets" element={<ComingSoonPage module="Asset Management" />} />
                      <Route path="/assets/*" element={<ComingSoonPage module="Asset Management" />} />

                      {/* ========== Human Resources Module ========== */}
                      {/* ========== Human Resources Module (Temporarily Disabled) ========== */}
                      <Route path="/hr" element={<ComingSoonPage module="Human Resources" />} />
                      <Route path="/hr/*" element={<ComingSoonPage module="Human Resources" />} />

                      {/* ========== Reports & Analytics ========== */}
                      <Route path="/reports/finance" element={<FinancialReportsPage />} />
                      <Route path="/reports/budgets" element={<FinancialReportsPage />} />

                      {/* ========== Projects & Programs Module (Coming Soon) ========== */}
                      <Route path="/projects" element={<ComingSoonPage module="Projects & Programs" />} />
                      <Route path="/projects/*" element={<ComingSoonPage module="Projects & Programs" />} />

                      {/* ========== Procurement Module ========== */}
                      <Route path="/procurement" element={<ProcurementDashboard />} />
                      <Route path="/procurement/requests" element={<PurchaseRequestList />} />
                      <Route path="/procurement/requests/create" element={<PurchaseRequestForm />} />
                      <Route path="/procurement/requests/:id" element={<PurchaseRequestDetail />} />
                      <Route path="/procurement/requests/:id/edit" element={<PurchaseRequestForm />} />
                      <Route path="/procurement/approvals" element={<ProcurementApprovalsPage />} />
                      <Route path="/procurement/vendors" element={<ProtectedRoute allowedRoles={['PROCUREMENT_OFFICER', 'ADMIN'] as UserRole[]}><VendorDatabase /></ProtectedRoute>} />

                      {/* ========== Grants & Donor Management Module (Coming Soon) ========== */}
                      <Route path="/grants" element={<ComingSoonPage module="Grants & Partners" />} />
                      <Route path="/grants/*" element={<ComingSoonPage module="Grants & Partners" />} />

                      {/* ========== Compliance & Audit Module (Coming Soon) ========== */}
                      <Route path="/compliance" element={<ComingSoonPage module="Compliance & Audit" />} />
                      <Route path="/compliance/*" element={<ComingSoonPage module="Compliance & Audit" />} />

                      {/* ========== Monitoring & Evaluation Module (Coming Soon) ========== */}
                      <Route path="/me" element={<ComingSoonPage module="Monitoring & Evaluation" />} />
                      <Route path="/me/*" element={<ComingSoonPage module="Monitoring & Evaluation" />} />

                      {/* ========== Administration Module ========== */}
                      <Route
                        path="/admin/overview"
                        element={
                          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                            <Suspense fallback={<div>Loading...</div>}>
                              <OverallAdminPage />
                            </Suspense>
                          </ProtectedRoute>
                        }
                      />
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
                      <Route
                        path="/admin/departments"
                        element={
                          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                            <Suspense fallback={<div>Loading...</div>}>
                              <DepartmentManagementPage />
                            </Suspense>
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
                      <Route
                        path="/admin/settings"
                        element={
                          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                            <Suspense fallback={<div>Loading...</div>}>
                              <SystemSettingsPage />
                            </Suspense>
                          </ProtectedRoute>
                        }
                      />

                      {/* Legacy route redirects */}
                      <Route path="/requests" element={<Navigate to="/finance/requests" replace />} />
                      <Route path="/requests/create" element={<Navigate to="/finance/requests/create" replace />} />
                      <Route path="/requests/:requestId" element={<Navigate to="/finance/requests/:requestId" replace />} />
                      <Route path="/approvals" element={<Navigate to="/finance/approvals" replace />} />
                      <Route path="/budgets" element={<Navigate to="/finance/budgets" replace />} />
                      <Route path="/budgets/manage" element={<Navigate to="/finance/budgets/manage" replace />} />
                      <Route path="/donors" element={<Navigate to="/finance/donors" replace />} />
                      <Route path="/dispatch" element={<Navigate to="/finance/dispatch" replace />} />

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
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
