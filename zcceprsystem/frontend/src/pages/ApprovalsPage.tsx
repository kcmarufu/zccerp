/**
 * Approvals Page Component
 * Shows all approvals in tabs: Pending, Approved, Rejected
 * Requests persist after action - nothing disappears
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Grid,
  IconButton,
  Tooltip,
  LinearProgress,
  Badge,
  Divider
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Visibility as ViewIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Undo as ReverseIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Description as DescriptionIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format, formatDistanceToNow } from 'date-fns';

import { Request, RequestItem, BudgetImpact, ApprovalPayload } from '../types';
import { approvalService } from '../services/approvalService';
import { requestService } from '../services/requestService';
import { useAuthStore } from '../store/authStore';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

interface RequestWithReversal extends Request {
  canReverse?: boolean;
  hoursRemaining?: string;
}

const ApprovalsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [tabValue, setTabValue] = useState(0);
  const [pendingRequests, setPendingRequests] = useState<Request[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<RequestWithReversal[]>([]);
  const [rejectedRequests, setRejectedRequests] = useState<Request[]>([]);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [fullRequestDetails, setFullRequestDetails] = useState<Request | null>(null);
  const [requestItems, setRequestItems] = useState<RequestItem[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [budgetImpact, setBudgetImpact] = useState<BudgetImpact[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<'approve' | 'reject' | 'reverse'>('approve');
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchPendingApprovals(),
        fetchApprovedRequests(),
        fetchRejectedRequests(),
        fetchStats()
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingApprovals = async () => {
    try {
      const response = await approvalService.getPendingApprovals();
      if (response.success && response.data) {
        setPendingRequests(response.data);
      }
    } catch (error) {
      console.error('Failed to load pending approvals:', error);
    }
  };

  const fetchApprovedRequests = async () => {
    try {
      const response = await approvalService.getApprovedRequests();
      if (response.success && response.data) {
        setApprovedRequests(response.data);
      }
    } catch (error) {
      console.error('Failed to load approved requests:', error);
    }
  };

  const fetchRejectedRequests = async () => {
    try {
      const response = await approvalService.getRejectedRequests();
      if (response.success && response.data) {
        setRejectedRequests(response.data);
      }
    } catch (error) {
      console.error('Failed to load rejected requests:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await approvalService.getApproverStats();
      if (response.success && response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleViewBudgetImpact = async (request: Request) => {
    try {
      const response = await approvalService.getBudgetImpact(request.id);
      if (response.success && response.data) {
        setBudgetImpact(response.data);
      }
    } catch (error) {
      toast.error('Failed to load budget impact');
    }
  };

  const handleOpenDialog = async (request: Request, action: 'approve' | 'reject' | 'reverse') => {
    setSelectedRequest(request);
    setDialogAction(action);
    setComments('');
    setBudgetImpact([]);
    setFullRequestDetails(null);
    setRequestItems([]);
    setIsDialogOpen(true);
    setIsLoadingDetails(true);

    // Fetch full request details including items
    try {
      const response = await requestService.getById(request.id);
      if (response.success && response.data) {
        const data = response.data as any;
        setFullRequestDetails(data);
        setRequestItems(data.items || []);
      }
    } catch (error) {
      console.error('Failed to load request details:', error);
    } finally {
      setIsLoadingDetails(false);
    }

    if (action === 'approve') {
      handleViewBudgetImpact(request);
    }
  };

  const handleSubmit = async () => {
    if (!selectedRequest) return;

    if (dialogAction === 'approve' && budgetImpact.some(bi => bi.hasInsufficientFunds)) {
      toast.error('Cannot approve: Insufficient budget funds');
      return;
    }

    try {
      setIsSubmitting(true);

      if (dialogAction === 'reverse') {
        const response = await approvalService.reverseApproval(selectedRequest.id, comments);
        if (response.success) {
          toast.success('Approval reversed successfully');
          setIsDialogOpen(false);
          fetchAllData();
        }
      } else {
        const payload: ApprovalPayload = {
          action: dialogAction === 'approve' ? 'APPROVED' : 'REJECTED',
          comments: comments || undefined,
          version: selectedRequest.version
        };

        const response = dialogAction === 'approve'
          ? await approvalService.approve(selectedRequest.id, payload)
          : await approvalService.reject(selectedRequest.id, payload);

        if (response.success) {
          toast.success(dialogAction === 'approve' ? 'Request approved' : 'Request rejected');
          setIsDialogOpen(false);
          fetchAllData();
        }
      }
    } catch (error: any) {
      if (error.response?.data?.code === 'VERSION_CONFLICT') {
        toast.error('Request was modified. Refreshing...');
        fetchAllData();
      } else {
        toast.error(error.response?.data?.error || 'Action failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string): 'warning' | 'info' | 'success' | 'error' | 'default' => {
    switch (status) {
      case 'PENDING_LEAD_APPROVAL': return 'warning';
      case 'PENDING_HOP_APPROVAL': return 'info';
      case 'PENDING_FINANCE_APPROVAL': return 'success';
      case 'APPROVED': case 'DISPATCHED': return 'success';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  };

  const getPriorityColor = (priority: string): 'default' | 'info' | 'warning' | 'error' => {
    switch (priority) {
      case 'LOW': return 'default';
      case 'MEDIUM': return 'info';
      case 'HIGH': return 'warning';
      case 'URGENT': return 'error';
      default: return 'default';
    }
  };

  // Check if a request can be reversed (within 5-hour window)
  const canReverseRequest = (request: any): boolean => {
    // Check if there's a recent approval (within 5 hours)
    const approvalTime = request.lead_approved_at || request.hop_approved_at || request.finance_approved_at;
    if (!approvalTime) return false;

    const approvedAt = new Date(approvalTime);
    const now = new Date();
    const hoursSinceApproval = (now.getTime() - approvedAt.getTime()) / (1000 * 60 * 60);

    return hoursSinceApproval < 5;
  };

  // Get hours remaining for reversal
  const getReversalTimeRemaining = (request: any): string => {
    const approvalTime = request.lead_approved_at || request.hop_approved_at || request.finance_approved_at;
    if (!approvalTime) return '';

    const approvedAt = new Date(approvalTime);
    const now = new Date();
    const hoursSinceApproval = (now.getTime() - approvedAt.getTime()) / (1000 * 60 * 60);
    const hoursRemaining = 5 - hoursSinceApproval;

    if (hoursRemaining <= 0) return '';
    if (hoursRemaining < 1) return `${Math.round(hoursRemaining * 60)}m remaining`;
    return `${hoursRemaining.toFixed(1)}h remaining`;
  };

  const renderRequestsTable = (requests: Request[], showActions: boolean, type: 'pending' | 'approved' | 'rejected') => {
    if (requests.length === 0) {
      return (
        <Paper elevation={1} sx={{ p: 4, textAlign: 'center' }}>
          <InfoIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No {type} requests
          </Typography>
        </Paper>
      );
    }

    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'grey.100' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>Request #</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Requester</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Department</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Priority</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>
                {type === 'pending' ? 'Submitted' : type === 'approved' ? 'Approved' : 'Rejected'}
              </TableCell>
              {type === 'approved' && <TableCell sx={{ fontWeight: 'bold' }}>Reversal Window</TableCell>}
              {type === 'rejected' && <TableCell sx={{ fontWeight: 'bold' }}>Reason</TableCell>}
              <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {requests.map((request: any) => {
              const canReverse = type === 'approved' && canReverseRequest(request);
              const reversalTime = type === 'approved' ? getReversalTimeRemaining(request) : '';

              return (
                <TableRow key={request.id} hover>
                  <TableCell>
                    <Typography fontWeight="medium">{request.request_code}</Typography>
                  </TableCell>
                  <TableCell>{request.requester_first_name} {request.requester_last_name}</TableCell>
                  <TableCell><Chip label={request.department_code} size="small" variant="outlined" /></TableCell>
                  <TableCell>
                    <Typography fontWeight="medium">
                      ${Number(request.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                  <TableCell><Chip label={request.priority} color={getPriorityColor(request.priority)} size="small" /></TableCell>
                  <TableCell><Chip label={request.status.replace(/_/g, ' ')} color={getStatusColor(request.status)} size="small" /></TableCell>
                  <TableCell>
                    {type === 'pending' && request.submitted_at && format(new Date(request.submitted_at), 'MMM d, yyyy HH:mm')}
                    {type === 'approved' && request.finance_approved_at && format(new Date(request.finance_approved_at), 'MMM d, yyyy HH:mm')}
                    {type === 'approved' && !request.finance_approved_at && request.hop_approved_at && format(new Date(request.hop_approved_at), 'MMM d, yyyy HH:mm')}
                    {type === 'approved' && !request.finance_approved_at && !request.hop_approved_at && request.lead_approved_at && format(new Date(request.lead_approved_at), 'MMM d, yyyy HH:mm')}
                    {type === 'rejected' && request.updated_at && format(new Date(request.updated_at), 'MMM d, yyyy HH:mm')}
                  </TableCell>
                  {type === 'approved' && (
                    <TableCell>
                      {canReverse ? (
                        <Chip
                          icon={<ScheduleIcon />}
                          label={reversalTime}
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">Expired</Typography>
                      )}
                    </TableCell>
                  )}
                  {type === 'rejected' && (
                    <TableCell>
                      <Tooltip title={request.rejection_reason || 'No reason provided'}>
                        <Typography noWrap sx={{ maxWidth: 150 }}>
                          {request.rejection_reason || '-'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                  )}
                  <TableCell align="center">
                    <Tooltip title="View Details">
                      <IconButton size="small" onClick={() => navigate(`/finance/requests/${request.id}`)}>
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                    {showActions && (
                      <>
                        <Tooltip title="Approve">
                          <IconButton size="small" color="success" onClick={() => handleOpenDialog(request, 'approve')}>
                            <ApproveIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reject">
                          <IconButton size="small" color="error" onClick={() => handleOpenDialog(request, 'reject')}>
                            <RejectIcon />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {type === 'approved' && canReverse && (
                      <Tooltip title="Reverse Approval (within 5h window)">
                        <IconButton size="small" color="warning" onClick={() => handleOpenDialog(request, 'reverse')}>
                          <ReverseIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header with Stats */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>Approvals Management</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Review requests, approve or reject, and track all approval history.
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                <Typography variant="h4" color="warning.main">{stats.pending}</Typography>
                <Typography variant="body2" color="text.secondary">Pending</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                <Typography variant="h4" color="success.main">{stats.approved}</Typography>
                <Typography variant="body2" color="text.secondary">Approved</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                <Typography variant="h4" color="error.main">{stats.rejected}</Typography>
                <Typography variant="body2" color="text.secondary">Rejected</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                <Typography variant="h4" color="primary.main">{stats.total}</Typography>
                <Typography variant="body2" color="text.secondary">Total</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabs */}
      <Paper elevation={2} sx={{ p: 2 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label={<Badge badgeContent={stats.pending} color="warning">Pending Approvals</Badge>} />
          <Tab label={<Badge badgeContent={stats.approved} color="success">Approved</Badge>} />
          <Tab label={<Badge badgeContent={stats.rejected} color="error">Rejected</Badge>} />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          {renderRequestsTable(pendingRequests, true, 'pending')}
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          {renderRequestsTable(approvedRequests, false, 'approved')}
        </TabPanel>
        <TabPanel value={tabValue} index={2}>
          {renderRequestsTable(rejectedRequests, false, 'rejected')}
        </TabPanel>
      </Paper>

      {/* Approval/Rejection/Reversal Dialog */}
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          {dialogAction === 'approve' ? 'Approve Request' : dialogAction === 'reject' ? 'Reject Request' : 'Reverse Approval'}
        </DialogTitle>
        <DialogContent>
          {isLoadingDetails ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : selectedRequest && (
            <Box>
              {/* Request Header Info */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="body2" color="text.secondary">Request Number</Typography>
                      <Typography fontWeight="medium" variant="h6">{selectedRequest.request_code}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={4}>
                      <Typography variant="body2" color="text.secondary">Status</Typography>
                      <Chip
                        label={selectedRequest.status.replace(/_/g, ' ')}
                        color={getStatusColor(selectedRequest.status)}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={6} sm={4}>
                      <Typography variant="body2" color="text.secondary">Priority</Typography>
                      <Chip
                        label={selectedRequest.priority || 'MEDIUM'}
                        color={getPriorityColor(selectedRequest.priority || 'MEDIUM')}
                        size="small"
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Requester & Department Info */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle2" color="primary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonIcon fontSize="small" /> Requester Information
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="body2" color="text.secondary">Requester</Typography>
                      <Typography fontWeight="medium">
                        {selectedRequest.requester_first_name} {selectedRequest.requester_last_name}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="body2" color="text.secondary">Department</Typography>
                      <Box display="flex" alignItems="center" gap={1}>
                        <BusinessIcon fontSize="small" color="action" />
                        <Typography>{fullRequestDetails?.department_name || selectedRequest.department_name}</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography variant="body2" color="text.secondary">Submitted</Typography>
                      <Typography>
                        {selectedRequest.submitted_at
                          ? format(new Date(selectedRequest.submitted_at), 'MMM d, yyyy HH:mm')
                          : format(new Date(selectedRequest.created_at), 'MMM d, yyyy HH:mm')}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Justification */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle2" color="primary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DescriptionIcon fontSize="small" /> Justification
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {fullRequestDetails?.justification || selectedRequest.justification || 'No justification provided'}
                  </Typography>
                </CardContent>
              </Card>

              {/* Request Items Table */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle2" color="primary" gutterBottom>
                    Request Items ({requestItems.length})
                  </Typography>
                  {requestItems.length > 0 ? (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Description</TableCell>
                            <TableCell align="center">Qty</TableCell>
                            <TableCell align="right">Unit Price</TableCell>
                            <TableCell>Budget Line</TableCell>
                            <TableCell align="right">Total</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {requestItems.map((item, index) => (
                            <TableRow key={item.id || index}>
                              <TableCell>{item.item_description || item.description}</TableCell>
                              <TableCell align="center">{item.quantity} {item.unit_of_measure}</TableCell>
                              <TableCell align="right">
                                ${Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell>
                                <Chip label={item.budget_code || 'N/A'} size="small" variant="outlined" />
                              </TableCell>
                              <TableCell align="right">
                                ${(Number(item.unit_price || 0) * Number(item.quantity || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={4} align="right"><strong>Total Amount:</strong></TableCell>
                            <TableCell align="right">
                              <Typography fontWeight="bold" color="primary">
                                ${Number(selectedRequest.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Typography color="text.secondary" variant="body2">No items found</Typography>
                  )}
                </CardContent>
              </Card>

              <Divider sx={{ my: 2 }} />

              {dialogAction === 'approve' && budgetImpact.length > 0 && (
                <Box mb={2}>
                  <Typography variant="subtitle1" fontWeight="medium" gutterBottom>Budget Impact</Typography>
                  {budgetImpact.map((impact) => (
                    <Card key={impact.budget_line_id} variant="outlined" sx={{ mb: 1, borderColor: impact.hasInsufficientFunds ? 'error.main' : 'grey.300' }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography fontWeight="medium">{impact.budget_code} - {impact.budget_name}</Typography>
                          {impact.hasInsufficientFunds && <Chip icon={<WarningIcon />} label="Insufficient" color="error" size="small" />}
                        </Box>
                        <Grid container spacing={2} mt={0.5}>
                          <Grid item xs={4}>
                            <Typography variant="caption" color="text.secondary">Current</Typography>
                            <Typography>${Number(impact.current_balance || 0).toLocaleString()}</Typography>
                          </Grid>
                          <Grid item xs={4}>
                            <Typography variant="caption" color="text.secondary">Requested</Typography>
                            <Typography color="error">-${Number(impact.requested_amount || 0).toLocaleString()}</Typography>
                          </Grid>
                          <Grid item xs={4}>
                            <Typography variant="caption" color="text.secondary">After</Typography>
                            <Typography color={impact.hasInsufficientFunds ? 'error' : 'success.main'}>
                              ${Number(impact.balanceAfterApproval || 0).toLocaleString()}
                            </Typography>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}

              {dialogAction === 'approve' && budgetImpact.some(bi => bi.hasInsufficientFunds) && (
                <Alert severity="error" sx={{ mb: 2 }}>Cannot approve - insufficient funds in one or more budget lines.</Alert>
              )}

              {dialogAction === 'reverse' && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  You are about to reverse your approval. This will move the request back to the previous stage.
                </Alert>
              )}

              <TextField
                label={dialogAction === 'approve' ? 'Comments (optional)' : dialogAction === 'reject' ? 'Reason for rejection (required)' : 'Reason for reversal'}
                multiline
                rows={3}
                fullWidth
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                required={dialogAction === 'reject'}
                error={dialogAction === 'reject' && !comments}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
          <Button
            variant="contained"
            color={dialogAction === 'approve' ? 'success' : dialogAction === 'reject' ? 'error' : 'warning'}
            onClick={handleSubmit}
            disabled={isSubmitting || (dialogAction === 'reject' && !comments) || (dialogAction === 'approve' && budgetImpact.some(bi => bi.hasInsufficientFunds))}
            startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : (dialogAction === 'approve' ? <ApproveIcon /> : dialogAction === 'reject' ? <RejectIcon /> : <ReverseIcon />)}
          >
            {dialogAction === 'approve' ? 'Approve' : dialogAction === 'reject' ? 'Reject' : 'Reverse'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApprovalsPage;
