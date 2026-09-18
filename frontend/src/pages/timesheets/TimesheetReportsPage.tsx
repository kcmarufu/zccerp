/**
 * Timesheet Reports
 *
 * Filter by employee, department, project, partner, month, year and status,
 * then read the result on screen or take it away as a workbook.
 *
 * Two views over the same filter set:
 *   Timesheets      — one row per person per month
 *   Project summary — hours rolled up by project and partner, which is the
 *                     shape a donor report needs
 *
 * The API narrows every query to what the caller may see, so a department head
 * gets their department and nothing wider.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Stack, TextField, MenuItem, CircularProgress, Grid,
  Chip, Tabs, Tab, TablePagination, IconButton, Tooltip, FormControlLabel, Switch,
} from '@mui/material';
import {
  TableChart as ExcelIcon, PictureAsPdf as PdfIcon, OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { useAuthStore } from '../../store/authStore';
import {
  TimesheetListRow, TimesheetProjectSummaryRow, TimesheetProject,
  TimesheetPartner, TimesheetEmployee, Department,
} from '../../types';
import {
  listTimesheets, getProjectSummary, getTimesheetProjects, getTimesheetPartners,
  getTimesheetEmployees, downloadTimesheetReport, downloadTimesheetPDF, downloadTimesheetExcel,
} from '../../services/timesheetService';
import api from '../../services/api';
import { hasOrgTimesheetAccess } from '../../utils/timesheetAccess';
import TimesheetStatusChip, {
  ALL_STATUSES, MONTHS, yearOptions, statusLabel,
} from '../../components/timesheets/TimesheetStatusChip';
import { formatDate } from '../../utils/datetime';

const TimesheetReportsPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isOrgLevel = hasOrgTimesheetAccess(user);
  const now = new Date();

  const [tab, setTab] = useState(0);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | ''>('');
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [partnerId, setPartnerId] = useState<number | ''>('');
  const [status, setStatus] = useState('');
  const [includeUnapproved, setIncludeUnapproved] = useState(false);

  const [rows, setRows] = useState<TimesheetListRow[]>([]);
  const [summary, setSummary] = useState<TimesheetProjectSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<TimesheetProject[]>([]);
  const [partners, setPartners] = useState<TimesheetPartner[]>([]);
  const [employees, setEmployees] = useState<TimesheetEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTimesheetProjects().then(setProjects).catch(() => setProjects([]));
    getTimesheetPartners().then(setPartners).catch(() => setPartners([]));
    getTimesheetEmployees().then(setEmployees).catch(() => setEmployees([]));
    if (isOrgLevel) {
      api.get('/departments').then((r) => setDepartments(r.data.data)).catch(() => setDepartments([]));
    }
  }, [isOrgLevel]);

  /**
   * The filter set shared by both tabs and by the export. Rebuilt from the
   * individual pieces of state so the effect below can depend on those rather
   * than on an object that is new on every render.
   */
  const buildFilters = useCallback(() => ({
    year,
    month: month || undefined,
    departmentId: departmentId || undefined,
    employeeId: employeeId || undefined,
    projectId: projectId || undefined,
    partnerId: partnerId || undefined,
    status: status || undefined,
  }), [year, month, departmentId, employeeId, projectId, partnerId, status]);

  const load = useCallback(async () => {
    const filters = buildFilters();
    try {
      setLoading(true);
      if (tab === 0) {
        const res = await listTimesheets({ ...filters, page: page + 1, limit: rowsPerPage });
        setRows(res.data);
        setTotal(res.pagination.total);
      } else {
        setSummary(await getProjectSummary({ ...filters, includeUnapproved }));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load the report');
    } finally {
      setLoading(false);
    }
  }, [buildFilters, tab, includeUnapproved, page, rowsPerPage]);

  useEffect(() => { load(); }, [load]);

  const exportAll = async () => {
    try {
      await downloadTimesheetReport({ ...buildFilters(), includeUnapproved });
      toast.success('Report downloaded');
    } catch (err: any) {
      toast.error(err?.message || 'Export failed');
    }
  };

  const totalHours = summary.reduce((s, r) => s + Number(r.actual_hours), 0);

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between"
        alignItems={{ md: 'center' }} spacing={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={600}>Timesheet Reports</Typography>
          <Typography variant="body2" color="text.secondary">
            Filter, read, and export
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<ExcelIcon />} onClick={exportAll}>
          Export workbook
        </Button>
      </Stack>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3} md={2}>
            <TextField select fullWidth size="small" label="Year" value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setPage(0); }}>
              {yearOptions().map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField select fullWidth size="small" label="Month" value={month}
              onChange={(e) => {
                setMonth(e.target.value === '' ? '' : Number(e.target.value)); setPage(0);
              }}>
              <MenuItem value="">Whole year</MenuItem>
              {MONTHS.map((m, i) => <MenuItem key={m} value={i + 1}>{m}</MenuItem>)}
            </TextField>
          </Grid>
          {isOrgLevel && (
            <Grid item xs={12} sm={6} md={2}>
              <TextField select fullWidth size="small" label="Department" value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value === '' ? '' : Number(e.target.value)); setPage(0);
                }}>
                <MenuItem value="">All departments</MenuItem>
                {departments.map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.department_name}</MenuItem>
                ))}
              </TextField>
            </Grid>
          )}
          <Grid item xs={12} sm={6} md={2}>
            <TextField select fullWidth size="small" label="Employee" value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value === '' ? '' : Number(e.target.value)); setPage(0);
              }}>
              <MenuItem value="">All staff</MenuItem>
              {employees.map((emp) => (
                <MenuItem key={emp.employee_id} value={emp.employee_id}>{emp.employee_name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField select fullWidth size="small" label="Project" value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value === '' ? '' : Number(e.target.value)); setPage(0);
              }}>
              <MenuItem value="">All projects</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.project_code} — {p.project_name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField select fullWidth size="small" label="Partner" value={partnerId}
              onChange={(e) => {
                setPartnerId(e.target.value === '' ? '' : Number(e.target.value)); setPage(0);
              }}>
              <MenuItem value="">All partners</MenuItem>
              {partners.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.partner_name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField select fullWidth size="small" label="Status" value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
              <MenuItem value="">All statuses</MenuItem>
              {ALL_STATUSES.filter((s) => s !== 'NOT_STARTED').map((s) => (
                <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>
              ))}
            </TextField>
          </Grid>
          {tab === 1 && (
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={<Switch size="small" checked={includeUnapproved}
                  onChange={(e) => setIncludeUnapproved(e.target.checked)} />}
                label={<Typography variant="body2">Include timesheets not yet approved</Typography>}
              />
            </Grid>
          )}
        </Grid>
      </Paper>

      <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(0); }} sx={{ mb: 2 }}>
        <Tab label="Timesheets" />
        <Tab label="Project summary" />
      </Tabs>

      <Paper variant="outlined">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : tab === 0 ? (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Expected</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Actual</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Completion</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Approved</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No timesheets match these filters.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{r.employee_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.employee_number || ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{r.department_name || '—'}</Typography>
                      </TableCell>
                      <TableCell>{r.month_name} {r.year}</TableCell>
                      <TableCell><TimesheetStatusChip status={r.status} /></TableCell>
                      <TableCell align="right">{Number(r.expected_hours).toFixed(1)}</TableCell>
                      <TableCell align="right">{Number(r.total_hours).toFixed(1)}</TableCell>
                      <TableCell align="right">
                        <Chip size="small"
                          color={r.completion_percent >= 99 ? 'success'
                            : r.completion_percent >= 80 ? 'warning' : 'error'}
                          label={`${r.completion_percent.toFixed(0)}%`} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {r.approved_at ? formatDate(r.approved_at) : '—'}
                        </Typography>
                        {r.approved_by_name && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {r.approved_by_name}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Open">
                            <IconButton size="small" onClick={() => navigate(`/timesheets/${r.id}`)}>
                              <OpenIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="PDF">
                            <IconButton size="small" onClick={() => downloadTimesheetPDF(
                              r.id, `${r.employee_name}-${r.month_name}-${r.year}`.replace(/\s+/g, '-')
                            ).catch((e) => toast.error(e.message))}>
                              <PdfIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Excel">
                            <IconButton size="small" onClick={() => downloadTimesheetExcel(
                              r.id, `${r.employee_name}-${r.month_name}-${r.year}`.replace(/\s+/g, '-')
                            ).catch((e) => toast.error(e.message))}>
                              <ExcelIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div" count={total} page={page} rowsPerPage={rowsPerPage}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
              rowsPerPageOptions={[25, 50, 100]}
            />
          </>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Project</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Partner</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Staff</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Timesheets</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Average LOE %</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Hours</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Share of hours</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        No hours recorded for these filters.
                        {!includeUnapproved && ' Only approved timesheets are counted.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {summary.map((r) => (
                  <TableRow key={`${r.project_id}-${r.partner_id}`} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{r.project_code || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.project_name || ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{r.partner_name || '—'}</Typography>
                    </TableCell>
                    <TableCell align="right">{r.staff_count}</TableCell>
                    <TableCell align="right">{r.timesheet_count}</TableCell>
                    <TableCell align="right">{Number(r.average_loe_percent).toFixed(1)}%</TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {Number(r.actual_hours).toFixed(1)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{Number(r.actual_percent).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
                {summary.length > 0 && (
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell colSpan={5} sx={{ fontWeight: 700 }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {totalHours.toFixed(1)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>100.0%</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default TimesheetReportsPage;
