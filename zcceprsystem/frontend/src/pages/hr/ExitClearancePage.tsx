/**
 * Exit Clearance Page
 * Manage employee separation/exit clearance workflow
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, MenuItem, Stack, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField,
  CircularProgress, Checkbox, FormControlLabel, Divider
} from '@mui/material';
import {
  Add as AddIcon, Visibility as ViewIcon, Edit as EditIcon,
  ExitToApp as ExitIcon, CheckCircle as CheckIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import { getExitClearances, initiateExitClearance, updateExitClearance } from '../../services/hrService';
import { HRExitClearance } from '../../types';
import { useAuthStore } from '../../store/authStore';

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
  INITIATED: 'warning', IN_PROGRESS: 'info', COMPLETED: 'success', CANCELLED: 'error'
};

const fmtCurrency = (val: number | string | null) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ExitClearancePage: React.FC = () => {
  const { user } = useAuthStore();
  const [clearances, setClearances] = useState<HRExitClearance[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewClearance, setViewClearance] = useState<HRExitClearance | null>(null);
  const [editClearance, setEditClearance] = useState<any>(null);

  const isManager = user?.role === 'PROGRAM_LEAD' || user?.role === 'HEAD_OF_PROGRAMS' || user?.role === 'ADMIN';

  const { control, handleSubmit, reset, formState: { errors } } = useForm();

  const loadClearances = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getExitClearances({
        page: page + 1, limit: rowsPerPage, status: statusFilter || undefined
      });
      setClearances(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      toast.error('Failed to load exit clearances');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter]);

  useEffect(() => { loadClearances(); }, [loadClearances]);

  const onSubmitNew = async (data: any) => {
    try {
      await initiateExitClearance({
        employee_id: parseInt(data.employee_id),
        exit_type: data.exit_type,
        last_working_day: data.last_working_date,
        reason: data.reason
      });
      toast.success('Exit clearance initiated');
      setDialogOpen(false);
      reset();
      loadClearances();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to initiate exit clearance');
    }
  };

  const handleOpenEdit = (clearance: any) => {
    setEditClearance({
      id: clearance.id,
      it_cleared: !!clearance.it_cleared,
      finance_cleared: !!clearance.finance_cleared,
      hr_cleared: !!clearance.hr_cleared,
      assets_returned: !!clearance.assets_returned,
      admin_cleared: !!clearance.admin_cleared,
      exit_interview_conducted: !!clearance.exit_interview_conducted,
      exit_interview_notes: clearance.exit_interview_notes || '',
      outstanding_leave_days: clearance.outstanding_leave_days || 0,
      leave_payment: clearance.leave_payment || 0,
      outstanding_advances: clearance.outstanding_advances || 0,
      final_salary: clearance.final_salary || 0,
      gratuity: clearance.gratuity || 0,
      total_final_payment: clearance.total_final_payment || 0,
      status: clearance.status
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editClearance) return;
    try {
      await updateExitClearance(editClearance.id, editClearance);
      toast.success('Exit clearance updated');
      setEditDialogOpen(false);
      loadClearances();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update exit clearance');
    }
  };

  const allCleared = (c: any) => c.it_cleared && c.finance_cleared && c.hr_cleared && c.assets_returned && c.admin_cleared;

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          <ExitIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Exit Clearance
        </Typography>
        {isManager && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => { reset({ exit_type: 'RESIGNATION' }); setDialogOpen(true); }}>
            Initiate Exit
          </Button>
        )}
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Status" sx={{ width: 160 }}
            value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="INITIATED">Initiated</MenuItem>
            <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
            <MenuItem value="COMPLETED">Completed</MenuItem>
            <MenuItem value="CANCELLED">Cancelled</MenuItem>
          </TextField>
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold' }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Exit Type</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Last Working Day</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">IT</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Finance</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">HR</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Assets</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Admin</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clearances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center">
                      <Typography variant="body2" color="text.secondary" py={4}>No exit clearances found</Typography>
                    </TableCell>
                  </TableRow>
                ) : clearances.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{(c as any).employee_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{(c as any).employee_number}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={(c as any).exit_type?.replace(/_/g, ' ')} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {(c as any).last_working_date ? new Date((c as any).last_working_date).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <CheckIcon fontSize="small" color={(c as any).it_cleared ? 'success' : 'disabled'} />
                    </TableCell>
                    <TableCell align="center">
                      <CheckIcon fontSize="small" color={(c as any).finance_cleared ? 'success' : 'disabled'} />
                    </TableCell>
                    <TableCell align="center">
                      <CheckIcon fontSize="small" color={c.hr_clearance || (c as any).hr_cleared ? 'success' : 'disabled'} />
                    </TableCell>
                    <TableCell align="center">
                      <CheckIcon fontSize="small" color={(c as any).assets_returned ? 'success' : 'disabled'} />
                    </TableCell>
                    <TableCell align="center">
                      <CheckIcon fontSize="small" color={(c as any).admin_cleared ? 'success' : 'disabled'} />
                    </TableCell>
                    <TableCell>
                      <Chip label={c.status} size="small" color={STATUS_COLORS[c.status] || 'default'} />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <IconButton size="small" onClick={() => { setViewClearance(c); setViewDialogOpen(true); }}>
                          <ViewIcon fontSize="small" />
                        </IconButton>
                        {isManager && c.status !== 'COMPLETED' && (
                          <IconButton size="small" onClick={() => handleOpenEdit(c)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>
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

      {/* Initiate Exit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Initiate Exit Clearance</DialogTitle>
        <form onSubmit={handleSubmit(onSubmitNew)}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller name="employee_id" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Employee ID *" type="number" fullWidth size="small" error={!!errors.employee_id} />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="exit_type" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Exit Type" fullWidth size="small">
                      <MenuItem value="RESIGNATION">Resignation</MenuItem>
                      <MenuItem value="TERMINATION">Termination</MenuItem>
                      <MenuItem value="RETIREMENT">Retirement</MenuItem>
                      <MenuItem value="CONTRACT_END">Contract End</MenuItem>
                      <MenuItem value="OTHER">Other</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="last_working_date" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Last Working Day *" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} error={!!errors.last_working_date} />} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="reason" control={control}
                  render={({ field }) => <TextField {...field} label="Reason" fullWidth size="small" multiline rows={3} />} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Initiate</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Edit Clearance Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Update Exit Clearance</DialogTitle>
        <DialogContent>
          {editClearance && (
            <>
              <Typography variant="subtitle2" fontWeight="bold" color="primary" mt={1} mb={1}>Clearance Checklist</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={4}>
                  <FormControlLabel
                    control={<Checkbox checked={editClearance.it_cleared}
                      onChange={(e) => setEditClearance({ ...editClearance, it_cleared: e.target.checked })} />}
                    label="IT Cleared" />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <FormControlLabel
                    control={<Checkbox checked={editClearance.finance_cleared}
                      onChange={(e) => setEditClearance({ ...editClearance, finance_cleared: e.target.checked })} />}
                    label="Finance Cleared" />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <FormControlLabel
                    control={<Checkbox checked={editClearance.hr_cleared}
                      onChange={(e) => setEditClearance({ ...editClearance, hr_cleared: e.target.checked })} />}
                    label="HR Cleared" />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <FormControlLabel
                    control={<Checkbox checked={editClearance.assets_returned}
                      onChange={(e) => setEditClearance({ ...editClearance, assets_returned: e.target.checked })} />}
                    label="Assets Returned" />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <FormControlLabel
                    control={<Checkbox checked={editClearance.admin_cleared}
                      onChange={(e) => setEditClearance({ ...editClearance, admin_cleared: e.target.checked })} />}
                    label="Admin Cleared" />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <FormControlLabel
                    control={<Checkbox checked={editClearance.exit_interview_conducted}
                      onChange={(e) => setEditClearance({ ...editClearance, exit_interview_conducted: e.target.checked })} />}
                    label="Exit Interview Done" />
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight="bold" color="primary" mb={1}>Financial Settlement</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={4}>
                  <TextField label="Outstanding Leave Days" type="number" fullWidth size="small"
                    value={editClearance.outstanding_leave_days}
                    onChange={(e) => setEditClearance({ ...editClearance, outstanding_leave_days: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField label="Leave Payment" type="number" fullWidth size="small"
                    value={editClearance.leave_payment}
                    onChange={(e) => setEditClearance({ ...editClearance, leave_payment: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField label="Outstanding Advances" type="number" fullWidth size="small"
                    value={editClearance.outstanding_advances}
                    onChange={(e) => setEditClearance({ ...editClearance, outstanding_advances: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField label="Final Salary" type="number" fullWidth size="small"
                    value={editClearance.final_salary}
                    onChange={(e) => setEditClearance({ ...editClearance, final_salary: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField label="Gratuity" type="number" fullWidth size="small"
                    value={editClearance.gratuity}
                    onChange={(e) => setEditClearance({ ...editClearance, gratuity: parseFloat(e.target.value) || 0 })} />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField label="Total Final Payment" type="number" fullWidth size="small"
                    value={editClearance.total_final_payment}
                    onChange={(e) => setEditClearance({ ...editClearance, total_final_payment: parseFloat(e.target.value) || 0 })} />
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField label="Exit Interview Notes" fullWidth size="small" multiline rows={3}
                    value={editClearance.exit_interview_notes}
                    onChange={(e) => setEditClearance({ ...editClearance, exit_interview_notes: e.target.value })} />
                </Grid>
                <Grid item xs={6}>
                  <TextField select label="Status" fullWidth size="small"
                    value={editClearance.status}
                    onChange={(e) => setEditClearance({ ...editClearance, status: e.target.value })}>
                    <MenuItem value="INITIATED">Initiated</MenuItem>
                    <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                    <MenuItem value="COMPLETED">Completed</MenuItem>
                    <MenuItem value="CANCELLED">Cancelled</MenuItem>
                  </TextField>
                </Grid>
              </Grid>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit}>Save Changes</Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Exit Clearance Details</DialogTitle>
        <DialogContent>
          {viewClearance && (
            <>
              <Grid container spacing={2} mb={2}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Employee</Typography>
                  <Typography fontWeight={600}>{(viewClearance as any).employee_name}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Exit Type</Typography>
                  <Box><Chip label={(viewClearance as any).exit_type?.replace(/_/g, ' ')} size="small" /></Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Last Working Day</Typography>
                  <Typography>{(viewClearance as any).last_working_date ? new Date((viewClearance as any).last_working_date).toLocaleDateString() : '-'}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Box><Chip label={viewClearance.status} size="small" color={STATUS_COLORS[viewClearance.status] || 'default'} /></Box>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight="bold" mb={1}>Clearance Status</Typography>
              <Grid container spacing={2}>
                {[
                  { label: 'IT', field: 'it_cleared' },
                  { label: 'Finance', field: 'finance_cleared' },
                  { label: 'HR', field: 'hr_cleared' },
                  { label: 'Assets', field: 'assets_returned' },
                  { label: 'Admin', field: 'admin_cleared' }
                ].map(item => (
                  <Grid item xs={4} sm={2.4} key={item.field}>
                    <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                      <CheckIcon color={(viewClearance as any)[item.field] ? 'success' : 'disabled'} />
                      <Typography variant="caption" display="block">{item.label}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight="bold" mb={1}>Financial Settlement</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Outstanding Leave Days</Typography>
                  <Typography>{(viewClearance as any).outstanding_leave_days || 0}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Leave Payment</Typography>
                  <Typography>${fmtCurrency((viewClearance as any).leave_payment)}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Outstanding Advances</Typography>
                  <Typography>${fmtCurrency((viewClearance as any).outstanding_advances)}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Final Salary</Typography>
                  <Typography>${fmtCurrency((viewClearance as any).final_salary)}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Gratuity</Typography>
                  <Typography>${fmtCurrency((viewClearance as any).gratuity)}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Total Final Payment</Typography>
                  <Typography fontWeight="bold" color="primary">${fmtCurrency((viewClearance as any).total_final_payment)}</Typography>
                </Grid>
              </Grid>

              {viewClearance.exit_interview_notes && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" fontWeight="bold" mb={1}>Exit Interview Notes</Typography>
                  <Typography variant="body2">{viewClearance.exit_interview_notes}</Typography>
                </>
              )}

              {(viewClearance as any).reason && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" fontWeight="bold" mb={1}>Reason</Typography>
                  <Typography variant="body2">{(viewClearance as any).reason}</Typography>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExitClearancePage;
