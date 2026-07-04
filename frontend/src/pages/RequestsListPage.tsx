/**
 * Float Requisition List Page
 * Displays all requisitions with filtering, bulk export (PDF/Excel), and checkbox selection
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Button,
  Chip,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  IconButton,
  Tooltip,
  Checkbox,
  Stack,
  Divider,
  alpha,
  useTheme
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  FilterList as FilterIcon,
  TableChart as ExcelIcon,
  Print as PrintIcon,
  Refresh as RefreshIcon,
  Receipt as RequisitionIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

import { useAuthStore } from '../store/authStore';
import { requestService } from '../services/requestService';
import { Request, RequestStatus } from '../types';

// ── HARDCODED BRANDING ─────────────────────────────────────────────────────
const POWERED_BY = 'Powered By Kudakwashe C Marufu' as const;
const DOC_TITLE  = 'Float Requisition' as const;
// ──────────────────────────────────────────────────────────────────────────

const REQUEST_STATUSES: { value: RequestStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_ADMIN_APPROVAL', label: 'Pending Admin' },
  { value: 'PENDING_LEAD_APPROVAL', label: 'Pending Lead' },
  { value: 'PENDING_HOP_APPROVAL', label: 'Pending HOP' },
  { value: 'PENDING_FINANCE_APPROVAL', label: 'Pending Finance' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DISPATCHED', label: 'Dispatched' },
  { value: 'PENDING_RECONCILIATION', label: 'Pending Reconciliation' },
  { value: 'RECONCILED', label: 'Reconciled' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' }
];

const RequestsListPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { hasPermission, user } = useAuthStore();

  const [requests, setRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Selection
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    fetchRequests();
  }, [page, rowsPerPage, statusFilter, refreshTrigger]);

  // Refresh data when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setRefreshTrigger(prev => prev + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Also refresh on mount and when navigating back
  useEffect(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const response = await requestService.getAll({
        page: page + 1,
        limit: rowsPerPage,
        status: statusFilter || undefined,
        search: searchTerm || undefined
      });

      if (response.success && response.data) {
        let data: Request[] = response.data.requests || [];
        // Client-side date filter, preserve newest-first order
        if (dateFrom) data = data.filter(r => new Date(r.created_at) >= new Date(dateFrom));
        if (dateTo)   data = data.filter(r => new Date(r.created_at) <= new Date(dateTo + 'T23:59:59'));
        data = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRequests(data);
        setTotalCount(response.data.pagination?.total ?? data.length);
        setSelected([]);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => { setPage(0); fetchRequests(); };
  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };
  const clearFilters = () => { setSearchTerm(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(0); };

  const getStatusColor = (status: RequestStatus): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    switch (status) {
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      case 'DRAFT':    return 'default';
      case 'PENDING_ADMIN_APPROVAL': return 'info';
      case 'PENDING_LEAD_APPROVAL':
      case 'PENDING_HOP_APPROVAL':
      case 'PENDING_FINANCE_APPROVAL': return 'warning';
      default: return 'info';
    }
  };

  const fmtDate = (d: string) => d ? format(new Date(d), 'dd MMM yyyy') : '—';
  const fmtCurrency = (a: number | string) => `$${Number(a || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Selection helpers ─────────────────────────────────────────────────
  const toggleSelect = (id: number) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelected(selected.length === requests.length ? [] : requests.map(r => r.id));
  const selectedSet = new Set(selected);
  const targetRequests = selected.length > 0 ? requests.filter(r => selectedSet.has(r.id)) : requests;

  // ── Excel export ──────────────────────────────────────────────────────
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const headers = ['Reference', 'Department', 'Requester', 'Description', 'Total Amount ($)', 'Priority', 'Status', 'Date Created', 'Date Submitted'];
    const rows = targetRequests.map(r => [
      r.request_code,
      r.department_name || '',
      `${r.requester_first_name || ''} ${r.requester_last_name || ''}`.trim(),
      (r as any).justification || (r as any).description || '',
      Number(r.total_amount || 0).toFixed(2),
      (r as any).priority || '',
      r.status.replace(/_/g, ' '),
      r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : '',
      (r as any).submitted_at ? format(new Date((r as any).submitted_at), 'dd MMM yyyy') : ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [14, 20, 22, 35, 14, 10, 22, 14, 14].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Float Requisitions');
    XLSX.writeFile(wb, `float-requisitions-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  // ── Bulk PDF (all selected or visible) ────────────────────────────────
  const exportBulkPDF = () => {
    const list = targetRequests;
    if (list.length === 0) return;
    const rows = list.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.request_code}</strong></td>
        <td>${r.department_name || '—'}</td>
        <td>${`${r.requester_first_name || ''} ${r.requester_last_name || ''}`.trim()}</td>
        <td>${(r as any).justification || (r as any).description || '—'}</td>
        <td align="right"><strong>$${Number(r.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
        <td class="status-${r.status}">${r.status.replace(/_/g, ' ')}</td>
        <td>${r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : '—'}</td>
      </tr>`).join('');
    const totalAmt = list.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${DOC_TITLE} — Bulk Export</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; margin: 0; padding: 20px; }
  .doc-header { background: white; border-bottom: 2px solid #006064; color: #006064; padding: 12px 0 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
  .doc-header .org { font-size: 11px; font-weight: bold; color: #006064; letter-spacing: .4px; margin-bottom: 4px; }
  .doc-header h1 { font-size: 18px; margin: 0; color: #006064; }
  .doc-header p  { margin: 3px 0; font-size: 11px; color: #444; }
  .doc-header .meta { text-align: right; font-size: 10px; color: #666; }
  h3 { font-size: 12px; color: #006064; border-bottom: 1.5px solid #006064; padding-bottom: 3px; margin: 14px 0 8px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead th { background: #006064; color: white; padding: 6px 8px; text-align: left; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
  tbody tr:nth-child(even) td { background: #f7f7f7; }
  .total-row td { font-weight: bold; background: #e0f2f1 !important; border-top: 1.5px solid #006064; font-size: 11px; }
  .status-APPROVED        { color: #2e7d32; font-weight: bold; }
  .status-REJECTED        { color: #c62828; font-weight: bold; }
  .status-DRAFT           { color: #616161; }
  .status-DISPATCHED      { color: #1565c0; font-weight: bold; }
  .page-footer { margin-top: 24px; padding-top: 8px; border-top: 2px solid #e0e0e0; display: flex; justify-content: space-between; }
  .footer-left  { font-size: 9px; color: #999; }
  .footer-right { font-size: 9px; font-weight: bold; color: #006064; }
  @media print { body { padding: 8px; } thead { display: table-header-group; } tr { page-break-inside: avoid; } }
</style></head><body>
<div class="doc-header">
  <div>
    <div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div>
    <h1>${DOC_TITLE} — Bulk Report</h1>
    <p>Total Records: <strong>${list.length}</strong> &nbsp;|&nbsp; Total Amount: <strong>$${totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
    <p>${statusFilter ? `Status: ${statusFilter.replace(/_/g, ' ')}` : 'All Statuses'} ${dateFrom ? `| From: ${dateFrom}` : ''} ${dateTo ? `| To: ${dateTo}` : ''}</p>
  </div>
  <div class="meta">Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</div>
</div>
<h3>Requisition Summary (${list.length} records)</h3>
<table>
  <thead><tr><th>#</th><th>Reference</th><th>Department</th><th>Requester</th><th>Description</th><th align="right">Amount ($)</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>
    ${rows}
    <tr class="total-row"><td colspan="5" align="right">TOTAL:</td><td align="right">$${totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td colspan="2"></td></tr>
  </tbody>
</table>
<div class="page-footer">
  <div class="footer-left"><div>Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</div><div>ERP Connect - Zimbabwe Council of Churches | CONFIDENTIAL</div></div>
  <div class="footer-right">${POWERED_BY}</div>
</div>
</body></html>`;
    const w = window.open('', '_blank', 'width=960,height=720');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 500); }
  };

  return (
    <Box>
      {/* ── Header ── */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, background: `linear-gradient(135deg, #006064 0%, #00363a 100%)`, color: 'white', borderRadius: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <RequisitionIcon sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>{DOC_TITLE}s</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>Manage and export float requisitions</Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Refresh"><IconButton sx={{ color: 'white' }} onClick={() => setRefreshTrigger(p => p + 1)}><RefreshIcon /></IconButton></Tooltip>
            <Tooltip title={`Export ${selected.length > 0 ? `${selected.length} selected` : 'all visible'} to Excel`}>
              <Button variant="outlined" size="small" startIcon={<ExcelIcon />} onClick={exportExcel} disabled={requests.length === 0} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                Excel
              </Button>
            </Tooltip>
            <Tooltip title={`Print/PDF ${selected.length > 0 ? `${selected.length} selected` : 'all visible'}`}>
              <Button variant="outlined" size="small" startIcon={<PrintIcon />} onClick={exportBulkPDF} disabled={requests.length === 0} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                Print PDF
              </Button>
            </Tooltip>
            {hasPermission('create_request') && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/finance/requests/create')} sx={{ bgcolor: 'white', color: '#006064', '&:hover': { bgcolor: alpha('#ffffff', 0.9) } }}>
                New Request
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>

      {/* ── Filters ── */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <FilterIcon fontSize="small" color="action" />
          <Typography variant="body2" fontWeight={600} color="text.secondary">Filters</Typography>
          {(searchTerm || statusFilter || dateFrom || dateTo) && (
            <Button size="small" startIcon={<ClearIcon />} onClick={clearFilters} sx={{ ml: 'auto' }}>Clear All</Button>
          )}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
          <TextField size="small" placeholder="Search by reference, description..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} onKeyPress={handleKeyPress}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 260, flex: 2 }} />
          <FormControl size="small" sx={{ minWidth: 185, flex: 1 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={e => { setStatusFilter(e.target.value as RequestStatus | ''); setPage(0); }}>
              {REQUEST_STATUSES.map(s => <MenuItem key={s.value || 'all'} value={s.value}>{s.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" type="date" label="From Date" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} sx={{ minWidth: 150, flex: 1 }} />
          <TextField size="small" type="date" label="To Date" InputLabelProps={{ shrink: true }} value={dateTo} onChange={e => setDateTo(e.target.value)} sx={{ minWidth: 150, flex: 1 }} />
          <Button variant="outlined" onClick={handleSearch} startIcon={<FilterIcon />}>Apply</Button>
        </Stack>
        {selected.length > 0 && (
          <Box mt={1.5} p={1} bgcolor={alpha(theme.palette.primary.main, 0.08)} borderRadius={1} display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" color="primary.main" fontWeight={600}>{selected.length} requisition{selected.length !== 1 ? 's' : ''} selected</Typography>
            <Button size="small" startIcon={<ExcelIcon />} onClick={exportExcel}>Export Excel</Button>
            <Button size="small" startIcon={<PrintIcon />} onClick={exportBulkPDF}>Print PDF</Button>
            <Button size="small" onClick={() => setSelected([])}>Clear Selection</Button>
          </Box>
        )}
      </Paper>

      {/* ── Table ── */}
      <Paper elevation={2} sx={{ borderRadius: 2 }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#006064' }}>
                <TableCell padding="checkbox" sx={{ bgcolor: '#006064' }}>
                  <Checkbox checked={requests.length > 0 && selected.length === requests.length} indeterminate={selected.length > 0 && selected.length < requests.length} onChange={toggleSelectAll} sx={{ color: 'white', '&.Mui-checked': { color: 'white' }, '&.MuiCheckbox-indeterminate': { color: 'white' } }} />
                </TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Reference</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Department</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Requester</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Description</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Amount</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 5 }}><CircularProgress /></TableCell></TableRow>
              ) : requests.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 5 }}><RequisitionIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} /><Typography color="text.secondary">No requisitions found</Typography></TableCell></TableRow>
              ) : (
                requests.map((request) => (
                  <TableRow key={request.id} hover selected={selectedSet.has(request.id)} sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.06) } }}>
                    <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                      <Checkbox size="small" checked={selectedSet.has(request.id)} onChange={() => toggleSelect(request.id)} />
                    </TableCell>
                    <TableCell onClick={() => navigate(`/finance/requests/${request.id}`)}>
                      <Typography fontWeight={600} variant="body2" color="primary.main">{request.request_code}</Typography>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/finance/requests/${request.id}`)}>{request.department_name}</TableCell>
                    <TableCell onClick={() => navigate(`/finance/requests/${request.id}`)}>
                      <Typography variant="body2">{`${(request as any).requester_first_name || ''} ${(request as any).requester_last_name || ''}`.trim() || '—'}</Typography>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/finance/requests/${request.id}`)}>
                      <Typography noWrap sx={{ maxWidth: 200 }} variant="body2">{(request as any).justification || (request as any).description || '—'}</Typography>
                    </TableCell>
                    <TableCell align="right" onClick={() => navigate(`/finance/requests/${request.id}`)}>
                      <Typography fontWeight={600} variant="body2">{fmtCurrency(request.total_amount)}</Typography>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/finance/requests/${request.id}`)}>
                      <Chip label={request.status.replace(/_/g, ' ')} size="small" color={getStatusColor(request.status)} />
                    </TableCell>
                    <TableCell onClick={() => navigate(`/finance/requests/${request.id}`)}>
                      <Typography variant="caption">{fmtDate(request.created_at)}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="View"><IconButton size="small" color="primary" onClick={e => { e.stopPropagation(); navigate(`/finance/requests/${request.id}`); }}><ViewIcon fontSize="small" /></IconButton></Tooltip>
                        {['DRAFT', 'REJECTED', 'PENDING_LEAD_APPROVAL', 'PENDING_ADMIN_APPROVAL', 'PENDING_HOP_APPROVAL'].includes(request.status) && request.requester_id === user?.id && hasPermission('create_request') && (
                          <Tooltip title="Edit"><IconButton size="small" onClick={e => { e.stopPropagation(); navigate(`/finance/requests/${request.id}/edit`); }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Divider />
        <Box display="flex" alignItems="center" justifyContent="space-between" px={2} py={0.5}>
          <Typography variant="caption" color="text.secondary">
            {selected.length > 0 ? `${selected.length} of ${requests.length} selected` : `${requests.length} records`}
          </Typography>
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            sx={{ border: 0 }}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default RequestsListPage;
