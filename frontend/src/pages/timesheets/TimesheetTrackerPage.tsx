/**
 * Team and Organisation timesheet trackers.
 *
 * One component serves both, because they differ only in reach:
 *   scope="team"         — a department HOP/Lead monitoring their department
 *   scope="organisation" — the HR Office and Super Admin monitoring everyone,
 *                          with a department filter
 *
 * The API pins a department head to their own department regardless of what is
 * asked for, so this only decides which controls to render.
 *
 * People who have not started appear as Not Started. A tracker that only listed
 * the timesheets that exist would hide exactly what it is meant to surface.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Stack, TextField, MenuItem, CircularProgress, Grid,
  LinearProgress, Tooltip, Chip, Card, CardContent, Collapse, IconButton,
} from '@mui/material';
import {
  TableChart as ExcelIcon, PictureAsPdf as PdfIcon, OpenInNew as OpenIcon,
  KeyboardArrowDown as ExpandIcon, KeyboardArrowUp as CollapseIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { useAuthStore } from '../../store/authStore';
import {
  TimesheetTrackerRow, TimesheetPeriodStats, TimesheetProject, Department,
} from '../../types';
import {
  getPeriodTracker, getPeriodStats, getTimesheetProjects,
  downloadTimesheetReport, downloadTimesheetPDF,
} from '../../services/timesheetService';
import api from '../../services/api';
import { hasOrgTimesheetAccess } from '../../utils/timesheetAccess';
import TimesheetStatusChip, {
  ALL_STATUSES, MONTHS, yearOptions, statusLabel,
} from '../../components/timesheets/TimesheetStatusChip';

interface Props {
  scope: 'team' | 'organisation';
}

const StatCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={600}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </CardContent>
  </Card>
);

const TimesheetTrackerPage: React.FC<Props> = ({ scope }) => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const now = new Date();
  const isOrg = scope === 'organisation';

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [status, setStatus] = useState<string>('');
  const [projectId, setProjectId] = useState<number | ''>('');

  const [rows, setRows] = useState<TimesheetTrackerRow[]>([]);
  const [stats, setStats] = useState<TimesheetPeriodStats | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<TimesheetProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (isOrg && hasOrgTimesheetAccess(user)) {
      api.get('/departments')
        .then((r) => setDepartments(r.data.data))
        .catch(() => setDepartments([]));
    }
    getTimesheetProjects().then(setProjects).catch(() => setProjects([]));
  }, [isOrg, user]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        year,
        month,
        departmentId: departmentId || undefined,
        status: (status || undefined) as any,
        projectId: projectId || undefined,
      };
      const [trackerRows, periodStats] = await Promise.all([
        getPeriodTracker(params),
        getPeriodStats({ year, month, departmentId: departmentId || undefined }),
      ]);
      setRows(trackerRows);
      setStats(periodStats);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load the tracker');
    } finally {
      setLoading(false);
    }
  }, [year, month, departmentId, status, projectId]);

  useEffect(() => { load(); }, [load]);

  const exportReport = async () => {
    try {
      await downloadTimesheetReport({
        year,
        month,
        departmentId: departmentId || undefined,
        status: status || undefined,
        projectId: projectId || undefined,
      });
      toast.success('Report downloaded');
    } catch (err: any) {
      toast.error(err?.message || 'Export failed');
    }
  };

  const title = isOrg ? 'Organisation Timesheets' : 'Team Timesheets';
  const subtitle = isOrg
    ? 'Every member of staff, every department'
    : `${user?.department_name || 'Your department'}`;

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between"
        alignItems={{ md: 'center' }} spacing={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={600}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        </Box>
        <Button variant="contained" startIcon={<ExcelIcon />} onClick={exportReport}>
          Export report
        </Button>
      </Stack>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3} md={2}>
            <TextField select fullWidth size="small" label="Year" value={year}
              onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField select fullWidth size="small" label="Month" value={month}
              onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
            </TextField>
          </Grid>
          {isOrg && (
            <Grid item xs={12} sm={6} md={3}>
              <TextField select fullWidth size="small" label="Department" value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">All departments</MenuItem>
                {departments.map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.department_name}</MenuItem>
                ))}
              </TextField>
            </Grid>
          )}
          <Grid item xs={12} sm={6} md={2}>
            <TextField select fullWidth size="small" label="Status" value={status}
              onChange={(e) => setStatus(e.target.value)}>
              <MenuItem value="">All statuses</MenuItem>
              {ALL_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField select fullWidth size="small" label="Project" value={projectId}
              onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}>
              <MenuItem value="">All projects</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.project_code} — {p.project_name}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* ── Headline numbers ─────────────────────────────────────────────── */}
      {stats && (
        <Grid container spacing={2} mb={2}>
          <Grid item xs={6} md={3}>
            <StatCard label="Staff" value={String(stats.headcount)}
              hint={`${MONTHS[stats.month - 1]} ${stats.year}`} />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatCard label="Approved" value={String(
              (stats.status_counts.APPROVED || 0) + (stats.status_counts.LOCKED || 0)
            )} hint={`${stats.status_counts.NOT_STARTED || 0} not started`} />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatCard label="Awaiting approval" value={String(
              (stats.status_counts.SUBMITTED || 0) + (stats.status_counts.UNDER_REVIEW || 0)
            )} hint={`${stats.status_counts.REJECTED || 0} rejected, ${stats.status_counts.RETURNED || 0} returned`} />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatCard label="Hours recorded"
              value={`${stats.actual_hours.toFixed(0)} / ${stats.expected_hours.toFixed(0)}`}
              hint={`${stats.completion_percent.toFixed(0)}% of expected`} />
          </Grid>
        </Grid>
      )}

      {/* ── The tracker ──────────────────────────────────────────────────── */}
      <Paper variant="outlined">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell width={40} />
                  <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                  {isOrg && <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>}
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Expected</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Actual</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 130 }}>Completion</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Leave</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Projects</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isOrg ? 10 : 9} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        Nobody matches these filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <React.Fragment key={r.employee_id}>
                    <TableRow hover>
                      <TableCell>
                        {r.projects.length > 0 && (
                          <IconButton size="small"
                            onClick={() => setExpanded(expanded === r.employee_id ? null : r.employee_id)}>
                            {expanded === r.employee_id ? <CollapseIcon /> : <ExpandIcon />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{r.employee_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.position_title || r.employee_number || ''}
                        </Typography>
                      </TableCell>
                      {isOrg && (
                        <TableCell>
                          <Typography variant="caption">{r.department_name || '—'}</Typography>
                        </TableCell>
                      )}
                      <TableCell><TimesheetStatusChip status={r.status} /></TableCell>
                      <TableCell align="right">{r.expected_hours.toFixed(1)}</TableCell>
                      <TableCell align="right">{r.actual_hours.toFixed(1)}</TableCell>
                      <TableCell>
                        <Stack spacing={0.5}>
                          <LinearProgress variant="determinate"
                            value={Math.min(r.completion_percent, 100)}
                            color={r.completion_percent >= 99 ? 'success'
                              : r.completion_percent > 0 ? 'warning' : 'inherit'}
                            sx={{ height: 6, borderRadius: 3 }} />
                          <Typography variant="caption" color="text.secondary">
                            {r.completion_percent.toFixed(0)}%
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={`${r.holiday_days} public holiday(s) this month`}>
                          <Typography variant="caption">{r.leave_days || '—'}</Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        <Chip size="small" variant="outlined" label={r.projects.length} />
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title={r.timesheet_id ? 'Open the timesheet' : 'Not started'}>
                            <span>
                              <IconButton size="small" disabled={!r.timesheet_id}
                                onClick={() => navigate(`/timesheets/${r.timesheet_id}`)}>
                                <OpenIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Download as PDF">
                            <span>
                              <IconButton size="small" disabled={!r.timesheet_id}
                                onClick={() => downloadTimesheetPDF(
                                  r.timesheet_id!,
                                  `${r.employee_name}-${r.month_name}-${r.year}`.replace(/\s+/g, '-')
                                ).catch((e) => toast.error(e.message))}>
                                <PdfIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>

                    {/* LOE % against Actual %, per project */}
                    <TableRow>
                      <TableCell colSpan={isOrg ? 10 : 9} sx={{ py: 0, borderBottom: 0 }}>
                        <Collapse in={expanded === r.employee_id} timeout="auto" unmountOnExit>
                          <Box sx={{ my: 1, ml: 6 }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell sx={{ fontWeight: 600 }}>Project</TableCell>
                                  <TableCell sx={{ fontWeight: 600 }}>Partner</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>LOE %</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>Expected</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actual</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actual %</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>Variance</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {r.projects.map((p) => {
                                  const variance = p.actual_percent - p.loe_percent;
                                  return (
                                    <TableRow key={`${r.employee_id}-${p.project_id}`}>
                                      <TableCell>
                                        <Typography variant="caption" fontWeight={600}>
                                          {p.project_code}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary"
                                          display="block">
                                          {p.project_name}
                                        </Typography>
                                      </TableCell>
                                      <TableCell>
                                        <Typography variant="caption">{p.partner_name || '—'}</Typography>
                                      </TableCell>
                                      <TableCell align="right">{p.loe_percent.toFixed(1)}%</TableCell>
                                      <TableCell align="right">{p.expected_hours.toFixed(1)}</TableCell>
                                      <TableCell align="right">{p.actual_hours.toFixed(1)}</TableCell>
                                      <TableCell align="right">{p.actual_percent.toFixed(1)}%</TableCell>
                                      <TableCell align="right">
                                        <Typography variant="caption" fontWeight={600}
                                          color={Math.abs(variance) > 10 ? 'warning.dark' : 'text.secondary'}>
                                          {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                                        </Typography>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default TimesheetTrackerPage;
