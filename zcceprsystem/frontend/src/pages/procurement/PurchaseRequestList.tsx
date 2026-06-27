/**
 * Purchase Requests List Page
 * Shows all purchase requests with filtering & search
 */

import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, MenuItem, Button, Chip, IconButton,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, TablePagination,
  CircularProgress, Alert, InputAdornment, Tooltip, Stack, Avatar, alpha, useTheme,
  Divider
} from '@mui/material';
import {
  Search as SearchIcon,
  AddCircle as AddIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  ShoppingCart as ProcIcon,
  TableChart as ExportIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import {
  getPurchaseRequests,
  PROC_STATUS_LABELS,
  PROC_STATUS_COLORS
} from '../../services/procurementService';
import { ProcurementStatus, Priority } from '../../types';
import * as XLSX from 'xlsx';
import api from '../../services/api';

const STATUSES: ProcurementStatus[] = [
  'DRAFT', 'PENDING_DEPT_APPROVAL', 'PENDING_FINANCE_APPROVAL',
  'PENDING_PROCUREMENT', 'PENDING_COMMITTEE', 'PENDING_FINAL_FINANCE',
  'COMPLETED', 'REJECTED', 'CANCELLED'
];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const PRIORITY_COLORS: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  LOW: 'default', MEDIUM: 'info', HIGH: 'warning', URGENT: 'error'
};

const PurchaseRequestList: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [donorFilter, setDonorFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  const [departments, setDepartments] = useState<{id: number; department_name: string}[]>([]);

  useEffect(() => {
    api.get('/departments').then(res => { if (res.data.success) setDepartments(res.data.data); }).catch(() => {});
  }, []);

  useEffect(() => { setPage(0); }, [search, statusFilter, priorityFilter, dateFrom, dateTo, deptFilter, donorFilter]);

  const { data: allRequests = [], isLoading, error, refetch } = useQuery({
    queryKey: ['proc-requests', search, statusFilter, priorityFilter],
    queryFn: () => getPurchaseRequests({
      search: search || undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      limit: 200
    }),
    refetchInterval: 30000
  });

  // Client-side date + dept + donor filter
  const requests = allRequests.filter(r => {
    if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(r.created_at) > new Date(dateTo + 'T23:59:59')) return false;
    if (deptFilter && String((r as any).department_id) !== deptFilter) return false;
    if (donorFilter && (r.donor_name || '').toLowerCase() !== donorFilter.toLowerCase()) return false;
    return true;
  });

  // Unique donor names for dropdown
  const donorNames = Array.from(new Set(allRequests.map(r => r.donor_name).filter(Boolean))) as string[];

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const headers = ['Reference', 'Title', 'Requester', 'Department', 'Donor', 'Priority', 'Amount (USD)', 'Status', 'Date Created'];
    const rows = requests.map(r => [
      r.request_code,
      r.title || '',
      `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      `${r.department_name || ''} (${r.department_code || ''})`,
      r.donor_name || '',
      r.priority || '',
      Number(r.total_estimated_amount || 0).toFixed(2),
      PROC_STATUS_LABELS[r.status] || r.status,
      r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Column widths
    ws['!cols'] = [14, 40, 22, 24, 20, 10, 16, 22, 14].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Requests');
    XLSX.writeFile(wb, `purchase-requests-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const hasFilters = Boolean(search || statusFilter || priorityFilter || dateFrom || dateTo || deptFilter || donorFilter);

  const canCreate = hasPermission('create_purchase_request');

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <ProcIcon color="primary" />
          <Typography variant="h5" fontWeight={600}>Purchase Requests</Typography>
          <Chip label={requests.length} size="small" color="primary" sx={{ ml: 1 }} />
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={() => refetch()} size="small" title="Refresh"><RefreshIcon /></IconButton>
          <Tooltip title={requests.length === 0 ? 'No records to export' : `Export ${requests.length} records to Excel`}>
            <span>
              <Button
                variant="outlined" size="small" startIcon={<ExportIcon />}
                onClick={exportToExcel} disabled={requests.length === 0}
              >
                Export Excel
              </Button>
            </span>
          </Tooltip>
          {canCreate && (
            <Button
              variant="contained" startIcon={<AddIcon />}
              onClick={() => navigate('/procurement/requests/create')}
            >
              New Request
            </Button>
          )}
        </Stack>
      </Box>

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <FilterIcon fontSize="small" color="action" />
          <Typography variant="body2" fontWeight={600} color="text.secondary">Filters</Typography>
          {hasFilters && (
            <Button size="small" startIcon={<ClearIcon />} onClick={() => { setSearch(''); setStatusFilter(''); setPriorityFilter(''); setDateFrom(''); setDateTo(''); setDeptFilter(''); setDonorFilter(''); }} sx={{ ml: 'auto' }}>
              Clear All
            </Button>
          )}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
          <TextField
            size="small" placeholder="Search by code, title, requester..." sx={{ minWidth: 260, flex: 2 }}
            value={search} onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <TextField
            select size="small" label="Status" sx={{ minWidth: 185, flex: 1 }}
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All Statuses</MenuItem>
            {STATUSES.map(s => (
              <MenuItem key={s} value={s}>{PROC_STATUS_LABELS[s]}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Priority" sx={{ minWidth: 120, flex: 1 }}
            value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
          >
            <MenuItem value="">All Priorities</MenuItem>
            {PRIORITIES.map(p => (
              <MenuItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small" type="date" label="From Date" InputLabelProps={{ shrink: true }} sx={{ minWidth: 150, flex: 1 }}
            value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          />
          <TextField
            size="small" type="date" label="To Date" InputLabelProps={{ shrink: true }} sx={{ minWidth: 150, flex: 1 }}
            value={dateTo} onChange={e => setDateTo(e.target.value)}
          />
          <TextField
            select size="small" label="Department" sx={{ minWidth: 180, flex: 1 }}
            value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          >
            <MenuItem value="">All Departments</MenuItem>
            {departments.map(d => (
              <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>
            ))}
          </TextField>
          {donorNames.length > 0 && (
            <TextField
              select size="small" label="Donor / Project" sx={{ minWidth: 180, flex: 1 }}
              value={donorFilter} onChange={e => setDonorFilter(e.target.value)}
            >
              <MenuItem value="">All Donors</MenuItem>
              {donorNames.map(n => (
                <MenuItem key={n} value={n}>{n}</MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
        {hasFilters && (
          <Typography variant="caption" color="text.secondary" mt={1} display="block">
            Showing {requests.length} results
          </Typography>
        )}
      </Paper>

      {/* Table */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load requests.</Alert>}

      <TableContainer component={Paper} elevation={1} sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell><strong>Reference</strong></TableCell>
              <TableCell><strong>Title</strong></TableCell>
              <TableCell><strong>Requester</strong></TableCell>
              <TableCell><strong>Department</strong></TableCell>
              <TableCell><strong>Priority</strong></TableCell>
              <TableCell><strong>Amount</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Date</strong></TableCell>
              <TableCell align="center"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={32} />
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                  <ProcIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1, display: 'block', mx: 'auto' }} />
                  <Typography color="text.secondary">
                    {search || statusFilter || priorityFilter
                      ? 'No requests match your filters'
                      : 'No purchase requests yet'}
                  </Typography>
                  {canCreate && !search && !statusFilter && (
                    <Button
                      sx={{ mt: 1 }} startIcon={<AddIcon />} size="small"
                      onClick={() => navigate('/procurement/requests/create')}
                    >
                      Create First Request
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              requests.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((req) => (
                <TableRow
                  key={req.id}
                  hover
                  sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                  onClick={() => navigate(`/procurement/requests/${req.id}`)}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={700} color="primary" noWrap>
                      {req.request_code}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {req.title}
                    </Typography>
                    {req.donor_name && (
                      <Typography variant="caption" color="text.secondary">
                        {req.donor_code}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: alpha('#1976d2', 0.15), color: '#1976d2', fontSize: '0.7rem' }}>
                        {(req.first_name?.[0] || '') + (req.last_name?.[0] || '')}
                      </Avatar>
                      <Typography variant="body2" noWrap>
                        {req.first_name} {req.last_name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={req.department_code} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={req.priority}
                      color={PRIORITY_COLORS[req.priority] || 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      ${Number(req.total_estimated_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={PROC_STATUS_LABELS[req.status] || req.status}
                      color={PROC_STATUS_COLORS[req.status] as any || 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(req.created_at), 'dd MMM yyyy')}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="View Details">
                      <IconButton size="small" color="primary" onClick={e => { e.stopPropagation(); navigate(`/procurement/requests/${req.id}`); }}>
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={requests.length}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 15, 25, 50]}
      />
    </Box>
  );
};

export default PurchaseRequestList;
