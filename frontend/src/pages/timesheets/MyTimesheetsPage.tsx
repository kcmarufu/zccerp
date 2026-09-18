/**
 * My Timesheets
 *
 * The January-to-December completion tracker for the signed-in user. Every
 * month is listed whether or not a timesheet has been started, because the
 * point of the page is to show what is outstanding.
 *
 * The Super Admin does not complete timesheets, so they are told so rather
 * than shown an empty grid.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Stack, TextField, MenuItem, CircularProgress, Grid,
  LinearProgress, Tooltip, Alert, Card, CardContent,
} from '@mui/material';
import {
  OpenInNew as OpenIcon, PictureAsPdf as PdfIcon, TableChart as ExcelIcon,
  AccessTime as ClockIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { useAuthStore } from '../../store/authStore';
import { TimesheetYearTracker } from '../../types';
import { getMyYear, downloadTimesheetPDF, downloadTimesheetExcel } from '../../services/timesheetService';
import { requiresTimesheet } from '../../utils/timesheetAccess';
import TimesheetStatusChip, { yearOptions } from '../../components/timesheets/TimesheetStatusChip';
import { formatDate } from '../../utils/datetime';

const StatCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent sx={{ py: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={600}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </CardContent>
  </Card>
);

const MyTimesheetsPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const mustFile = requiresTimesheet(user);

  const [year, setYear] = useState(new Date().getFullYear());
  const [tracker, setTracker] = useState<TimesheetYearTracker | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!mustFile) { setLoading(false); return; }
    try {
      setLoading(true);
      setTracker(await getMyYear(year));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load your timesheets');
    } finally {
      setLoading(false);
    }
  }, [year, mustFile]);

  useEffect(() => { load(); }, [load]);

  const openMonth = (month: number) => navigate(`/timesheets/period/${year}/${month}`);

  const download = async (kind: 'pdf' | 'excel', id: number, label: string) => {
    try {
      if (kind === 'pdf') await downloadTimesheetPDF(id, label);
      else await downloadTimesheetExcel(id, label);
    } catch (err: any) {
      toast.error(err?.message || 'Export failed');
    }
  };

  if (!mustFile) {
    return (
      <Box>
        <Typography variant="h5" fontWeight={600} gutterBottom>My Timesheets</Typography>
        <Alert severity="info" sx={{ mt: 2 }}>
          The Super Admin does not complete a monthly timesheet. Use{' '}
          <strong>Organisation Timesheets</strong> to monitor everyone, and{' '}
          <strong>Timesheet Approvals</strong> to act on what is waiting for you.
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>;
  }

  const summary = tracker?.summary;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"
        alignItems={{ sm: 'center' }} spacing={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={600}>My Timesheets</Typography>
          <Typography variant="body2" color="text.secondary">
            {tracker?.employee?.employee_name}
            {tracker?.employee?.department_name ? ` · ${tracker.employee.department_name}` : ''}
          </Typography>
        </Box>
        <TextField
          select size="small" label="Year" value={year}
          onChange={(e) => setYear(Number(e.target.value))} sx={{ minWidth: 140 }}
        >
          {yearOptions().map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </TextField>
      </Stack>

      {summary && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={6} md={3}>
            <StatCard label="Expected hours" value={summary.expected_hours.toFixed(0)}
              hint={`${year} to date`} />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatCard label="Actual hours" value={summary.actual_hours.toFixed(0)} />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatCard label="Completion" value={`${summary.completion_percent.toFixed(0)}%`} />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatCard label="Outstanding" value={String(summary.outstanding_months)}
              hint={`${summary.approved_months} approved`} />
          </Grid>
        </Grid>
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell sx={{ fontWeight: 700 }}>Month</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Working days</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Holidays</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Leave</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Expected</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Actual</TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 130 }}>Completion</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Submitted</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(tracker?.months || []).map((m) => (
                <TableRow key={m.month} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{m.month_name}</Typography>
                    {(m.rejection_reason || m.returned_reason) && (
                      <Tooltip title={m.rejection_reason || m.returned_reason || ''}>
                        <Typography variant="caption" color="error.main" noWrap
                          sx={{ display: 'block', maxWidth: 180 }}>
                          {m.rejection_reason || m.returned_reason}
                        </Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell><TimesheetStatusChip status={m.status} /></TableCell>
                  <TableCell align="right">{m.working_days}</TableCell>
                  <TableCell align="right">{m.holiday_days || '—'}</TableCell>
                  <TableCell align="right">{m.leave_days || '—'}</TableCell>
                  <TableCell align="right">{m.expected_hours.toFixed(1)}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2"
                      color={m.actual_hours > 0 ? 'text.primary' : 'text.disabled'}>
                      {m.actual_hours.toFixed(1)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(m.completion_percent, 100)}
                        color={m.completion_percent >= 99 ? 'success'
                          : m.completion_percent > 0 ? 'warning' : 'inherit'}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {m.completion_percent.toFixed(0)}%
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {m.submitted_at ? formatDate(m.submitted_at) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Tooltip title={m.timesheet_id ? 'Open' : 'Start this month'}>
                        <Button size="small" variant={m.timesheet_id ? 'text' : 'outlined'}
                          startIcon={m.timesheet_id ? <OpenIcon /> : <ClockIcon />}
                          onClick={() => openMonth(m.month)}>
                          {m.timesheet_id ? 'Open' : 'Start'}
                        </Button>
                      </Tooltip>
                      {m.timesheet_id && (
                        <>
                          <Tooltip title="Download as PDF">
                            <Button size="small" onClick={() => download('pdf', m.timesheet_id!,
                              `${m.month_name}-${year}`)}>
                              <PdfIcon fontSize="small" />
                            </Button>
                          </Tooltip>
                          <Tooltip title="Download as Excel">
                            <Button size="small" onClick={() => download('excel', m.timesheet_id!,
                              `${m.month_name}-${year}`)}>
                              <ExcelIcon fontSize="small" />
                            </Button>
                          </Tooltip>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Expected hours are worked out from the working days in the month, less public holidays and
        any approved leave, at the organisation&apos;s standard daily hours. Your allocation across
        projects is set by the HR Office.
      </Typography>
    </Box>
  );
};

export default MyTimesheetsPage;
