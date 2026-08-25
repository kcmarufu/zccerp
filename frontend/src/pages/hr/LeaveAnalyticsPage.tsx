/**
 * Leave Analytics Page
 *
 * Oversight view for the HR Office and Super Admin:
 *   - headline balance position across the organisation
 *   - employees banking too many days (the leave-liability watch list)
 *   - employees who have barely taken leave
 *   - department and leave-type breakdowns
 *   - ageing of unapproved requests
 *   - confirmation that the 25th-of-month accrual actually ran
 *
 * A Head of Department sees the same page scoped to their own department;
 * the narrowing is applied server-side.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Stack, Select, MenuItem, FormControl,
  InputLabel, CircularProgress, Alert, Button, Tooltip, IconButton, Divider,
  LinearProgress, Menu, Tabs, Tab, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, InputAdornment, ToggleButton, ToggleButtonGroup,
  TablePagination, alpha, useTheme,
} from '@mui/material';
import {
  Insights as InsightsIcon,
  Warning as WarningIcon,
  Download as DownloadIcon,
  PictureAsPdf as PdfIcon,
  TableView as ExcelIcon,
  Refresh as RefreshIcon,
  EventRepeat as AccrualIcon,
  HourglassTop as AgingIcon,
  Groups as GroupsIcon,
  Tune as AdjustIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Search as SearchIcon,
  ListAlt as RegisterIcon,
} from '@mui/icons-material';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Legend, LineChart, Line,
} from 'recharts';
import { toast } from 'react-toastify';

import {
  getLeaveAnalytics, runLeaveAccrual, downloadLeaveRegisterPDF, downloadLeaveExcel,
  getLeaveRegister, getAccrualReport, adjustLeaveBalance, getLeaveAdjustments,
  getLeaveTypes,
} from '../../services/hrService';
import {
  HRLeaveAnalytics, HRLeaveRegisterRow, HRAccrualReport, HRLeaveAdjustment,
  HRLeaveType,
} from '../../types';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import { formatDateTime } from '../../utils/datetime';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const days = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toFixed(1);

/** The API returns MySQL tinyints, so 1/0 must count as true/false. */
const truthy = (v: boolean | number | undefined | null) => v === true || v === 1;

// ─── Stat tile ───────────────────────────────────────────────────────────────

const Stat: React.FC<{
  label: string; value: React.ReactNode; hint?: string; color?: string;
}> = ({ label, value, hint, color }) => (
  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
    <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography variant="h4" fontWeight={700} color={color} mt={0.5}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.disabled" display="block" mt={0.25}>
          {hint}
        </Typography>
      )}
    </CardContent>
  </Card>
);

// ─── Page ────────────────────────────────────────────────────────────────────

const LeaveAnalyticsPage: React.FC = () => {
  const theme = useTheme();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'ADMIN';

  const [data, setData]         = useState<HRLeaveAnalytics | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [year, setYear]         = useState(new Date().getFullYear());
  const [threshold, setThreshold] = useState(30);
  const [accruing, setAccruing] = useState(false);
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);

  // Tabs: 0 = Overview, 1 = Leave Register, 2 = Accruals & Adjustments
  const [tab, setTab] = useState(0);

  const [register, setRegister]       = useState<HRLeaveRegisterRow[]>([]);
  const [registerLoading, setRegLoad] = useState(false);
  const [search, setSearch]           = useState('');
  const [regPage, setRegPage]         = useState(0);
  const [regRows, setRegRows]         = useState(25);
  /** Register filters: department, and a reporting period to count leave over. */
  const [regDept, setRegDept]         = useState('');
  const [regFrom, setRegFrom]         = useState('');
  const [regTo, setRegTo]             = useState('');
  const [departments, setDepartments] = useState<{ id: number; department_name: string }[]>([]);
  const regPeriodActive = Boolean(regFrom || regTo);

  const [accrual, setAccrual]         = useState<HRAccrualReport | null>(null);
  const [adjustments, setAdjustments] = useState<HRLeaveAdjustment[]>([]);
  const [leaveTypes, setLeaveTypes]   = useState<HRLeaveType[]>([]);

  /** Manual top-up / deduction dialog. */
  const [adjDialog, setAdjDialog] = useState<{
    open: boolean; row: HRLeaveRegisterRow | null;
  }>({ open: false, row: null });
  const [adjMode, setAdjMode]     = useState<'ADD' | 'DEDUCT'>('ADD');
  const [adjDays, setAdjDays]     = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjTypeId, setAdjTypeId] = useState<number | ''>('');
  const [adjSaving, setAdjSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getLeaveAnalytics({ year, threshold }));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load leave analytics');
    } finally {
      setLoading(false);
    }
  }, [year, threshold]);

  useEffect(() => { load(); }, [load]);

  const loadRegister = useCallback(async () => {
    setRegLoad(true);
    try {
      setRegister(await getLeaveRegister({
        year,
        search: search || undefined,
        departmentId: regDept ? Number(regDept) : undefined,
        dateFrom: regFrom || undefined,
        dateTo: regTo || undefined,
      }));
    }
    catch (err: any) { toast.error(err.response?.data?.error || 'Failed to load the leave register'); }
    finally { setRegLoad(false); }
  }, [year, search, regDept, regFrom, regTo]);

  const loadAccruals = useCallback(async () => {
    try {
      const [rep, adj] = await Promise.all([
        getAccrualReport({ year }),
        getLeaveAdjustments({ year }),
      ]);
      setAccrual(rep);
      setAdjustments(adj);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load the accrual report');
    }
  }, [year]);

  // Load each tab's data the first time it is opened, and on year change.
  useEffect(() => {
    if (tab === 1) loadRegister();
    if (tab === 2) loadAccruals();
  }, [tab, loadRegister, loadAccruals]);

  useEffect(() => {
    getLeaveTypes().then(setLeaveTypes).catch(() => setLeaveTypes([]));
    // A Head of Department is scoped to their own department server-side, so an
    // empty list simply leaves the picker out of their way.
    api.get('/departments')
      .then((res) => { if (res.data?.success) setDepartments(res.data.data); })
      .catch(() => setDepartments([]));
  }, []);

  /**
   * A reporting period narrows the register to the staff who actually have
   * leave inside it — otherwise a date filter would change two columns and
   * leave the same wall of names in place.
   */
  const registerRows = regPeriodActive
    ? register.filter((r) => Number(r.requests_in_period) > 0)
    : register;

  /** The accrued pool — the only balance a manual adjustment can meaningfully move. */
  const accrualType = leaveTypes.find((t) => truthy(t.is_accrual_target));

  const openAdjust = (row: HRLeaveRegisterRow) => {
    setAdjMode('ADD');
    setAdjDays('');
    setAdjReason('');
    setAdjTypeId(accrualType ? Number(accrualType.id) : '');
    setAdjDialog({ open: true, row });
  };

  const submitAdjustment = async () => {
    const row = adjDialog.row;
    if (!row) return;
    const magnitude = Number(adjDays);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      toast.error('Enter a number of days greater than zero');
      return;
    }
    if (!adjReason.trim()) {
      toast.error('A reason is required');
      return;
    }
    if (!adjTypeId) {
      toast.error('Choose a leave type');
      return;
    }

    setAdjSaving(true);
    try {
      const result = await adjustLeaveBalance({
        employee_id: row.employee_id,
        leave_type_id: Number(adjTypeId),
        adjustment_days: adjMode === 'ADD' ? magnitude : -magnitude,
        reason: adjReason.trim(),
        fiscal_year: year,
      });
      toast.success(
        `${magnitude} day(s) ${adjMode === 'ADD' ? 'credited to' : 'deducted from'} ${row.employee_name}. `
        + `Balance ${Number(result.balance_before).toFixed(1)} → ${Number(result.balance_after).toFixed(1)} day(s).`
      );
      setAdjDialog({ open: false, row: null });
      // Refresh every view the number appears in, so the change is visible
      // immediately rather than only after a manual reload.
      await Promise.all([loadRegister(), load(), loadAccruals()]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to adjust the balance');
    } finally {
      setAdjSaving(false);
    }
  };

  const handleAccrual = async () => {
    setAccruing(true);
    try {
      const result = await runLeaveAccrual();
      toast.success(
        result?.ran
          ? `Accrual processed — ${result.credited} employee(s) credited ${result.days_per_employee} day(s); ${result.skipped} already had this month.`
          : `Accrual did not run: ${result?.reason || 'unknown reason'}`
      );
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to run accrual');
    } finally {
      setAccruing(false);
    }
  };

  const runExport = async (kind: 'pdf' | 'excel') => {
    setExportAnchor(null);
    try {
      toast.info('Preparing export…');
      // The printed register follows whatever department the tab is showing.
      if (kind === 'pdf') await downloadLeaveRegisterPDF({
        year, departmentId: regDept ? Number(regDept) : undefined,
      });
      else                await downloadLeaveExcel({ year, threshold });
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    }
  };

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  if (loading) {
    return <Box display="flex" justifyContent="center" p={8}><CircularProgress /></Box>;
  }
  if (error) {
    return <Box p={3}><Alert severity="error">{error}</Alert></Box>;
  }
  if (!data) return null;

  const s = data.summary;
  const utilisation = Number(s.total_entitlement) > 0
    ? Math.round((Number(s.total_taken) / Number(s.total_entitlement)) * 100)
    : 0;

  const trendData = MONTHS.map((m, i) => {
    const hit = data.monthlyTrend.find((t) => Number(t.month) === i + 1);
    return { month: m, days: hit ? Number(hit.days) : 0, requests: hit ? Number(hit.request_count) : 0 };
  });

  const deptData = data.byDepartment.slice(0, 12).map((d) => ({
    name: d.department_name || 'Unassigned',
    Taken: Number(d.days_taken),
    Remaining: Number(d.days_remaining),
  }));

  return (
    <Box p={3}>
      {/* ── Header ── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={700} display="flex" alignItems="center" gap={1}>
            <InsightsIcon color="primary" />
            Leave Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {isSuperAdmin
              ? 'Organisation-wide leave position, liability and approval health'
              : 'Leave position for your department'}
            {' — fiscal year '}{data.fiscal_year}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel>Year</InputLabel>
            <Select value={year} label="Year" onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Flag above</InputLabel>
            <Select value={threshold} label="Flag above" onChange={(e) => setThreshold(Number(e.target.value))}>
              {[15, 20, 25, 30, 40, 50].map((t) => (
                <MenuItem key={t} value={t}>{t} days</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load}><RefreshIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Button variant="outlined" startIcon={<DownloadIcon />}
            onClick={(e) => setExportAnchor(e.currentTarget)}>
            Export
          </Button>
          <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
            <MenuItem onClick={() => runExport('pdf')}>
              <PdfIcon fontSize="small" style={{ marginRight: 8 }} /> Leave Register (PDF)
            </MenuItem>
            <MenuItem onClick={() => runExport('excel')}>
              <ExcelIcon fontSize="small" style={{ marginRight: 8 }} /> Full Report (Excel)
            </MenuItem>
          </Menu>
        </Stack>
      </Box>

      {/* ── Headline stats ── */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Stat label="EMPLOYEES TRACKED" value={Number(s.employees) || 0}
                hint="with a deductible balance" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Stat label="DAYS OUTSTANDING" value={days(s.total_remaining)}
                hint="total leave liability" color="warning.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Stat label="AVERAGE BALANCE" value={days(s.avg_remaining)}
                hint="days per employee" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Stat
            label="OVER THRESHOLD"
            value={data.highBalances.length}
            hint={`holding ${data.high_balance_threshold}+ days`}
            color={data.highBalances.length > 0 ? 'error.main' : 'success.main'}
          />
        </Grid>
      </Grid>

      {/* ── Utilisation bar ── */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="subtitle2" fontWeight={700}>Leave Utilisation</Typography>
          <Typography variant="body2" color="text.secondary">
            {days(s.total_taken)} taken of {days(s.total_entitlement)} entitled ({utilisation}%)
            {Number(s.total_pending) > 0 && ` • ${days(s.total_pending)} awaiting approval`}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(utilisation, 100)}
          sx={{ height: 10, borderRadius: 5 }}
          color={utilisation < 30 ? 'warning' : 'primary'}
        />
        {utilisation < 30 && (
          <Typography variant="caption" color="warning.main" mt={0.75} display="block">
            Low utilisation — staff are accruing faster than they are taking leave, which grows the liability.
          </Typography>
        )}
      </Paper>

      {/* ── Tabs ── */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<InsightsIcon fontSize="small" />} iconPosition="start" label="Overview"
             sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48 }} />
        <Tab icon={<RegisterIcon fontSize="small" />} iconPosition="start" label="Leave Register"
             sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48 }} />
        <Tab icon={<AccrualIcon fontSize="small" />} iconPosition="start" label="Accruals & Adjustments"
             sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48 }} />
      </Tabs>

      {tab === 0 && (
      <Grid container spacing={3}>
        {/* ── Monthly trend ── */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              Approved Leave by Month — {data.fiscal_year}
            </Typography>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <ReTooltip />
                <Legend />
                <Line type="monotone" dataKey="days" name="Days taken"
                      stroke={theme.palette.primary.main} strokeWidth={2} />
                <Line type="monotone" dataKey="requests" name="Requests"
                      stroke={theme.palette.secondary.main} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* ── Leave type split ── */}
        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>Usage by Leave Type</Typography>
            <TableContainer sx={{ maxHeight: 260 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Deductible</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Approved</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Pending</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.byLeaveType.map((t) => (
                    <TableRow key={t.leave_type_id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{t.leave_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t.request_count} request(s)
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small" variant="outlined"
                          label={t.is_deductible ? 'Yes' : 'No'}
                          color={t.is_deductible ? 'warning' : 'success'}
                          sx={{ height: 20, fontSize: 11 }}
                        />
                      </TableCell>
                      <TableCell align="right">{days(t.days_approved)}</TableCell>
                      <TableCell align="right">{days(t.days_pending)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* ── Department breakdown ── */}
        {deptData.length > 0 && (
          <Grid item xs={12}>
            <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5}
                display="flex" alignItems="center" gap={0.75}>
                <GroupsIcon fontSize="small" /> Balance and Usage by Department
              </Typography>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={deptData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                  <XAxis dataKey="name" fontSize={11} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis fontSize={12} />
                  <ReTooltip />
                  <Legend />
                  <Bar dataKey="Taken" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Remaining" fill={theme.palette.warning.main} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}

        {/* ── High balances: the "too many days" watch list ── */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}
              display="flex" alignItems="center" gap={0.75}>
              <WarningIcon fontSize="small" color="error" />
              Employees Holding {data.high_balance_threshold}+ Days
            </Typography>
            {data.highBalances.length === 0 ? (
              <Alert severity="success" sx={{ py: 0.5 }}>
                No one is above the {data.high_balance_threshold}-day threshold.
              </Alert>
            ) : (
              <TableContainer sx={{ maxHeight: 340 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Taken</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Remaining</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.highBalances.map((h) => (
                      <TableRow key={`${h.employee_id}-${h.leave_type_name}`} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{h.employee_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {h.employee_number || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{h.department_name || '—'}</Typography>
                        </TableCell>
                        <TableCell align="right">{days(h.taken)}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color="error.main">
                            {days(h.remaining_days)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* ── Low utilisation ── */}
        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              Barely Taking Leave (5 days or fewer)
            </Typography>
            {data.lowUtilisation.length === 0 ? (
              <Alert severity="success" sx={{ py: 0.5 }}>Everyone has taken meaningful leave.</Alert>
            ) : (
              <TableContainer sx={{ maxHeight: 340 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Days Taken</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.lowUtilisation.map((l) => (
                      <TableRow key={l.employee_id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{l.employee_name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{l.department_name || '—'}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700}
                            color={Number(l.days_taken) === 0 ? 'error.main' : 'warning.main'}>
                            {days(l.days_taken)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* ── Pending ageing ── */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}
              display="flex" alignItems="center" gap={0.75}>
              <AgingIcon fontSize="small" /> Requests Awaiting Approval
            </Typography>
            {data.pendingAging.length === 0 ? (
              <Alert severity="success" sx={{ py: 0.5 }}>Nothing is waiting for approval.</Alert>
            ) : (
              <TableContainer sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Days</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Waiting</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.pendingAging.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{p.employee_name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{p.department_name || '—'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{p.leave_type_name}</Typography>
                        </TableCell>
                        <TableCell align="right">{days(p.total_days)}</TableCell>
                        <TableCell align="right">
                          <Chip
                            size="small"
                            label={`${p.days_waiting}d`}
                            color={p.days_waiting > 7 ? 'error' : p.days_waiting > 3 ? 'warning' : 'default'}
                            sx={{ height: 20, fontSize: 11 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* ── Accrual health ── */}
        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography variant="subtitle2" fontWeight={700}
                display="flex" alignItems="center" gap={0.75}>
                <AccrualIcon fontSize="small" /> Monthly Accrual
              </Typography>
              {isSuperAdmin && (
                <Button size="small" variant="outlined" onClick={handleAccrual} disabled={accruing}
                  startIcon={accruing ? <CircularProgress size={14} /> : undefined}>
                  Run now
                </Button>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
              Every employee is credited automatically on the 25th of each month.
              Re-running is safe — each employee can only be credited once per month.
            </Typography>
            <Divider sx={{ mb: 1 }} />
            {data.accrualHistory.length === 0 ? (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                No accrual has run yet. Check that the scheduler is enabled.
              </Alert>
            ) : (
              <TableContainer sx={{ maxHeight: 220 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Employees</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Days</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Ran</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.accrualHistory.map((a) => (
                      <TableRow key={`${a.fiscal_year}-${a.accrual_month}`}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {MONTHS[a.accrual_month - 1]} {a.fiscal_year}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{a.employees_credited}</TableCell>
                        <TableCell align="right">{days(a.days_added)}</TableCell>
                        <TableCell>
                          <Typography variant="caption">{formatDateTime(a.run_at)}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>
      )}

      {/* ══════════════════ TAB 1 — LEAVE REGISTER ══════════════════ */}
      {tab === 1 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Box p={2} display="flex" alignItems="center" gap={2} flexWrap="wrap">
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>
                Leave Days per Employee — {year}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {isSuperAdmin
                  ? 'Every active employee across the organisation.'
                  : 'Every active employee in your department.'}
                {' '}Use Adjust to credit or deduct days by hand.
                {regPeriodActive && ' Showing only staff with leave in the chosen period; Taken and Pending count that period.'}
              </Typography>
            </Box>
            <Box flex={1} />
            <TextField
              size="small"
              placeholder="Search name or number…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setRegPage(0); }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                ),
              }}
              sx={{ minWidth: 240 }}
            />
            {departments.length > 1 && (
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <InputLabel>Department</InputLabel>
                <Select
                  value={regDept} label="Department"
                  onChange={(e) => { setRegDept(String(e.target.value)); setRegPage(0); }}
                >
                  <MenuItem value="">All Departments</MenuItem>
                  {departments.map((d) => (
                    <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              size="small" type="date" label="From" InputLabelProps={{ shrink: true }}
              value={regFrom}
              onChange={(e) => { setRegFrom(e.target.value); setRegPage(0); }}
              sx={{ minWidth: 150 }}
            />
            <TextField
              size="small" type="date" label="To" InputLabelProps={{ shrink: true }}
              value={regTo}
              onChange={(e) => { setRegTo(e.target.value); setRegPage(0); }}
              sx={{ minWidth: 150 }}
            />
            {(regDept || regPeriodActive || search) && (
              <Button size="small" onClick={() => {
                setRegDept(''); setRegFrom(''); setRegTo(''); setSearch(''); setRegPage(0);
              }}>
                Clear
              </Button>
            )}
            <Tooltip title="Refresh">
              <span>
                <IconButton size="small" onClick={loadRegister} disabled={registerLoading}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          <Divider />

          {registerLoading ? (
            <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>
          ) : registerRows.length === 0 ? (
            <Box py={6} textAlign="center">
              <Typography variant="body2" color="text.secondary">No employees found.</Typography>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">Rate</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Accrued</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Adjustments</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Entitlement</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        {regPeriodActive ? 'Taken (period)' : 'Taken'}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        {regPeriodActive ? 'Pending (period)' : 'Pending'}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Remaining</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">Adjust</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {registerRows
                      .slice(regPage * regRows, regPage * regRows + regRows)
                      .map((r) => {
                        const remaining = Number(r.remaining_days);
                        const adj = Number(r.manual_adjustments);
                        return (
                          <TableRow key={r.employee_id} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{r.employee_name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {r.employee_number || '—'}
                                {r.position_title ? ` • ${r.position_title}` : ''}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{r.department_name || '—'}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              {/* Anyone not on the standard 2.5 is flagged, so a
                                  skewed report can be traced to its cause. */}
                              {r.accrual_enabled === 0 ? (
                                <Chip size="small" label="Off" color="default"
                                      sx={{ height: 20, fontSize: 11 }} />
                              ) : r.accrual_rate_override != null ? (
                                <Tooltip title={r.accrual_note || 'Custom monthly rate'}>
                                  <Chip size="small" color="info" variant="outlined"
                                        label={`${Number(r.accrual_rate_override).toFixed(2)}/mo`}
                                        sx={{ height: 20, fontSize: 11 }} />
                                </Tooltip>
                              ) : (
                                <Typography variant="caption" color="text.disabled">2.50/mo</Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">{days(r.accrued_this_year)}</TableCell>
                            <TableCell align="right">
                              {adj === 0 ? (
                                <Typography variant="body2" color="text.disabled">—</Typography>
                              ) : (
                                <Typography variant="body2" fontWeight={600}
                                  color={adj > 0 ? 'success.main' : 'error.main'}>
                                  {adj > 0 ? '+' : ''}{days(adj)}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">{days(r.entitlement)}</TableCell>
                            <TableCell align="right">
                              {days(regPeriodActive ? r.taken_in_period : r.taken)}
                            </TableCell>
                            <TableCell align="right">
                              {days(regPeriodActive ? r.pending_in_period : r.pending)}
                            </TableCell>
                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                fontWeight={700}
                                color={
                                  remaining < 0 ? 'error.main'
                                  : remaining >= threshold ? 'warning.main'
                                  : 'success.main'
                                }
                              >
                                {days(remaining)}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title="Top up or deduct days">
                                <IconButton size="small" color="primary" onClick={() => openAdjust(r)}>
                                  <AdjustIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[25, 50, 100]}
                component="div"
                count={registerRows.length}
                rowsPerPage={regRows}
                page={regPage}
                onPageChange={(_, pg) => setRegPage(pg)}
                onRowsPerPageChange={(e) => { setRegRows(parseInt(e.target.value)); setRegPage(0); }}
              />
            </>
          )}
        </Paper>
      )}

      {/* ══════════════ TAB 2 — ACCRUALS & ADJUSTMENTS ══════════════ */}
      {tab === 2 && (
        <Grid container spacing={3}>
          {accrual && (
            <>
              <Grid item xs={12} sm={4}>
                <Stat label="DAYS ACCRUED THIS YEAR" value={days(accrual.totals.days_accrued)}
                      hint={`${accrual.totals.credit_events} credit events`} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Stat label="EMPLOYEES CREDITED" value={Number(accrual.totals.employees) || 0}
                      hint="at least once this year" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Stat label="MANUAL ADJUSTMENTS" value={adjustments.length}
                      hint="hand-applied credits and deductions" />
              </Grid>

              <Grid item xs={12} md={7}>
                <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                    Accruals per Department — {accrual.fiscal_year}
                  </Typography>
                  {accrual.byDepartment.length === 0 ? (
                    <Alert severity="info" sx={{ py: 0.5 }}>No accruals recorded yet.</Alert>
                  ) : (
                    <TableContainer sx={{ maxHeight: 320 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                            <TableCell sx={{ fontWeight: 700 }} align="right">Employees</TableCell>
                            <TableCell sx={{ fontWeight: 700 }} align="right">Days Accrued</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {accrual.byDepartment.map((d) => (
                            <TableRow key={`${d.department_id}-${d.department_name}`} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>{d.department_name}</Typography>
                              </TableCell>
                              <TableCell align="right">{d.employees_credited}</TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" fontWeight={700}>{days(d.days_accrued)}</Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Paper>
              </Grid>

              <Grid item xs={12} md={5}>
                <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                  <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                    Accruals by Month
                  </Typography>
                  {accrual.byMonth.length === 0 ? (
                    <Alert severity="warning" sx={{ py: 0.5 }}>
                      No accrual has run yet this year.
                    </Alert>
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={accrual.byMonth.map((m) => ({
                        name: MONTHS[m.month - 1],
                        Days: Number(m.days_accrued),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis fontSize={11} />
                        <ReTooltip />
                        <Bar dataKey="Days" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Paper>
              </Grid>
            </>
          )}

          <Grid item xs={12}>
            <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
                Manual Adjustment Log
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                Every hand-applied credit or deduction, with the reason given and who applied it.
              </Typography>
              {adjustments.length === 0 ? (
                <Alert severity="info" sx={{ py: 0.5 }}>No manual adjustments have been made.</Alert>
              ) : (
                <TableContainer sx={{ maxHeight: 420 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Leave Type</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Change</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Before</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">After</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Reason</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>By</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {adjustments.map((a) => {
                        const delta = Number(a.adjustment_days);
                        return (
                          <TableRow key={a.id} hover>
                            <TableCell>
                              <Typography variant="caption">{formatDateTime(a.created_at)}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{a.employee_name}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{a.department_name || '—'}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{a.leave_type_name}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Chip
                                size="small"
                                label={`${delta > 0 ? '+' : ''}${days(delta)}`}
                                color={delta > 0 ? 'success' : 'error'}
                                sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
                              />
                            </TableCell>
                            <TableCell align="right">{days(a.balance_before)}</TableCell>
                            <TableCell align="right">{days(a.balance_after)}</TableCell>
                            <TableCell sx={{ maxWidth: 280 }}>
                              <Typography variant="body2" color="text.secondary">{a.reason}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{a.adjusted_by_name || 'System'}</Typography>
                              {a.adjusted_by_role && (
                                <Typography variant="caption" color="text.secondary">
                                  {a.adjusted_by_role.replace(/_/g, ' ')}
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* ═══════════════ Manual adjustment dialog ═══════════════ */}
      <Dialog
        open={adjDialog.open}
        onClose={() => setAdjDialog({ open: false, row: null })}
        maxWidth="sm" fullWidth
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>Adjust Leave Balance</Typography>
          {adjDialog.row && (
            <Typography variant="caption" color="text.secondary">
              {adjDialog.row.employee_name}
              {adjDialog.row.department_name ? ` — ${adjDialog.row.department_name}` : ''}
              {` • currently ${days(adjDialog.row.remaining_days)} day(s)`}
            </Typography>
          )}
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={adjMode}
              onChange={(_, v) => v && setAdjMode(v)}
            >
              <ToggleButton value="ADD" color="success">
                <AddIcon fontSize="small" style={{ marginRight: 6 }} /> Top up
              </ToggleButton>
              <ToggleButton value="DEDUCT" color="error">
                <RemoveIcon fontSize="small" style={{ marginRight: 6 }} /> Deduct
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Fixed, not a choice: only the accrued pool carries a balance, so
                that is the only thing an adjustment can move. */}
            <Alert severity="info" sx={{ py: 0.5 }}>
              Adjusting <strong>{accrualType ? accrualType.leave_name : 'the accrued leave balance'}</strong> —
              the only balance that accrues. Other leave types draw from this same
              pool once their free allowance is used up.
            </Alert>

            <TextField
              size="small"
              fullWidth
              type="number"
              label="Number of days"
              value={adjDays}
              onChange={(e) => setAdjDays(e.target.value)}
              inputProps={{ min: 0.5, step: 0.5 }}
            />

            {adjDialog.row && adjDays && Number(adjDays) > 0 && (
              <Alert severity={adjMode === 'ADD' ? 'success' : 'warning'} sx={{ py: 0.5 }}>
                {days(adjDialog.row.remaining_days)} →{' '}
                <strong>
                  {days(
                    Number(adjDialog.row.remaining_days)
                    + (adjMode === 'ADD' ? Number(adjDays) : -Number(adjDays))
                  )}
                </strong>{' '}
                day(s)
              </Alert>
            )}

            <TextField
              size="small"
              fullWidth
              multiline
              rows={3}
              required
              label="Reason (required)"
              placeholder="e.g. Opening balance correction, leave taken before go-live, long-service award"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
            />
            <Typography variant="caption" color="text.secondary">
              This adjustment is recorded permanently against your name and shown in the
              adjustment log.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjDialog({ open: false, row: null })}>Cancel</Button>
          <Button
            variant="contained"
            color={adjMode === 'ADD' ? 'success' : 'error'}
            onClick={submitAdjustment}
            disabled={adjSaving || !adjReason.trim() || !adjDays}
            startIcon={adjSaving ? <CircularProgress size={16} /> : undefined}
          >
            {adjMode === 'ADD' ? 'Credit days' : 'Deduct days'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LeaveAnalyticsPage;
