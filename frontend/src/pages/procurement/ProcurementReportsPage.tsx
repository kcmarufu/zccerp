/**
 * Procurement Reports & Analytics
 *
 * Tabs: Overview · Pipeline · Departments & Partners · Vendors · Spend Analysis · Cycle Times
 *
 * Access mirrors the Financial Reports page exactly: the route carries the
 * `view_reports` permission, and the server decides how wide each reader's
 * figures are. Rather than guess at that here, the page reads the `scope` the
 * server returns and states it at the top — a Program Lead must not be shown a
 * department total under a heading that reads "organisation-wide".
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Chip, LinearProgress, Alert, CircularProgress, TextField, MenuItem,
  Tooltip, Stack, Button, InputAdornment
} from '@mui/material';
import {
  ShoppingCart as ProcurementIcon,
  Assessment as AssessmentIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Speed as SpeedIcon,
  Storefront as VendorIcon,
  Search as SearchIcon,
  GetApp as DownloadIcon,
  PictureAsPdf as PdfIcon,
  HourglassEmpty as PendingIcon,
  Gavel as CommitteeIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ComposedChart, Line
} from 'recharts';
import { format } from '../../utils/datetime';
import { downloadHTMLAsPDF } from '../../utils/pdfUtils';
import { getProcurementReports } from '../../services/procurementService';
import { PROC_STATUS_LABELS } from '../../services/procurementService';
import { toast } from 'react-toastify';

const COLORS = ['#1976d2', '#388e3c', '#f57c00', '#d32f2f', '#7b1fa2', '#0097a7', '#5d4037', '#455a64', '#c2185b', '#00796b'];

const num = (v: any) => parseFloat(v) || 0;
const int = (v: any) => parseInt(v) || 0;

const money = (amount: any) =>
  `$${num(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compact = (amount: any) => {
  const a = num(amount);
  if (a >= 1000000) return `$${(a / 1000000).toFixed(1)}M`;
  if (a >= 1000) return `$${(a / 1000).toFixed(1)}K`;
  return `$${a.toFixed(0)}`;
};

// `null` from an AVG over an empty set means "no request has completed this leg
// yet", which is not the same as zero days — show a dash so an empty stage is
// never read as an instantaneous one.
const days = (v: any) => (v === null || v === undefined || v === '' ? '—' : `${num(v).toFixed(1)} d`);

const statusLabel = (s: string) => (PROC_STATUS_LABELS as any)?.[s] || String(s || '').replace(/_/g, ' ');

interface TabPanelProps { children?: React.ReactNode; index: number; value: number; }
function TabPanel({ children, value, index }: TabPanelProps) {
  return <div role="tabpanel" hidden={value !== index}>{value === index && <Box sx={{ pt: 3 }}>{children}</Box>}</div>;
}

const StatCard: React.FC<{
  title: string; value: string; caption?: string; icon: React.ReactNode; color: string;
}> = ({ title, value, caption, icon, color }) => (
  <Card elevation={2} sx={{ height: '100%' }}>
    <CardContent>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom noWrap>{title}</Typography>
          <Typography variant="h5" fontWeight={700} sx={{ color }}>{value}</Typography>
          {caption && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
              {caption}
            </Typography>
          )}
        </Box>
        <Box sx={{ color, opacity: 0.35, ml: 1 }}>{icon}</Box>
      </Box>
    </CardContent>
  </Card>
);

const ProcurementReportsPage: React.FC = () => {
  const [tabIndex, setTabIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterDonorId, setFilterDonorId] = useState<number | ''>('');
  const [filterProjectId, setFilterProjectId] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDonors, setFilterDonors] = useState<any[]>([]);
  const [filterProjects, setFilterProjects] = useState<any[]>([]);

  const [searchVendor, setSearchVendor] = useState('');
  const [searchAgeing, setSearchAgeing] = useState('');
  const [vendorPage, setVendorPage] = useState(0);
  const [vendorRowsPerPage, setVendorRowsPerPage] = useState(10);
  const [ageingPage, setAgeingPage] = useState(0);
  const [ageingRowsPerPage, setAgeingRowsPerPage] = useState(10);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setIsLoading(true);
        const result = await getProcurementReports({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          donorId: filterDonorId ? Number(filterDonorId) : undefined,
          projectId: filterProjectId ? Number(filterProjectId) : undefined,
          status: filterStatus || undefined
        });
        setData(result);
        setVendorPage(0);
        setAgeingPage(0);
      } catch (error) {
        toast.error('Failed to load procurement reports');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReports();
  }, [dateFrom, dateTo, filterDonorId, filterProjectId, filterStatus]);

  useEffect(() => {
    import('../../services/donorService').then(m => {
      m.default.getActiveDonors().then(setFilterDonors).catch(() => {});
    });
  }, []);

  useEffect(() => {
    setFilterProjectId('');
    setFilterProjects([]);
    if (!filterDonorId) return;
    import('../../services/projectService').then(m => {
      m.default.getProjectsByDonor(Number(filterDonorId)).then(setFilterProjects).catch(() => {});
    });
  }, [filterDonorId]);

  const filteredVendors = useMemo(() => {
    const q = searchVendor.toLowerCase();
    return (data?.vendorSummary || []).filter((v: any) =>
      !q || v.vendor_name?.toLowerCase().includes(q) || v.vendor_code?.toLowerCase().includes(q));
  }, [data, searchVendor]);

  const filteredAgeing = useMemo(() => {
    const q = searchAgeing.toLowerCase();
    return (data?.ageingRequests || []).filter((r: any) =>
      !q || r.request_code?.toLowerCase().includes(q) || r.title?.toLowerCase().includes(q) ||
      r.requester_name?.toLowerCase().includes(q) || r.department_code?.toLowerCase().includes(q));
  }, [data, searchAgeing]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" flexDirection="column" gap={2}>
        <CircularProgress size={48} />
        <Typography variant="body2" color="text.secondary">Loading procurement reports...</Typography>
      </Box>
    );
  }

  if (!data) {
    return <Alert severity="error" sx={{ m: 3 }}>Failed to load procurement reports. Please try again.</Alert>;
  }

  const {
    scope, totals, statusSummary, departmentSummary, donorSummary, projectSummary,
    categorySummary, vendorSummary, competition, savings, monthlyTrend,
    cycleTimes, ageingRequests, rejectionSummary, highValueRequests
  } = data;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const statusChartData = (statusSummary || []).map((s: any) => ({
    name: statusLabel(s.status),
    value: int(s.request_count),
    amount: num(s.total_value)
  }));

  const deptChartData = (departmentSummary || []).map((d: any) => ({
    name: d.department_code,
    value: num(d.total_value),
    requests: int(d.request_count),
    rejectionRate: num(d.rejection_rate)
  }));

  const trendChartData = (monthlyTrend || []).map((m: any) => ({
    period: m.period,
    value: num(m.total_value),
    requests: int(m.request_count),
    completed: int(m.completed_count)
  }));

  const categoryChartData = (categorySummary || []).map((c: any) => ({
    name: c.category,
    value: num(c.total_value)
  }));

  const cycleChartData = [
    { stage: 'Submit → Dept', value: cycleTimes?.submit_to_dept === null ? 0 : num(cycleTimes?.submit_to_dept) },
    { stage: 'Dept → Finance', value: cycleTimes?.dept_to_finance === null ? 0 : num(cycleTimes?.dept_to_finance) },
    { stage: 'Sourcing → Cttee', value: cycleTimes?.sourcing_to_committee === null ? 0 : num(cycleTimes?.sourcing_to_committee) },
    { stage: 'Cttee → Final', value: cycleTimes?.committee_to_final === null ? 0 : num(cycleTimes?.committee_to_final) }
  ];

  const completionRate = int(totals?.total_requests) > 0
    ? (int(totals?.completed_count) / int(totals?.total_requests)) * 100
    : 0;
  const rejectionRate = int(totals?.total_requests) > 0
    ? (int(totals?.rejected_count) / int(totals?.total_requests)) * 100
    : 0;
  const threeQuoteRate = int(competition?.sourced_requests) > 0
    ? (int(competition?.with_three_or_more) / int(competition?.sourced_requests)) * 100
    : 0;

  // Savings are only meaningful where a quotation has actually been selected.
  const totalSavings = (savings || []).reduce((sum: number, s: any) => sum + num(s.variance), 0);

  // ── Export helpers ─────────────────────────────────────────────────────────
  const today = format(new Date(), 'yyyy-MM-dd');
  const ORG = 'ERP Connect — Zimbabwe Council of Churches';
  const periodLabel = dateFrom || dateTo
    ? `${dateFrom || 'start'} to ${dateTo || 'today'}`
    : 'All time';
  // Every export repeats the reader's scope: a department extract that circulates
  // without it reads as an organisation-wide total to whoever receives it.
  const scopeLabel = scope?.ownRequestsOnly
    ? 'Own requests only'
    : scope?.orgWide ? 'Organisation-wide' : 'Own department only';

  const buildPDFTable = (title: string, headers: string[], rows: any[][]) => {
    const headerRow = headers.map(h => `<th>${h}</th>`).join('');
    const bodyRows = rows.map(r => `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;margin:0;padding:20px;}
  .hdr{border-bottom:2px solid #1976d2;padding-bottom:8px;margin-bottom:14px;}
  .hdr h1{font-size:18px;color:#1976d2;margin:0 0 4px}
  .hdr p{margin:2px 0;font-size:11px;color:#555}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-top:10px}
  th{background:#1976d2;color:white;padding:7px 8px;text-align:left;font-weight:600}
  td{padding:5px 8px;border-bottom:1px solid #e0e0e0}
  tr:nth-child(even) td{background:#f7f7f7}
  .footer{margin-top:18px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:6px;display:flex;justify-content:space-between}
</style></head><body>
<div class="hdr">
  <h1>${title}</h1>
  <p>${ORG}</p>
  <p>Period: <strong>${periodLabel}</strong> &nbsp;|&nbsp; Scope: <strong>${scopeLabel}</strong></p>
</div>
<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>
<div class="footer"><span>Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</span><span>CONFIDENTIAL</span></div>
</body></html>`;
  };

  const exportSheet = (name: string, headers: string[], rows: any[][], file: string) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    XLSX.writeFile(wb, `${file}-${today}.xlsx`);
    toast.success(`${name} exported`);
  };

  const pipelineHeaders = ['Status', 'Requests', 'Total Value ($)', 'Avg Days in Stage'];
  const pipelineRows = (statusSummary || []).map((s: any) =>
    [statusLabel(s.status), int(s.request_count), num(s.total_value), num(s.avg_days_in_status).toFixed(1)]);

  const deptHeaders = ['Department', 'Name', 'Requests', 'Total Value ($)', 'Completed', 'Rejected', 'Rejection %', 'Avg Cycle (days)'];
  const deptRows = (departmentSummary || []).map((d: any) =>
    [d.department_code, d.department_name, int(d.request_count), num(d.total_value),
     int(d.completed_count), int(d.rejected_count), num(d.rejection_rate).toFixed(1),
     d.avg_cycle_days === null ? '—' : num(d.avg_cycle_days).toFixed(1)]);

  const vendorHeaders = ['Vendor', 'Code', 'Prequalified', 'Rating', 'Quotations', 'Won', 'Win Rate %', 'Awarded Value ($)', 'Avg Quote ($)'];
  const vendorRows = filteredVendors.map((v: any) =>
    [v.vendor_name, v.vendor_code || '—', v.is_prequalified ? 'Yes' : 'No', num(v.rating).toFixed(1),
     int(v.quotations_submitted), int(v.quotations_won), num(v.win_rate).toFixed(1),
     num(v.awarded_value), num(v.avg_quotation_value)]);

  const ageingHeaders = ['Request', 'Title', 'Status', 'Priority', 'Department', 'Partner', 'Requester', 'Value ($)', 'Days in Stage', 'Days Since Submission'];
  const ageingRows = filteredAgeing.map((r: any) =>
    [r.request_code, r.title, statusLabel(r.status), r.priority, r.department_code, r.donor_code || '—',
     r.requester_name, num(r.total_estimated_amount), int(r.days_in_current_stage), int(r.days_since_submission)]);

  const donorHeaders = ['Partner', 'Name', 'Currency', 'Requests', 'Total Value ($)', 'Completed', 'Rejected'];
  const donorRows = (donorSummary || []).map((d: any) =>
    [d.donor_code, d.donor_name, d.currency_code, int(d.request_count), num(d.total_value),
     int(d.completed_count), int(d.rejected_count)]);

  const savingsHeaders = ['Request', 'Title', 'Vendor', 'Estimated ($)', 'Awarded ($)', 'Variance ($)'];
  const savingsRows = (savings || []).map((s: any) =>
    [s.request_code, s.title, s.vendor_name, num(s.estimated), num(s.awarded), num(s.variance)]);

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={1}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Procurement Reports & Analytics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pipeline, spend, vendor performance and turnaround across the procurement lifecycle.
          </Typography>
        </Box>
      </Box>

      {/* The reader's scope, stated before any figure is read. */}
      <Alert
        severity={scope?.orgWide ? 'info' : 'warning'}
        icon={<AssessmentIcon fontSize="inherit" />}
        sx={{ mb: 2 }}
      >
        {scope?.ownRequestsOnly ? (
          <>These figures cover <strong>only the purchase requests you raised</strong>. Organisation-wide
          procurement reporting is available to Finance, Procurement and Administration.</>
        ) : scope?.orgWide ? (
          <>These figures cover <strong>all departments</strong>.</>
        ) : (
          <>These figures cover <strong>your department only</strong> — requests raised by it, or routed to
          it for approval. Organisation-wide totals are available to Finance, Procurement and Administration.</>
        )}
      </Alert>

      {/* Filters */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth size="small" type="date" label="From" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth size="small" type="date" label="To" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              select fullWidth size="small" label="Partner" value={filterDonorId}
              onChange={(e) => setFilterDonorId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <MenuItem value="">All partners</MenuItem>
              {filterDonors.map((d: any) => (
                <MenuItem key={d.id} value={d.id}>{d.donor_code} — {d.donor_name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              select fullWidth size="small" label="Project" value={filterProjectId}
              disabled={!filterDonorId}
              onChange={(e) => setFilterProjectId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <MenuItem value="">All projects</MenuItem>
              {filterProjects.map((p: any) => (
                <MenuItem key={p.id} value={p.id}>{p.project_code} — {p.project_name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select fullWidth size="small" label="Status" value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <MenuItem value="">All statuses</MenuItem>
              {Object.keys(PROC_STATUS_LABELS || {}).map((s) => (
                <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={1}>
            <Button
              fullWidth size="small" variant="outlined"
              onClick={() => {
                setDateFrom(''); setDateTo(''); setFilterDonorId('');
                setFilterProjectId(''); setFilterStatus('');
              }}
            >
              Reset
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Headline figures */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Requests" value={int(totals?.total_requests).toLocaleString()}
            caption={`${money(totals?.total_estimated)} estimated`}
            icon={<ProcurementIcon sx={{ fontSize: 44 }} />} color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="In the Pipeline" value={int(totals?.in_flight_count).toLocaleString()}
            caption={`${money(totals?.in_flight_value)} awaiting a decision`}
            icon={<PendingIcon sx={{ fontSize: 44 }} />} color="#f57c00"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Completed" value={int(totals?.completed_count).toLocaleString()}
            caption={`${completionRate.toFixed(1)}% of all requests · ${money(totals?.completed_value)}`}
            icon={<CheckCircleIcon sx={{ fontSize: 44 }} />} color="#388e3c"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Avg Turnaround"
            value={totals?.avg_cycle_days === null ? '—' : `${num(totals?.avg_cycle_days).toFixed(1)} d`}
            caption="Submission to completion"
            icon={<SpeedIcon sx={{ fontSize: 44 }} />} color="#7b1fa2"
          />
        </Grid>
      </Grid>

      <Paper elevation={2}>
        <Tabs
          value={tabIndex} onChange={(_, v) => setTabIndex(v)}
          variant="scrollable" scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab label="Overview" />
          <Tab label="Pipeline & Ageing" />
          <Tab label="Departments & Partners" />
          <Tab label="Vendors & Competition" />
          <Tab label="Spend Analysis" />
          <Tab label="Cycle Times" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          <TabPanel value={tabIndex} index={0}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Requests by Status</Typography>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie
                        data={statusChartData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={110} label={(e: any) => e.value}
                      >
                        {statusChartData.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(v: any, n: any, p: any) => [`${v} requests · ${money(p.payload.amount)}`, p.payload.name]}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Monthly Volume & Value</Typography>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={trendChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" />
                      <YAxis yAxisId="left" tickFormatter={compact} />
                      <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                      <RechartsTooltip
                        formatter={(v: any, n: any) => (n === 'Value' ? money(v) : v)}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="value" name="Value" fill="#1976d2" />
                      <Line yAxisId="right" dataKey="requests" name="Requests" stroke="#f57c00" strokeWidth={2} />
                      <Line yAxisId="right" dataKey="completed" name="Completed" stroke="#388e3c" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Rejection Rate" value={`${rejectionRate.toFixed(1)}%`}
                  caption={`${int(totals?.rejected_count)} rejected · ${money(totals?.rejected_value)}`}
                  icon={<WarningIcon sx={{ fontSize: 44 }} />} color="#d32f2f"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="3+ Quotations" value={`${threeQuoteRate.toFixed(1)}%`}
                  caption={`${int(competition?.with_three_or_more)} of ${int(competition?.sourced_requests)} sourced requests`}
                  icon={<CommitteeIcon sx={{ fontSize: 44 }} />}
                  color={threeQuoteRate >= 80 ? '#388e3c' : threeQuoteRate >= 50 ? '#f57c00' : '#d32f2f'}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Avg Quotations" value={num(competition?.avg_quotations_per_request).toFixed(2)}
                  caption={`${int(competition?.under_three)} request(s) under three`}
                  icon={<VendorIcon sx={{ fontSize: 44 }} />} color="#0097a7"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="High-Value Requests" value={int(highValueRequests?.length).toLocaleString()}
                  caption="$5,000+ — dual approval required"
                  icon={<AssessmentIcon sx={{ fontSize: 44 }} />} color="#7b1fa2"
                />
              </Grid>

              <Grid item xs={12}>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>High-Value Requests ($5,000+)</Typography>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Requests whose selected quotation — or estimate, where none is selected yet — crosses the
                    threshold for Super Admin and owning-department approval.
                  </Typography>
                  <TableContainer sx={{ maxHeight: 400 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Request</strong></TableCell>
                          <TableCell><strong>Title</strong></TableCell>
                          <TableCell><strong>Status</strong></TableCell>
                          <TableCell><strong>Dept</strong></TableCell>
                          <TableCell><strong>Partner</strong></TableCell>
                          <TableCell><strong>Vendor</strong></TableCell>
                          <TableCell align="right"><strong>Estimated</strong></TableCell>
                          <TableCell align="right"><strong>Selected Quote</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(highValueRequests || []).length === 0 ? (
                          <TableRow><TableCell colSpan={8} align="center">No high-value requests in this period</TableCell></TableRow>
                        ) : (highValueRequests || []).map((r: any) => (
                          <TableRow key={r.id} hover>
                            <TableCell>{r.request_code}</TableCell>
                            <TableCell sx={{ maxWidth: 260 }}>
                              <Tooltip title={r.title || ''}><span>{r.title}</span></Tooltip>
                            </TableCell>
                            <TableCell><Chip size="small" label={statusLabel(r.status)} /></TableCell>
                            <TableCell>{r.department_code}</TableCell>
                            <TableCell>{r.donor_code || '—'}</TableCell>
                            <TableCell>{r.vendor_name || '—'}</TableCell>
                            <TableCell align="right">{money(r.total_estimated_amount)}</TableCell>
                            <TableCell align="right">
                              {r.selected_quotation_amount ? money(r.selected_quotation_amount) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Grid>
            </Grid>
          </TabPanel>

          {/* ── PIPELINE & AGEING ────────────────────────────────────────── */}
          <TabPanel value={tabIndex} index={1}>
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
              <Typography variant="h6">Pipeline by Stage</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" startIcon={<DownloadIcon />}
                  onClick={() => exportSheet('Pipeline', pipelineHeaders, pipelineRows, 'procurement-pipeline')}>
                  Excel
                </Button>
                <Button size="small" startIcon={<PdfIcon />}
                  onClick={() => downloadHTMLAsPDF(buildPDFTable('Procurement Pipeline by Stage', pipelineHeaders, pipelineRows), `procurement-pipeline-${today}`)}>
                  PDF
                </Button>
              </Stack>
            </Box>

            <TableContainer component={Paper} elevation={1} sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell align="right"><strong>Requests</strong></TableCell>
                    <TableCell align="right"><strong>Total Value</strong></TableCell>
                    <TableCell align="right"><strong>Avg Days in Stage</strong></TableCell>
                    <TableCell><strong>Share of Value</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(statusSummary || []).map((s: any) => {
                    const share = num(totals?.total_estimated) > 0
                      ? (num(s.total_value) / num(totals.total_estimated)) * 100 : 0;
                    return (
                      <TableRow key={s.status} hover>
                        <TableCell><Chip size="small" label={statusLabel(s.status)} /></TableCell>
                        <TableCell align="right">{int(s.request_count)}</TableCell>
                        <TableCell align="right">{money(s.total_value)}</TableCell>
                        <TableCell align="right">{days(s.avg_days_in_status)}</TableCell>
                        <TableCell sx={{ minWidth: 160 }}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <LinearProgress variant="determinate" value={Math.min(share, 100)} sx={{ flexGrow: 1, height: 8, borderRadius: 4 }} />
                            <Typography variant="caption">{share.toFixed(1)}%</Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
              <Typography variant="h6">Ageing — Open Requests</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small" placeholder="Search requests..." value={searchAgeing}
                  onChange={(e) => { setSearchAgeing(e.target.value); setAgeingPage(0); }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                />
                <Button size="small" startIcon={<DownloadIcon />}
                  onClick={() => exportSheet('Ageing', ageingHeaders, ageingRows, 'procurement-ageing')}>
                  Excel
                </Button>
                <Button size="small" startIcon={<PdfIcon />}
                  onClick={() => downloadHTMLAsPDF(buildPDFTable('Procurement Ageing — Open Requests', ageingHeaders, ageingRows), `procurement-ageing-${today}`)}>
                  PDF
                </Button>
              </Stack>
            </Box>

            <TableContainer component={Paper} elevation={1}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Request</strong></TableCell>
                    <TableCell><strong>Title</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell><strong>Dept</strong></TableCell>
                    <TableCell><strong>Requester</strong></TableCell>
                    <TableCell align="right"><strong>Value</strong></TableCell>
                    <TableCell align="right"><strong>Days in Stage</strong></TableCell>
                    <TableCell align="right"><strong>Days Since Submission</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAgeing.length === 0 ? (
                    <TableRow><TableCell colSpan={8} align="center">No open requests</TableCell></TableRow>
                  ) : filteredAgeing
                    .slice(ageingPage * ageingRowsPerPage, ageingPage * ageingRowsPerPage + ageingRowsPerPage)
                    .map((r: any) => {
                      const stale = int(r.days_in_current_stage);
                      return (
                        <TableRow key={r.id} hover>
                          <TableCell>{r.request_code}</TableCell>
                          <TableCell sx={{ maxWidth: 240 }}>
                            <Tooltip title={r.title || ''}><span>{r.title}</span></Tooltip>
                          </TableCell>
                          <TableCell><Chip size="small" label={statusLabel(r.status)} /></TableCell>
                          <TableCell>{r.department_code}</TableCell>
                          <TableCell>{r.requester_name}</TableCell>
                          <TableCell align="right">{money(r.total_estimated_amount)}</TableCell>
                          <TableCell align="right">
                            <Chip
                              size="small" label={stale}
                              color={stale >= 30 ? 'error' : stale >= 14 ? 'warning' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">{int(r.days_since_submission)}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
              <TablePagination
                component="div" count={filteredAgeing.length} page={ageingPage}
                onPageChange={(_, p) => setAgeingPage(p)}
                rowsPerPage={ageingRowsPerPage}
                onRowsPerPageChange={(e) => { setAgeingRowsPerPage(parseInt(e.target.value, 10)); setAgeingPage(0); }}
                rowsPerPageOptions={[10, 25, 50]}
              />
            </TableContainer>
          </TabPanel>

          {/* ── DEPARTMENTS & PARTNERS ───────────────────────────────────── */}
          <TabPanel value={tabIndex} index={2}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Value by Department</Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={deptChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={compact} />
                      <RechartsTooltip formatter={(v: any) => money(v)} />
                      <Bar dataKey="value" name="Total Value" fill="#1976d2" />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Value by Partner</Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={(donorSummary || []).slice(0, 12).map((d: any) => ({
                      name: d.donor_code, value: num(d.total_value)
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={compact} />
                      <RechartsTooltip formatter={(v: any) => money(v)} />
                      <Bar dataKey="value" name="Total Value" fill="#388e3c" />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="h6">Department Analysis</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" startIcon={<DownloadIcon />}
                      onClick={() => exportSheet('Departments', deptHeaders, deptRows, 'procurement-departments')}>
                      Excel
                    </Button>
                    <Button size="small" startIcon={<PdfIcon />}
                      onClick={() => downloadHTMLAsPDF(buildPDFTable('Procurement by Department', deptHeaders, deptRows), `procurement-departments-${today}`)}>
                      PDF
                    </Button>
                  </Stack>
                </Box>
                <TableContainer component={Paper} elevation={1}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Department</strong></TableCell>
                        <TableCell align="right"><strong>Requests</strong></TableCell>
                        <TableCell align="right"><strong>Total Value</strong></TableCell>
                        <TableCell align="right"><strong>Completed</strong></TableCell>
                        <TableCell align="right"><strong>Rejected</strong></TableCell>
                        <TableCell align="right"><strong>Rejection Rate</strong></TableCell>
                        <TableCell align="right"><strong>Avg Cycle</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(departmentSummary || []).map((d: any) => (
                        <TableRow key={d.department_id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{d.department_code}</Typography>
                            <Typography variant="caption" color="text.secondary">{d.department_name}</Typography>
                          </TableCell>
                          <TableCell align="right">{int(d.request_count)}</TableCell>
                          <TableCell align="right">{money(d.total_value)}</TableCell>
                          <TableCell align="right">{int(d.completed_count)}</TableCell>
                          <TableCell align="right">{int(d.rejected_count)}</TableCell>
                          <TableCell align="right">
                            <Chip
                              size="small" label={`${num(d.rejection_rate).toFixed(1)}%`}
                              color={num(d.rejection_rate) >= 30 ? 'error' : num(d.rejection_rate) >= 15 ? 'warning' : 'success'}
                            />
                          </TableCell>
                          <TableCell align="right">{days(d.avg_cycle_days)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>

              <Grid item xs={12}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="h6">Partner Analysis</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" startIcon={<DownloadIcon />}
                      onClick={() => exportSheet('Partners', donorHeaders, donorRows, 'procurement-partners')}>
                      Excel
                    </Button>
                    <Button size="small" startIcon={<PdfIcon />}
                      onClick={() => downloadHTMLAsPDF(buildPDFTable('Procurement by Partner', donorHeaders, donorRows), `procurement-partners-${today}`)}>
                      PDF
                    </Button>
                  </Stack>
                </Box>
                <TableContainer component={Paper} elevation={1} sx={{ maxHeight: 420 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Partner</strong></TableCell>
                        <TableCell align="right"><strong>Requests</strong></TableCell>
                        <TableCell align="right"><strong>Total Value</strong></TableCell>
                        <TableCell align="right"><strong>Completed</strong></TableCell>
                        <TableCell align="right"><strong>Rejected</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(donorSummary || []).map((d: any) => (
                        <TableRow key={d.donor_id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{d.donor_code}</Typography>
                            <Typography variant="caption" color="text.secondary">{d.donor_name}</Typography>
                          </TableCell>
                          <TableCell align="right">{int(d.request_count)}</TableCell>
                          <TableCell align="right">{money(d.total_value)}</TableCell>
                          <TableCell align="right">{int(d.completed_count)}</TableCell>
                          <TableCell align="right">{int(d.rejected_count)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>Top Projects by Procurement Value</Typography>
                <TableContainer component={Paper} elevation={1} sx={{ maxHeight: 420 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Project</strong></TableCell>
                        <TableCell><strong>Partner</strong></TableCell>
                        <TableCell align="right"><strong>Requests</strong></TableCell>
                        <TableCell align="right"><strong>Total Value</strong></TableCell>
                        <TableCell align="right"><strong>Completed</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(projectSummary || []).map((p: any) => (
                        <TableRow key={p.project_id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{p.project_code}</Typography>
                            <Typography variant="caption" color="text.secondary">{p.project_name}</Typography>
                          </TableCell>
                          <TableCell>{p.donor_code || '—'}</TableCell>
                          <TableCell align="right">{int(p.request_count)}</TableCell>
                          <TableCell align="right">{money(p.total_value)}</TableCell>
                          <TableCell align="right">{int(p.completed_count)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>

          {/* ── VENDORS & COMPETITION ────────────────────────────────────── */}
          <TabPanel value={tabIndex} index={3}>
            <Grid container spacing={2} mb={3}>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Sourced Requests" value={int(competition?.sourced_requests).toLocaleString()}
                  caption="Reached the quotation stage"
                  icon={<VendorIcon sx={{ fontSize: 44 }} />} color="#1976d2"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="With 3+ Quotations" value={int(competition?.with_three_or_more).toLocaleString()}
                  caption={`${threeQuoteRate.toFixed(1)}% of sourced requests`}
                  icon={<CheckCircleIcon sx={{ fontSize: 44 }} />}
                  color={threeQuoteRate >= 80 ? '#388e3c' : '#f57c00'}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="Under Three Quotations" value={int(competition?.under_three).toLocaleString()}
                  caption="Below the competitive-sourcing threshold"
                  icon={<WarningIcon sx={{ fontSize: 44 }} />}
                  color={int(competition?.under_three) > 0 ? '#d32f2f' : '#388e3c'}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  title="No Quotations" value={int(competition?.with_none).toLocaleString()}
                  caption="Sourced requests with nothing on file"
                  icon={<WarningIcon sx={{ fontSize: 44 }} />}
                  color={int(competition?.with_none) > 0 ? '#d32f2f' : '#388e3c'}
                />
              </Grid>
            </Grid>

            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
              <Typography variant="h6">Vendor Performance</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small" placeholder="Search vendors..." value={searchVendor}
                  onChange={(e) => { setSearchVendor(e.target.value); setVendorPage(0); }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                />
                <Button size="small" startIcon={<DownloadIcon />}
                  onClick={() => exportSheet('Vendors', vendorHeaders, vendorRows, 'procurement-vendors')}>
                  Excel
                </Button>
                <Button size="small" startIcon={<PdfIcon />}
                  onClick={() => downloadHTMLAsPDF(buildPDFTable('Vendor Performance', vendorHeaders, vendorRows), `procurement-vendors-${today}`)}>
                  PDF
                </Button>
              </Stack>
            </Box>

            <TableContainer component={Paper} elevation={1}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Vendor</strong></TableCell>
                    <TableCell><strong>Prequalified</strong></TableCell>
                    <TableCell align="right"><strong>Quotations</strong></TableCell>
                    <TableCell align="right"><strong>Won</strong></TableCell>
                    <TableCell align="right"><strong>Win Rate</strong></TableCell>
                    <TableCell align="right"><strong>Awarded Value</strong></TableCell>
                    <TableCell align="right"><strong>Avg Quote</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredVendors.length === 0 ? (
                    <TableRow><TableCell colSpan={7} align="center">No vendor quotations in this period</TableCell></TableRow>
                  ) : filteredVendors
                    .slice(vendorPage * vendorRowsPerPage, vendorPage * vendorRowsPerPage + vendorRowsPerPage)
                    .map((v: any, i: number) => (
                      <TableRow key={`${v.vendor_name}-${i}`} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{v.vendor_name}</Typography>
                          {v.vendor_code && (
                            <Typography variant="caption" color="text.secondary">{v.vendor_code}</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {v.vendor_code
                            ? <Chip size="small" label={v.is_prequalified ? 'Yes' : 'No'} color={v.is_prequalified ? 'success' : 'default'} />
                            : <Tooltip title="Quoted without a record in the vendor database"><Chip size="small" label="Unregistered" color="warning" /></Tooltip>}
                        </TableCell>
                        <TableCell align="right">{int(v.quotations_submitted)}</TableCell>
                        <TableCell align="right">{int(v.quotations_won)}</TableCell>
                        <TableCell align="right">
                          <Box display="flex" alignItems="center" gap={1} justifyContent="flex-end">
                            <LinearProgress
                              variant="determinate" value={Math.min(num(v.win_rate), 100)}
                              sx={{ width: 60, height: 6, borderRadius: 3 }}
                            />
                            <Typography variant="caption">{num(v.win_rate).toFixed(0)}%</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">{money(v.awarded_value)}</TableCell>
                        <TableCell align="right">{money(v.avg_quotation_value)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              <TablePagination
                component="div" count={filteredVendors.length} page={vendorPage}
                onPageChange={(_, p) => setVendorPage(p)}
                rowsPerPage={vendorRowsPerPage}
                onRowsPerPageChange={(e) => { setVendorRowsPerPage(parseInt(e.target.value, 10)); setVendorPage(0); }}
                rowsPerPageOptions={[10, 25, 50]}
              />
            </TableContainer>
          </TabPanel>

          {/* ── SPEND ANALYSIS ───────────────────────────────────────────── */}
          <TabPanel value={tabIndex} index={4}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Spend by Budget Category</Typography>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie
                        data={categoryChartData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={110}
                      >
                        {categoryChartData.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(v: any) => money(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Category Detail</Typography>
                  <TableContainer sx={{ maxHeight: 320 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Category</strong></TableCell>
                          <TableCell align="right"><strong>Requests</strong></TableCell>
                          <TableCell align="right"><strong>Items</strong></TableCell>
                          <TableCell align="right"><strong>Value</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(categorySummary || []).map((c: any) => (
                          <TableRow key={c.category} hover>
                            <TableCell>{c.category}</TableCell>
                            <TableCell align="right">{int(c.request_count)}</TableCell>
                            <TableCell align="right">{int(c.item_count)}</TableCell>
                            <TableCell align="right">{money(c.total_value)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={1}>
                  <Box>
                    <Typography variant="h6">Estimate vs. Awarded</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Requests with a selected quotation, largest gap first. A positive variance means the
                      selected quotation came in under the requester's estimate.
                      {' '}Net across the requests listed: <strong>{money(totalSavings)}</strong>.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" startIcon={<DownloadIcon />}
                      onClick={() => exportSheet('Estimate vs Awarded', savingsHeaders, savingsRows, 'procurement-savings')}>
                      Excel
                    </Button>
                    <Button size="small" startIcon={<PdfIcon />}
                      onClick={() => downloadHTMLAsPDF(buildPDFTable('Estimate vs. Awarded', savingsHeaders, savingsRows), `procurement-savings-${today}`)}>
                      PDF
                    </Button>
                  </Stack>
                </Box>
                <TableContainer component={Paper} elevation={1} sx={{ maxHeight: 460 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Request</strong></TableCell>
                        <TableCell><strong>Title</strong></TableCell>
                        <TableCell><strong>Vendor</strong></TableCell>
                        <TableCell align="right"><strong>Estimated</strong></TableCell>
                        <TableCell align="right"><strong>Awarded</strong></TableCell>
                        <TableCell align="right"><strong>Variance</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(savings || []).length === 0 ? (
                        <TableRow><TableCell colSpan={6} align="center">No selected quotations in this period</TableCell></TableRow>
                      ) : (savings || []).map((s: any) => (
                        <TableRow key={s.id} hover>
                          <TableCell>{s.request_code}</TableCell>
                          <TableCell sx={{ maxWidth: 240 }}>
                            <Tooltip title={s.title || ''}><span>{s.title}</span></Tooltip>
                          </TableCell>
                          <TableCell>{s.vendor_name}</TableCell>
                          <TableCell align="right">{money(s.estimated)}</TableCell>
                          <TableCell align="right">{money(s.awarded)}</TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2" fontWeight={600}
                              color={num(s.variance) >= 0 ? 'success.main' : 'error.main'}
                            >
                              {num(s.variance) >= 0 ? '+' : ''}{money(s.variance)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>Rejections</Typography>
                <TableContainer component={Paper} elevation={1}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Rejected By</strong></TableCell>
                        <TableCell><strong>At Stage</strong></TableCell>
                        <TableCell align="right"><strong>Count</strong></TableCell>
                        <TableCell align="right"><strong>Value</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(rejectionSummary || []).length === 0 ? (
                        <TableRow><TableCell colSpan={4} align="center">No rejections in this period</TableCell></TableRow>
                      ) : (rejectionSummary || []).map((r: any, i: number) => (
                        <TableRow key={i} hover>
                          <TableCell>{String(r.rejected_by_role || '').replace(/_/g, ' ')}</TableCell>
                          <TableCell>{statusLabel(r.rejected_at_stage)}</TableCell>
                          <TableCell align="right">{int(r.rejection_count)}</TableCell>
                          <TableCell align="right">{money(r.total_value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>

          {/* ── CYCLE TIMES ──────────────────────────────────────────────── */}
          <TabPanel value={tabIndex} index={5}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={7}>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Average Days per Stage</Typography>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Measured only on requests that have passed each stage, so a stage nothing has cleared
                    yet is left out rather than counted as instantaneous.
                  </Typography>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={cycleChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="stage" width={140} />
                      <RechartsTooltip formatter={(v: any) => `${num(v).toFixed(1)} days`} />
                      <Bar dataKey="value" name="Days" fill="#7b1fa2" />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              <Grid item xs={12} md={5}>
                <Paper elevation={1} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Turnaround Summary</Typography>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell>Submission → Department approval</TableCell>
                        <TableCell align="right"><strong>{days(cycleTimes?.submit_to_dept)}</strong></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Department → Finance approval</TableCell>
                        <TableCell align="right"><strong>{days(cycleTimes?.dept_to_finance)}</strong></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Sourcing → Committee review</TableCell>
                        <TableCell align="right"><strong>{days(cycleTimes?.sourcing_to_committee)}</strong></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Committee → Final Finance</TableCell>
                        <TableCell align="right"><strong>{days(cycleTimes?.committee_to_final)}</strong></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell><strong>End to end</strong></TableCell>
                        <TableCell align="right"><strong>{days(cycleTimes?.end_to_end)}</strong></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>Turnaround by Department</Typography>
                <TableContainer component={Paper} elevation={1}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Department</strong></TableCell>
                        <TableCell align="right"><strong>Completed Requests</strong></TableCell>
                        <TableCell align="right"><strong>Avg Cycle</strong></TableCell>
                        <TableCell align="right"><strong>Rejection Rate</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(departmentSummary || []).map((d: any) => (
                        <TableRow key={d.department_id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{d.department_code}</Typography>
                            <Typography variant="caption" color="text.secondary">{d.department_name}</Typography>
                          </TableCell>
                          <TableCell align="right">{int(d.completed_count)}</TableCell>
                          <TableCell align="right">{days(d.avg_cycle_days)}</TableCell>
                          <TableCell align="right">{num(d.rejection_rate).toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </TabPanel>
        </Box>
      </Paper>
    </Box>
  );
};

export default ProcurementReportsPage;
