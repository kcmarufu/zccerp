/**
 * Dispatch Desk Component
 * View approved requests with PDF/Excel export functionality
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
  CardContent
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

import { Request, Department } from '../../types';
import { requestService } from '../../services/requestService';
import api from '../../services/api';

const DispatchDesk: React.FC = () => {
  const [requests, setRequests] = useState<Request[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'APPROVED',
    departmentId: '',
    startDate: '',
    endDate: ''
  });
  const [selectedRequests, setSelectedRequests] = useState<number[]>([]);

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

      // If no specific status, we need to fetch both APPROVED and REJECTED
      // For "All Completed", we fetch without status filter and then filter client-side
      const statusToFetch = filters.status || undefined;

      const response = await requestService.getAll({
        status: statusToFetch,
        limit: 100
      });

      if (response.success && response.data) {
        // Handle both array and nested object response formats
        let filteredRequests = Array.isArray(response.data)
          ? response.data
          : (response.data.requests || []);

        // If "All Completed" is selected, filter to only show completed statuses
        if (!filters.status) {
          filteredRequests = filteredRequests.filter(
            r => r.status === 'APPROVED' || r.status === 'REJECTED' || r.status === 'DISPATCHED'
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

  // Download PDF for a request
  const handleDownloadPDF = async (requestId: number, requestNumber: string) => {
    try {
      const response = await api.get(`/export/dispatch/${requestId}/pdf`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `dispatch-${requestNumber}.pdf`);
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
  const handleDownloadExcel = async (requestId: number, requestNumber: string) => {
    try {
      const response = await api.get(`/export/dispatch/${requestId}/excel`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `dispatch-${requestNumber}.xlsx`);
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

  const getStatusColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
    switch (status) {
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Dispatch Desk
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View approved requests and generate printable dispatch documents with full audit trails.
        </Typography>
      </Paper>

      {/* Filters */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Status"
              size="small"
              fullWidth
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <MenuItem value="APPROVED">Approved</MenuItem>
              <MenuItem value="REJECTED">Rejected</MenuItem>
              <MenuItem value="">All Completed</MenuItem>
            </TextField>
          </Grid>
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
          <Grid item xs={12} md={4}>
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

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Total Requests</Typography>
              <Typography variant="h4">{requests.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Total Amount</Typography>
              <Typography variant="h4">
                ${requests.reduce((sum, r) => sum + Number(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Selected for Export</Typography>
              <Typography variant="h4">{selectedRequests.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
                    checked={selectedRequests.length === requests.length && requests.length > 0}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Request #</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Requester</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Approved Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">Export</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No requests found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => (
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
                      <Typography fontWeight="medium">{request.request_number}</Typography>
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
                        label={request.status} 
                        color={getStatusColor(request.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {request.completed_at 
                        ? format(new Date(request.completed_at), 'MMM d, yyyy HH:mm')
                        : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Download PDF">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDownloadPDF(request.id, request.request_number)}
                        >
                          <PdfIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Download Excel">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleDownloadExcel(request.id, request.request_number)}
                        >
                          <ExcelIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default DispatchDesk;
