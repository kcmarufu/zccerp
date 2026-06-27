/**
 * Payroll Management Page
 * View payroll periods, records, and salary breakdowns
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, MenuItem, Stack, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField,
  CircularProgress, Divider
} from '@mui/material';
import {
  Visibility as ViewIcon, AttachMoney as PayrollIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { getPayrollPeriods, getPayrollRecords } from '../../services/hrService';

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  OPEN: 'info', PROCESSING: 'warning', PROCESSED: 'success', APPROVED: 'success', CLOSED: 'default'
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const fmtCurrency = (val: number | string | null) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const PayrollPage: React.FC = () => {
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const loadPeriods = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getPayrollPeriods({
        page: page + 1, limit: rowsPerPage,
        year: yearFilter ? parseInt(yearFilter) : undefined,
        status: statusFilter || undefined
      });
      setPeriods(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      toast.error('Failed to load payroll periods');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, yearFilter, statusFilter]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  const handleViewPeriod = async (period: any) => {
    setSelectedPeriod(period);
    setViewDialogOpen(true);
    setLoadingRecords(true);
    try {
      const records = await getPayrollRecords(period.id);
      setPayrollRecords(records);
    } catch (err) {
      toast.error('Failed to load payroll records');
    } finally {
      setLoadingRecords(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // Totals for the records view
  const totals = payrollRecords.reduce((acc, r) => ({
    gross: acc.gross + Number(r.gross_pay || 0),
    deductions: acc.deductions + Number(r.total_deductions || 0),
    net: acc.net + Number(r.net_pay || 0)
  }), { gross: 0, deductions: 0, net: 0 });

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">
          <PayrollIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Payroll Management
        </Typography>
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField select size="small" label="Year" sx={{ width: 120 }}
            value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Status" sx={{ width: 160 }}
            value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="OPEN">Open</MenuItem>
            <MenuItem value="PROCESSING">Processing</MenuItem>
            <MenuItem value="PROCESSED">Processed</MenuItem>
            <MenuItem value="APPROVED">Approved</MenuItem>
            <MenuItem value="CLOSED">Closed</MenuItem>
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
                  <TableCell sx={{ fontWeight: 'bold' }}>Period</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Month</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Date Range</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Employees</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="right">Total Net Pay</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {periods.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary" py={4}>No payroll periods found</Typography>
                    </TableCell>
                  </TableRow>
                ) : periods.map((period) => (
                  <TableRow key={period.id} hover>
                    <TableCell><Typography variant="body2" fontWeight={600}>{period.period_name}</Typography></TableCell>
                    <TableCell>{MONTHS[(period.period_month || 1) - 1]} {period.period_year}</TableCell>
                    <TableCell>
                      {period.start_date ? new Date(period.start_date).toLocaleDateString() : '-'} — {period.end_date ? new Date(period.end_date).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={period.record_count || 0} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        ${fmtCurrency(period.total_net)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={period.status} size="small" color={STATUS_COLORS[period.status] || 'default'} />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => handleViewPeriod(period)}>
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

      {/* Payroll Records Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              Payroll: {selectedPeriod?.period_name}
            </Typography>
            {selectedPeriod && (
              <Chip label={selectedPeriod.status} size="small" color={STATUS_COLORS[selectedPeriod.status] || 'default'} />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingRecords ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : (
            <>
              {/* Summary Cards */}
              <Grid container spacing={2} mb={2}>
                <Grid item xs={4}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Total Gross Pay</Typography>
                    <Typography variant="h6" fontWeight="bold" color="primary">${fmtCurrency(totals.gross)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Total Deductions</Typography>
                    <Typography variant="h6" fontWeight="bold" color="error">${fmtCurrency(totals.deductions)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Total Net Pay</Typography>
                    <Typography variant="h6" fontWeight="bold" color="success.main">${fmtCurrency(totals.net)}</Typography>
                  </Paper>
                </Grid>
              </Grid>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'grey.100' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>Employee</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Emp #</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Department</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Basic</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Allowances</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Gross</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Deductions</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">Net Pay</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payrollRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center">
                          <Typography variant="body2" color="text.secondary" py={4}>No payroll records for this period</Typography>
                        </TableCell>
                      </TableRow>
                    ) : payrollRecords.map((rec) => {
                      const totalAllowances = Number(rec.transport_allowance || 0) + 
                        Number(rec.housing_allowance || 0) + Number(rec.field_allowance || 0) +
                        Number(rec.overtime_pay || 0) + Number(rec.other_allowances || 0);
                      return (
                        <TableRow key={rec.id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>{rec.employee_name}</Typography>
                          </TableCell>
                          <TableCell>{rec.employee_number}</TableCell>
                          <TableCell>{rec.department_name || '-'}</TableCell>
                          <TableCell align="right">{fmtCurrency(rec.basic_salary)}</TableCell>
                          <TableCell align="right">{fmtCurrency(totalAllowances)}</TableCell>
                          <TableCell align="right">
                            <Typography fontWeight={600}>{fmtCurrency(rec.gross_pay)}</Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ color: 'error.main' }}>
                            {fmtCurrency(rec.total_deductions)}
                          </TableCell>
                          <TableCell align="right">
                            <Typography fontWeight={600} color="success.main">
                              {fmtCurrency(rec.net_pay)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip label={rec.status} size="small" 
                              color={rec.status === 'PAID' ? 'success' : rec.status === 'DRAFT' ? 'default' : 'info'} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {payrollRecords.length > 0 && (
                      <TableRow sx={{ backgroundColor: 'grey.50' }}>
                        <TableCell colSpan={5} sx={{ fontWeight: 'bold' }}>TOTALS</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>${fmtCurrency(totals.gross)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>${fmtCurrency(totals.deductions)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', color: 'success.main' }}>${fmtCurrency(totals.net)}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PayrollPage;
