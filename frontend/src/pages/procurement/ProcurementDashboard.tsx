/**
 * Procurement Dashboard Page
 * Role-based dashboard showing relevant KPIs and quick actions
 */

import React from 'react';
import {
  Box, Grid, Paper, Typography, Chip, Button, Card, CardContent,
  CardActionArea, Avatar, Divider, CircularProgress, Alert, List,
  ListItem, ListItemText, ListItemAvatar, alpha, useTheme, Stack,
  LinearProgress, Tooltip
} from '@mui/material';
import {
  ShoppingCart as ProcIcon,
  AddCircle as AddIcon,
  HourglassEmpty as PendingIcon,
  CheckCircle as DoneIcon,
  Cancel as RejectedIcon,
  Gavel as CommitteeIcon,
  Store as VendorIcon,
  Assignment as RequestIcon,
  TrendingUp as TrendIcon,
  ReceiptLong as QuotIcon,
  NavigateNext as NavIcon,
  FactCheck as ReviewIcon,
  AccountBalance as FinanceIcon,
  ArrowForward as ArrowIcon,
  VerifiedUser as GavelIcon,
  TaskAlt as ConfirmIcon,
  Payments as PaymentIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from '../../utils/datetime';
import { useAuthStore } from '../../store/authStore';
import { getProcurementDashboard, PROC_STATUS_LABELS, PROC_STATUS_COLORS } from '../../services/procurementService';
import { ProcurementStatus } from '../../types';

// Workflow pipeline — every stage a purchase request passes through, in order.
// `keys` lists the statuses counted at a stage (a request returned to
// Procurement after the Committee is counted with Procurement); `optional`
// stages are only passed by some requests (Head of Department requests go to
// the General Secretary; only awards of USD 5,000+ need the high-value pair).
const PIPELINE_STEPS: { key: string; keys: string[]; label: string; hint: string; icon: React.ReactElement; color: string; optional?: boolean }[] = [
  { key: 'DEPT', keys: ['PENDING_DEPT_APPROVAL'], label: 'Dept\nApproval', hint: 'Awaiting the Department Lead / Head of Department', icon: <ReviewIcon sx={{ fontSize: 18 }} />, color: '#ed6c02' },
  { key: 'GS', keys: ['PENDING_GS_APPROVAL'], label: 'GS\nApproval', hint: "A Head of Department's request, awaiting the General Secretary", icon: <ReviewIcon sx={{ fontSize: 18 }} />, color: '#6a1b9a', optional: true },
  { key: 'PROC', keys: ['PENDING_PROCUREMENT', 'RETURNED_TO_PROCUREMENT'], label: 'Procurement', hint: 'Quotations being collected, or returned to Procurement to amend', icon: <QuotIcon sx={{ fontSize: 18 }} />, color: '#7b1fa2' },
  { key: 'COMMITTEE', keys: ['PENDING_COMMITTEE'], label: 'Committee', hint: 'Awaiting the Procurement Committee votes', icon: <CommitteeIcon sx={{ fontSize: 18 }} />, color: '#0288d1' },
  { key: 'HV', keys: ['PENDING_HIGH_VALUE_APPROVAL'], label: 'High-Value\nApproval', hint: 'USD 5,000+: awaiting the Super Admin and the Finance Head of Department', icon: <GavelIcon sx={{ fontSize: 18 }} />, color: '#5e35b1', optional: true },
  { key: 'CONFIRM', keys: ['PENDING_DEPT_CONFIRMATION'], label: 'Dept\nConfirmation', hint: 'The department confirms the award', icon: <ConfirmIcon sx={{ fontSize: 18 }} />, color: '#f57c00' },
  { key: 'FINANCE', keys: ['PENDING_FINAL_FINANCE', 'PENDING_FINANCE_APPROVAL'], label: 'Finance\nApproval', hint: 'Awaiting Finance approval', icon: <FinanceIcon sx={{ fontSize: 18 }} />, color: '#00695c' },
  { key: 'PAYMENT', keys: ['PENDING_PAYMENT'], label: 'Awaiting\nPayment', hint: 'Approved — funds reserved; Finance records the payment and proof of payment', icon: <PaymentIcon sx={{ fontSize: 18 }} />, color: '#0277bd' },
  { key: 'DONE', keys: ['COMPLETED'], label: 'Completed', hint: 'Paid in full', icon: <DoneIcon sx={{ fontSize: 18 }} />, color: '#2e7d32' },
];

const ProcurementDashboard: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, hasRole, hasPermission, isAdminHrManager } = useAuthStore();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['proc-dashboard'],
    queryFn: getProcurementDashboard,
    refetchInterval: 30000
  });

  const canCreate = hasPermission('create_purchase_request');
  const canApprove = hasPermission('approve_purchase_request') || hasPermission('proc_finance_approve');
  const canManageQuotations = hasPermission('manage_quotations');
  const canCommittee = hasPermission('committee_review');
  const isAdminHr = isAdminHrManager();

  const kpiCards = [
    {

      label: 'Pending Approval',
      sublabel: 'Awaiting dept/finance',
      value: stats?.totalPending ?? '—',
      icon: <PendingIcon />,
      gradient: 'linear-gradient(135deg, #e65100 0%, #bf360c 100%)',
      show: canApprove || hasRole('ADMIN')
    },
    {
      label: 'In Procurement',
      sublabel: 'Quotation stage',
      value: stats?.totalInProcurement ?? '—',
      icon: <QuotIcon />,
      gradient: 'linear-gradient(135deg, #6a1b9a 0%, #4a148c 100%)',
      show: canManageQuotations || hasRole('ADMIN', 'FINANCE_CLERK') || isAdminHr
    },
    {
      label: 'At Committee',
      sublabel: 'Awaiting all 3 votes',
      value: stats?.totalAwaitingCommittee ?? '—',
      icon: <CommitteeIcon />,
      gradient: 'linear-gradient(135deg, #0277bd 0%, #01579b 100%)',
      show: canCommittee || hasRole('ADMIN', 'FINANCE_CLERK') || isAdminHr
    },
    {
      label: 'Completed',
      sublabel: 'Successfully processed',
      value: stats?.totalCompleted ?? '—',
      icon: <DoneIcon />,
      gradient: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
      show: true
    },
    {
      label: 'Rejected',
      sublabel: 'Did not proceed',
      value: stats?.totalRejected ?? '—',
      icon: <RejectedIcon />,
      gradient: 'linear-gradient(135deg, #c62828 0%, #b71c1c 100%)',
      show: true
    }
  ].filter(c => c.show);

  const quickActions = [
    {
      label: 'New Request',
      description: 'Submit purchase request',
      icon: <AddIcon sx={{ fontSize: 28 }} />,
      color: '#1565c0',
      path: '/procurement/requests/create',
      show: canCreate
    },
    {
      label: 'My Requests',
      description: 'Track your submissions',
      icon: <RequestIcon sx={{ fontSize: 28 }} />,
      color: '#2e7d32',
      path: '/procurement/requests',
      show: true
    },
    {
      label: 'Approval Queue',
      description: 'Items needing action',
      icon: <PendingIcon sx={{ fontSize: 28 }} />,
      color: '#e65100',
      path: '/procurement/approvals',
      show: canApprove || canManageQuotations || canCommittee
    },
    {
      label: 'Vendors',
      description: 'Manage supplier database',
      icon: <VendorIcon sx={{ fontSize: 28 }} />,
      color: '#6a1b9a',
      path: '/procurement/vendors',
      show: canManageQuotations || isAdminHr
    }
  ].filter(a => a.show);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, md: 3 }, mb: 3,
          background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 50%, #0a3d91 100%)',
          color: 'white', borderRadius: 2, position: 'relative', overflow: 'hidden'
        }}
      >
        {/* Decorative circles */}
        <Box sx={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)' }} />
        <Box sx={{ position: 'absolute', bottom: -20, right: 80, width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)' }} />
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} position="relative">
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.15)', width: 52, height: 52 }}>
              <ProcIcon sx={{ fontSize: 30 }} />
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight={800} letterSpacing={-0.5}>Procurement Module</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.25 }}>
                Purchase requests · Vendor management · Committee approvals
              </Typography>
            </Box>
          </Box>
          {canCreate && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/procurement/requests/create')}
              sx={{ bgcolor: 'white', color: '#1565c0', fontWeight: 700,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                '&:hover': { bgcolor: '#e3f2fd', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' } }}
            >
              New Request
            </Button>
          )}
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>Failed to load dashboard data.</Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }} alignItems="stretch">
        {kpiCards.map((card) => (
          <Grid item xs={6} sm={4} md={2} key={card.label} sx={{ display: 'flex' }}>
            <Paper elevation={3} sx={{
              p: 2, borderRadius: 2, width: '100%',
              background: card.gradient, color: 'white',
              transition: 'transform 0.15s, box-shadow 0.15s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 6 }
            }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.18)', width: 36, height: 36 }}>
                  {React.cloneElement(card.icon, { sx: { fontSize: 18, color: 'white' } })}
                </Avatar>
              </Box>
              <Typography variant="h4" fontWeight={800} sx={{ lineHeight: 1, mb: 0.5 }}>
                {card.value}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 600, display: 'block' }}>
                {card.label}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.63rem' }}>
                {card.sublabel}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Workflow Pipeline */}
      <Paper elevation={1} sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
        <Box display="flex" alignItems="baseline" justifyContent="space-between" flexWrap="wrap" gap={1} mb={2}>
          <Typography variant="h6" fontWeight={700}>Approval Pipeline</Typography>
          <Typography variant="caption" color="text.secondary">
            {(() => {
              const open = PIPELINE_STEPS.filter(s => s.key !== 'DONE')
                .reduce((n, s) => n + s.keys.reduce((m, k) => m + ((stats?.statusSummary as any)?.[k] || 0), 0), 0);
              const rejected = (stats?.statusSummary as any)?.REJECTED || 0;
              return `${open} in progress · ${rejected} rejected / awaiting amendment · dashed stages apply to some requests only`;
            })()}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, overflowX: 'auto', pb: 0.5 }}>
          {PIPELINE_STEPS.map((step, idx) => {
            const summary = (stats?.statusSummary as any) || {};
            const count = step.keys.reduce((n, k) => n + (summary[k] || 0), 0);
            const returned = step.key === 'PROC' ? (summary.RETURNED_TO_PROCUREMENT || 0) : 0;
            return (
              <React.Fragment key={step.key}>
                <Tooltip title={`${step.hint} — ${count} request${count !== 1 ? 's' : ''}`}>
                  <Box sx={{
                    flex: '1 0 92px', minWidth: 92, p: 1.25, borderRadius: 1.5, textAlign: 'center', cursor: 'default',
                    bgcolor: count > 0 ? alpha(step.color, 0.1) : 'grey.50',
                    border: `2px ${step.optional ? 'dashed' : 'solid'} ${count > 0 ? step.color : theme.palette.divider}`,
                    transition: 'all 0.2s',
                    '&:hover': count > 0 ? { bgcolor: alpha(step.color, 0.18) } : {}
                  }}>
                    <Avatar sx={{ bgcolor: count > 0 ? step.color : 'grey.300', width: 30, height: 30, mx: 'auto', mb: 0.5 }}>
                      {step.icon}
                    </Avatar>
                    <Typography variant="caption" fontWeight={700} sx={{ whiteSpace: 'pre-line', display: 'block', lineHeight: 1.2, minHeight: '2.4em', color: count > 0 ? step.color : 'text.disabled' }}>
                      {step.label}
                    </Typography>
                    <Typography variant="h6" fontWeight={800} color={count > 0 ? step.color : 'text.disabled'}>
                      {count}
                    </Typography>
                    {returned > 0 && (
                      <Typography variant="caption" sx={{ fontSize: '0.62rem', color: step.color, display: 'block', lineHeight: 1.1 }}>
                        {returned} returned
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
                {idx < PIPELINE_STEPS.length - 1 && (
                  <ArrowIcon sx={{ color: 'text.disabled', flexShrink: 0, alignSelf: 'center', fontSize: 18 }} />
                )}
              </React.Fragment>
            );
          })}
        </Box>
      </Paper>

      <Grid container spacing={3} alignItems="stretch">
        {/* Quick Actions */}
        {quickActions.length > 0 && (
          <Grid item xs={12} md={5}>
            <Paper elevation={1} sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
              <Typography variant="h6" fontWeight={700} mb={2}>Quick Actions</Typography>
              <Grid container spacing={1.5}>
                {quickActions.map((action) => (
                  <Grid item xs={6} key={action.label}>
                    <Card elevation={0} sx={{
                      border: `1.5px solid ${theme.palette.divider}`, borderRadius: 2,
                      transition: 'all 0.18s',
                      '&:hover': { borderColor: action.color, boxShadow: `0 4px 16px ${alpha(action.color, 0.22)}`, transform: 'translateY(-2px)' }
                    }}>
                      <CardActionArea onClick={() => navigate(action.path)} sx={{ p: 2, textAlign: 'center' }}>
                        <Avatar sx={{ bgcolor: alpha(action.color, 0.12), color: action.color, width: 48, height: 48, mx: 'auto', mb: 1 }}>
                          {action.icon}
                        </Avatar>
                        <Typography variant="body2" fontWeight={700} color="text.primary">{action.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{action.description}</Typography>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          </Grid>
        )}

        {/* Recent Requests */}
        <Grid item xs={12} md={quickActions.length > 0 ? 7 : 12}>
          <Paper elevation={1} sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Typography variant="h6" fontWeight={700}>Recent Requests</Typography>
              <Button size="small" endIcon={<NavIcon />} onClick={() => navigate('/procurement/requests')}>
                View All
              </Button>
            </Box>
            {stats?.recentRequests && stats.recentRequests.length > 0 ? (
              <List dense disablePadding>
                {stats.recentRequests.map((req, idx) => (
                  <React.Fragment key={req.id}>
                    {idx > 0 && <Divider component="li" />}
                    <ListItem
                      disablePadding
                      sx={{ py: 1, cursor: 'pointer', borderRadius: 1, px: 0.5,
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) } }}
                      onClick={() => navigate(`/procurement/requests/${req.id}`)}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: alpha('#1565c0', 0.1), color: '#1565c0', fontSize: '0.78rem', fontWeight: 700 }}>
                          {(req.first_name?.[0] || '') + (req.last_name?.[0] || '')}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2" fontWeight={700}>{req.request_code}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>{req.title || ''}</Typography>
                          </Box>
                        }
                        secondary={
                          <Box display="flex" alignItems="center" gap={0.75} mt={0.25}>
                            <Chip
                              label={PROC_STATUS_LABELS[req.status] || req.status}
                              color={PROC_STATUS_COLORS[req.status] as any || 'default'}
                              size="small"
                              sx={{ fontSize: '0.62rem', height: 18 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {req.first_name} {req.last_name}
                            </Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                              {format(new Date(req.created_at), 'dd MMM')}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            ) : (
              <Box textAlign="center" py={4}>
                <TrendIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">No requests yet</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ProcurementDashboard;
