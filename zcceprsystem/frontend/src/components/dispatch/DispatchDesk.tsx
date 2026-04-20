/**
 * Dispatch Desk Component
 * View ALL requests (dispatched and non-dispatched) with full detail view
 */

import React, { useState, useEffect } from 'react';
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
  Button,
  Chip,
  CircularProgress,
  TextField,
  MenuItem,
  Grid,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Tabs,
  Tab
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  LocalShipping as DispatchIcon,
  CheckCircle as ApprovedIcon,
  Receipt as ReconcileIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

import { Request, Department } from '../../types';
import { requestService } from '../../services/requestService';
import { reconciliationService } from '../../services/reconciliationService';
import api from '../../services/api';

const DispatchDesk: React.FC = () => {
  const [requests, setRequests] = useState<Request[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [filters, setFilters] = useState({
    status: '',
    departmentId: '',
    startDate: '',
    endDate: ''
  });
  const [selectedRequests, setSelectedRequests] = useState<number[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<any>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [detailApprovalTrail, setDetailApprovalTrail] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    fetchDepartments();
    fetchRequests();
  }, [filters]);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      if (response.data.success) {
        setDepartments(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  const fetchRequests = async () => {
    try {
      setIsLoading(true);

      const statusToFetch = filters.status || undefined;

      const response = await requestService.getAll({
        status: statusToFetch,
        limit: 100
      });

      if (response.success && response.data) {
        let filteredRequests = Array.isArray(response.data)
          ? response.data
          : (response.data.requests || []);

        // Show ALL completed statuses when no filter
        if (!filters.status) {
          filteredRequests = filteredRequests.filter(
            r => ['APPROVED', 'REJECTED', 'DISPATCHED', 'PENDING_RECONCILIATION', 'RECONCILED'].includes(r.status)
          );
        }

        // Apply department filter
        if (filters.departmentId) {
          filteredRequests = filteredRequests.filter(
            r => r.department_id === parseInt(filters.departmentId)
          );
        }

        // Apply date filters
        if (filters.startDate) {
          filteredRequests = filteredRequests.filter(
            r => new Date(r.submitted_at || r.created_at) >= new Date(filters.startDate)
          );
        }
        if (filters.endDate) {
          filteredRequests = filteredRequests.filter(
            r => new Date(r.submitted_at || r.created_at) <= new Date(filters.endDate)
          );
        }

        setRequests(filteredRequests);
      } else {
        setRequests([]);
      }
    } catch (error: any) {
      console.error('Error fetching requests for dispatch:', error);
      toast.error(error?.response?.data?.error || 'Failed to load requests');
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Open detail view dialog
  const handleViewDetail = async (request: any) => {
    try {
      setLoadingDetail(true);
      setDetailOpen(true);
      const response = await requestService.getById(request.id);
      if (response.success && response.data) {
        setDetailRequest(response.data);
        setDetailItems(response.data.items || []);
        setDetailApprovalTrail(response.data.approvalTrail || []);
      }
    } catch (error) {
      toast.error('Failed to load request details');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Download PDF for a request
  const handleDownloadPDF = async (requestId: number, requestCode: string) => {
    try {
      const response = await api.get(`/export/dispatch/${requestId}/pdf`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `dispatch-${requestCode}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('PDF downloaded successfully');
    } catch (error) {
      toast.error('Failed to download PDF');
    }
  };

  // Download Excel for a request
  const handleDownloadExcel = async (requestId: number, requestCode: string) => {
    try {
      const response = await api.get(`/export/dispatch/${requestId}/excel`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `dispatch-${requestCode}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Excel downloaded successfully');
    } catch (error) {
      toast.error('Failed to download Excel');
    }
  };

  // Bulk export selected requests
  const handleBulkExport = async () => {
    if (selectedRequests.length === 0) {
      toast.warning('Please select requests to export');
      return;
    }

    try {
      const response = await api.post('/export/bulk', 
        { requestIds: selectedRequests },
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `requests-export-${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Bulk export completed');
      setSelectedRequests([]);
    } catch (error) {
      toast.error('Failed to export');
    }
  };

  // Toggle request selection
  const toggleSelection = (requestId: number) => {
    setSelectedRequests(prev => 
      prev.includes(requestId)
        ? prev.filter(id => id !== requestId)
        : [...prev, requestId]
    );
  };

  // Select all visible requests
  const toggleSelectAll = () => {
    if (selectedRequests.length === requests.length) {
      setSelectedRequests([]);
    } else {
      setSelectedRequests(requests.map(r => r.id));
    }
  };

  // Mark request as dispatched
  const handleMarkDispatched = async (requestId: number) => {
    try {
      const result = await reconciliationService.markAsDispatched(requestId);
      if (result.success) {
        toast.success('Request marked as dispatched');
        fetchRequests();
      } else {
        toast.error(result.error || 'Failed to mark as dispatched');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to mark as dispatched');
    }
  };

  const getStatusColor = (status: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
    switch (status) {
      case 'APPROVED': return 'success';
      case 'DISPATCHED': return 'info';
      case 'REJECTED': return 'error';
      case 'PENDING_RECONCILIATION': return 'warning';
      case 'RECONCILED': return 'success';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string): string => {
    return status.replace(/_/g, ' ');
  };

  // Filtered counts
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
  const dispatchedCount = requests.filter(r => r.status === 'DISPATCHED').length;
  const reconciledCount = requests.filter(r => ['PENDING_RECONCILIATION', 'RECONCILED'].includes(r.status)).length;

  // Tab-based filtering
  const getTabRequests = () => {
    switch (activeTab) {
      case 0: return requests; // All
      case 1: return requests.filter(r => r.status === 'APPROVED'); // Pending Dispatch
      case 2: return requests.filter(r => r.status === 'DISPATCHED'); // Dispatched
      case 3: return requests.filter(r => ['PENDING_RECONCILIATION', 'RECONCILED'].includes(r.status)); // Reconciled
      default: return requests;
    }
  };

  const displayedRequests = getTabRequests();

  return (
    <Box>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Dispatch Desk
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View all requests, manage dispatch, and generate printable documents. Track dispatched and non-dispatched requests.
        </Typography>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography color="text.secondary" variant="caption">Total Requests</Typography>
              <Typography variant="h4">{requests.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ borderLeft: '4px solid #2e7d32' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography color="text.secondary" variant="caption">Pending Dispatch</Typography>
              <Typography variant="h4" color="success.main">{approvedCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ borderLeft: '4px solid #1976d2' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography color="text.secondary" variant="caption">Dispatched</Typography>
              <Typography variant="h4" color="info.main">{dispatchedCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography color="text.secondary" variant="caption">Total Amount</Typography>
              <Typography variant="h5">
                ${requests.reduce((sum, r) => sum + Number(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper elevation={1} sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab label={`All (${requests.length})`} />
          <Tab icon={<ApprovedIcon />} iconPosition="start" label={`Pending Dispatch (${approvedCount})`} />
          <Tab icon={<DispatchIcon />} iconPosition="start" label={`Dispatched (${dispatchedCount})`} />
          <Tab icon={<ReconcileIcon />} iconPosition="start" label={`Reconciliation (${reconciledCount})`} />
        </Tabs>
      </Paper>

      {/* Filters */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Department"
              size="small"
              fullWidth
              value={filters.departmentId}
              onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
            >
              <MenuItem value="">All Departments</MenuItem>
              {departments.map(dept => (
                <MenuItem key={dept.id} value={dept.id}>
                  {dept.department_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              type="date"
              label="From Date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              type="date"
              label="To Date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Box display="flex" gap={1}>
              <Button
                variant="outlined"
                startIcon={<FilterIcon />}
                onClick={fetchRequests}
              >
                Apply Filters
              </Button>
              {selectedRequests.length > 0 && (
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={handleBulkExport}
                >
                  Export Selected ({selectedRequests.length})
                </Button>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Requests Table */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'grey.100' }}>
                <TableCell padding="checkbox">
                  <input
                    type="checkbox"
                    checked={selectedRequests.length === displayedRequests.length && displayedRequests.length > 0}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Request #</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Requester</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Priority</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayedRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No requests found for the selected filter</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                displayedRequests.map((request) => (
                  <TableRow 
                    key={request.id}
                    hover
                    selected={selectedRequests.includes(request.id)}
                  >
                    <TableCell padding="checkbox">
                      <input
                        type="checkbox"
                        checked={selectedRequests.includes(request.id)}
                        onChange={() => toggleSelection(request.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight="medium">{request.request_code}</Typography>
                    </TableCell>
                    <TableCell>
                      {request.requester_first_name} {request.requester_last_name}
                    </TableCell>
                    <TableCell>
                      <Chip label={request.department_code} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      ${Number(request.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={request.priority || 'MEDIUM'}
                        size="small"
                        color={request.priority === 'URGENT' ? 'error' : request.priority === 'HIGH' ? 'warning' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={getStatusLabel(request.status)} 
                        color={getStatusColor(request.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {request.submitted_at 
                        ? format(new Date(request.submitted_at), 'MMM d, yyyy')
                        : request.created_at ? format(new Date(request.created_at), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" gap={0.5} justifyContent="center">
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleViewDetail(request)}
                          >
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                        {request.status === 'APPROVED' && (
                          <Tooltip title="Mark as Dispatched">
                            <Button
                              size="small"
                              variant="contained"
                              color="primary"
                              startIcon={<DispatchIcon />}
                              onClick={() => handleMarkDispatched(request.id)}
                            >
                              Dispatch
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip title="Download PDF">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDownloadPDF(request.id, request.request_code)}
                          >
                            <PdfIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download Excel">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => handleDownloadExcel(request.id, request.request_code)}
                          >
                            <ExcelIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ==================== REQUEST DETAIL DIALOG ==================== */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <ViewIcon color="primary" />
            <Typography variant="h6">Request Details: {detailRequest?.request_code}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loadingDetail ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : detailRequest ? (
            <Box>
              {/* Request Info */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Requester</Typography>
                  <Typography fontWeight={500}>
                    {detailRequest.requester_first_name} {detailRequest.requester_last_name}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Department</Typography>
                  <Typography fontWeight={500}>{detailRequest.department_name}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Box mt={0.5}>
                    <Chip label={getStatusLabel(detailRequest.status)} color={getStatusColor(detailRequest.status)} size="small" />
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Priority</Typography>
                  <Box mt={0.5}>
                    <Chip 
                      label={detailRequest.priority || 'MEDIUM'} 
                      size="small"
                      color={detailRequest.priority === 'URGENT' ? 'error' : detailRequest.priority === 'HIGH' ? 'warning' : 'default'}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Total Amount</Typography>
                  <Typography variant="h6" fontWeight={600} color="primary.main">
                    ${Number(detailRequest.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Submitted</Typography>
                  <Typography fontWeight={500}>
                    {detailRequest.submitted_at ? format(new Date(detailRequest.submitted_at), 'MMM d, yyyy HH:mm') : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Finance Approved</Typography>
                  <Typography fontWeight={500}>
                    {detailRequest.finance_approved_at ? format(new Date(detailRequest.finance_approved_at), 'MMM d, yyyy HH:mm') : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Request Code</Typography>
                  <Typography fontWeight={500}>{detailRequest.request_code}</Typography>
                </Grid>
              </Grid>

              {detailRequest.justification && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Justification</Typography>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2">{detailRequest.justification}</Typography>
                  </Paper>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Line Items */}
              {detailItems.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Request Items</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 600 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Unit</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Unit Price</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Total</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Budget Code</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detailItems.map((item: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell>{item.item_description}</TableCell>
                            <TableCell align="right">{item.quantity}</TableCell>
                            <TableCell>{item.unit_of_measure}</TableCell>
                            <TableCell align="right">${Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell align="right">${(Number(item.quantity || 1) * Number(item.unit_price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell><Chip label={item.budget_code} size="small" variant="outlined" /></TableCell>
                          </TableRow>
                        ))}
                        <TableRow sx={{ backgroundColor: 'primary.light' }}>
                          <TableCell colSpan={5} align="right"><Typography fontWeight={600}>Grand Total:</Typography></TableCell>
                          <TableCell align="right">
                            <Typography fontWeight={600}>
                              ${Number(detailRequest.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </Typography>
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Approval Trail */}
              {detailApprovalTrail.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Approval Trail</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>By</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Comments</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detailApprovalTrail.map((log: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Chip
                                label={log.action}
                                size="small"
                                color={log.action === 'APPROVED' ? 'success' : log.action === 'REJECTED' ? 'error' : 'default'}
                              />
                            </TableCell>
                            <TableCell>{log.approver_first_name || log.actor_name} {log.approver_last_name || ''}</TableCell>
                            <TableCell>{(log.approver_role || log.actor_role || '').replace(/_/g, ' ')}</TableCell>
                            <TableCell>{log.comments || log.comment || '-'}</TableCell>
                            <TableCell>{log.created_at ? format(new Date(log.created_at), 'MMM d, yyyy HH:mm') : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          {detailRequest?.status === 'APPROVED' && (
            <Button variant="contained" startIcon={<DispatchIcon />} onClick={() => { handleMarkDispatched(detailRequest.id); setDetailOpen(false); }}>
              Mark as Dispatched
            </Button>
          )}
          <Button variant="outlined" color="error" onClick={() => handleDownloadPDF(detailRequest?.id, detailRequest?.request_code)} startIcon={<PdfIcon />}>
            PDF
          </Button>
          <Button variant="outlined" color="success" onClick={() => handleDownloadExcel(detailRequest?.id, detailRequest?.request_code)} startIcon={<ExcelIcon />}>
            Excel
          </Button>
          <Button onClick={() => setDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DispatchDesk;
