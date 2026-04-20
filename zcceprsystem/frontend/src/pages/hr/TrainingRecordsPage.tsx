/**
 * Training Records Page
 * Track employee training, certifications, and professional development
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, MenuItem, Stack, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField,
  CircularProgress, FormControlLabel, Switch
} from '@mui/material';
import {
  Add as AddIcon, School as TrainingIcon, Visibility as ViewIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import { getTrainingRecords, createTrainingRecord } from '../../services/hrService';
import { HRTrainingRecord } from '../../types';
import { useAuthStore } from '../../store/authStore';

const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success' | 'default'> = {
  SCHEDULED: 'info', IN_PROGRESS: 'warning', COMPLETED: 'success', CANCELLED: 'default'
};

const TrainingRecordsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [records, setRecords] = useState<HRTrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const isManager = user?.role === 'PROGRAM_LEAD' || user?.role === 'HEAD_OF_PROGRAMS' || user?.role === 'ADMIN';

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm();
  const watchCertReceived = watch('certification_received');

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getTrainingRecords({
        page: page + 1, limit: rowsPerPage, status: statusFilter || undefined
      });
      setRecords(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      toast.error('Failed to load training records');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const onSubmit = async (data: any) => {
    try {
      await createTrainingRecord(data);
      toast.success('Training record created');
      setDialogOpen(false);
      reset();
      loadRecords();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create training record');
    }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          <TrainingIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Training & Development
        </Typography>
        {isManager && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { reset({ status: 'SCHEDULED', currency: 'USD' }); setDialogOpen(true); }}>
            Add Training Record
          </Button>
        )}
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Status" sx={{ width: 160 }}
            value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="SCHEDULED">Scheduled</MenuItem>
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
                  <TableCell sx={{ fontWeight: 'bold' }}>Training Title</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Provider</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Dates</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="right">Cost</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Certified</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" py={4}>No training records found</Typography>
                    </TableCell>
                  </TableRow>
                ) : records.map((rec) => (
                  <TableRow key={rec.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{rec.employee_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{rec.department_name}</Typography>
                    </TableCell>
                    <TableCell>{rec.training_title}</TableCell>
                    <TableCell><Chip label={rec.training_type} size="small" variant="outlined" /></TableCell>
                    <TableCell>{rec.provider || '-'}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(rec.start_date).toLocaleDateString()}
                        {rec.end_date && ` - ${new Date(rec.end_date).toLocaleDateString()}`}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {rec.cost > 0 ? `${rec.currency} ${rec.cost.toLocaleString()}` : '-'}
                      {rec.donor_funded && <Chip label="Donor" size="small" sx={{ ml: 0.5 }} />}
                    </TableCell>
                    <TableCell align="center">
                      {rec.certification_received ? (
                        <Chip label={rec.certification_name || 'Yes'} size="small" color="success" />
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Chip label={rec.status} size="small" color={STATUS_COLORS[rec.status] || 'default'} />
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

      {/* Create Training Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Training Record</DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller name="employee_id" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Employee ID *" type="number" fullWidth size="small" error={!!errors.employee_id} />} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="training_title" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Training Title *" fullWidth size="small" error={!!errors.training_title} />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="training_type" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Type" fullWidth size="small">
                      <MenuItem value="WORKSHOP">Workshop</MenuItem>
                      <MenuItem value="SEMINAR">Seminar</MenuItem>
                      <MenuItem value="CONFERENCE">Conference</MenuItem>
                      <MenuItem value="ONLINE_COURSE">Online Course</MenuItem>
                      <MenuItem value="ON_THE_JOB">On-the-Job</MenuItem>
                      <MenuItem value="CERTIFICATION">Certification</MenuItem>
                      <MenuItem value="OTHER">Other</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="provider" control={control}
                  render={({ field }) => <TextField {...field} label="Provider" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="start_date" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Start Date *" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} error={!!errors.start_date} />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="end_date" control={control}
                  render={({ field }) => <TextField {...field} label="End Date" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="cost" control={control}
                  render={({ field }) => <TextField {...field} label="Cost" type="number" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="status" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Status" fullWidth size="small">
                      <MenuItem value="SCHEDULED">Scheduled</MenuItem>
                      <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                      <MenuItem value="COMPLETED">Completed</MenuItem>
                      <MenuItem value="CANCELLED">Cancelled</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="certification_received" control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                      label="Certification Received"
                    />
                  )} />
              </Grid>
              {watchCertReceived && (
                <>
                  <Grid item xs={6}>
                    <Controller name="certification_name" control={control}
                      render={({ field }) => <TextField {...field} label="Certification Name" fullWidth size="small" />} />
                  </Grid>
                  <Grid item xs={6}>
                    <Controller name="certification_expiry" control={control}
                      render={({ field }) => <TextField {...field} label="Expiry Date" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} />} />
                  </Grid>
                </>
              )}
              <Grid item xs={12}>
                <Controller name="notes" control={control}
                  render={({ field }) => <TextField {...field} label="Notes" fullWidth size="small" multiline rows={2} />} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Create</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default TrainingRecordsPage;
