import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import {
  AccountBalance as BudgetIcon,
  Groups as UsersIcon,
  Inventory2 as AssetIcon,
  AssignmentTurnedIn as RequestsIcon,
  Person as HREmployeeIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import api from '../../services/api';

interface AdminOverviewResponse {
  summary: {
    users: { total: number; active: number };
    departments: { total: number };
    requests: { total: number; pending: number; approved: number; rejected: number };
    budgets: { total: number; allocated: number; spent: number };
    assets: { total: number; active: number };
    hrEmployees: { total: number; active: number };
  };
  roleDistribution: Array<{ role: string; count: number }>;
  departmentDistribution: Array<{
    department_name: string;
    department_code: string;
    user_count: number;
    active_users: number;
  }>;
  recentApprovals: Array<{
    created_at: string;
    action: string;
    approver_role: string;
    comments: string | null;
    request_code: string | null;
    actor_name: string | null;
  }>;
  recentBudgetTransactions: Array<{
    created_at: string;
    transaction_type: string;
    amount: number;
    budget_code: string | null;
    actor_name: string | null;
  }>;
}

const OverallAdminPage: React.FC = () => {
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllApprovals, setShowAllApprovals] = useState(false);
  const [showAllBudget, setShowAllBudget] = useState(false);

  useEffect(() => {
    const loadOverview = async () => {
      try {
        setIsLoading(true);
        const response = await api.get('/admin/overview');
        if (response.data?.success) {
          setData(response.data.data);
          setError(null);
        } else {
          setError('Failed to load admin overview data');
        }
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Failed to load admin overview data');
      } finally {
        setIsLoading(false);
      }
    };

    loadOverview();
  }, []);

  const budgetBalance = useMemo(() => {
    if (!data) return 0;
    const allocated = Number(data.summary.budgets.allocated || 0);
    const spent = Number(data.summary.budgets.spent || 0);
    return allocated - spent;
  }, [data]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return <Alert severity="error">{error || 'No admin overview data available.'}</Alert>;
  }

  return (
    <Box>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Overall Admin Control Center
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Super-admin visibility across users, departments, requests, budgets, assets, HR records, and recent activity.
        </Typography>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4} lg={4}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="caption" color="text.secondary">Users</Typography>
                <UsersIcon fontSize="small" color="primary" />
              </Box>
              <Typography variant="h5" fontWeight={700}>{data.summary.users.total}</Typography>
              <Typography variant="caption" color="success.main">{data.summary.users.active} active</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4} lg={4}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="caption" color="text.secondary">Requests</Typography>
                <RequestsIcon fontSize="small" color="primary" />
              </Box>
              <Typography variant="h5" fontWeight={700}>{data.summary.requests.total}</Typography>
              <Typography variant="caption" color="warning.main">{data.summary.requests.pending} pending</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4} lg={4}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="caption" color="text.secondary">Budget Lines</Typography>
                <BudgetIcon fontSize="small" color="primary" />
              </Box>
              <Typography variant="h5" fontWeight={700}>{data.summary.budgets.total}</Typography>
              <Typography variant="caption" color={budgetBalance >= 0 ? 'success.main' : 'error.main'}>
                ${budgetBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} balance
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4} lg={4}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="caption" color="text.secondary">Assets</Typography>
                <AssetIcon fontSize="small" color="primary" />
              </Box>
              <Typography variant="h5" fontWeight={700}>{data.summary.assets.total}</Typography>
              <Typography variant="caption" color="success.main">{data.summary.assets.active} active</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4} lg={4}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="caption" color="text.secondary">HR Employees</Typography>
                <HREmployeeIcon fontSize="small" color="primary" />
              </Box>
              <Typography variant="h5" fontWeight={700}>{data.summary.hrEmployees.total}</Typography>
              <Typography variant="caption" color="success.main">{data.summary.hrEmployees.active} active</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={6}>
          <Paper elevation={1} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Department Coverage</Typography>
            <Divider sx={{ mb: 2 }} />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Department</TableCell>
                    <TableCell align="right">Users</TableCell>
                    <TableCell align="right">Active</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.departmentDistribution.map((dept) => (
                    <TableRow key={dept.department_code}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{dept.department_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{dept.department_code}</Typography>
                      </TableCell>
                      <TableCell align="right">{dept.user_count}</TableCell>
                      <TableCell align="right">{dept.active_users}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Paper elevation={1} sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Role Distribution</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box display="flex" gap={1} flexWrap="wrap">
              {data.roleDistribution.map((item) => (
                <Chip
                  key={item.role}
                  label={`${item.role.replace(/_/g, ' ')}: ${item.count}`}
                  variant="outlined"
                />
              ))}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Paper elevation={1} sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6">Recent Approval Activity</Typography>
              {data.recentApprovals.length > 6 && (
                <Button size="small" onClick={() => setShowAllApprovals(v => !v)}>
                  {showAllApprovals ? 'Show Less' : `View More (${data.recentApprovals.length})`}
                </Button>
              )}
            </Box>
            <Divider sx={{ mb: 2 }} />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Action</TableCell>
                    <TableCell>Actor</TableCell>
                    <TableCell>When</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(showAllApprovals ? data.recentApprovals : data.recentApprovals.slice(0, 6)).map((row, idx) => (
                    <TableRow key={`${row.created_at}-${idx}`}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.action}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.request_code || 'N/A'}</Typography>
                      </TableCell>
                      <TableCell>{row.actor_name || 'System'}</TableCell>
                      <TableCell>
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Paper elevation={1} sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6">Recent Budget Activity</Typography>
              {data.recentBudgetTransactions.length > 6 && (
                <Button size="small" onClick={() => setShowAllBudget(v => !v)}>
                  {showAllBudget ? 'Show Less' : `View More (${data.recentBudgetTransactions.length})`}
                </Button>
              )}
            </Box>
            <Divider sx={{ mb: 2 }} />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Budget</TableCell>
                    <TableCell align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(showAllBudget ? data.recentBudgetTransactions : data.recentBudgetTransactions.slice(0, 6)).map((row, idx) => (
                    <TableRow key={`${row.created_at}-${idx}`}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{row.transaction_type}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.budget_code || 'N/A'}</TableCell>
                      <TableCell align="right">${Number(row.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default OverallAdminPage;
