/**
 * Timesheet Management Page
 * Create, submit, and approve timesheets with donor/project allocation
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, IconButton, MenuItem, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField,
  CircularProgress, Tooltip
} from '@mui/material';
import {
  Add as AddIcon, Send as SubmitIcon, Check as ApproveIcon,
  Close as RejectIcon, Visibility as ViewIcon, AccessTime as TimesheetIcon
} from '@mui/icons-material';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { toast } from 'react-toastify';
import {
  getTimesheets, createTimesheet, submitTimesheet, approveTimesheet, getTimesheet
} from '../../services/hrService';
import { HRTimesheet, TimesheetStatus } from '../../types';
import { useAuthStore } from '../../store/authStore';

const STATUS_COLORS: Record<string, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  DRAFT: 'default', SUBMITTED: 'info', APPROVED: 'success', REJECTED: 'error'
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const TimesheetManagementPage: React.FC = () => {
  const { user } = useAuthStore();
  const [timesheets, setTimesheets] = useState<HRTimesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewTimesheet, setViewTimesheet] = useState<HRTimesheet | null>(null);

  const isManager = user?.role === 'PROGRAM_LEAD' || user?.role === 'HEAD_OF_PROGRAMS' || user?.role === 'ADMIN';

  const { control, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      notes: '',
      entries: [{ entry_date: '', hours_worked: 8, project_code: '', activity_description: '' }]
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'entries' });

  const loadTimesheets = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getTimesheets({
        page: page + 1, limit: rowsPerPage,
        status: statusFilter || undefined
      });
      setTimesheets(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      toast.error('Failed to load timesheets');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter]);

  useEffect(() => { loadTimesheets(); }, [loadTimesheets]);

  const onCreateTimesheet = async (data: any) => {
    try {
      await createTimesheet(data);
      toast.success('Timesheet created successfully');
      setDialogOpen(false);
      reset();
      loadTimesheets();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create timesheet');
    }
  };

  const handleSubmitTimesheet = async (id: number) => {
    try {
      await submitTimesheet(id);
      toast.success('Timesheet submitted for approval');
      loadTimesheets();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit timesheet');
    }
  };

  const handleApproveTimesheet = async (id: number, approved: boolean) => {
    try {
      await approveTimesheet(id, { approved });
      toast.success(`Timesheet ${approved ? 'approved' : 'rejected'} successfully`);
      loadTimesheets();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to process timesheet');
    }
  };

  const handleViewTimesheet = async (id: number) => {
    try {
      const ts = await getTimesheet(id);
      setViewTimesheet(ts);
      setViewDialogOpen(true);
    } catch (err) {
      toast.error('Failed to load timesheet details');
    }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          <TimesheetIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Timesheet Management
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { reset(); setDialogOpen(true); }}>
          New Timesheet
        </Button>
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Status" sx={{ width: 160 }}
            value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="DRAFT">Draft</MenuItem>
            <MenuItem value="SUBMITTED">Submitted</MenuItem>
            <MenuItem value="APPROVED">Approved</MenuItem>
            <MenuItem value="REJECTED">Rejected</MenuItem>
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
                  <TableCell sx={{ fontWeight: 'bold' }}>Period</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Total Hours</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Approved By</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {timesheets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary" py={4}>No timesheets found</Typography>
                    </TableCell>
                  </TableRow>
                ) : timesheets.map((ts) => (
                  <TableRow key={ts.id} hover>
                    <TableCell>{ts.employee_name}</TableCell>
                    <TableCell>{MONTHS[ts.month - 1]} {ts.year}</TableCell>
                    <TableCell align="center">
                      <Chip label={`${ts.total_hours}h`} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={ts.status} size="small" color={STATUS_COLORS[ts.status] || 'default'} />
                    </TableCell>
                    <TableCell>{ts.approved_by_name || '-'}</TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <IconButton size="small" onClick={() => handleViewTimesheet(ts.id)}>
                          <ViewIcon fontSize="small" />
                        </IconButton>
                        {ts.status === 'DRAFT' && (
                          <Tooltip title="Submit for approval">
                            <IconButton size="small" color="primary" onClick={() => handleSubmitTimesheet(ts.id)}>
                              <SubmitIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isManager && ts.status === 'SUBMITTED' && (
                          <>
                            <IconButton size="small" color="success" onClick={() => handleApproveTimesheet(ts.id, true)}>
                              <ApproveIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" color="error" onClick={() => handleApproveTimesheet(ts.id, false)}>
                              <RejectIcon fontSize="small" />
                            </IconButton>
                          </>
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

      {/* Create Timesheet Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>New Timesheet</DialogTitle>
        <form onSubmit={handleSubmit(onCreateTimesheet)}>
          <DialogContent>
            <Grid container spacing={2} mb={2}>
              <Grid item xs={4}>
                <Controller name="month" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Month" fullWidth size="small">
                      {MONTHS.map((m, i) => <MenuItem key={i} value={i + 1}>{m}</MenuItem>)}
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={4}>
                <Controller name="year" control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Year" type="number" fullWidth size="small" />
                  )} />
              </Grid>
              <Grid item xs={4}>
                <Controller name="notes" control={control}
                  render={({ field }) => <TextField {...field} label="Notes" fullWidth size="small" />} />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" fontWeight="bold" mb={1}>Time Entries</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Hours</TableCell>
                  <TableCell>Project Code</TableCell>
                  <TableCell>Activity</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map((field, index) => (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Controller name={`entries.${index}.entry_date`} control={control}
                        render={({ field }) => <TextField {...field} type="date" size="small" InputLabelProps={{ shrink: true }} />} />
                    </TableCell>
                    <TableCell>
                      <Controller name={`entries.${index}.hours_worked`} control={control}
                        render={({ field }) => <TextField {...field} type="number" size="small" sx={{ width: 80 }} inputProps={{ min: 0, max: 24, step: 0.5 }} />} />
                    </TableCell>
                    <TableCell>
                      <Controller name={`entries.${index}.project_code`} control={control}
                        render={({ field }) => <TextField {...field} size="small" placeholder="Project code" />} />
                    </TableCell>
                    <TableCell>
                      <Controller name={`entries.${index}.activity_description`} control={control}
                        render={({ field }) => <TextField {...field} size="small" fullWidth placeholder="Activity description" />} />
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" color="error" onClick={() => remove(index)} disabled={fields.length === 1}>
                        <RejectIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button size="small" onClick={() => append({ entry_date: '', hours_worked: 8, project_code: '', activity_description: '' })} sx={{ mt: 1 }}>
              + Add Entry
            </Button>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Create Timesheet</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* View Timesheet Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Timesheet: {viewTimesheet ? `${MONTHS[viewTimesheet.month - 1]} ${viewTimesheet.year}` : ''}
        </DialogTitle>
        <DialogContent>
          {viewTimesheet && (
            <>
              <Grid container spacing={2} mb={2}>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Employee</Typography>
                  <Typography>{viewTimesheet.employee_name}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Total Hours</Typography>
                  <Typography fontWeight="bold">{viewTimesheet.total_hours}h</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Box><Chip label={viewTimesheet.status} size="small" color={STATUS_COLORS[viewTimesheet.status] || 'default'} /></Box>
                </Grid>
              </Grid>

              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.100' }}>
                    <TableCell>Date</TableCell>
                    <TableCell align="center">Hours</TableCell>
                    <TableCell>Donor</TableCell>
                    <TableCell>Project</TableCell>
                    <TableCell>Activity</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(viewTimesheet.entries || []).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{new Date(entry.entry_date).toLocaleDateString()}</TableCell>
                      <TableCell align="center">{entry.hours_worked}</TableCell>
                      <TableCell>{entry.donor_name || '-'}</TableCell>
                      <TableCell>{entry.project_code || '-'}</TableCell>
                      <TableCell>{entry.activity_description || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

export default TimesheetManagementPage;
