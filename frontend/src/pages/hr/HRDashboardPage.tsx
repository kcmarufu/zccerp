/**
 * HR Dashboard Page
 * Overview of HR metrics: employee stats, pending actions, upcoming events
 */

import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Paper, Typography, Card, CardContent, Chip, Divider,
  List, ListItem, ListItemText, ListItemAvatar, Avatar, CircularProgress,
  Alert, Button, Stack, LinearProgress, Tooltip, alpha, useTheme
} from '@mui/material';
import {
  People as PeopleIcon,
  EventNote as LeaveIcon,
  Warning as WarningIcon,
  Cake as BirthdayIcon,
  Description as ContractIcon,
  TrendingUp as TrendingUpIcon,
  Group as GroupIcon,
  PersonOff as InactiveIcon,
  ArrowForward as ArrowIcon,
  History as HistoryIcon,
  CheckCircle as ApprovedIcon,
  Cancel as RejectedIcon,
  HourglassTop as PendingIcon,
  BeachAccess as VacationIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { getHRDashboardStats } from '../../services/hrService';
import AccrualStatement from '../../components/hr/AccrualStatement';
import { HRDashboardStats } from '../../types';
import { formatDate } from '../../utils/datetime';

/**
 * The dashboard a member of staff sees.
 *
 * Deliberately answers only the questions they actually have: how many days do
 * I have, what happens next with what I have asked for, and how did my balance
 * get to this number.
 */
const PersonalHRDashboard: React.FC<{ data: any; navigate: (p: string) => void }> = ({ data, navigate }) => {
  const theme = useTheme();
  const { employee, balances = [], requestCounts, recentRequests = [] } = data;

  const num = (n: any) => (n === null || n === undefined ? '—' : Number(n).toFixed(1));

  const STATUS_META: Record<string, { label: string; color: 'warning' | 'success' | 'error' | 'default'; icon: React.ReactNode }> = {
    PENDING:   { label: 'Awaiting approval', color: 'warning', icon: <PendingIcon fontSize="small" /> },
    APPROVED:  { label: 'Approved',          color: 'success', icon: <ApprovedIcon fontSize="small" /> },
    REJECTED:  { label: 'Rejected',          color: 'error',   icon: <RejectedIcon fontSize="small" /> },
    CANCELLED: { label: 'Cancelled',         color: 'default', icon: null },
  };

  // The accrued pool is the number that actually matters day to day.
  const vacation = balances.find((b: any) => b.is_accrual_target) || balances[0];
  const vacRemaining = vacation ? Number(vacation.remaining_days) : 0;
  const vacTotal = vacation ? Number(vacation.total_days) + Number(vacation.carried_forward || 0) : 0;
  const usedPct = vacTotal > 0
    ? Math.min(100, Math.max(0, Math.round(((vacTotal - vacRemaining) / vacTotal) * 100)))
    : 0;

  return (
    <Box p={3}>
      {/* ── Greeting ── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {employee ? `Hello, ${String(employee.employee_name || '').split(' ')[0]}` : 'My HR Dashboard'}
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {employee
              ? [employee.position_title, employee.department_name, employee.employee_number]
                  .filter(Boolean).join(' • ')
              : 'Your leave position'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => navigate('/hr/leave')}>
            My Leave
          </Button>
          <Button variant="contained" startIcon={<LeaveIcon />} onClick={() => navigate('/hr/leave')}>
            Apply for Leave
          </Button>
        </Stack>
      </Box>

      {!employee && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Your employee record is created the first time you submit a leave request.
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ── Headline balance ── */}
        <Grid item xs={12} md={5}>
          <Paper
            elevation={0}
            sx={{
              p: 3, height: '100%',
              border: '1px solid', borderColor: 'divider',
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)}, ${alpha(theme.palette.primary.main, 0.02)})`,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <VacationIcon color="primary" />
              <Typography variant="subtitle2" color="text.secondary" fontWeight={700}>
                {vacation ? String(vacation.leave_type_name).toUpperCase() : 'LEAVE BALANCE'}
              </Typography>
            </Stack>

            <Box display="flex" alignItems="baseline" gap={1}>
              <Typography
                variant="h2"
                fontWeight={800}
                color={vacRemaining < 0 ? 'error.main' : 'primary.main'}
                lineHeight={1}
              >
                {num(vacRemaining)}
              </Typography>
              <Typography variant="h6" color="text.secondary">days available</Typography>
            </Box>

            {vacation && (
              <>
                <LinearProgress
                  variant="determinate"
                  value={usedPct}
                  sx={{ mt: 2, height: 8, borderRadius: 4 }}
                  color={vacRemaining < 0 ? 'error' : 'primary'}
                />
                <Stack direction="row" justifyContent="space-between" mt={0.75}>
                  <Typography variant="caption" color="text.secondary">
                    {num(vacation.used_days)} taken
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {num(vacation.pending_days)} awaiting approval
                  </Typography>
                </Stack>
              </>
            )}

            {vacRemaining < 0 && (
              <Alert severity="warning" sx={{ mt: 2, py: 0.5 }}>
                Your balance is negative — approved leave has run ahead of what you have accrued.
              </Alert>
            )}

            <Typography variant="caption" color="text.secondary" display="block" mt={2}>
              You earn 2.5 days on the 25th of every month.
            </Typography>
          </Paper>
        </Grid>

        {/* ── Request status ── */}
        <Grid item xs={12} md={7}>
          <Grid container spacing={2}>
            {[
              { key: 'pending',  label: 'Awaiting Approval', value: requestCounts?.pending  ?? 0, color: theme.palette.warning.main, icon: <PendingIcon /> },
              { key: 'approved', label: 'Approved',          value: requestCounts?.approved ?? 0, color: theme.palette.success.main, icon: <ApprovedIcon /> },
              { key: 'rejected', label: 'Rejected',          value: requestCounts?.rejected ?? 0, color: theme.palette.error.main,   icon: <RejectedIcon /> },
            ].map((c) => (
              <Grid item xs={12} sm={4} key={c.key}>
                <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                  <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                      <Box color={c.color} display="flex">{c.icon}</Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        {c.label.toUpperCase()}
                      </Typography>
                    </Stack>
                    <Typography variant="h4" fontWeight={700} sx={{ color: c.color }}>
                      {c.value}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      this year
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}

            {/* Other balances, if any type carries its own entitlement. */}
            {balances.filter((b: any) => !b.is_accrual_target).length > 0 && (
              <Grid item xs={12}>
                <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2" fontWeight={700} mb={1}>
                    Other Leave Types
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {balances.filter((b: any) => !b.is_accrual_target).map((b: any) => (
                      <Chip
                        key={b.id}
                        variant="outlined"
                        label={`${b.leave_type_name}: ${num(b.used_days)} taken`}
                      />
                    ))}
                  </Stack>
                </Paper>
              </Grid>
            )}

            {/* Recent requests */}
            <Grid item xs={12}>
              <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle2" fontWeight={700}>My Recent Requests</Typography>
                  <Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/hr/leave')}>
                    View all
                  </Button>
                </Box>
                {recentRequests.length === 0 ? (
                  <Box py={3} textAlign="center">
                    <Typography variant="body2" color="text.secondary">
                      You have not submitted any leave requests yet.
                    </Typography>
                  </Box>
                ) : (
                  <List dense disablePadding>
                    {recentRequests.map((r: any) => {
                      const meta = STATUS_META[r.status] || STATUS_META.CANCELLED;
                      return (
                        <ListItem
                          key={r.id}
                          disableGutters
                          secondaryAction={
                            <Chip label={meta.label} size="small" color={meta.color} />
                          }
                          sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 1 }}
                        >
                          <ListItemText
                            primary={
                              <Typography variant="body2" fontWeight={600}>
                                {r.leave_type_name} — {num(r.total_days)} day(s)
                              </Typography>
                            }
                            secondary={`${formatDate(r.start_date)} to ${formatDate(r.end_date)}`}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                )}
                {requestCounts?.rejected > 0 && (
                  <Alert severity="warning" sx={{ mt: 1.5, py: 0.5 }}>
                    A rejected request can be amended and resubmitted from the Leave page.
                  </Alert>
                )}
              </Paper>
            </Grid>
          </Grid>
        </Grid>

        {/* ── How the balance was built ── */}
        <Grid item xs={12}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" fontWeight={700} mb={0.5}
              display="flex" alignItems="center" gap={0.75}>
              <HistoryIcon fontSize="small" /> How My Leave Built Up
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
              Every monthly credit, manual adjustment and day taken, with a running balance.
            </Typography>
            <AccrualStatement />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

const HRDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<HRDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await getHRDashboardStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load HR dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!stats) return null;

  // Staff without oversight get a personal view. The API returns a different
  // shape for them (personal: true), carrying only their own leave position —
  // so none of the organisation-wide tiles below are rendered at all.
  if ((stats as any).personal) {
    return <PersonalHRDashboard data={stats as any} navigate={navigate} />;
  }

  const statCards = [
    { title: 'Total Employees', value: stats.totalEmployees || 0, icon: <PeopleIcon />, color: '#1976d2', path: '/hr/employees' },
    { title: 'Pending Leave Requests', value: stats.pendingLeaveRequests || 0, icon: <LeaveIcon />, color: '#ed6c02', path: '/hr/leave' },
    { title: 'Expiring Contracts', value: stats.expiringContracts || 0, icon: <WarningIcon />, color: '#d32f2f', path: '/hr/employees' },
    { title: 'Active Departments', value: (stats.byDepartment || []).length, icon: <GroupIcon />, color: '#2e7d32', path: '/hr/employees' }
  ];

  return (
    <Box p={3}>
      <Typography variant="h4" fontWeight="bold" mb={3}>HR Dashboard</Typography>

      {/* Stat Cards */}
      <Grid container spacing={2.5} mb={3}>
        {statCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card 
              elevation={0}
              sx={{ 
                border: '1px solid', borderColor: 'divider',
                cursor: 'pointer', 
                '&:hover': { boxShadow: 4 }, 
                transition: 'box-shadow 0.2s',
                height: '100%'
              }}
              onClick={() => navigate(card.path)}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={500} textTransform="uppercase" letterSpacing={0.5}>
                      {card.title}
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>{card.value}</Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: card.color + '1a', color: card.color, width: 44, height: 44 }}>{card.icon}</Avatar>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* By Department */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              <GroupIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Staff by Department
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {(stats.byDepartment || []).map((dept, index) => (
              <Box key={index} display="flex" justifyContent="space-between" alignItems="center" py={1}>
                <Typography variant="body2">{dept.department_name || 'Unassigned'}</Typography>
                <Chip label={dept.count} size="small" color="primary" variant="outlined" />
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* By Status */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Employment Status
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {(stats.byStatus || []).map((s, index) => (
              <Box key={index} display="flex" justifyContent="space-between" alignItems="center" py={1}>
                <Chip 
                  label={(s.employment_status || 'UNKNOWN').replace('_', ' ')} 
                  size="small" 
                  color={s.employment_status === 'ACTIVE' ? 'success' : s.employment_status === 'TERMINATED' ? 'error' : 'warning'}
                />
                <Typography variant="body1" fontWeight="bold">{s.count}</Typography>
              </Box>
            ))}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>By Contract Type</Typography>
            {(stats.byContractType || []).map((ct, index) => (
              <Box key={index} display="flex" justifyContent="space-between" alignItems="center" py={0.5}>
                <Typography variant="body2">{(ct.employment_type || 'UNKNOWN').replace('_', ' ')}</Typography>
                <Typography variant="body2" fontWeight="bold">{ct.count}</Typography>
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Upcoming Birthdays */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" fontWeight="bold" mb={2}>
              <BirthdayIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Upcoming Birthdays
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {(stats.upcomingBirthdays || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">No upcoming birthdays in the next 30 days</Typography>
            ) : (
              <List dense>
                {(stats.upcomingBirthdays || []).map((emp) => (
                  <ListItem key={emp.id} disablePadding sx={{ py: 0.5 }}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: '#e91e63', width: 32, height: 32 }}>
                        {emp.first_name[0]}{emp.last_name[0]}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={`${emp.first_name} ${emp.last_name}`}
                      secondary={
                        `${formatDate(emp.date_of_birth, { omitYear: true })}` +
                        ((emp as any).days_until !== undefined
                          ? ` — ${Number((emp as any).days_until) === 0
                              ? 'today'
                              : `in ${(emp as any).days_until} day(s)`}`
                          : '')
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* ── Expiring contracts ── */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" fontWeight="bold" mb={1.5}
              display="flex" alignItems="center" gap={1}>
              <ContractIcon fontSize="small" /> Contracts Expiring (next 90 days)
            </Typography>
            {((stats as any).expiringContractList || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No contracts expiring in the next 90 days
              </Typography>
            ) : (
              <List dense>
                {((stats as any).expiringContractList || []).map((c: any) => (
                  <ListItem key={c.id} disablePadding sx={{ py: 0.5 }}
                    secondaryAction={
                      <Chip
                        size="small"
                        label={`${c.days_remaining}d`}
                        color={c.days_remaining <= 30 ? 'error' : c.days_remaining <= 60 ? 'warning' : 'default'}
                      />
                    }>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: '#d32f2f', width: 32, height: 32 }}>
                        <ContractIcon fontSize="small" />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={c.employee_name}
                      secondary={`${String(c.contract_type || '').replace(/_/g, ' ')} — ends ${formatDate(c.end_date)}${c.department_name ? ` • ${c.department_name}` : ''}`}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Quick Actions */}
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" fontWeight="bold" mb={2}>Quick Actions</Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" startIcon={<PeopleIcon />} onClick={() => navigate('/hr/employees')}>
            Employee Directory
          </Button>
          <Button variant="outlined" startIcon={<LeaveIcon />} onClick={() => navigate('/hr/leave')}>
            Leave Management
          </Button>
          <Button variant="outlined" startIcon={<ContractIcon />} onClick={() => navigate('/hr/timesheets')}>
            Timesheets
          </Button>
          <Button variant="outlined" startIcon={<TrendingUpIcon />} onClick={() => navigate('/hr/performance')}>
            Performance Reviews
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};

export default HRDashboardPage;
