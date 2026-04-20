/**
 * Dashboard Page Component
 * Role-specific dashboard with stats and quick actions
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
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  CircularProgress,
  Divider
} from '@mui/material';
import {
  Description as RequestIcon,
  CheckCircle as ApprovedIcon,
  HourglassEmpty as PendingIcon,
  Cancel as RejectedIcon,
  Add as AddIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalance as BudgetIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { useAuthStore } from '../store/authStore';
import { requestService } from '../services/requestService';
import { approvalService } from '../services/approvalService';
import { budgetService } from '../services/budgetService';
import { Request, BudgetLine } from '../types';

const COLORS = ['#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0'];

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
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

      // Fetch budget info
      try {
        const budgetResponse = await budgetService.getAll({ isActive: true });
        if (budgetResponse.success && budgetResponse.data) {
          const budgets = budgetResponse.data;
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
      default: return 'warning';
    }
  };

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
      </Box>
    );
  }

  return (
    <Box>
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
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

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
              </Box>
            </CardContent>
          </Card>
        </Grid>

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
              </Box>
            </CardContent>
          </Card>
        </Grid>

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
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {pieData.map((entry, index) => (
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
                ))}
              </List>
            )}
          </Paper>
        </Grid>

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
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
