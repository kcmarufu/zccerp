/**
 * Request Ageing — how long float requests take at each stage, from being
 * raised to being dispatched and fully reconciled, and how long the requests
 * still in the pipeline have been sitting where they are.
 *
 * Every stage can be extracted: the Excel workbook carries one sheet per stage
 * (requests that cleared it, and requests still in it), plus the stage summary,
 * the open pipeline and a full timeline per request.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Alert, CircularProgress, TextField, MenuItem, Stack, Button, Chip, Tooltip,
  InputAdornment, IconButton
} from '@mui/material';
import {
  GetApp as DownloadIcon, Search as SearchIcon, Warning as WarningIcon, Close as CloseIcon
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import { Link as RouterLink } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { format } from '../../utils/datetime';
import { budgetService } from '../../services/budgetService';
import { toast } from 'react-toastify';

interface Props {
  fiscalYear: number;
  donorId?: number;
  projectId?: number;
}

const MILESTONES: { key: string; label: string }[] = [
  { key: 'created', label: 'Raised' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'supervisorApproved', label: 'Supervisor approved' },
  { key: 'financeApproved', label: 'Finance approved' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'reconSubmitted', label: 'Reconciliation submitted' },
  { key: 'reconSupervisorApproved', label: 'Reconciliation supervisor-approved' },
  { key: 'reconciled', label: 'Fully reconciled' },
];

/** Which milestones open and close each stage — mirrors requestAgeing.service. */
const STAGE_BOUNDS: Record<string, { from: string[]; to: string }> = {
  SUBMISSION: { from: ['created'], to: 'submitted' },
  SUPERVISOR: { from: ['submitted'], to: 'supervisorApproved' },
  FINANCE: { from: ['supervisorApproved', 'submitted'], to: 'financeApproved' },
  DISPATCH: { from: ['financeApproved'], to: 'dispatched' },
  RECON_SUBMISSION: { from: ['dispatched'], to: 'reconSubmitted' },
  RECON_SUPERVISOR: { from: ['reconSubmitted'], to: 'reconSupervisorApproved' },
  RECON_FINANCE: { from: ['reconSupervisorApproved', 'reconSubmitted'], to: 'reconciled' },
};

const fmtDays = (d: number | null | undefined) => (d === null || d === undefined ? '—' : d.toFixed(1));
const fmtDate = (s?: string | null) => (s ? format(new Date(s), 'dd MMM yyyy HH:mm') : '');
const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const RequestAgeingReport: React.FC<Props> = ({ fiscalYear, donorId, projectId }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  // Narrows the request table to one stage: requests sitting in it now
  // (optionally in one ageing bucket), or requests that have cleared it.
  const [stageFilter, setStageFilter] = useState<{ stage: string; mode: 'open' | 'done'; bucket?: string; label: string } | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    budgetService.getAgeingReport({
      fiscalYear, donorId, projectId,
      dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
    })
      .then(res => { if (!cancelled && res.success) setData(res.data); })
      .catch(() => { if (!cancelled) toast.error('Failed to load the ageing report'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fiscalYear, donorId, projectId, dateFrom, dateTo]);

  const departments: string[] = useMemo(
    () => Array.from(new Set<string>((data?.requests || []).map((r: any) => r.department_code).filter(Boolean))).sort(),
    [data]
  );

  const deptRequests: any[] = useMemo(
    () => (data?.requests || []).filter((r: any) => !department || r.department_code === department),
    [data, department]
  );

  const stageLabel = (key: string) =>
    (data?.stages || []).find((s: any) => s.key === key)?.label
    || (key === 'RETURNED' ? 'Returned to requester (rejected)' : key);

  const bucketOf = (d: number) => {
    if (d <= 2) return '0-2';
    if (d <= 7) return '3-7';
    if (d <= 14) return '8-14';
    if (d <= 30) return '15-30';
    return '30+';
  };

  // Stage statistics and the open pipeline are recomputed from the rows so the
  // department filter applies to them as well as to the table.
  const { stageStats, pipeline, totals } = useMemo(() => {
    const summarise = (vals: number[]) => {
      const v = vals.filter(x => x !== null && x !== undefined).sort((a, b) => a - b);
      if (!v.length) return { count: 0, avg: null, median: null, p90: null, max: null };
      const pct = (p: number) => v[Math.max(0, Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1))];
      return {
        count: v.length,
        avg: Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10,
        median: pct(50), p90: pct(90), max: v[v.length - 1],
      };
    };
    const stageStats = (data?.stages || []).map((s: any) => ({
      key: s.key, label: s.label,
      ...summarise(deptRequests.map(r => r.stage_days[s.key]).filter((d: any) => d !== null)),
      open: deptRequests.filter(r => r.current_stage === s.key).length,
    }));
    const order = [...(data?.stages || []).map((s: any) => s.key), 'RETURNED'];
    const pipeline = order.map((key: string) => {
      const rows = deptRequests.filter(r => r.current_stage === key && r.days_in_current_stage !== null);
      const buckets: Record<string, number> = { '0-2': 0, '3-7': 0, '8-14': 0, '15-30': 0, '30+': 0 };
      rows.forEach(r => { buckets[bucketOf(r.days_in_current_stage)] += 1; });
      return {
        key, label: stageLabel(key), count: rows.length, buckets,
        amount: rows.reduce((s, r) => s + (r.total_amount || 0), 0),
        oldest: rows.reduce((m, r) => Math.max(m, r.days_in_current_stage), 0),
      };
    }).filter(p => p.count > 0);
    const totals = {
      toDispatch: summarise(deptRequests.map(r => r.submitted_to_dispatched).filter((d: any) => d !== null)),
      toReconciled: summarise(deptRequests.map(r => r.submitted_to_reconciled).filter((d: any) => d !== null)),
      open: deptRequests.filter(r => r.current_stage).length,
      openOver14: deptRequests.filter(r => r.current_stage && r.days_in_current_stage > 14).length,
    };
    return { stageStats, pipeline, totals };
  }, [data, deptRequests]);

  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deptRequests.filter(r => {
      if (stageFilter) {
        if (stageFilter.mode === 'open') {
          if (r.current_stage !== stageFilter.stage) return false;
          if (stageFilter.bucket && bucketOf(r.days_in_current_stage) !== stageFilter.bucket) return false;
        } else if (r.stage_days[stageFilter.stage] === null || r.stage_days[stageFilter.stage] === undefined) {
          return false;
        }
      }
      return !q
        || r.request_code?.toLowerCase().includes(q)
        || r.requester_name?.toLowerCase().includes(q)
        || r.donor_code?.toLowerCase().includes(q)
        || r.project_code?.toLowerCase().includes(q);
    }).sort((a, b) => {
      // When looking at one stage, the slowest requests are the ones to chase.
      if (stageFilter?.mode === 'open') return (b.days_in_current_stage || 0) - (a.days_in_current_stage || 0);
      if (stageFilter?.mode === 'done') return (b.stage_days[stageFilter.stage] || 0) - (a.stage_days[stageFilter.stage] || 0);
      return 0;
    });
  }, [deptRequests, search, stageFilter]);

  useEffect(() => { setPage(0); }, [search, stageFilter, department, data]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const timelineRow = (r: any) => [
    r.request_code, r.requester_name, r.department_code || '', r.donor_code || '', r.project_code || '',
    r.total_amount, r.status.replace(/_/g, ' '),
    ...MILESTONES.map(m => fmtDate(r.milestones[m.key])),
    ...(data.stages as any[]).map(s => r.stage_days[s.key]),
    r.submitted_to_dispatched, r.submitted_to_reconciled,
    r.rejections.SUPERVISOR, r.rejections.FINANCE, r.rejections.RECON,
    r.current_stage_label || 'Complete', r.days_in_current_stage,
  ];
  const timelineHeaders = () => [
    'Request', 'Requester', 'Department', 'Partner', 'Project', 'Amount ($)', 'Status',
    ...MILESTONES.map(m => m.label),
    ...(data.stages as any[]).map(s => `${s.label} (days)`),
    'Submitted → Dispatched (days)', 'Submitted → Reconciled (days)',
    'Supervisor rejections', 'Finance rejections', 'Reconciliation rejections',
    'Current stage', 'Days in current stage',
  ];

  const stageSheet = (stageKey: string) => {
    const bounds = STAGE_BOUNDS[stageKey];
    const headers = ['Request', 'Requester', 'Department', 'Partner', 'Project', 'Amount ($)', 'Status',
      'Stage state', 'Stage started', 'Stage completed', 'Days in stage', 'Rejections (all stages)'];
    const rows: any[][] = [];
    deptRequests.forEach(r => {
      const started = bounds.from.map(k => r.milestones[k]).find(Boolean);
      const base = [r.request_code, r.requester_name, r.department_code || '', r.donor_code || '', r.project_code || '',
        r.total_amount, r.status.replace(/_/g, ' ')];
      const rej = r.rejections.SUPERVISOR + r.rejections.FINANCE + r.rejections.RECON;
      if (r.stage_days[stageKey] !== null && r.stage_days[stageKey] !== undefined) {
        rows.push([...base, 'Completed', fmtDate(started), fmtDate(r.milestones[bounds.to]), r.stage_days[stageKey], rej]);
      } else if (r.current_stage === stageKey) {
        rows.push([...base, 'In progress', fmtDate(started), '', r.days_in_current_stage, rej]);
      }
    });
    rows.sort((a, b) => (b[10] || 0) - (a[10] || 0));
    return XLSX.utils.aoa_to_sheet([headers, ...rows]);
  };

  const suffix = () => `${department ? `${department}-` : ''}fy${fiscalYear}-${format(new Date(), 'yyyy-MM-dd')}`;

  const exportWorkbook = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Stage', 'Completed', 'Average (days)', 'Median (days)', '90th percentile (days)', 'Longest (days)', 'Open now'],
      ...stageStats.map((s: any) => [s.label, s.count, s.avg, s.median, s.p90, s.max, s.open]),
      [],
      ['Submitted → Dispatched', totals.toDispatch.count, totals.toDispatch.avg, totals.toDispatch.median, totals.toDispatch.p90, totals.toDispatch.max],
      ['Submitted → Fully reconciled', totals.toReconciled.count, totals.toReconciled.avg, totals.toReconciled.median, totals.toReconciled.p90, totals.toReconciled.max],
      [],
      ['Days are elapsed calendar days. Time lost to rejection and rework is charged to the stage the request was finally cleared from.'],
    ]), 'Stage Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Current stage', 'Requests', 'Value ($)', '0–2 days', '3–7 days', '8–14 days', '15–30 days', 'Over 30 days', 'Oldest (days)'],
      ...pipeline.map(p => [p.label, p.count, Math.round(p.amount * 100) / 100,
        p.buckets['0-2'], p.buckets['3-7'], p.buckets['8-14'], p.buckets['15-30'], p.buckets['30+'], p.oldest]),
    ]), 'Open Pipeline');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([timelineHeaders(), ...deptRequests.map(timelineRow)]), 'All Requests');
    (data.stages as any[]).forEach((s, i) => {
      XLSX.utils.book_append_sheet(wb, stageSheet(s.key), `${i + 1}. ${s.label}`.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
    });
    XLSX.writeFile(wb, `request-ageing-${suffix()}.xlsx`);
  };

  const exportStage = (stageKey: string, label: string) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, stageSheet(stageKey), label.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
    XLSX.writeFile(wb, `ageing-${stageKey.toLowerCase().replace(/_/g, '-')}-${suffix()}.xlsx`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading && !data) {
    return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  }
  if (!data) return <Alert severity="error">The ageing report could not be loaded.</Alert>;

  const chartData = stageStats.filter((s: any) => s.count > 0)
    .map((s: any) => ({ name: s.label, median: s.median, avg: s.avg, p90: s.p90, count: s.count }));
  const slowest = [...stageStats].filter((s: any) => s.avg !== null).sort((a: any, b: any) => b.avg - a.avg)[0];

  const Tile = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={700}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{hint}</Typography>
    </Paper>
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Request Ageing</Typography>
          <Typography variant="body2" color="text.secondary">
            How long requests take at each stage — from being raised, through approval and dispatch, to full reconciliation
          </Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={exportWorkbook}>
          Excel (all stages)
        </Button>
      </Box>

      <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap" useFlexGap alignItems="center">
        <TextField size="small" type="date" label="Raised from" InputLabelProps={{ shrink: true }}
          value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <TextField size="small" type="date" label="Raised to" InputLabelProps={{ shrink: true }}
          value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {departments.length > 1 && (
          <TextField select size="small" label="Department" value={department}
            onChange={e => setDepartment(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">All departments</MenuItem>
            {departments.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
        )}
        {(dateFrom || dateTo) && (
          <Button size="small" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear dates</Button>
        )}
        <Typography variant="caption" color="text.secondary">
          {dateFrom || dateTo ? 'Date range overrides the fiscal year.' : `Requests raised in FY ${fiscalYear}.`}
          {loading && ' Updating…'}
        </Typography>
      </Stack>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Tile label="Submitted → Dispatched" value={`${fmtDays(totals.toDispatch.median)} days`}
            hint={`median · average ${fmtDays(totals.toDispatch.avg)} · ${totals.toDispatch.count} requests`} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Tile label="Submitted → Fully reconciled" value={`${fmtDays(totals.toReconciled.median)} days`}
            hint={`median · average ${fmtDays(totals.toReconciled.avg)} · ${totals.toReconciled.count} requests`} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Tile label="Slowest stage (average)" value={slowest ? `${fmtDays(slowest.avg)} days` : '—'}
            hint={slowest ? slowest.label : 'No completed stages yet'} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Tile label="Still in the pipeline" value={String(totals.open)}
            hint={`${totals.openOver14} waiting more than 14 days at their current stage`} />
        </Grid>
      </Grid>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="subtitle2" fontWeight={700}>Median days per stage</Typography>
            <Typography variant="caption" color="text.secondary">Completed stages only — hover for average and 90th percentile</Typography>
            <Box height={300} mt={1}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e0e0e0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="d" />
                  <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    formatter={(v: any) => [`${fmtDays(v)} days`, 'Median']}
                    labelFormatter={(label: any) => {
                      const s = chartData.find((c: any) => c.name === label);
                      return s ? `${label} — average ${fmtDays(s.avg)}d, 90th pct ${fmtDays(s.p90)}d (${s.count} requests)` : label;
                    }}
                  />
                  <Bar dataKey="median" fill="#1976d2" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
            <Box p={2} pb={1}>
              <Typography variant="subtitle2" fontWeight={700}>Time taken per stage</Typography>
              <Typography variant="caption" color="text.secondary">
                Click a stage to list the requests that cleared it, slowest first. The download icon extracts that stage.
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Stage</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Done</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Avg</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Median</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>90th pct</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Longest</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Open now</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stageStats.map((s: any) => (
                    <TableRow key={s.key} hover sx={{ cursor: 'pointer' }}
                      selected={stageFilter?.stage === s.key && stageFilter.mode === 'done'}
                      onClick={() => setStageFilter({ stage: s.key, mode: 'done', label: `Cleared: ${s.label}` })}>
                      <TableCell>{s.label}</TableCell>
                      <TableCell align="right">{s.count}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: s.key === slowest?.key ? 700 : 400 }}>{fmtDays(s.avg)}</TableCell>
                      <TableCell align="right">{fmtDays(s.median)}</TableCell>
                      <TableCell align="right">{fmtDays(s.p90)}</TableCell>
                      <TableCell align="right">{fmtDays(s.max)}</TableCell>
                      <TableCell align="right">{s.open}</TableCell>
                      <TableCell padding="checkbox">
                        <Tooltip title={`Extract "${s.label}" to Excel`}>
                          <IconButton size="small" onClick={e => { e.stopPropagation(); exportStage(s.key, s.label); }}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 2, pt: 1 }}>
              Days are elapsed calendar days. Time lost to a rejection is charged to the stage the request was finally cleared from.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
        <Box p={2} pb={1}>
          <Typography variant="subtitle2" fontWeight={700}>Open pipeline — how long requests have waited at their current stage</Typography>
          <Typography variant="caption" color="text.secondary">Click a count to list those requests.</Typography>
        </Box>
        {pipeline.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Nothing is waiting — every request has been reconciled.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Current stage</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Requests</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Value</TableCell>
                  {(data.buckets as any[]).map(b => (
                    <TableCell key={b.key} align="right" sx={{ fontWeight: 600 }}>
                      {b.key === '30+' ? <Box display="inline-flex" alignItems="center" gap={0.5}><WarningIcon fontSize="inherit" color="warning" />{b.label}</Box> : b.label}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Oldest</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pipeline.map(p => (
                  <TableRow key={p.key}>
                    <TableCell>{p.label}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => setStageFilter({ stage: p.key, mode: 'open', label: `Waiting at: ${p.label}` })}>{p.count}</Button>
                    </TableCell>
                    <TableCell align="right">{money(p.amount)}</TableCell>
                    {(data.buckets as any[]).map(b => (
                      <TableCell key={b.key} align="right">
                        {p.buckets[b.key] > 0 ? (
                          <Button size="small" sx={{ minWidth: 0, fontWeight: b.key === '30+' || b.key === '15-30' ? 700 : 400 }}
                            onClick={() => setStageFilter({ stage: p.key, mode: 'open', bucket: b.key, label: `Waiting at: ${p.label}, ${b.label}` })}>
                            {p.buckets[b.key]}
                          </Button>
                        ) : <Typography variant="body2" color="text.disabled">0</Typography>}
                      </TableCell>
                    ))}
                    <TableCell align="right">{fmtDays(p.oldest)}d</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Box p={2} display="flex" gap={1.5} alignItems="center" flexWrap="wrap">
          <Typography variant="subtitle2" fontWeight={700} sx={{ mr: 1 }}>Requests</Typography>
          {stageFilter && (
            <Chip label={stageFilter.label} onDelete={() => setStageFilter(null)} deleteIcon={<CloseIcon />} color="primary" variant="outlined" size="small" />
          )}
          <TextField size="small" placeholder="Search request, requester, partner…" value={search}
            onChange={e => setSearch(e.target.value)} sx={{ ml: 'auto', minWidth: 260 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        </Box>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1200 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 600 }}>Request</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Dept</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Amount</TableCell>
                {(data.stages as any[]).map(s => (
                  <TableCell key={s.key} align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap',
                    bgcolor: stageFilter?.stage === s.key ? 'action.selected' : undefined }}>
                    <Tooltip title={s.label}><span>{s.label.replace('Reconciliation', 'Recon').replace(' approval', '')}</span></Tooltip>
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>To dispatch</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>To reconciled</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Rejections</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Now</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tableRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(r => {
                const rej = r.rejections.SUPERVISOR + r.rejections.FINANCE + r.rejections.RECON;
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <RouterLink to={`/finance/requests/${r.id}`} style={{ color: 'inherit' }}>{r.request_code}</RouterLink>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.requester_name}</TableCell>
                    <TableCell>{r.department_code}</TableCell>
                    <TableCell align="right">{money(r.total_amount)}</TableCell>
                    {(data.stages as any[]).map(s => (
                      <TableCell key={s.key} align="right"
                        sx={{ bgcolor: stageFilter?.stage === s.key ? 'action.hover' : undefined }}>
                        {r.current_stage === s.key
                          ? <Tooltip title="Still in this stage — days so far"><span><em>{fmtDays(r.days_in_current_stage)}…</em></span></Tooltip>
                          : fmtDays(r.stage_days[s.key])}
                      </TableCell>
                    ))}
                    <TableCell align="right">{fmtDays(r.submitted_to_dispatched)}</TableCell>
                    <TableCell align="right">{fmtDays(r.submitted_to_reconciled)}</TableCell>
                    <TableCell align="right">
                      {rej > 0
                        ? <Tooltip title={`Supervisor ${r.rejections.SUPERVISOR} · Finance ${r.rejections.FINANCE} · Reconciliation ${r.rejections.RECON}`}><span>{rej}</span></Tooltip>
                        : 0}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {r.current_stage
                        ? `${r.current_stage_label} · ${fmtDays(r.days_in_current_stage)}d`
                        : 'Reconciled'}
                    </TableCell>
                  </TableRow>
                );
              })}
              {tableRows.length === 0 && (
                <TableRow><TableCell colSpan={20} align="center" sx={{ py: 4, color: 'text.secondary' }}>No requests match.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={tableRows.length} page={page} rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </Paper>
    </Box>
  );
};

export default RequestAgeingReport;
