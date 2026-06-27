/**
<<<<<<< HEAD
 * ERP Dashboard Page
 * Module-based dashboard with KPIs, quick actions, and activity overview
=======
 * Dashboard Page Component
 * Role-specific dashboard with stats and quick actions
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
<<<<<<< HEAD
  CardActionArea,
  Button,
  Alert,
=======
  Button,
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
<<<<<<< HEAD
  ListItemAvatar,
  Chip,
  CircularProgress,
  Divider,
  Avatar,
  LinearProgress,
  alpha,
  useTheme,
  IconButton,
  Skeleton
=======
  Chip,
  CircularProgress,
  Divider
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
} from '@mui/material';
import {
  Description as RequestIcon,
  CheckCircle as ApprovedIcon,
  HourglassEmpty as PendingIcon,
  Cancel as RejectedIcon,
  Add as AddIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalance as BudgetIcon,
<<<<<<< HEAD
  Warning as WarningIcon,
  AttachMoney as FinanceIcon,
  Inventory as AssetIcon,
  People as HRIcon,
  LocalShipping as DispatchIcon,
  BarChart as AnalyticsIcon,
  Receipt as ReconciliationIcon,
  ArrowForward as ArrowForwardIcon,
  Schedule as ScheduleIcon,
  OpenInNew as OpenIcon,
  TrendingDown as TrendingDownIcon,
  AccountTree as ProjectsIcon,
  ShoppingCart as ProcurementIcon,
  Security as ComplianceIcon,
  TrendingUp as MEIcon,
  VolunteerActivism as GrantsIcon,
  AdminPanelSettings as AdminIcon,
  NotificationsActive as AlertBellIcon
=======
  Warning as WarningIcon
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { useAuthStore } from '../store/authStore';
import { requestService } from '../services/requestService';
import { approvalService } from '../services/approvalService';
import { budgetService } from '../services/budgetService';
<<<<<<< HEAD
import { getProcurementDashboard } from '../services/procurementService';
import { reconciliationService } from '../services/reconciliationService';
import { Request, BudgetLine } from '../types';

const COLORS = ['#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0', '#00bcd4'];

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user, hasRole, hasPermission } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [procStats, setProcStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [overdueRecon, setOverdueRecon] = useState<{ overdueCount: number; isBlocked: boolean } | null>(null);
  const [pendingReconDesk, setPendingReconDesk] = useState(0);
  const [myReconStats, setMyReconStats] = useState({ total: 0, pending: 0, approved: 0 });
  const [pendingLeadCount, setPendingLeadCount] = useState(0);

=======
import { Request, BudgetLine } from '../types';

const COLORS = ['#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0'];

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasRole, hasPermission } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  const [stats, setStats] = useState({
    totalRequests: 0,
    pendingApprovals: 0,
    approved: 0,
    rejected: 0,
    totalBudget: 0,
    totalSpent: 0
  });
  const [recentRequests, setRecentRequests] = useState<Request[]>([]);
  const [lowBudgets, setLowBudgets] = useState<BudgetLine[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
<<<<<<< HEAD
      const isApprover = hasRole('ADMIN', 'PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK');
      const isGeneralUser = hasRole('GENERAL_USER') || (!isApprover);

      // Overdue reconciliation check for general users
      if (isGeneralUser) {
        try {
          const overdueRes = await reconciliationService.getOverdueCheck();
          setOverdueRecon(overdueRes);
        } catch { /* silent */ }
      }

      // Pending reconciliations on desk for approvers
      if (isApprover) {
        try {
          const pendingRes = await reconciliationService.getPendingReconciliations();
          if (pendingRes.success && pendingRes.data) {
            setPendingReconDesk(Array.isArray(pendingRes.data) ? pendingRes.data.length : 0);
          }
        } catch { /* silent */ }

        // Pending lead review for HOP/LEAD
        const canReviewLead = hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'ADMIN');
        if (canReviewLead) {
          try {
            const leadRes = await reconciliationService.getPendingLeadReconciliations();
            if (leadRes.success && leadRes.data) {
              setPendingLeadCount(Array.isArray(leadRes.data) ? leadRes.data.length : 0);
            }
          } catch { /* silent */ }
        }
      }

      // My reconciliation stats for general users
      // Fetch both submitted reconciliations AND dispatched requests (pre-submission)
      // so users like Fungai who have a DISPATCHED request but haven't submitted yet
      // still see the reconciliation card with accurate pending counts.
      if (isGeneralUser) {
        try {
          const [myReconRes, myDispatchedRes] = await Promise.allSettled([
            reconciliationService.getMyReconciliations(),
            reconciliationService.getMyDispatchedRequests()
          ]);

          const recs: any[] = (myReconRes.status === 'fulfilled' && myReconRes.value?.success)
            ? (Array.isArray(myReconRes.value.data) ? myReconRes.value.data : [])
            : [];

          const dispatched: any[] = (myDispatchedRes.status === 'fulfilled' && myDispatchedRes.value?.success)
            ? (Array.isArray(myDispatchedRes.value.data) ? myDispatchedRes.value.data : [])
            : [];

          // Requests awaiting reconciliation submission (status DISPATCHED = no reconciliation yet)
          const awaitingSubmission = dispatched.filter((r: any) => r.status === 'DISPATCHED').length;
          // Reconciliations already submitted and awaiting lead/finance approval
          // (request moves to RECON_PENDING_LEAD or RECON_PENDING_FINANCE — same record, not double-counted)
          const pendingApproval = dispatched.filter((r: any) =>
            r.status === 'RECON_PENDING_LEAD' || r.status === 'RECON_PENDING_FINANCE'
          ).length;

          setMyReconStats({
            total: dispatched.length, // all requests in the reconciliation workflow
            pending: awaitingSubmission + pendingApproval, // needs action
            approved: dispatched.filter((r: any) => r.status === 'RECONCILED').length
          });
        } catch { /* silent */ }
      }
      setIsLoading(true);

      const requestsResponse = await requestService.getAll({ limit: 100 });
      if (requestsResponse.success && requestsResponse.data) {
        const requests = requestsResponse.data.requests;
        setStats(prev => ({
          ...prev,
          totalRequests: requests.length,
          approved: requests.filter((r: Request) => r.status === 'APPROVED').length,
          rejected: requests.filter((r: Request) => r.status === 'REJECTED').length
        }));
        setRecentRequests(requests.slice(0, 5));
      }

=======
      setIsLoading(true);
      const isApprover = hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK');

      // Fetch requests - for general users, fetch their own requests
      const requestsResponse = await requestService.getAll({ limit: 100 });
      if (requestsResponse.success && requestsResponse.data) {
        const requests = requestsResponse.data.requests;

        setStats(prev => ({
          ...prev,
          totalRequests: requests.length,
          approved: requests.filter(r => r.status === 'APPROVED').length,
          rejected: requests.filter(r => r.status === 'REJECTED').length
        }));

        setRecentRequests(requests.slice(0, 5));
      }

      // Fetch approver-specific stats (pending, approved, rejected counts)
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      if (isApprover) {
        try {
          const statsResponse = await approvalService.getApproverStats();
          if (statsResponse.success && statsResponse.data) {
            setStats(prev => ({
              ...prev,
              pendingApprovals: statsResponse.data!.pending,
              totalRequests: statsResponse.data!.total,
              approved: statsResponse.data!.approved,
              rejected: statsResponse.data!.rejected
            }));
          }
        } catch (err) {
          console.error('Error fetching approver stats:', err);
        }
      }

<<<<<<< HEAD
=======
      // Fetch budget info
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      try {
        const budgetResponse = await budgetService.getAll({ isActive: true });
        if (budgetResponse.success && budgetResponse.data) {
          const budgets = budgetResponse.data;
<<<<<<< HEAD
          const totalAllocated = budgets.reduce((sum: number, b: BudgetLine) => sum + (Number(b.allocated_amount) || 0), 0);
          const totalSpent = budgets.reduce((sum: number, b: BudgetLine) => sum + (Number(b.spent_amount) || 0), 0);
          setStats(prev => ({ ...prev, totalBudget: totalAllocated, totalSpent: totalSpent }));
          const low = budgets.filter((b: BudgetLine) =>
            Number(b.allocated_amount) > 0 && (Number(b.balance) / Number(b.allocated_amount)) < 0.1 && Number(b.balance) > 0
          );
          setLowBudgets(low);
=======
          const totalAllocated = budgets.reduce((sum, b) => sum + (b.allocated_amount || 0), 0);
          const totalSpent = budgets.reduce((sum, b) => sum + (b.spent_amount || 0), 0);

          setStats(prev => ({
            ...prev,
            totalBudget: totalAllocated,
            totalSpent: totalSpent
          }));

          // Find low balance budgets (less than 10% remaining)
          const lowBalanceBudgets = budgets.filter(b =>
            b.allocated_amount > 0 && (b.balance / b.allocated_amount) < 0.1 && b.balance > 0
          );
          setLowBudgets(lowBalanceBudgets);
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        }
      } catch (err) {
        console.error('Error fetching budgets:', err);
      }
<<<<<<< HEAD
      try {
        const pd = await getProcurementDashboard();
        const total = Object.values(pd.statusSummary || {}).reduce((a: number, b) => a + (b as number), 0);
        const pending = (pd.pendingDeptApproval ?? 0) + (pd.totalAwaitingCommittee ?? 0) + (pd.totalInProcurement ?? 0) + (pd.totalFinalFinance ?? 0);
        setProcStats({
          total,
          pending,
          approved: pd.totalCompleted ?? 0,
          rejected: pd.totalRejected ?? 0
        });
      } catch { /* silent — procurement stats are supplemental */ }
=======

>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    switch (status) {
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      case 'DRAFT': return 'default';
<<<<<<< HEAD
      case 'DISPATCHED': return 'info';
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      default: return 'warning';
    }
  };

<<<<<<< HEAD
  const formatCurrency = (amount: number) => {
    return `$${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const pieData = [
    { name: 'Approved', value: stats.approved },
    { name: 'Pending', value: Math.max(0, stats.totalRequests - stats.approved - stats.rejected) },
    { name: 'Rejected', value: stats.rejected }
  ].filter(d => d.value > 0);

  const budgetUtilization = stats.totalBudget > 0 ? (stats.totalSpent / stats.totalBudget) * 100 : 0;

  // ERP Module cards for quick access
  const moduleCards = [
    {
      title: 'Finance & Procurement',
      description: 'Float requests, approvals, budget management',
      icon: <FinanceIcon />,
      color: theme.palette.primary.main,
      bgColor: alpha(theme.palette.primary.main, 0.1),
      path: '/finance/requests',
      stats: `${stats.totalRequests} requests`,
      active: true
    },
    {
      title: 'Projects & Programs',
      description: 'Project budgets, milestones, expense allocation',
      icon: <ProjectsIcon />,
      color: '#7b1fa2',
      bgColor: alpha('#7b1fa2', 0.1),
      path: '/projects',
      stats: 'Coming Soon',
      active: true
    },
    {
      title: 'Procurement',
      description: 'Purchase requests, vendors, tendering',
      icon: <ProcurementIcon />,
      color: '#1565c0',
      bgColor: alpha('#1565c0', 0.1),
      path: '/procurement',
      stats: `${procStats.total} requests`,
      active: true
    },
    {
      title: 'Grants & Donors',
      description: 'Grant lifecycle, donor relations, fund tracking',
      icon: <GrantsIcon />,
      color: '#e65100',
      bgColor: alpha('#e65100', 0.1),
      path: '/grants',
      stats: 'Coming Soon',
      active: true
    },
    {
      title: 'Compliance & Audit',
      description: 'Internal controls, audit trail, documents',
      icon: <ComplianceIcon />,
      color: '#c62828',
      bgColor: alpha('#c62828', 0.1),
      path: '/compliance',
      stats: 'Coming Soon',
      active: true
    },
    {
      title: 'M&E',
      description: 'Indicators, KPIs, impact tracking',
      icon: <MEIcon />,
      color: '#00695c',
      bgColor: alpha('#00695c', 0.1),
      path: '/me',
      stats: 'Coming Soon',
      active: true
    },
    {
      title: 'Asset Management',
      description: 'Track and manage organizational assets',
      icon: <AssetIcon />,
      color: theme.palette.success.main,
      bgColor: alpha(theme.palette.success.main, 0.1),
      path: '/assets',
      stats: 'Coming Soon',
      active: false
    },
    {
      title: 'Human Resources',
      description: 'Employee management, leave tracking',
      icon: <HRIcon />,
      color: theme.palette.secondary.main,
      bgColor: alpha(theme.palette.secondary.main, 0.1),
      path: '/hr',
      stats: 'Coming Soon',
      active: false
    },
    {
      title: 'Reports & Analytics',
      description: 'Financial reports, budget analysis',
      icon: <AnalyticsIcon />,
      color: theme.palette.warning.main,
      bgColor: alpha(theme.palette.warning.main, 0.1),
      path: '/reports/finance',
      stats: 'View Reports',
      active: true
    }
  ];

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2, mb: 3 }} />
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map(i => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={3}>
          {[1, 2, 3].map(i => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
=======
  // Pie chart data
  const pieData = [
    { name: 'Approved', value: stats.approved },
    { name: 'Pending', value: stats.totalRequests - stats.approved - stats.rejected },
    { name: 'Rejected', value: stats.rejected }
  ].filter(d => d.value > 0);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      </Box>
    );
  }

  return (
    <Box>
<<<<<<< HEAD
      {/* Welcome Banner */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          mb: 3,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: 'white',
          borderRadius: 2
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: { xs: 1.5, sm: 0 }
          }}
        >
          <Box>
            <Typography variant="h5" fontWeight={600} gutterBottom sx={{ fontSize: { xs: '1.1rem', sm: '1.5rem' } }}>
              Welcome back, {user?.first_name}!
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
              {user?.department_name} &bull; {user?.role?.replace(/_/g, ' ')}
            </Typography>
          </Box>
          <Box display="flex" gap={1} flexWrap="wrap">
            {hasRole('GENERAL_USER') && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                size="small"
                onClick={() => navigate('/finance/requests/create')}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.2)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                  backdropFilter: 'blur(10px)'
                }}
              >
                New Request
              </Button>
            )}
            {hasRole('ADMIN', 'PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && stats.pendingApprovals > 0 && (
              <Button
                variant="contained"
                startIcon={<PendingIcon />}
                size="small"
                onClick={() => navigate('/finance/approvals')}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.2)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                  backdropFilter: 'blur(10px)'
                }}
              >
                {stats.pendingApprovals} Pending
              </Button>
            )}
          </Box>
        </Box>
      </Paper>
      {/* Overdue Reconciliation Banner — shown to general users with outstanding recons */}
      {overdueRecon && overdueRecon.overdueCount > 0 && (
        <Alert
          severity={overdueRecon.isBlocked ? 'error' : 'warning'}
          icon={<AlertBellIcon />}
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/finance/reconciliation')}>
              Submit Now
            </Button>
          }
        >
          <Typography variant="subtitle2" fontWeight={700}>
            {overdueRecon.isBlocked ? '🚫 Float Requests Blocked' : '⚠️ Overdue Reconciliations'}
          </Typography>
          <Typography variant="body2">
            You have <strong>{overdueRecon.overdueCount}</strong> overdue reconciliation{overdueRecon.overdueCount !== 1 ? 's' : ''} that must be submitted.
            {overdueRecon.isBlocked
              ? ' New float requests are blocked until all overdue reconciliations are submitted.'
              : ' Please submit them as soon as possible to avoid your float requests being blocked.'}
          </Typography>
        </Alert>
      )}

      {/* Pending Reconciliation Desk Alert — shown to approvers */}
      {pendingReconDesk > 0 && hasRole('ADMIN', 'PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && (
        <Alert
          severity="info"
          icon={<ReconciliationIcon />}
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/finance/reconciliation')}>
              Review Now
            </Button>
          }
        >
          <Typography variant="subtitle2" fontWeight={700}>
            Reconciliations Awaiting Your Review
          </Typography>
          <Typography variant="body2">
            You have <strong>{pendingReconDesk}</strong> reconciliation{pendingReconDesk !== 1 ? 's' : ''} sitting on your desk.
            The longer you take to approve/reject a reconciliation, the more it affects overall system reports and accuracy.
          </Typography>
        </Alert>
      )}

      {/* KPI Cards */}
      {/* Reconciliation Analysis Cards */}
      {(hasRole('ADMIN', 'PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') || myReconStats.total > 0) && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {/* General user: My Reconciliations summary */}
          {!hasRole('ADMIN', 'PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && (
            <Grid item xs={12} sm={6} md={4}>
              <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, cursor: 'pointer', '&:hover': { borderColor: theme.palette.info.main } }} onClick={() => navigate('/finance/reconciliation')}>
                <CardContent sx={{ p: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
                        My Reconciliations
                      </Typography>
                      <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                        {myReconStats.total}
                      </Typography>
                      <Box display="flex" gap={1} mt={0.5}>
                        <Chip label={`${myReconStats.pending} pending`} size="small" color="warning" variant="outlined" />
                        <Chip label={`${myReconStats.approved} approved`} size="small" color="success" variant="outlined" />
                      </Box>
                    </Box>
                    <Avatar sx={{ bgcolor: alpha(theme.palette.info.main, 0.1), color: 'info.main', width: 44, height: 44 }}>
                      <ReconciliationIcon />
                    </Avatar>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* HOP/LEAD: Pending Lead Review */}
          {hasRole('ADMIN', 'PROGRAM_LEAD', 'HEAD_OF_PROGRAMS') && (
            <Grid item xs={12} sm={6} md={4}>
              <Card elevation={0} sx={{ border: `1px solid ${pendingLeadCount > 0 ? theme.palette.warning.main : theme.palette.divider}`, cursor: 'pointer', '&:hover': { borderColor: theme.palette.warning.main } }} onClick={() => navigate('/finance/reconciliation')}>
                <CardContent sx={{ p: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
                        Pending Lead Review
                      </Typography>
                      <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: pendingLeadCount > 0 ? 'warning.main' : 'text.primary' }}>
                        {pendingLeadCount}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {pendingLeadCount === 0 ? 'All caught up' : 'Awaiting your lead approval'}
                      </Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: alpha(theme.palette.warning.main, 0.1), color: 'warning.main', width: 44, height: 44 }}>
                      <ReconciliationIcon />
                    </Avatar>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Finance/Admin: Pending Finance Review */}
          {hasRole('ADMIN', 'FINANCE_CLERK') && (
            <Grid item xs={12} sm={6} md={4}>
              <Card elevation={0} sx={{ border: `1px solid ${pendingReconDesk > 0 ? theme.palette.error.main : theme.palette.divider}`, cursor: 'pointer', '&:hover': { borderColor: theme.palette.error.main } }} onClick={() => navigate('/finance/reconciliation')}>
                <CardContent sx={{ p: 2 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
                        Pending Finance Review
                      </Typography>
                      <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: pendingReconDesk > 0 ? 'error.main' : 'text.primary' }}>
                        {pendingReconDesk}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {pendingReconDesk === 0 ? 'No pending items' : 'Awaiting finance approval'}
                      </Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: alpha(theme.palette.error.main, 0.1), color: 'error.main', width: 44, height: 44 }}>
                      <ScheduleIcon />
                    </Avatar>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {hasRole('ADMIN', 'PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && (
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, cursor: 'pointer', '&:hover': { borderColor: theme.palette.warning.main, boxShadow: `0 0 0 1px ${theme.palette.warning.main}` } }} onClick={() => navigate('/finance/approvals')}>
              <CardContent sx={{ p: 2.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={500} textTransform="uppercase" letterSpacing={0.5}>
                      Pending Approvals
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                      {stats.pendingApprovals}
                    </Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: alpha(theme.palette.warning.main, 0.1), color: 'warning.main', width: 44, height: 44 }}>
                    <PendingIcon />
                  </Avatar>
=======
      {/* Welcome Header */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Welcome, {user?.first_name}!
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {user?.department_name} • {user?.role.replace(/_/g, ' ')}
        </Typography>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Pending Approvals - for Approvers */}
        {hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }}
              onClick={() => navigate('/approvals')}
            >
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      backgroundColor: 'warning.light'
                    }}
                  >
                    <PendingIcon sx={{ color: 'warning.main' }} />
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight="bold">
                      {stats.pendingApprovals}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Pending Approvals
                    </Typography>
                  </Box>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

<<<<<<< HEAD
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} textTransform="uppercase" letterSpacing={0.5}>
                    Total Requests
                  </Typography>
                  <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                    {stats.totalRequests}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', width: 44, height: 44 }}>
                  <RequestIcon />
                </Avatar>
=======
        {/* Total Requests */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: 'primary.light'
                  }}
                >
                  <RequestIcon sx={{ color: 'primary.main' }} />
                </Box>
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.totalRequests}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Requests
                  </Typography>
                </Box>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              </Box>
            </CardContent>
          </Card>
        </Grid>

<<<<<<< HEAD
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} textTransform="uppercase" letterSpacing={0.5}>
                    Approved
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="success.main" sx={{ mt: 0.5 }}>
                    {stats.approved}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: alpha(theme.palette.success.main, 0.1), color: 'success.main', width: 44, height: 44 }}>
                  <ApprovedIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} textTransform="uppercase" letterSpacing={0.5}>
                    Budget Balance
                  </Typography>
                  <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5 }}>
                    {formatCurrency(stats.totalBudget - stats.totalSpent)}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(budgetUtilization, 100)} 
                      color={budgetUtilization > 90 ? 'error' : budgetUtilization > 70 ? 'warning' : 'success'}
                      sx={{ flex: 1, height: 6, borderRadius: 3 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {budgetUtilization.toFixed(0)}%
                    </Typography>
                  </Box>
                </Box>
                <Avatar sx={{ bgcolor: alpha(theme.palette.info.main, 0.1), color: 'info.main', width: 44, height: 44 }}>
                  <BudgetIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Procurement KPI Cards */}
      <Typography variant="subtitle2" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={1} sx={{ mb: 1.5 }}>
        Procurement Overview
      </Typography>
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, cursor: 'pointer', '&:hover': { borderColor: '#1565c0', boxShadow: `0 0 0 1px #1565c0` } }} onClick={() => navigate('/procurement/requests')}>
            <CardContent sx={{ p: 2.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} textTransform="uppercase" letterSpacing={0.5}>
                    Purchase Requests
                  </Typography>
                  <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                    {procStats.total}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: alpha('#1565c0', 0.1), color: '#1565c0', width: 44, height: 44 }}>
                  <ProcurementIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, cursor: 'pointer', '&:hover': { borderColor: theme.palette.warning.main, boxShadow: `0 0 0 1px ${theme.palette.warning.main}` } }} onClick={() => navigate('/procurement/approvals')}>
            <CardContent sx={{ p: 2.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} textTransform="uppercase" letterSpacing={0.5}>
                    Pending Approvals
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="warning.main" sx={{ mt: 0.5 }}>
                    {procStats.pending}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: alpha(theme.palette.warning.main, 0.1), color: 'warning.main', width: 44, height: 44 }}>
                  <PendingIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, cursor: 'pointer', '&:hover': { borderColor: theme.palette.success.main, boxShadow: `0 0 0 1px ${theme.palette.success.main}` } }} onClick={() => navigate('/procurement/requests')}>            <CardContent sx={{ p: 2.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} textTransform="uppercase" letterSpacing={0.5}>
                    Approved
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="success.main" sx={{ mt: 0.5 }}>
                    {procStats.approved}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: alpha(theme.palette.success.main, 0.1), color: 'success.main', width: 44, height: 44 }}>
                  <ApprovedIcon />
                </Avatar>
=======
        {/* Approved */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: 'success.light'
                  }}
                >
                  <ApprovedIcon sx={{ color: 'success.main' }} />
                </Box>
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.approved}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Approved
                  </Typography>
                </Box>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              </Box>
            </CardContent>
          </Card>
        </Grid>

<<<<<<< HEAD
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, cursor: 'pointer', '&:hover': { borderColor: '#c62828', boxShadow: `0 0 0 1px #c62828` } }} onClick={() => navigate('/procurement/requests')}>
            <CardContent sx={{ p: 2.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={500} textTransform="uppercase" letterSpacing={0.5}>
                    Rejected
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="error.main" sx={{ mt: 0.5 }}>
                    {procStats.rejected}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: alpha('#c62828', 0.1), color: '#c62828', width: 44, height: 44 }}>
                  <RejectedIcon />
                </Avatar>
=======
        {/* Budget Balance - visible to all */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: 'info.light'
                  }}
                >
                  <BudgetIcon sx={{ color: 'info.main' }} />
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight="bold">
                    ${((stats.totalBudget - stats.totalSpent) / 1000).toFixed(0)}K
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Balance
                  </Typography>
                </Box>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

<<<<<<< HEAD
      {/* Module Quick Access */}
      <Typography variant="subtitle2" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={1} sx={{ mb: 1.5 }}>
        System Modules
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {moduleCards.map((mod) => (
          <Grid item xs={6} sm={4} md={3} key={mod.title}>
            <Card
              elevation={0}
              sx={{
                border: `1px solid ${theme.palette.divider}`,
                position: 'relative',
                overflow: 'visible',
                opacity: mod.active ? 1 : 0.7,
                height: '100%',
                '&:hover': mod.active ? {
                  borderColor: mod.color,
                  boxShadow: `0 4px 20px ${alpha(mod.color, 0.15)}`
                } : {}
              }}
            >
              <CardActionArea
                onClick={() => mod.active && navigate(mod.path)}
                disabled={!mod.active}
                sx={{ p: { xs: 1.5, sm: 2.5 }, height: '100%' }}
              >
                <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'center', sm: 'flex-start' }} gap={{ xs: 1, sm: 2 }} textAlign={{ xs: 'center', sm: 'left' }}>
                  <Avatar sx={{ bgcolor: mod.bgColor, color: mod.color, width: { xs: 36, sm: 48 }, height: { xs: 36, sm: 48 }, flexShrink: 0 }}>
                    {mod.icon}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={600} noWrap sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                      {mod.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display={{ xs: 'none', sm: 'block' }} sx={{ mb: 0.5 }}>
                      {mod.description}
                    </Typography>
                    <Chip
                      label={mod.stats}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        bgcolor: mod.active ? mod.bgColor : 'grey.100',
                        color: mod.active ? mod.color : 'text.disabled'
                      }}
                    />
                  </Box>
                </Box>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Bottom Row */}
      <Grid container spacing={2}>
        {/* Request Status Chart */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 2, border: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Request Overview
            </Typography>
            <Divider sx={{ mb: 1 }} />
            {pieData.length > 0 ? (
              <Box height={150}>
=======
      <Grid container spacing={3}>
        {/* Quick Actions */}
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box display="flex" flexDirection="column" gap={2}>
              {hasRole('GENERAL_USER') && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  fullWidth
                  onClick={() => navigate('/requests/create')}
                >
                  Create New Request
                </Button>
              )}
              {hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && (
                <Button
                  variant="outlined"
                  startIcon={<PendingIcon />}
                  fullWidth
                  onClick={() => navigate('/approvals')}
                >
                  Review Approvals ({stats.pendingApprovals})
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<BudgetIcon />}
                fullWidth
                onClick={() => navigate('/budgets')}
              >
                View Budgets
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Request Status Chart */}
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Request Status
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {pieData.length > 0 ? (
              <Box height={200}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
<<<<<<< HEAD
                      innerRadius={38}
                      outerRadius={60}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((_entry, index) => (
=======
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {pieData.map((entry, index) => (
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
<<<<<<< HEAD
              <Box display="flex" justifyContent="center" alignItems="center" height={150}>
                <Typography variant="caption" color="text.secondary">No data yet</Typography>
              </Box>
            )}
            <Box display="flex" justifyContent="center" flexWrap="wrap" gap={1.5} mt={0.5}>
              {pieData.map((entry, index) => (
                <Box key={entry.name} display="flex" alignItems="center" gap={0.5}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: COLORS[index], flexShrink: 0 }} />
                  <Typography variant="caption">{entry.name}: {entry.value}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 2, border: `1px solid ${theme.palette.divider}` }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
              <Typography variant="subtitle2" fontWeight={600}>
                Recent Requests
              </Typography>
              <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/finance/requests')} sx={{ fontSize: '0.7rem', py: 0 }}>
                View All
              </Button>
            </Box>
            <Divider sx={{ mb: 0.5 }} />
            {recentRequests.length === 0 ? (
              <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={3}>
                <RequestIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 0.5 }} />
                <Typography variant="caption" color="text.secondary">No requests yet</Typography>
              </Box>
            ) : (
              <List disablePadding dense>
                {recentRequests.slice(0, 4).map((request, index) => (
                  <React.Fragment key={request.id}>
                    <ListItem
                      sx={{ px: 0.5, py: 0.5, cursor: 'pointer', borderRadius: 1, '&:hover': { backgroundColor: 'grey.50' } }}
                      onClick={() => navigate(`/finance/requests/${request.id}`)}
                    >
                      <ListItemAvatar sx={{ minWidth: 32 }}>
                        <Avatar sx={{ width: 24, height: 24, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
                          <RequestIcon sx={{ fontSize: 12 }} />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: 90 }}>
                              {request.request_code}
                            </Typography>
                            <Chip label={request.status.replace(/_/g, ' ')} size="small" color={getStatusColor(request.status)} sx={{ height: 16, fontSize: '0.6rem' }} />
                          </Box>
                        }
                        secondary={`$${Number(request.total_amount || 0).toLocaleString()} • ${request.department_name}`}
                        secondaryTypographyProps={{ fontSize: '0.68rem' }}
                      />
                    </ListItem>
                    {index < Math.min(recentRequests.length, 4) - 1 && <Divider variant="inset" component="li" />}
                  </React.Fragment>
=======
              <Box display="flex" justifyContent="center" alignItems="center" height={200}>
                <Typography color="text.secondary">No data yet</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Low Budget Alerts */}
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 3, height: '100%' }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <WarningIcon color="warning" />
              <Typography variant="h6">Low Budget Alerts</Typography>
            </Box>
            <Divider sx={{ mb: 2 }} />
            {lowBudgets.length === 0 ? (
              <Typography color="text.secondary">
                All budgets are healthy
              </Typography>
            ) : (
              <List dense>
                {lowBudgets.slice(0, 5).map((budget) => (
                  <ListItem key={budget.id}>
                    <ListItemIcon>
                      <WarningIcon color="warning" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={budget.budget_code}
                      secondary={`Balance: $${Number(budget.balance || 0).toLocaleString()}`}
                    />
                  </ListItem>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                ))}
              </List>
            )}
          </Paper>
        </Grid>

<<<<<<< HEAD
        {/* Budget Alerts & Quick Actions */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 2, border: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Alerts & Quick Actions
            </Typography>
            <Divider sx={{ mb: 1 }} />

            {/* Low Budget Alerts */}
            {lowBudgets.length > 0 && (
              <Box sx={{ mb: 1.5, p: 1.5, bgcolor: alpha(theme.palette.warning.main, 0.05), borderRadius: 1, border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}` }}>
                <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                  <WarningIcon color="warning" sx={{ fontSize: 16 }} />
                  <Typography variant="caption" fontWeight={600} color="warning.dark">Low Budget Alerts</Typography>
                </Box>
                {lowBudgets.slice(0, 3).map((budget) => (
                  <Box key={budget.id} display="flex" justifyContent="space-between" alignItems="center" py={0.25}>
                    <Typography variant="caption" fontWeight={500}>{budget.budget_code}</Typography>
                    <Typography variant="caption" color="error">${Number(budget.balance || 0).toLocaleString()} left</Typography>
                  </Box>
                ))}
              </Box>
            )}

            {/* Quick Actions */}
            <Box display="flex" flexDirection="column" gap={1}>
              {hasRole('GENERAL_USER') && (
                <Button variant="outlined" startIcon={<AddIcon />} fullWidth size="small" onClick={() => navigate('/finance/requests/create')} sx={{ justifyContent: 'flex-start', py: 0.5 }}>
                  Create Float Request
                </Button>
              )}
              {hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && (
                <Button variant="outlined" startIcon={<PendingIcon />} fullWidth size="small" onClick={() => navigate('/finance/approvals')} sx={{ justifyContent: 'flex-start', py: 0.5 }}>
                  Review Approvals ({stats.pendingApprovals})
                </Button>
              )}
              <Button variant="outlined" startIcon={<BudgetIcon />} fullWidth size="small" onClick={() => navigate('/finance/budgets')} sx={{ justifyContent: 'flex-start', py: 0.5 }}>
                View Budget Lines
              </Button>
              {hasRole('FINANCE_CLERK') && (
                <Button variant="outlined" startIcon={<DispatchIcon />} fullWidth size="small" onClick={() => navigate('/finance/dispatch')} sx={{ justifyContent: 'flex-start', py: 0.5 }}>
                  Dispatch Desk
                </Button>
              )}
            </Box>
=======
        {/* Recent Requests */}
        <Grid item xs={12}>
          <Paper elevation={2} sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Recent Requests</Typography>
              <Button size="small" onClick={() => navigate('/requests')}>
                View All
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            {recentRequests.length === 0 ? (
              <Typography color="text.secondary">No requests yet</Typography>
            ) : (
              <List>
                {recentRequests.map((request) => (
                  <ListItem
                    key={request.id}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'grey.50' },
                      borderRadius: 1
                    }}
                    onClick={() => navigate(`/requests/${request.id}`)}
                  >
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography fontWeight="medium">
                            {request.request_number}
                          </Typography>
                          <Chip
                            label={request.status.replace(/_/g, ' ')}
                            size="small"
                            color={getStatusColor(request.status)}
                          />
                        </Box>
                      }
                      secondary={`$${Number(request.total_amount || 0).toLocaleString()} • ${request.department_name}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
