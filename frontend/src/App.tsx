/**
 * Main Application Component
 * ZCC ERP - Enterprise Resource Planning
 * Module-based routing with role-based access control
 */

import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Components
import Navigation from './components/layout/Navigation';
import ProtectedRoute from './components/common/ProtectedRoute';
import { HrOfficeRoute, HrOversightRoute } from './components/common/HrRoutes';
import InactivityTimer from './components/common/InactivityTimer';

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

// Admin Pages (lazy load)
const UserManagementPage = React.lazy(() => import('./pages/admin/UserManagementPage'));
const AccessControlPage = React.lazy(() => import('./pages/admin/AccessControlPage'));
const OverallAdminPage = React.lazy(() => import('./pages/admin/OverallAdminPage'));
const DepartmentManagementPage = React.lazy(() => import('./pages/admin/DepartmentManagementPage'));
const SystemSettingsPage = React.lazy(() => import('./pages/admin/SystemSettingsPage'));

// HR Module Pages (lazy load)
const HRDashboardPage = React.lazy(() => import('./pages/hr/HRDashboardPage'));
const EmployeeDirectoryPage = React.lazy(() => import('./pages/hr/EmployeeDirectoryPage'));
const LeaveManagementPage = React.lazy(() => import('./pages/hr/LeaveManagementPage'));
const LeaveAnalyticsPage = React.lazy(() => import('./pages/hr/LeaveAnalyticsPage'));
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
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: 8 }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 8 }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 8 }
      }
    }
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

const APPROVER_ROLES: UserRole[] = ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK', 'ADMIN'];
const FINANCE_ROLES: UserRole[] = ['FINANCE_CLERK'];
const ADMIN_ROLES: UserRole[] = ['ADMIN'];
const FINANCE_MANAGERS: UserRole[] = ['ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'];
const ALL_FINANCE_ROLES: UserRole[] = ['ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD', 'FINANCE_CLERK'];
// HR oversight: Super Admin plus department heads/leads. Record-level scoping
// (own vs department vs organisation) is enforced by the API, not here.
const HR_MANAGERS: UserRole[] = ['ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'];
const HR_APPROVERS: UserRole[] = ['ADMIN', 'HEAD_OF_PROGRAMS'];

/**
 * The request form is reachable from two routes and for any request id. React
 * reuses a component instance when only the route params change, so without a
 * key the form would carry the previous request's state — including its travel
 * claim — into the next one. Keying on the id guarantees a fresh form.
 */
const KeyedRequestForm: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  return <RequestForm key={requestId || 'new'} />;
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <InactivityTimer />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Navigation>
                    <Routes>
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />

                      <Route path="/finance/requests" element={<ProtectedRoute requiredPermission="view_own_requests"><RequestsListPage /></ProtectedRoute>} />
                      <Route path="/finance/requests/create" element={<ProtectedRoute requiredPermission="create_request"><KeyedRequestForm /></ProtectedRoute>} />
                      <Route path="/finance/requests/:requestId/edit" element={<ProtectedRoute requiredPermission="create_request"><KeyedRequestForm /></ProtectedRoute>} />
                      <Route path="/finance/requests/:requestId" element={<RequestDetailPage />} />
                      <Route path="/finance/approvals" element={<ProtectedRoute allowedRoles={APPROVER_ROLES}><ApprovalsPage /></ProtectedRoute>} />
                      <Route path="/finance/reconciliation" element={<ReconciliationPage />} />
                      <Route path="/finance/dispatch" element={<ProtectedRoute allowedRoles={['FINANCE_CLERK', 'ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'] as UserRole[]}><DispatchDesk /></ProtectedRoute>} />
                      <Route path="/finance/budgets" element={<ProtectedRoute requiredPermission="view_budget_lines"><BudgetListPage /></ProtectedRoute>} />
                      <Route path="/finance/budgets/manage" element={<ProtectedRoute allowedRoles={FINANCE_MANAGERS}><BudgetManagement /></ProtectedRoute>} />
                      <Route path="/finance/donors" element={<ProtectedRoute allowedRoles={ALL_FINANCE_ROLES}><DonorManagementPage /></ProtectedRoute>} />
                      <Route path="/finance/projects" element={<ProtectedRoute allowedRoles={ALL_FINANCE_ROLES}><ProjectManagementPage /></ProtectedRoute>} />

                      <Route path="/assets" element={<ComingSoonPage module="Asset Management" />} />
                      <Route path="/assets/*" element={<ComingSoonPage module="Asset Management" />} />

                      {/* HR MODULE */}
                      <Route path="/hr" element={<Suspense fallback={<div>Loading...</div>}><HRDashboardPage /></Suspense>} />
                      <Route path="/hr/dashboard" element={<Suspense fallback={<div>Loading...</div>}><HRDashboardPage /></Suspense>} />
                      {/* Every user reaches Leave — the page itself shows "My Leave" to
                          general users and adds the approval queue for HOP/Admin. */}
                      <Route path="/hr/leave" element={<Suspense fallback={<div>Loading...</div>}><LeaveManagementPage /></Suspense>} />
                      <Route path="/hr/leave-analytics" element={<HrOversightRoute><Suspense fallback={<div>Loading...</div>}><LeaveAnalyticsPage /></Suspense></HrOversightRoute>} />
                      {/* Reserved for the HR Office (Super Admin, or Admin & HR HOP/Lead).
                          HrOfficeRoute sends anyone else to /unauthorized rather than
                          letting them load a page the API will refuse. */}
                      <Route path="/hr/employees" element={<HrOfficeRoute><Suspense fallback={<div>Loading...</div>}><EmployeeDirectoryPage /></Suspense></HrOfficeRoute>} />
                      <Route path="/hr/exit-clearance" element={<HrOfficeRoute><Suspense fallback={<div>Loading...</div>}><ExitClearancePage /></Suspense></HrOfficeRoute>} />
                      <Route path="/hr/payroll" element={<ComingSoonPage module="Payroll" />} />

                      {/* Not built out yet — shown as Coming Soon rather than half-working. */}
                      <Route path="/hr/timesheets" element={<ComingSoonPage module="Timesheet Management" />} />
                      <Route path="/hr/performance" element={<ComingSoonPage module="Performance Reviews" />} />
                      <Route path="/hr/training" element={<ComingSoonPage module="Training & Development" />} />
                      <Route path="/hr/disciplinary" element={<ComingSoonPage module="Disciplinary Records" />} />
                      <Route path="/hr/*" element={<Navigate to="/hr/dashboard" replace />} />

                      <Route path="/reports/finance" element={<FinancialReportsPage />} />
                      <Route path="/reports/budgets" element={<FinancialReportsPage />} />

                      <Route path="/projects" element={<ComingSoonPage module="Projects & Programs" />} />
                      <Route path="/projects/*" element={<ComingSoonPage module="Projects & Programs" />} />

                      <Route path="/procurement" element={<ProcurementDashboard />} />
                      <Route path="/procurement/requests" element={<PurchaseRequestList />} />
                      <Route path="/procurement/requests/create" element={<PurchaseRequestForm />} />
                      <Route path="/procurement/requests/:id" element={<PurchaseRequestDetail />} />
                      <Route path="/procurement/requests/:id/edit" element={<PurchaseRequestForm />} />
                      <Route path="/procurement/approvals" element={<ProcurementApprovalsPage />} />
                      <Route path="/procurement/vendors" element={<ProtectedRoute allowedRoles={['PROCUREMENT_OFFICER', 'ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD', 'FINANCE_CLERK'] as UserRole[]}><VendorDatabase /></ProtectedRoute>} />

                      <Route path="/grants" element={<ComingSoonPage module="Grants & Partners" />} />
                      <Route path="/grants/*" element={<ComingSoonPage module="Grants & Partners" />} />
                      <Route path="/compliance" element={<ComingSoonPage module="Compliance & Audit" />} />
                      <Route path="/compliance/*" element={<ComingSoonPage module="Compliance & Audit" />} />
                      <Route path="/me" element={<ComingSoonPage module="Monitoring & Evaluation" />} />
                      <Route path="/me/*" element={<ComingSoonPage module="Monitoring & Evaluation" />} />

                      <Route path="/admin/overview" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Suspense fallback={<div>Loading...</div>}><OverallAdminPage /></Suspense></ProtectedRoute>} />
                      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Suspense fallback={<div>Loading...</div>}><UserManagementPage /></Suspense></ProtectedRoute>} />
                      <Route path="/admin/access-control" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Suspense fallback={<div>Loading...</div>}><AccessControlPage /></Suspense></ProtectedRoute>} />
                      <Route path="/admin/departments" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Suspense fallback={<div>Loading...</div>}><DepartmentManagementPage /></Suspense></ProtectedRoute>} />
                      <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><Suspense fallback={<div>Loading...</div>}><SystemSettingsPage /></Suspense></ProtectedRoute>} />
                      <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />

                      <Route path="/requests" element={<Navigate to="/finance/requests" replace />} />
                      <Route path="/requests/create" element={<Navigate to="/finance/requests/create" replace />} />
                      <Route path="/approvals" element={<Navigate to="/finance/approvals" replace />} />
                      <Route path="/budgets" element={<Navigate to="/finance/budgets" replace />} />
                      <Route path="/budgets/manage" element={<Navigate to="/finance/budgets/manage" replace />} />
                      <Route path="/donors" element={<Navigate to="/finance/donors" replace />} />
                      <Route path="/dispatch" element={<Navigate to="/finance/dispatch" replace />} />

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
