/**
 * ERP Dashboard Page
 * Module-based dashboard with KPIs, quick actions, and activity overview
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
  CardActionArea,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
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
} from '@mui/material';
import {
  Description as RequestIcon,
  CheckCircle as ApprovedIcon,
  HourglassEmpty as PendingIcon,
  Cancel as RejectedIcon,
  Add as AddIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalance as BudgetIcon,
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
  AdminPanelSettings as AdminIcon
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { useAuthStore } from '../store/authStore';
import { requestService } from '../services/requestService';
import { approvalService } from '../services/approvalService';
import { budgetService } from '../services/budgetService';
import { Request, BudgetLine } from '../types';

const COLORS = ['#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0', '#00bcd4'];

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user, hasRole, hasPermission } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
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
      setIsLoading(true);
      const isApprover = hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK');

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

      try {
        const budgetResponse = await budgetService.getAll({ isActive: true });
        if (budgetResponse.success && budgetResponse.data) {
          const budgets = budgetResponse.data;
          const totalAllocated = budgets.reduce((sum: number, b: BudgetLine) => sum + (Number(b.allocated_amount) || 0), 0);
          const totalSpent = budgets.reduce((sum: number, b: BudgetLine) => sum + (Number(b.spent_amount) || 0), 0);
          setStats(prev => ({ ...prev, totalBudget: totalAllocated, totalSpent: totalSpent }));
          const low = budgets.filter((b: BudgetLine) =>
            Number(b.allocated_amount) > 0 && (Number(b.balance) / Number(b.allocated_amount)) < 0.1 && Number(b.balance) > 0
          );
          setLowBudgets(low);
        }
      } catch (err) {
        console.error('Error fetching budgets:', err);
      }
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
      case 'DISPATCHED': return 'info';
      default: return 'warning';
    }
  };

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
      stats: 'Coming Soon',
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
      </Box>
    );
  }

  return (
    <Box>
      {/* Welcome Banner */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: 'white',
          borderRadius: 2
        }}
      >
        <Grid container alignItems="center" justifyContent="space-between">
          <Grid item>
            <Typography variant="h5" fontWeight={600} gutterBottom>
              Welcome back, {user?.first_name}!
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              {user?.department_name} &bull; {user?.role?.replace(/_/g, ' ')}
            </Typography>
          </Grid>
          <Grid item>
            <Box display="flex" gap={1}>
              {hasRole('GENERAL_USER') && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
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
              {hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && stats.pendingApprovals > 0 && (
                <Button
                  variant="contained"
                  startIcon={<PendingIcon />}
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
          </Grid>
        </Grid>
      </Paper>

      {/* KPI Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && (
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
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

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
                '&:hover': mod.active ? { 
                  borderColor: mod.color,
                  boxShadow: `0 4px 20px ${alpha(mod.color, 0.15)}`
                } : {}
              }}
            >
              <CardActionArea
                onClick={() => mod.active && navigate(mod.path)}
                disabled={!mod.active}
                sx={{ p: 2.5 }}
              >
                <Box display="flex" alignItems="flex-start" gap={2}>
                  <Avatar sx={{ bgcolor: mod.bgColor, color: mod.color, width: 48, height: 48 }}>
                    {mod.icon}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={600} noWrap>
                      {mod.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
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
      <Grid container spacing={3}>
        {/* Request Status Chart */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 3, height: '100%', border: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Request Overview
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {pieData.length > 0 ? (
              <Box height={200}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Box display="flex" justifyContent="center" alignItems="center" height={200}>
                <Typography color="text.secondary">No data yet</Typography>
              </Box>
            )}
            {/* Legend */}
            <Box display="flex" justifyContent="center" gap={2} mt={1}>
              {pieData.map((entry, index) => (
                <Box key={entry.name} display="flex" alignItems="center" gap={0.5}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: COLORS[index] }} />
                  <Typography variant="caption">{entry.name}: {entry.value}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 3, height: '100%', border: `1px solid ${theme.palette.divider}` }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle1" fontWeight={600}>
                Recent Requests
              </Typography>
              <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/finance/requests')}>
                View All
              </Button>
            </Box>
            <Divider sx={{ mb: 1 }} />
            {recentRequests.length === 0 ? (
              <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={4}>
                <RequestIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No requests yet</Typography>
              </Box>
            ) : (
              <List disablePadding>
                {recentRequests.map((request, index) => (
                  <React.Fragment key={request.id}>
                    <ListItem
                      sx={{
                        px: 1,
                        py: 1,
                        cursor: 'pointer',
                        borderRadius: 1,
                        '&:hover': { backgroundColor: 'grey.50' }
                      }}
                      onClick={() => navigate(`/finance/requests/${request.id}`)}
                    >
                      <ListItemAvatar sx={{ minWidth: 40 }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
                          <RequestIcon sx={{ fontSize: 16 }} />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2" fontWeight={600}>
                              {request.request_code}
                            </Typography>
                            <Chip
                              label={request.status.replace(/_/g, ' ')}
                              size="small"
                              color={getStatusColor(request.status)}
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          </Box>
                        }
                        secondary={`$${Number(request.total_amount || 0).toLocaleString()} • ${request.department_name}`}
                        secondaryTypographyProps={{ fontSize: '0.75rem' }}
                      />
                    </ListItem>
                    {index < recentRequests.length - 1 && <Divider variant="inset" component="li" />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Budget Alerts & Quick Actions */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ p: 3, height: '100%', border: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Alerts & Quick Actions
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {/* Low Budget Alerts */}
            {lowBudgets.length > 0 && (
              <Box sx={{ mb: 2, p: 2, bgcolor: alpha(theme.palette.warning.main, 0.05), borderRadius: 1.5, border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}` }}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <WarningIcon color="warning" fontSize="small" />
                  <Typography variant="subtitle2" color="warning.dark">Low Budget Alerts</Typography>
                </Box>
                {lowBudgets.slice(0, 3).map((budget) => (
                  <Box key={budget.id} display="flex" justifyContent="space-between" alignItems="center" py={0.5}>
                    <Typography variant="caption" fontWeight={500}>{budget.budget_code}</Typography>
                    <Typography variant="caption" color="error">${Number(budget.balance || 0).toLocaleString()} left</Typography>
                  </Box>
                ))}
              </Box>
            )}

            {/* Quick Actions */}
            <Box display="flex" flexDirection="column" gap={1.5}>
              {hasRole('GENERAL_USER') && (
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  fullWidth
                  size="small"
                  onClick={() => navigate('/finance/requests/create')}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Create Float Request
                </Button>
              )}
              {hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK') && (
                <Button
                  variant="outlined"
                  startIcon={<PendingIcon />}
                  fullWidth
                  size="small"
                  onClick={() => navigate('/finance/approvals')}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Review Approvals ({stats.pendingApprovals})
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<BudgetIcon />}
                fullWidth
                size="small"
                onClick={() => navigate('/finance/budgets')}
                sx={{ justifyContent: 'flex-start' }}
              >
                View Budget Lines
              </Button>
              {hasRole('FINANCE_CLERK') && (
                <Button
                  variant="outlined"
                  startIcon={<DispatchIcon />}
                  fullWidth
                  size="small"
                  onClick={() => navigate('/finance/dispatch')}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Dispatch Desk
                </Button>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
