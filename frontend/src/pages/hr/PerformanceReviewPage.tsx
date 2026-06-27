/**
 * Performance Review Page
 * Create and manage performance reviews and appraisals
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, MenuItem, Stack, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField,
  CircularProgress, Rating, Tooltip
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Visibility as ViewIcon,
  TrendingUp as ReviewIcon, Star as StarIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import { getPerformanceReviews, createPerformanceReview, updatePerformanceReview } from '../../services/hrService';
import { HRPerformanceReview } from '../../types';
import { useAuthStore } from '../../store/authStore';

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  DRAFT: 'default', IN_PROGRESS: 'info', COMPLETED: 'success', ACKNOWLEDGED: 'warning'
};

const PerformanceReviewPage: React.FC = () => {
  const { user } = useAuthStore();
  const [reviews, setReviews] = useState<HRPerformanceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<HRPerformanceReview | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewReview, setViewReview] = useState<HRPerformanceReview | null>(null);

  const isManager = user?.role === 'PROGRAM_LEAD' || user?.role === 'HEAD_OF_PROGRAMS' || user?.role === 'ADMIN';

  const { control, handleSubmit, reset, formState: { errors } } = useForm();

  const loadReviews = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getPerformanceReviews({
        page: page + 1, limit: rowsPerPage, status: statusFilter || undefined
      });
      setReviews(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      toast.error('Failed to load performance reviews');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const handleOpenDialog = (review?: HRPerformanceReview) => {
    if (review) {
      setEditingReview(review);
      reset({
        employee_id: review.employee_id,
        review_period: review.review_period,
        review_date: review.review_date?.split('T')[0],
        overall_rating: review.overall_rating,
        areas_of_improvement: review.areas_of_improvement,
        comments: review.comments,
        status: review.status
      });
    } else {
      setEditingReview(null);
      reset({ review_period: `${new Date().getFullYear()}`, status: 'DRAFT' });
    }
    setDialogOpen(true);
  };

  const onSubmit = async (data: any) => {
    try {
      if (editingReview) {
        await updatePerformanceReview(editingReview.id, data);
        toast.success('Performance review updated');
      } else {
        await createPerformanceReview(data);
        toast.success('Performance review created');
      }
      setDialogOpen(false);
      loadReviews();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save performance review');
    }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          <ReviewIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Performance Reviews
        </Typography>
        {isManager && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
            New Review
          </Button>
        )}
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Status" sx={{ width: 160 }}
            value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="DRAFT">Draft</MenuItem>
            <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
            <MenuItem value="COMPLETED">Completed</MenuItem>
            <MenuItem value="ACKNOWLEDGED">Acknowledged</MenuItem>
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
                  <TableCell sx={{ fontWeight: 'bold' }}>Job Title</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Department</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Review Period</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Rating</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Reviewer</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reviews.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <Typography variant="body2" color="text.secondary" py={4}>No performance reviews found</Typography>
                    </TableCell>
                  </TableRow>
                ) : reviews.map((review) => (
                  <TableRow key={review.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{review.employee_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{review.employee_number}</Typography>
                    </TableCell>
                    <TableCell>{review.job_title || '-'}</TableCell>
                    <TableCell>{review.department_name || '-'}</TableCell>
                    <TableCell>{review.review_period}</TableCell>
                    <TableCell>{review.review_date ? new Date(review.review_date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell align="center">
                      {review.overall_rating ? (
                        <Rating value={review.overall_rating} readOnly size="small" max={5} />
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Chip label={review.status.replace('_', ' ')} size="small" color={STATUS_COLORS[review.status] || 'default'} />
                    </TableCell>
                    <TableCell>{review.reviewer_name || '-'}</TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <IconButton size="small" onClick={() => { setViewReview(review); setViewDialogOpen(true); }}>
                          <ViewIcon fontSize="small" />
                        </IconButton>
                        {isManager && (
                          <IconButton size="small" onClick={() => handleOpenDialog(review)}>
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingReview ? 'Edit Performance Review' : 'New Performance Review'}</DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Grid container spacing={2}>
              {!editingReview && (
                <Grid item xs={12}>
                  <Controller name="employee_id" control={control} rules={{ required: 'Required' }}
                    render={({ field }) => (
                      <TextField {...field} label="Employee ID *" type="number" fullWidth size="small" error={!!errors.employee_id}
                        helperText="Enter the employee ID to review" />
                    )} />
                </Grid>
              )}
              <Grid item xs={6}>
                <Controller name="review_period" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Review Period *" fullWidth size="small" placeholder="e.g. 2024" error={!!errors.review_period} />} />
              </Grid>
              <Grid item xs={6}>
                <Controller name="review_date" control={control}
                  render={({ field }) => <TextField {...field} label="Review Date" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} />} />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" mb={0.5}>Overall Rating</Typography>
                <Controller name="overall_rating" control={control}
                  render={({ field }) => (
                    <Rating value={field.value || 0} onChange={(_, v) => field.onChange(v)} max={5} size="large" />
                  )} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="areas_of_improvement" control={control}
                  render={({ field }) => <TextField {...field} label="Areas of Improvement" fullWidth size="small" multiline rows={3} />} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="comments" control={control}
                  render={({ field }) => <TextField {...field} label="Comments" fullWidth size="small" multiline rows={3} />} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="status" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Status" fullWidth size="small">
                      <MenuItem value="DRAFT">Draft</MenuItem>
                      <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                      <MenuItem value="COMPLETED">Completed</MenuItem>
                      <MenuItem value="ACKNOWLEDGED">Acknowledged</MenuItem>
                    </TextField>
                  )} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">{editingReview ? 'Update' : 'Create'}</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Performance Review Details</DialogTitle>
        <DialogContent>
          {viewReview && (
            <Grid container spacing={2}>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Employee</Typography><Typography fontWeight={600}>{viewReview.employee_name}</Typography></Grid>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Period</Typography><Typography>{viewReview.review_period}</Typography></Grid>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Status</Typography><Box><Chip label={viewReview.status.replace('_', ' ')} size="small" color={STATUS_COLORS[viewReview.status] || 'default'} /></Box></Grid>
              <Grid item xs={6}><Typography variant="caption" color="text.secondary">Rating</Typography><Box>{viewReview.overall_rating ? <Rating value={viewReview.overall_rating} readOnly size="small" /> : 'Not rated'}</Box></Grid>
              <Grid item xs={12}><Typography variant="caption" color="text.secondary">Reviewer</Typography><Typography>{viewReview.reviewer_name || 'Not assigned'}</Typography></Grid>
              <Grid item xs={12}><Typography variant="caption" color="text.secondary">Areas of Improvement</Typography><Typography variant="body2">{viewReview.areas_of_improvement || 'None specified'}</Typography></Grid>
              <Grid item xs={12}><Typography variant="caption" color="text.secondary">Comments</Typography><Typography variant="body2">{viewReview.comments || 'No comments'}</Typography></Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setViewDialogOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default PerformanceReviewPage;
