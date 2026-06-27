/**
 * Leave Management Page
 * Two-stage departmental approval workflow
 *   Stage 1 – PROGRAM_LEAD / HEAD_OF_PROGRAMS (departmental)
 *   Stage 2 – ADMIN (HR Office final approval)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, IconButton, MenuItem, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField,
  CircularProgress, Alert, Tabs, Tab, Tooltip, Badge, Stepper, Step,
  StepLabel, StepConnector, Divider, Card, CardContent, LinearProgress,
  Select, FormControl, InputLabel, alpha, useTheme
} from '@mui/material';
import {
  Add as AddIcon,
  Check as ApproveIcon,
  Close as RejectIcon,
  EventNote as LeaveIcon,
  Person as PersonIcon,
  Business as DeptIcon,
  AdminPanelSettings as HRIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Schedule as PendingIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import {
  getLeaveRequests, createLeaveRequest, approveLeaveRequest, getLeaveTypes, getLeaveBalances
} from '../../services/hrService';
import { HRLeaveRequest, HRLeaveType, HRLeaveBalance, LeaveStatus } from '../../types';
import { useAuthStore } from '../../store/authStore';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtDt = (d: string) =>
  new Date(d).toLocaleDateString('en-ZW', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_META: Record<LeaveStatus, { label: string; color: 'warning' | 'info' | 'success' | 'error' | 'default' }> = {
  PENDING:       { label: 'Awaiting Dept. Approval', color: 'warning' },
  DEPT_APPROVED: { label: 'Dept. Approved — Awaiting HR',  color: 'info'    },
  APPROVED:      { label: 'Approved',                color: 'success'  },
  REJECTED:      { label: 'Rejected',                color: 'error'    },
  CANCELLED:     { label: 'Cancelled',               color: 'default'  },
  ESCALATED:     { label: 'Escalated to HR',         color: 'warning'  },
};

// ─── Leave Balance Card ──────────────────────────────────────────────────────

const BalanceCard: React.FC<{ balance: HRLeaveBalance }> = ({ balance }) => {
  const pct = balance.total_days > 0 ? Math.round(((balance.total_days - balance.used_days) / balance.total_days) * 100) : 0;
  const color = pct > 50 ? '#2e7d32' : pct > 20 ? '#ed6c02' : '#d32f2f';
  return (
    <Card elevation={0} sx={{ minWidth: 180, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>
          {balance.leave_type_name}
        </Typography>
        <Box display="flex" alignItems="baseline" gap={0.5} mt={0.5}>
          <Typography variant="h4" fontWeight={700} color={color}>{balance.remaining_days}</Typography>
          <Typography variant="body2" color="text.secondary">/ {balance.total_days} days</Typography>
        </Box>
        <LinearProgress variant="determinate" value={pct} sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: alpha(color, 0.15), '& .MuiLinearProgress-bar': { bgcolor: color } }} />
        <Stack direction="row" justifyContent="space-between" mt={0.75}>
          <Typography variant="caption" color="text.secondary">Used: {balance.used_days}</Typography>
          <Typography variant="caption" color="text.secondary">Pending: {balance.pending_days}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
};

// ─── Approval Stage Stepper ──────────────────────────────────────────────────

const ApprovalStepper: React.FC<{ request: HRLeaveRequest }> = ({ request }) => {
  const theme = useTheme();
  const { status } = request;

  type Stage = { label: string; sublabel?: string; state: 'done' | 'active' | 'rejected' | 'pending' };

  const stages: Stage[] = [
    {
      label: 'Submitted',
      sublabel: fmt(request.created_at),
      state: 'done',
    },
    {
      label: 'Dept. Review',
      sublabel: request.dept_approved_by_name
        ? (status === 'REJECTED' && request.dept_rejection_reason ? `Rejected by ${request.dept_approved_by_name}` : `Approved by ${request.dept_approved_by_name}`)
        : (status === 'REJECTED' && request.dept_rejection_reason ? 'Rejected' : 'Pending'),
      state:
        status === 'REJECTED' && request.dept_rejection_reason ? 'rejected'
        : ['DEPT_APPROVED', 'APPROVED'].includes(status) ? 'done'
        : status === 'PENDING' ? 'active'
        : 'pending',
    },
    {
      label: 'HR Approval',
      sublabel: request.approved_by_name
        ? (status === 'REJECTED' && request.hr_rejection_reason ? `Rejected by ${request.approved_by_name}` : `Approved by ${request.approved_by_name}`)
        : (status === 'APPROVED' ? 'Approved' : status === 'DEPT_APPROVED' ? 'Pending' : '—'),
      state:
        status === 'APPROVED' ? 'done'
        : status === 'REJECTED' && request.hr_rejection_reason ? 'rejected'
        : status === 'DEPT_APPROVED' ? 'active'
        : 'pending',
    },
  ];

  const stateColor = (s: Stage['state']) => {
    if (s === 'done')     return theme.palette.success.main;
    if (s === 'active')   return theme.palette.warning.main;
    if (s === 'rejected') return theme.palette.error.main;
    return theme.palette.grey[400];
  };

  const stateIcon = (s: Stage['state']) => {
    if (s === 'done')     return <CheckCircleIcon sx={{ fontSize: 18, color: theme.palette.success.main }} />;
    if (s === 'rejected') return <CancelIcon      sx={{ fontSize: 18, color: theme.palette.error.main   }} />;
    if (s === 'active')   return <PendingIcon     sx={{ fontSize: 18, color: theme.palette.warning.main }} />;
    return <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${theme.palette.grey[300]}` }} />;
  };

  return (
    <Box display="flex" alignItems="flex-start" gap={0}>
      {stages.map((stage, i) => (
        <React.Fragment key={stage.label}>
          <Box display="flex" flexDirection="column" alignItems="center" sx={{ minWidth: 100 }}>
            <Box display="flex" alignItems="center" gap={0.5}>
              {stateIcon(stage.state)}
              <Typography variant="caption" fontWeight={600} color={stateColor(stage.state)}>
                {stage.label}
              </Typography>
            </Box>
            {stage.sublabel && (
              <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ mt: 0.25, fontSize: '0.65rem', maxWidth: 90 }}>
                {stage.sublabel}
              </Typography>
            )}
          </Box>
          {i < stages.length - 1 && (
            <Box sx={{ flex: 1, height: 2, bgcolor: stateColor(stages[i + 1].state === 'done' || stages[i + 1].state === 'rejected' ? stages[i + 1].state : stage.state), mt: 1, mx: 0.5, borderRadius: 1, minWidth: 24 }} />
          )}
        </React.Fragment>
      ))}
    </Box>
  );
};

// ─── Detail Dialog ────────────────────────────────────────────────────────────

const DetailDialog: React.FC<{ request: HRLeaveRequest | null; onClose: () => void }> = ({ request, onClose }) => {
  if (!request) return null;
  const meta = STATUS_META[request.status] || STATUS_META.PENDING;
  return (
    <Dialog open={!!request} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Leave Request Details</Typography>
          <Typography variant="caption" color="text.secondary">ID #{request.id}</Typography>
        </Box>
        <Chip label={meta.label} color={meta.color} size="small" />
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Employee</Typography><Typography variant="body2" fontWeight={600}>{request.employee_name}</Typography></Grid>
          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Department</Typography><Typography variant="body2" fontWeight={600}>{request.department_name || '—'}</Typography></Grid>
          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Leave Type</Typography><Typography variant="body2" fontWeight={600}>{request.leave_type_name}</Typography></Grid>
          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Days Requested</Typography><Typography variant="body2" fontWeight={600}>{request.total_days} day(s)</Typography></Grid>
          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Start Date</Typography><Typography variant="body2" fontWeight={600}>{fmt(request.start_date)}</Typography></Grid>
          <Grid item xs={6}><Typography variant="caption" color="text.secondary">End Date</Typography><Typography variant="body2" fontWeight={600}>{fmt(request.end_date)}</Typography></Grid>
          {request.reason && (
            <Grid item xs={12}><Typography variant="caption" color="text.secondary">Reason</Typography><Typography variant="body2">{request.reason}</Typography></Grid>
          )}
        </Grid>

        <Typography variant="subtitle2" fontWeight={700} mt={2.5} mb={1}>Approval Timeline</Typography>
        <ApprovalStepper request={request} />

        {/* Stage 1 detail */}
        {(request.dept_approved_by || request.dept_rejection_reason) && (
          <Paper elevation={0} sx={{ mt: 2, p: 1.5, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>DEPARTMENTAL DECISION</Typography>
            {request.dept_approved_by_name && <Typography variant="body2" mt={0.5}><strong>By:</strong> {request.dept_approved_by_name}</Typography>}
            {request.dept_approved_at     && <Typography variant="body2"><strong>At:</strong> {fmtDt(request.dept_approved_at)}</Typography>}
            {request.dept_rejection_reason && <Typography variant="body2" color="error.main"><strong>Reason:</strong> {request.dept_rejection_reason}</Typography>}
          </Paper>
        )}

        {/* Stage 2 detail */}
        {(request.approved_by || request.hr_rejection_reason) && (
          <Paper elevation={0} sx={{ mt: 1.5, p: 1.5, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>HR OFFICE DECISION</Typography>
            {request.approved_by_name   && <Typography variant="body2" mt={0.5}><strong>By:</strong> {request.approved_by_name}</Typography>}
            {request.approved_at        && <Typography variant="body2"><strong>At:</strong> {fmtDt(request.approved_at)}</Typography>}
            {request.hr_rejection_reason && <Typography variant="body2" color="error.main"><strong>Reason:</strong> {request.hr_rejection_reason}</Typography>}
            {request.approval_comments && !request.hr_rejection_reason && <Typography variant="body2"><strong>Comments:</strong> {request.approval_comments}</Typography>}
          </Paper>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const LeaveManagementPage: React.FC = () => {
  const theme = useTheme();
  const { user } = useAuthStore();

  const isGeneralUser  = user?.role === 'GENERAL_USER';
  const isDeptApprover = user?.role === 'PROGRAM_LEAD' || user?.role === 'HEAD_OF_PROGRAMS';
  const isHROffice     = user?.role === 'ADMIN';

  // tabs: 0 = My Leave, 1 = Team Approvals (dept approver) OR All Requests (HR), 2 = HR Overview (HR only)
  const TAB_MY     = 0;
  const TAB_TEAM   = 1;
  const TAB_HR_ALL = 2;

  const [tab, setTab]                   = useState(TAB_MY);
  const [requests, setRequests]         = useState<HRLeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes]     = useState<HRLeaveType[]>([]);
  const [balances, setBalances]         = useState<HRLeaveBalance[]>([]);
  const [loading, setLoading]           = useState(true);
  const [page, setPage]                 = useState(0);
  const [rowsPerPage, setRowsPerPage]   = useState(25);
  const [total, setTotal]               = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter]     = useState(new Date().getFullYear());
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [detailReq, setDetailReq]       = useState<HRLeaveRequest | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const [approvalDialog, setApprovalDialog] = useState<{
    open: boolean; request: HRLeaveRequest | null; approve: boolean
  }>({ open: false, request: null, approve: true });
  const [approvalComments, setApprovalComments] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);

  const { control, handleSubmit, reset, formState: { errors }, watch } = useForm();
  const watchStart = watch('start_date');
  const watchEnd   = watch('end_date');

  // Calculated days preview
  const calcDays = () => {
    if (!watchStart || !watchEnd) return null;
    const diff = Math.ceil((new Date(watchEnd).getTime() - new Date(watchStart).getTime()) / 86400000) + 1;
    return diff > 0 ? diff : null;
  };

  // ── data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const baseFilters: any = {
        page: page + 1,
        limit: rowsPerPage,
        status: statusFilter || undefined,
        year: yearFilter,
      };

      // TAB_MY → my own requests (all roles)
      // TAB_TEAM → dept approver sees dept requests; HR sees DEPT_APPROVED needing final approval
      // TAB_HR_ALL → HR sees everything (no dept filter)

      if (tab === TAB_MY) {
        // General users – scoped in backend; others pass their own employeeId if needed
        // Backend auto-scopes GENERAL_USER to their employee record
      } else if (tab === TAB_TEAM) {
        if (isDeptApprover) {
          baseFilters.departmentId = user?.department_id;
          if (!statusFilter) baseFilters.status = 'PENDING';
        } else if (isHROffice) {
          if (!statusFilter) baseFilters.status = 'DEPT_APPROVED';
        }
      }
      // TAB_HR_ALL → no additional filter, ADMIN sees all in backend

      const [reqResult, types] = await Promise.all([
        getLeaveRequests(baseFilters),
        getLeaveTypes(),
      ]);

      setRequests(reqResult.data);
      setTotal(reqResult.pagination.total);
      setLeaveTypes(types);

      // Pending badge counts
      if (isDeptApprover || isHROffice) {
        const pendFilter = isDeptApprover
          ? { status: 'PENDING',       departmentId: user?.department_id, page: 1, limit: 1 }
          : { status: 'DEPT_APPROVED', page: 1, limit: 1 };
        const pRes = await getLeaveRequests(pendFilter);
        setPendingCount(pRes.pagination.total);
      }

      // Leave balances for My Leave tab
      if (tab === TAB_MY && user) {
        // Balances are loaded via employee ID — handled by backend scoping
        // We'll load them separately if employeeId is available from first request
        const myReq = reqResult.data[0];
        if (myReq?.employee_id) {
          try {
            const bal = await getLeaveBalances(myReq.employee_id, yearFilter);
            setBalances(bal);
          } catch { /* balances not critical */ }
        }
      }
    } catch (err) {
      toast.error('Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter, yearFilter, tab, user, isDeptApprover, isHROffice]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── submit leave ─────────────────────────────────────────────────────────────

  const onSubmitLeave = async (data: any) => {
    try {
      await createLeaveRequest(data);
      toast.success('Leave request submitted successfully');
      setDialogOpen(false);
      reset();
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit leave request');
    }
  };

  // ── approval action ──────────────────────────────────────────────────────────

  const handleApproval = async () => {
    if (!approvalDialog.request) return;
    setApprovalLoading(true);
    try {
      await approveLeaveRequest(approvalDialog.request.id, {
        approved: approvalDialog.approve,
        comments: approvalComments,
      });
      const action = approvalDialog.approve
        ? (isDeptApprover ? 'forwarded to HR Office for final approval' : 'approved')
        : 'rejected';
      toast.success(`Leave request ${action}`);
      setApprovalDialog({ open: false, request: null, approve: true });
      setApprovalComments('');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to process leave request');
    } finally {
      setApprovalLoading(false);
    }
  };

  // ── helpers ───────────────────────────────────────────────────────────────────

  const canActOn = (req: HRLeaveRequest) => {
    if (isDeptApprover) return req.status === 'PENDING';
    if (isHROffice) return req.status === 'PENDING' || req.status === 'DEPT_APPROVED';
    return false;
  };

  const approveTooltip = isDeptApprover
    ? 'Approve and forward to HR Office'
    : 'Give final HR approval';

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  // ── status filter options ─────────────────────────────────────────────────────

  const statusOptions = [
    { value: '',              label: 'All Statuses' },
    { value: 'PENDING',       label: 'Pending (Dept)' },
    { value: 'DEPT_APPROVED', label: 'Dept. Approved' },
    { value: 'APPROVED',      label: 'Approved' },
    { value: 'REJECTED',      label: 'Rejected' },
    { value: 'CANCELLED',     label: 'Cancelled' },
  ];

  // ── tabs config ───────────────────────────────────────────────────────────────

  const tabs = [
    { label: 'My Leave', icon: <PersonIcon fontSize="small" /> },
    ...(isDeptApprover || isHROffice ? [{
      label: isDeptApprover ? 'Team Approvals' : 'Pending HR Approval',
      icon: <DeptIcon fontSize="small" />,
      badge: pendingCount,
    }] : []),
    ...(isHROffice ? [{ label: 'All Leave Requests', icon: <HRIcon fontSize="small" /> }] : []),
  ];

  // ── table columns logic ───────────────────────────────────────────────────────

  const showDept    = isHROffice || (isDeptApprover && tab !== TAB_MY);
  const showActions = (isDeptApprover || isHROffice) && tab !== TAB_MY && tab !== TAB_HR_ALL;
  const showActionsHR = isHROffice && tab === TAB_TEAM;

  return (
    <Box p={3}>
      {/* ── Header ── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700} display="flex" alignItems="center" gap={1}>
            <LeaveIcon color="primary" />
            Leave Management
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {isHROffice
              ? 'HR Office — Full visibility and final approval authority'
              : isDeptApprover
              ? 'Departmental approver — Review and forward leave requests'
              : 'Apply for leave and track your request status'}
          </Typography>
        </Box>
        {!isHROffice && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { reset(); setDialogOpen(true); }}>
            Apply for Leave
          </Button>
        )}
      </Box>

      {/* ── Leave Balance Cards (My Leave tab only) ── */}
      {tab === TAB_MY && balances.length > 0 && (
        <Box mb={3}>
          <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={1.5}>
            MY LEAVE BALANCES — {yearFilter}
          </Typography>
          <Box display="flex" gap={2} flexWrap="wrap">
            {balances.map(b => <BalanceCard key={b.id} balance={b} />)}
          </Box>
        </Box>
      )}

      {/* ── Tabs ── */}
      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setPage(0); setStatusFilter(''); }}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((t, i) => (
          <Tab
            key={i}
            icon={t.icon}
            iconPosition="start"
            label={
              (t as any).badge > 0 ? (
                <Badge badgeContent={(t as any).badge} color="error" sx={{ pl: 1 }}>
                  {t.label}
                </Badge>
              ) : t.label
            }
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48 }}
          />
        ))}
      </Tabs>

      {/* ── Info banner for HR tab ── */}
      {isHROffice && tab === TAB_TEAM && (
        <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
          <strong>Pending HR Approval</strong> — These requests have been approved at departmental level and are now awaiting your final approval.
        </Alert>
      )}
      {isHROffice && tab === TAB_HR_ALL && (
        <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
          <strong>HR Office Overview</strong> — Showing all leave requests across all departments. Use filters to narrow results.
        </Alert>
      )}

      {/* ── Filters ── */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <FilterIcon fontSize="small" color="action" />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            >
              {statusOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Year</InputLabel>
            <Select
              value={yearFilter}
              label="Year"
              onChange={(e) => { setYearFilter(Number(e.target.value)); setPage(0); }}
            >
              {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <Box flex={1} />
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadData} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {/* ── Table ── */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>
        ) : requests.length === 0 ? (
          <Box py={8} textAlign="center">
            <LeaveIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" color="text.secondary" fontWeight={500}>No leave requests found</Typography>
            <Typography variant="body2" color="text.disabled">
              {tab === TAB_MY ? 'You have not submitted any leave requests yet.' : 'No requests match your current filters.'}
            </Typography>
            {tab === TAB_MY && !isHROffice && (
              <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }} onClick={() => { reset(); setDialogOpen(true); }}>
                Apply for Leave
              </Button>
            )}
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 700, py: 1.5 }}>Employee</TableCell>
                    {showDept && <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>}
                    <TableCell sx={{ fontWeight: 700 }}>Leave Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Days</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Approval Progress</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.map((req) => {
                    const meta = STATUS_META[req.status] || STATUS_META.PENDING;
                    return (
                      <TableRow key={req.id} hover sx={{ '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.02) } }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{req.employee_name}</Typography>
                          <Typography variant="caption" color="text.secondary">#{req.id}</Typography>
                        </TableCell>
                        {showDept && (
                          <TableCell>
                            <Typography variant="body2">{req.department_name || '—'}</Typography>
                          </TableCell>
                        )}
                        <TableCell>
                          <Chip label={req.leave_type_name} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{fmt(req.start_date)}</Typography>
                          <Typography variant="caption" color="text.secondary">to {fmt(req.end_date)}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={600}>{req.total_days}</Typography>
                        </TableCell>
                        <TableCell sx={{ minWidth: 280 }}>
                          <ApprovalStepper request={req} />
                        </TableCell>
                        <TableCell>
                          <Chip label={meta.label} size="small" color={meta.color} />
                        </TableCell>
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Tooltip title="View details">
                              <IconButton size="small" onClick={() => setDetailReq(req)}>
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {canActOn(req) && (
                              <>
                                <Tooltip title={approveTooltip}>
                                  <IconButton size="small" color="success"
                                    onClick={() => setApprovalDialog({ open: true, request: req, approve: true })}>
                                    <ApproveIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Reject">
                                  <IconButton size="small" color="error"
                                    onClick={() => setApprovalDialog({ open: true, request: req, approve: false })}>
                                    <RejectIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50]}
              component="div"
              count={total}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            />
          </>
        )}
      </Paper>

      {/* ─────────────────────── Apply Leave Dialog ─────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>Apply for Leave</Typography>
          <Typography variant="caption" color="text.secondary">
            Your request will be sent to your departmental supervisor for approval.
          </Typography>
        </DialogTitle>
        <Divider />
        <form onSubmit={handleSubmit(onSubmitLeave)}>
          <DialogContent sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller name="leave_type_id" control={control} rules={{ required: 'Leave type is required' }}
                  render={({ field }) => (
                    <TextField {...field} select label="Leave Type *" fullWidth size="small"
                      error={!!errors.leave_type_id} helperText={errors.leave_type_id?.message as string}>
                      {leaveTypes.map(lt => (
                        <MenuItem key={lt.id} value={lt.id}>
                          {lt.leave_name} — up to {lt.default_days_per_year} days/year
                        </MenuItem>
                      ))}
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="start_date" control={control} rules={{ required: 'Start date is required' }}
                  render={({ field }) => (
                    <TextField {...field} label="Start Date *" type="date" fullWidth size="small"
                      InputLabelProps={{ shrink: true }}
                      error={!!errors.start_date} helperText={errors.start_date?.message as string} />
                  )} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="end_date" control={control}
                  rules={{
                    required: 'End date is required',
                    validate: v => !watchStart || v >= watchStart || 'End date must be on or after start date'
                  }}
                  render={({ field }) => (
                    <TextField {...field} label="End Date *" type="date" fullWidth size="small"
                      InputLabelProps={{ shrink: true }}
                      error={!!errors.end_date} helperText={errors.end_date?.message as string} />
                  )} />
              </Grid>
              {calcDays() !== null && (
                <Grid item xs={12}>
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    This request covers <strong>{calcDays()} working day(s)</strong>.
                  </Alert>
                </Grid>
              )}
              <Grid item xs={12}>
                <Controller name="reason" control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Reason (optional)" fullWidth size="small" multiline rows={3}
                      placeholder="Briefly describe the reason for your leave request..." />
                  )} />
              </Grid>
            </Grid>
            <Alert severity="info" sx={{ mt: 2, fontSize: '0.78rem' }}>
              <strong>Approval flow:</strong> Submitted → Departmental Approval (LEAD/HOP) → HR Office Final Approval
            </Alert>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" startIcon={<LeaveIcon />}>Submit Request</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ─────────────────────── Approval Dialog ────────────────────────────── */}
      <Dialog
        open={approvalDialog.open}
        onClose={() => setApprovalDialog({ open: false, request: null, approve: true })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            {approvalDialog.approve
              ? <ApproveIcon color="success" />
              : <RejectIcon color="error" />}
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {approvalDialog.approve
                  ? (isDeptApprover ? 'Approve & Forward to HR' : 'Give Final HR Approval')
                  : 'Reject Leave Request'}
              </Typography>
              {approvalDialog.approve && isDeptApprover && (
                <Typography variant="caption" color="text.secondary">
                  This will forward the request to the HR Office for final approval.
                </Typography>
              )}
            </Box>
          </Box>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {approvalDialog.request && (
            <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
              <Grid container spacing={1}>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Employee</Typography><Typography variant="body2" fontWeight={600}>{approvalDialog.request.employee_name}</Typography></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Leave Type</Typography><Typography variant="body2" fontWeight={600}>{approvalDialog.request.leave_type_name}</Typography></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Period</Typography><Typography variant="body2">{fmt(approvalDialog.request.start_date)} – {fmt(approvalDialog.request.end_date)}</Typography></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Days</Typography><Typography variant="body2" fontWeight={600}>{approvalDialog.request.total_days} day(s)</Typography></Grid>
                {approvalDialog.request.reason && (
                  <Grid item xs={12}><Typography variant="caption" color="text.secondary">Reason</Typography><Typography variant="body2">{approvalDialog.request.reason}</Typography></Grid>
                )}
              </Grid>
            </Paper>
          )}
          <TextField
            label={approvalDialog.approve ? 'Comments (optional)' : 'Rejection reason *'}
            fullWidth
            multiline
            rows={3}
            size="small"
            value={approvalComments}
            onChange={(e) => setApprovalComments(e.target.value)}
            placeholder={approvalDialog.approve ? 'Add any notes or conditions...' : 'Please provide a reason for rejection...'}
            required={!approvalDialog.approve}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApprovalDialog({ open: false, request: null, approve: true })}>Cancel</Button>
          <Button
            variant="contained"
            color={approvalDialog.approve ? 'success' : 'error'}
            onClick={handleApproval}
            disabled={approvalLoading || (!approvalDialog.approve && !approvalComments.trim())}
            startIcon={approvalLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {approvalDialog.approve
              ? (isDeptApprover ? 'Approve & Forward' : 'Give Final Approval')
              : 'Reject Request'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─────────────────────── Detail Dialog ──────────────────────────────── */}
      <DetailDialog request={detailReq} onClose={() => setDetailReq(null)} />
    </Box>
  );
};

export default LeaveManagementPage;

