/**
 * Leave Management Page
 * View/manage leave requests, balances, and approvals
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, IconButton, MenuItem, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField,
  CircularProgress, Alert, Tabs, Tab, Tooltip
} from '@mui/material';
import {
  Add as AddIcon, Check as ApproveIcon, Close as RejectIcon,
  EventNote as LeaveIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import {
  getLeaveRequests, createLeaveRequest, approveLeaveRequest, getLeaveTypes
} from '../../services/hrService';
import { HRLeaveRequest, HRLeaveType, LeaveStatus } from '../../types';
import { useAuthStore } from '../../store/authStore';

const STATUS_COLORS: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'error', CANCELLED: 'default'
};

const LeaveManagementPage: React.FC = () => {
  const { user } = useAuthStore();
  const [requests, setRequests] = useState<HRLeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<HRLeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approvalDialog, setApprovalDialog] = useState<{ open: boolean; request: HRLeaveRequest | null; approve: boolean }>({
    open: false, request: null, approve: true
  });
  const [approvalComments, setApprovalComments] = useState('');

  const { control, handleSubmit, reset, formState: { errors } } = useForm();

  const isManager = user?.role === 'PROGRAM_LEAD' || user?.role === 'HEAD_OF_PROGRAMS' || user?.role === 'ADMIN';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [reqResult, types] = await Promise.all([
        getLeaveRequests({
          page: page + 1, limit: rowsPerPage,
          status: statusFilter || undefined,
          // Tab 0 = My requests, Tab 1 = Team requests (managers only)
          ...(tab === 0 && user ? {} : {}),
          ...(tab === 1 && user?.department_id ? { departmentId: user.department_id } : {})
        }),
        getLeaveTypes()
      ]);
      setRequests(reqResult.data);
      setTotal(reqResult.pagination.total);
      setLeaveTypes(types);
    } catch (err) {
      toast.error('Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter, tab, user]);

  useEffect(() => { loadData(); }, [loadData]);

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

  const handleApproval = async () => {
    if (!approvalDialog.request) return;
    try {
      await approveLeaveRequest(approvalDialog.request.id, {
        approved: approvalDialog.approve,
        comments: approvalComments
      });
      toast.success(`Leave request ${approvalDialog.approve ? 'approved' : 'rejected'} successfully`);
      setApprovalDialog({ open: false, request: null, approve: true });
      setApprovalComments('');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to process leave request');
    }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          <LeaveIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Leave Management
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { reset(); setDialogOpen(true); }}>
          Request Leave
        </Button>
      </Box>

      {isManager && (
        <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(0); }} sx={{ mb: 2 }}>
          <Tab label="My Leave" />
          <Tab label="Team Leave Requests" />
        </Tabs>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Status" sx={{ width: 160 }}
            value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="PENDING">Pending</MenuItem>
            <MenuItem value="APPROVED">Approved</MenuItem>
            <MenuItem value="REJECTED">Rejected</MenuItem>
          </TextField>
        </Stack>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold' }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Leave Type</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Start Date</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>End Date</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Days</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Reason</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  {isManager && tab === 1 && <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" py={4}>No leave requests found</Typography>
                    </TableCell>
                  </TableRow>
                ) : requests.map((req) => (
                  <TableRow key={req.id} hover>
                    <TableCell>{req.employee_name}</TableCell>
                    <TableCell><Chip label={req.leave_type_name} size="small" variant="outlined" /></TableCell>
                    <TableCell>{new Date(req.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(req.end_date).toLocaleDateString()}</TableCell>
                    <TableCell align="center">{req.total_days}</TableCell>
                    <TableCell>
                      <Tooltip title={req.reason || ''}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {req.reason || '-'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip label={req.status} size="small" color={STATUS_COLORS[req.status] || 'default'} />
                    </TableCell>
                    {isManager && tab === 1 && (
                      <TableCell align="center">
                        {req.status === 'PENDING' && (
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <IconButton size="small" color="success"
                              onClick={() => setApprovalDialog({ open: true, request: req, approve: true })}>
                              <ApproveIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" color="error"
                              onClick={() => setApprovalDialog({ open: true, request: req, approve: false })}>
                              <RejectIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50]}
              component="div" count={total} rowsPerPage={rowsPerPage} page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            />
          </>
        )}
      </TableContainer>

      {/* New Leave Request Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Leave</DialogTitle>
        <form onSubmit={handleSubmit(onSubmitLeave)}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller name="leave_type_id" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => (
                    <TextField {...field} select label="Leave Type *" fullWidth size="small" error={!!errors.leave_type_id}>
                      {leaveTypes.map(lt => (
                        <MenuItem key={lt.id} value={lt.id}>
                          {lt.name} ({lt.max_days_per_year} days/year)
                        </MenuItem>
                      ))}
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="start_date" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => (
                    <TextField {...field} label="Start Date *" type="date" fullWidth size="small"
                      InputLabelProps={{ shrink: true }} error={!!errors.start_date} />
                  )} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="end_date" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => (
                    <TextField {...field} label="End Date *" type="date" fullWidth size="small"
                      InputLabelProps={{ shrink: true }} error={!!errors.end_date} />
                  )} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="reason" control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Reason" fullWidth size="small" multiline rows={3} />
                  )} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Submit Request</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={approvalDialog.open} onClose={() => setApprovalDialog({ open: false, request: null, approve: true })}>
        <DialogTitle>
          {approvalDialog.approve ? 'Approve' : 'Reject'} Leave Request
        </DialogTitle>
        <DialogContent>
          {approvalDialog.request && (
            <Box mb={2}>
              <Typography variant="body2"><strong>Employee:</strong> {approvalDialog.request.employee_name}</Typography>
              <Typography variant="body2"><strong>Type:</strong> {approvalDialog.request.leave_type_name}</Typography>
              <Typography variant="body2"><strong>Period:</strong> {new Date(approvalDialog.request.start_date).toLocaleDateString()} - {new Date(approvalDialog.request.end_date).toLocaleDateString()}</Typography>
              <Typography variant="body2"><strong>Days:</strong> {approvalDialog.request.total_days}</Typography>
            </Box>
          )}
          <TextField
            label="Comments" fullWidth multiline rows={3}
            value={approvalComments} onChange={(e) => setApprovalComments(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovalDialog({ open: false, request: null, approve: true })}>Cancel</Button>
          <Button variant="contained" color={approvalDialog.approve ? 'success' : 'error'} onClick={handleApproval}>
            {approvalDialog.approve ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LeaveManagementPage;
