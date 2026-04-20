/**
 * Financial Reports Page
 * Tabs: Overview, Budget Variance, Donor Summary, Department Analysis, Spending Trends
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, Card, CardContent, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, LinearProgress, Alert, CircularProgress, TextField, MenuItem,
  Divider, Tooltip, Avatar, Stack
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  Assessment as AssessmentIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  PieChart as PieChartIcon,
  AttachMoney as MoneyIcon,
  Savings as SavingsIcon,
  Speed as SpeedIcon,
  SwapHoriz as SwapIcon,
  ReceiptLong as ReceiptIcon
} from '@mui/icons-material';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line,
  AreaChart, Area, ComposedChart
} from 'recharts';
import { budgetService } from '../services/budgetService';
import { toast } from 'react-toastify';

const COLORS = ['#1976d2', '#388e3c', '#f57c00', '#d32f2f', '#7b1fa2', '#0097a7', '#5d4037', '#455a64', '#c2185b', '#00796b'];
const VARIANCE_COLORS: Record<string, string> = {
  ON_TRACK: '#388e3c',
  WARNING: '#f57c00',
  CRITICAL: '#e64a19',
  OVER_BUDGET: '#c62828'
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const formatCurrency = (amount: number, symbol = '$') =>
  `${symbol}${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatCompact = (amount: number) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
};

const FinancialReportsPage: React.FC = () => {
  const [tabIndex, setTabIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchReports();
  }, [fiscalYear]);

  const fetchReports = async () => {
    try {
      setIsLoading(true);
      const response = await budgetService.getReports(fiscalYear);
      if (response.success) {
        setData(response.data);
      }
    } catch (error: any) {
      toast.error('Failed to load financial reports');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh" flexDirection="column" gap={2}>
        <CircularProgress size={48} />
        <Typography variant="body2" color="text.secondary">Loading financial reports...</Typography>
      </Box>
    );
  }

  if (!data) {
    return <Alert severity="error" sx={{ m: 3 }}>Failed to load reports data. Please try again.</Alert>;
  }

  const { totals, variance, donorSummary, departmentSummary, categorySummary, requestSummary, spendingTrend, reconciliationSummary } = data;

  // Prepare chart data
  const categoryChartData = categorySummary?.map((c: any) => ({
    name: c.category,
    allocated: parseFloat(c.total_allocated) || 0,
    spent: parseFloat(c.total_spent) || 0
  })) || [];

  const donorChartData = donorSummary?.map((d: any) => ({
    name: d.donor_code || d.donor_name,
    value: parseFloat(d.total_allocated) || 0,
    spent: parseFloat(d.total_spent) || 0
  })) || [];

  const donorBarData = donorSummary?.map((d: any) => ({
    name: d.donor_code || d.donor_name,
    committed: parseFloat(d.total_committed) || 0,
    allocated: parseFloat(d.total_allocated) || 0,
    spent: parseFloat(d.total_spent) || 0,
    unallocated: parseFloat(d.unallocated) || 0
  })) || [];

  const requestStatusData = requestSummary?.map((r: any) => ({
    name: r.status.replace(/_/g, ' '),
    value: parseInt(r.count) || 0,
    amount: parseFloat(r.total_amount) || 0
  })) || [];

  const trendData = spendingTrend?.map((m: any) => ({
    ...m,
    total_spent: parseFloat(m.total_spent) || 0,
    total_allocated: parseFloat(m.total_allocated) || 0,
    total_topup: parseFloat(m.total_topup) || 0,
    total_reversals: parseFloat(m.total_reversals) || 0,
    net_flow: (parseFloat(m.total_allocated) || 0) + (parseFloat(m.total_topup) || 0) - (parseFloat(m.total_spent) || 0)
  })) || [];

  const utilization = Number(totals?.overall_utilization || 0);
  const totalReqs = requestSummary?.reduce((sum: number, r: any) => sum + parseInt(r.count || 0), 0) || 0;
  const totalReqAmount = requestSummary?.reduce((sum: number, r: any) => sum + parseFloat(r.total_amount || 0), 0) || 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ letterSpacing: -0.5 }}>Financial Reports & Analytics</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            FY {fiscalYear} — Budget variance, donor summaries, department analysis, and spending trends
          </Typography>
        </Box>
        <TextField
          select
          label="Fiscal Year"
          value={fiscalYear}
          onChange={(e) => setFiscalYear(parseInt(e.target.value))}
          size="small"
          sx={{ width: 140 }}
        >
          {[2023, 2024, 2025, 2026, 2027].map(y => (
            <MenuItem key={y} value={y}>{y}</MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)', color: 'white', borderRadius: 2 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.85 }}>Total Allocated</Typography>
                  <Typography variant="h5" fontWeight={700}>{formatCurrency(totals?.grand_total_allocated)}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>{totals?.total_budget_lines || 0} active budget lines</Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 44, height: 44 }}>
                  <MoneyIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #d32f2f 0%, #c62828 100%)', color: 'white', borderRadius: 2 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.85 }}>Total Spent</Typography>
                  <Typography variant="h5" fontWeight={700}>{formatCurrency(totals?.grand_total_spent)}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>{utilization.toFixed(1)}% of budget used</Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 44, height: 44 }}>
                  <TrendingDownIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #388e3c 0%, #2e7d32 100%)', color: 'white', borderRadius: 2 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.85 }}>Remaining Balance</Typography>
                  <Typography variant="h5" fontWeight={700}>{formatCurrency(totals?.grand_total_remaining)}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>{(100 - utilization).toFixed(1)}% available</Typography>
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 44, height: 44 }}>
                  <SavingsIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${utilization > 85 ? '#e65100' : '#f57c00'} 0%, ${utilization > 85 ? '#bf360c' : '#e65100'} 100%)`, color: 'white', borderRadius: 2 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.85 }}>Overall Utilization</Typography>
                  <Typography variant="h5" fontWeight={700}>{utilization.toFixed(1)}%</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(utilization, 100)}
                    sx={{
                      mt: 1, height: 6, borderRadius: 3,
                      backgroundColor: 'rgba(255,255,255,0.3)',
                      '& .MuiLinearProgress-bar': { backgroundColor: 'white' }
                    }}
                  />
                </Box>
                <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 44, height: 44 }}>
                  <SpeedIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Request & Reconciliation Quick Stats */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6}>
          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <ReceiptIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2" fontWeight={600}>Request Summary</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {requestStatusData.map((r: any, i: number) => (
                <Chip
                  key={i}
                  label={`${r.name}: ${r.value}`}
                  size="small"
                  sx={{ bgcolor: COLORS[i % COLORS.length] + '20', color: COLORS[i % COLORS.length], fontWeight: 600 }}
                />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {totalReqs} total requests — {formatCurrency(totalReqAmount)} total value
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <SwapIcon color="secondary" fontSize="small" />
              <Typography variant="subtitle2" fontWeight={600}>Reconciliation Summary</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {(reconciliationSummary || []).map((r: any, i: number) => (
                <Chip
                  key={i}
                  label={`${r.status.replace(/_/g, ' ')}: ${r.count}`}
                  size="small"
                  sx={{ bgcolor: COLORS[(i + 3) % COLORS.length] + '20', color: COLORS[(i + 3) % COLORS.length], fontWeight: 600 }}
                />
              ))}
              {(!reconciliationSummary || reconciliationSummary.length === 0) && (
                <Typography variant="caption" color="text.secondary">No reconciliation data yet</Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
        <Tabs
          value={tabIndex}
          onChange={(_, v) => setTabIndex(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            px: 2,
            bgcolor: '#fafafa',
            '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', minHeight: 56 }
          }}
        >
          <Tab icon={<AssessmentIcon />} iconPosition="start" label="Budget Variance" />
          <Tab icon={<AccountBalanceIcon />} iconPosition="start" label="Donor Summary" />
          <Tab icon={<PieChartIcon />} iconPosition="start" label="Department Analysis" />
          <Tab icon={<TrendingUpIcon />} iconPosition="start" label="Spending Trends" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* TAB 0: Budget Variance */}
          <TabPanel value={tabIndex} index={0}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="h6" fontWeight={700}>Budget Variance Analysis</Typography>
                <Typography variant="body2" color="text.secondary">
                  Allocated vs spent for each budget line — highlighting over-budget and at-risk items
                </Typography>
              </Box>
            </Box>

            {variance?.length > 0 ? (
              <>
                {/* Variance Summary Cards */}
                <Grid container spacing={2} mb={3}>
                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#388e3c' }}>
                      <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                        <CheckCircleIcon sx={{ color: '#388e3c', fontSize: 28 }} />
                        <Typography variant="h4" fontWeight={700} color="success.main">
                          {variance.filter((v: any) => v.variance_status === 'ON_TRACK').length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">On Track</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#f57c00' }}>
                      <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                        <WarningIcon sx={{ color: '#f57c00', fontSize: 28 }} />
                        <Typography variant="h4" fontWeight={700} color="warning.main">
                          {variance.filter((v: any) => v.variance_status === 'WARNING').length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Warning (&gt;75%)</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#e64a19' }}>
                      <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                        <WarningIcon sx={{ color: '#e64a19', fontSize: 28 }} />
                        <Typography variant="h4" fontWeight={700} sx={{ color: '#e64a19' }}>
                          {variance.filter((v: any) => v.variance_status === 'CRITICAL').length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Critical (&gt;90%)</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#c62828' }}>
                      <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                        <TrendingDownIcon sx={{ color: '#c62828', fontSize: 28 }} />
                        <Typography variant="h4" fontWeight={700} color="error.main">
                          {variance.filter((v: any) => v.variance_status === 'OVER_BUDGET').length}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Over Budget</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                {/* Variance Bar Chart */}
                <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Budget Utilization Overview</Typography>
                  <ResponsiveContainer width="100%" height={Math.max(250, variance.length * 32)}>
                    <BarChart data={variance.slice(0, 15)} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => formatCompact(v)} />
                      <YAxis type="category" dataKey="budget_code" width={100} tick={{ fontSize: 11 }} />
                      <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="allocated_amount" fill="#1976d2" name="Allocated" radius={[0, 2, 2, 0]} />
                      <Bar dataKey="spent_amount" fill="#d32f2f" name="Spent" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>

                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell sx={{ fontWeight: 700 }}>Budget Line</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Donor</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Allocated</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Spent</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Variance</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Utilization</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {variance.map((row: any) => (
                        <TableRow key={row.id} hover sx={{
                          backgroundColor: row.variance_status === 'OVER_BUDGET' ? '#ffebee' :
                            row.variance_status === 'CRITICAL' ? '#fff3e0' : 'inherit'
                        }}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{row.budget_code}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.budget_name}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip label={row.donor_code || 'N/A'} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>{row.department_code || 'N/A'}</TableCell>
                          <TableCell>{row.category || '-'}</TableCell>
                          <TableCell align="right">{formatCurrency(row.allocated_amount)}</TableCell>
                          <TableCell align="right">{formatCurrency(row.spent_amount)}</TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              fontWeight="bold"
                              color={row.variance_amount < 0 ? 'error.main' : 'success.main'}
                            >
                              {row.variance_amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(row.variance_amount))}
                            </Typography>
                          </TableCell>
                          <TableCell align="center" sx={{ width: 120 }}>
                            <Box display="flex" alignItems="center" gap={1}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(row.utilization_pct || 0, 100)}
                                sx={{
                                  flex: 1, height: 8, borderRadius: 4,
                                  '& .MuiLinearProgress-bar': {
                                    backgroundColor: VARIANCE_COLORS[row.variance_status]
                                  }
                                }}
                              />
                              <Typography variant="caption" fontWeight="bold">
                                {Number(row.utilization_pct || 0).toFixed(0)}%
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={row.variance_status.replace('_', ' ')}
                              size="small"
                              sx={{
                                backgroundColor: VARIANCE_COLORS[row.variance_status],
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: '0.7rem'
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 2 }}>No budget variance data available for FY{fiscalYear}. Create budget lines to see variance analysis.</Alert>
            )}
          </TabPanel>

          {/* TAB 1: Donor Summary */}
          <TabPanel value={tabIndex} index={1}>
            <Box mb={2}>
              <Typography variant="h6" fontWeight={700}>Donor Financial Summary</Typography>
              <Typography variant="body2" color="text.secondary">
                Committed vs allocated vs spent per donor, with unallocated funds highlighted
              </Typography>
            </Box>

            {donorSummary?.length > 0 ? (
            <Grid container spacing={3}>
              {/* Donor Comparison Chart */}
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Donor Fund Comparison</Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={donorBarData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => formatCompact(v)} />
                      <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="committed" fill="#7b1fa2" name="Committed" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="allocated" fill="#1976d2" name="Allocated" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="spent" fill="#d32f2f" name="Spent" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              <Grid item xs={12} md={7}>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell sx={{ fontWeight: 700 }}>Donor</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Committed</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Allocated</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Spent</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Remaining</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Unallocated</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Utilization</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {donorSummary?.map((donor: any) => (
                        <TableRow key={donor.donor_id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{donor.donor_name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {donor.donor_code} | {donor.currency_code} | {donor.budget_line_count} lines
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{formatCurrency(donor.total_committed)}</TableCell>
                          <TableCell align="right">{formatCurrency(donor.total_allocated)}</TableCell>
                          <TableCell align="right" sx={{ color: 'error.main' }}>{formatCurrency(donor.total_spent)}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(donor.total_remaining)}</TableCell>
                          <TableCell align="right">
                            <Tooltip title="Committed minus Allocated — funds not yet assigned to budget lines">
                              <Typography
                                variant="body2"
                                fontWeight="bold"
                                color={donor.unallocated > 0 ? 'info.main' : 'text.secondary'}
                              >
                                {formatCurrency(donor.unallocated)}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell align="center">
                            <Box display="flex" alignItems="center" gap={1}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(donor.avg_utilization || 0, 100)}
                                sx={{ flex: 1, height: 6, borderRadius: 3 }}
                                color={donor.avg_utilization > 90 ? 'error' : donor.avg_utilization > 75 ? 'warning' : 'primary'}
                              />
                              <Typography variant="caption">{Number(donor.avg_utilization || 0).toFixed(0)}%</Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>

              <Grid item xs={12} md={5}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} align="center" gutterBottom>Allocation by Donor</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={donorChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {donorChartData.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                </Paper>
              </Grid>
            </Grid>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 2 }}>No donors registered yet. Add donors to see financial summaries here.</Alert>
            )}
          </TabPanel>

          {/* TAB 2: Department Analysis */}
          <TabPanel value={tabIndex} index={2}>
            <Box mb={2}>
              <Typography variant="h6" fontWeight={700}>Department Budget Analysis</Typography>
              <Typography variant="body2" color="text.secondary">
                Budget allocation and spending breakdown by department and category
              </Typography>
            </Box>

            {departmentSummary?.length > 0 ? (
            <Grid container spacing={3}>
              <Grid item xs={12} md={7}>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Lines</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Allocated</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Spent</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Remaining</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Utilization</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {departmentSummary?.map((dept: any) => (
                        <TableRow key={dept.department_id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{dept.department_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{dept.department_code}</Typography>
                          </TableCell>
                          <TableCell align="center">{dept.budget_line_count}</TableCell>
                          <TableCell align="right">{formatCurrency(dept.total_allocated)}</TableCell>
                          <TableCell align="right" sx={{ color: 'error.main' }}>{formatCurrency(dept.total_spent)}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(dept.total_remaining)}</TableCell>
                          <TableCell align="center" sx={{ width: 130 }}>
                            <Box display="flex" alignItems="center" gap={1}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(dept.avg_utilization || 0, 100)}
                                sx={{ flex: 1, height: 8, borderRadius: 4 }}
                                color={dept.avg_utilization > 90 ? 'error' : dept.avg_utilization > 75 ? 'warning' : 'primary'}
                              />
                              <Typography variant="caption" fontWeight="bold">
                                {Number(dept.avg_utilization || 0).toFixed(0)}%
                              </Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Divider sx={{ my: 3 }} />

                {/* Category breakdown */}
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>Spending by Category</Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Lines</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Allocated</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Spent</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Utilization</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {categorySummary?.map((cat: any, i: number) => (
                        <TableRow key={i} hover>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: COLORS[i % COLORS.length] }} />
                              {cat.category}
                            </Box>
                          </TableCell>
                          <TableCell align="center">{cat.budget_line_count}</TableCell>
                          <TableCell align="right">{formatCurrency(cat.total_allocated)}</TableCell>
                          <TableCell align="right">{formatCurrency(cat.total_spent)}</TableCell>
                          <TableCell align="center">{Number(cat.avg_utilization || 0).toFixed(0)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>

              <Grid item xs={12} md={5}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} align="center" gutterBottom>Allocated vs Spent by Category</Typography>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={categoryChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                    <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="allocated" fill="#1976d2" name="Allocated" radius={[0, 2, 2, 0]} />
                    <Bar dataKey="spent" fill="#d32f2f" name="Spent" radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} align="center" gutterBottom>Request Status Distribution</Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={requestStatusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {requestStatusData.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                </Paper>
              </Grid>
            </Grid>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 2 }}>No department data available. Create budget lines with departments to see analysis.</Alert>
            )}
          </TabPanel>

          {/* TAB 3: Spending Trends */}
          <TabPanel value={tabIndex} index={3}>
            <Box mb={2}>
              <Typography variant="h6" fontWeight={700}>Spending Trends (Last 12 Months)</Typography>
              <Typography variant="body2" color="text.secondary">
                Monthly breakdown of allocations, spending, top-ups, and reversals
              </Typography>
            </Box>

            {trendData?.length > 0 ? (
              <>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 3 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Monthly Cash Flow</Typography>
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => formatCompact(v)} />
                      <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Area type="monotone" dataKey="total_allocated" fill="#1976d220" stroke="#1976d2" strokeWidth={2} name="Allocated" />
                      <Bar dataKey="total_spent" fill="#d32f2f" name="Spent" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total_topup" fill="#388e3c" name="Top-ups" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total_reversals" fill="#f57c00" name="Reversals" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="net_flow" stroke="#7b1fa2" strokeWidth={2} name="Net Flow" dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Paper>

                <Typography variant="subtitle1" fontWeight={700} gutterBottom>Monthly Detail</Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell sx={{ fontWeight: 700 }}>Month</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Allocations</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Spending</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Top-ups</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Reversals</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Net Flow</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Transactions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {trendData.map((month: any) => (
                        <TableRow key={month.month} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{month.month}</TableCell>
                          <TableCell align="right" sx={{ color: 'primary.main' }}>{formatCurrency(month.total_allocated)}</TableCell>
                          <TableCell align="right" sx={{ color: 'error.main' }}>{formatCurrency(month.total_spent)}</TableCell>
                          <TableCell align="right" sx={{ color: 'success.main' }}>{formatCurrency(month.total_topup)}</TableCell>
                          <TableCell align="right" sx={{ color: 'warning.main' }}>{formatCurrency(month.total_reversals)}</TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              color={month.net_flow >= 0 ? 'success.main' : 'error.main'}
                            >
                              {month.net_flow >= 0 ? '+' : ''}{formatCurrency(month.net_flow)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip label={month.transaction_count} size="small" variant="outlined" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 2 }}>No spending trend data available yet. Transactions will appear here once budget activity occurs.</Alert>
            )}
          </TabPanel>
        </Box>
      </Paper>
    </Box>
  );
};

export default FinancialReportsPage;
