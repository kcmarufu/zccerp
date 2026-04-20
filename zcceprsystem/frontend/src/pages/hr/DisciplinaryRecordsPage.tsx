/**
 * Disciplinary Records Page
 * Track employee disciplinary actions, warnings, and investigations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, MenuItem, Stack, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField,
  CircularProgress, Tooltip
} from '@mui/material';
import {
  Add as AddIcon, Visibility as ViewIcon,
  Gavel as DisciplinaryIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import { getDisciplinaryRecords, createDisciplinaryRecord } from '../../services/hrService';
import { HRDisciplinaryRecord } from '../../types';
import { useAuthStore } from '../../store/authStore';

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
  OPEN: 'warning', INVESTIGATING: 'info', RESOLVED: 'success', CLOSED: 'default', APPEALED: 'error'
};

const SEVERITY_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  MINOR: 'success', MODERATE: 'warning', MAJOR: 'error', CRITICAL: 'error'
};

const DisciplinaryRecordsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [records, setRecords] = useState<HRDisciplinaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewRecord, setViewRecord] = useState<HRDisciplinaryRecord | null>(null);

  const isManager = user?.role === 'PROGRAM_LEAD' || user?.role === 'HEAD_OF_PROGRAMS' || user?.role === 'ADMIN';

  const { control, handleSubmit, reset, formState: { errors } } = useForm();

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getDisciplinaryRecords({
        page: page + 1, limit: rowsPerPage, status: statusFilter || undefined
      });
      setRecords(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      toast.error('Failed to load disciplinary records');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const onSubmit = async (data: any) => {
    try {
      await createDisciplinaryRecord(data);
      toast.success('Disciplinary record created');
      setDialogOpen(false);
      reset();
      loadRecords();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create record');
    }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          <DisciplinaryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Disciplinary Records
        </Typography>
        {isManager && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => { reset({ incident_type: 'WARNING', severity: 'MINOR', status: 'OPEN' }); setDialogOpen(true); }}>
            New Record
          </Button>
        )}
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Status" sx={{ width: 160 }}
            value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="OPEN">Open</MenuItem>
            <MenuItem value="INVESTIGATING">Investigating</MenuItem>
            <MenuItem value="RESOLVED">Resolved</MenuItem>
            <MenuItem value="CLOSED">Closed</MenuItem>
            <MenuItem value="APPEALED">Appealed</MenuItem>
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
                  <TableCell sx={{ fontWeight: 'bold' }}>Incident Date</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Severity</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Reported By</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" py={4}>No disciplinary records found</Typography>
                    </TableCell>
                  </TableRow>
                ) : records.map((rec) => (
                  <TableRow key={rec.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{rec.employee_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{rec.employee_number}</Typography>
                    </TableCell>
                    <TableCell>{new Date(rec.incident_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Chip label={(rec.action_type || (rec as any).incident_type || '').replace(/_/g, ' ')} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={(rec as any).severity || 'MINOR'} size="small"
                        color={SEVERITY_COLORS[(rec as any).severity] || 'default'} />
                    </TableCell>
                    <TableCell>
                      <Tooltip title={rec.description || ''}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {rec.description || '-'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{(rec as any).reported_by_name || '-'}</TableCell>
                    <TableCell>
                      <Chip label={rec.status} size="small" color={STATUS_COLORS[rec.status] || 'default'} />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => { setViewRecord(rec); setViewDialogOpen(true); }}>
                        <ViewIcon fontSize="small" />
                      </IconButton>
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

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Disciplinary Record</DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller name="employee_id" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Employee ID *" type="number" fullWidth size="small" error={!!errors.employee_id} />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="incident_date" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Incident Date *" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} error={!!errors.incident_date} />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="incident_type" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Incident Type" fullWidth size="small">
                      <MenuItem value="WARNING">Warning</MenuItem>
                      <MenuItem value="MISCONDUCT">Misconduct</MenuItem>
                      <MenuItem value="PERFORMANCE">Performance Issue</MenuItem>
                      <MenuItem value="POLICY_VIOLATION">Policy Violation</MenuItem>
                      <MenuItem value="INSUBORDINATION">Insubordination</MenuItem>
                      <MenuItem value="ABSENTEEISM">Absenteeism</MenuItem>
                      <MenuItem value="OTHER">Other</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="severity" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Severity" fullWidth size="small">
                      <MenuItem value="MINOR">Minor</MenuItem>
                      <MenuItem value="MODERATE">Moderate</MenuItem>
                      <MenuItem value="MAJOR">Major</MenuItem>
                      <MenuItem value="CRITICAL">Critical</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="warning_level" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Warning Level" fullWidth size="small">
                      <MenuItem value="">None</MenuItem>
                      <MenuItem value="VERBAL_WARNING">Verbal Warning</MenuItem>
                      <MenuItem value="WRITTEN_WARNING">Written Warning</MenuItem>
                      <MenuItem value="FINAL_WARNING">Final Warning</MenuItem>
                      <MenuItem value="SUSPENSION">Suspension</MenuItem>
                      <MenuItem value="TERMINATION">Termination</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="description" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Description *" fullWidth size="small" multiline rows={3} error={!!errors.description} />} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="action_taken" control={control}
                  render={({ field }) => <TextField {...field} label="Action Taken" fullWidth size="small" multiline rows={2} />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="follow_up_date" control={control}
                  render={({ field }) => <TextField {...field} label="Follow-up Date" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="status" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Status" fullWidth size="small">
                      <MenuItem value="OPEN">Open</MenuItem>
                      <MenuItem value="INVESTIGATING">Investigating</MenuItem>
                      <MenuItem value="RESOLVED">Resolved</MenuItem>
                      <MenuItem value="CLOSED">Closed</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="investigation_notes" control={control}
                  render={({ field }) => <TextField {...field} label="Investigation Notes" fullWidth size="small" multiline rows={2} />} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Create</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Disciplinary Record Details</DialogTitle>
        <DialogContent>
          {viewRecord && (
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Employee</Typography>
                <Typography fontWeight={600}>{viewRecord.employee_name}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Employee #</Typography>
                <Typography>{viewRecord.employee_number}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Incident Date</Typography>
                <Typography>{new Date(viewRecord.incident_date).toLocaleDateString()}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Type</Typography>
                <Box><Chip label={(viewRecord.action_type || (viewRecord as any).incident_type || '').replace(/_/g, ' ')} size="small" /></Box>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Severity</Typography>
                <Box><Chip label={(viewRecord as any).severity || '-'} size="small" color={SEVERITY_COLORS[(viewRecord as any).severity] || 'default'} /></Box>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Status</Typography>
                <Box><Chip label={viewRecord.status} size="small" color={STATUS_COLORS[viewRecord.status] || 'default'} /></Box>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Description</Typography>
                <Typography variant="body2">{viewRecord.description || '-'}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Action Taken</Typography>
                <Typography variant="body2">{viewRecord.action_taken || 'None yet'}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Reported By</Typography>
                <Typography>{(viewRecord as any).reported_by_name || '-'}</Typography>
              </Grid>
              {viewRecord.follow_up_date && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Follow-up Date</Typography>
                  <Typography>{new Date(viewRecord.follow_up_date).toLocaleDateString()}</Typography>
                </Grid>
              )}
              {viewRecord.notes && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Notes</Typography>
                  <Typography variant="body2">{viewRecord.notes}</Typography>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DisciplinaryRecordsPage;
