/**
 * HR Dashboard Page
 * Overview of HR metrics: employee stats, pending actions, upcoming events
 */

import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Paper, Typography, Card, CardContent, Chip, Divider,
  List, ListItem, ListItemText, ListItemAvatar, Avatar, CircularProgress,
  Alert, Button, Stack
} from '@mui/material';
import {
  People as PeopleIcon,
  EventNote as LeaveIcon,
  Warning as WarningIcon,
  Cake as BirthdayIcon,
  Description as ContractIcon,
  TrendingUp as TrendingUpIcon,
  Group as GroupIcon,
  PersonOff as InactiveIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { getHRDashboardStats } from '../../services/hrService';
import { HRDashboardStats } from '../../types';

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
                      secondary={new Date(emp.date_of_birth).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
