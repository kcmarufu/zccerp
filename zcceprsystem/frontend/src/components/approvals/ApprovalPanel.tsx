/**
 * Approval Panel Component
 * Shows pending approvals for approvers with budget impact preview
 */

import React, { useState, useEffect } from 'react';
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
  LinearProgress
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Visibility as ViewIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

import { Request, BudgetImpact, ApprovalPayload } from '../../types';
import { approvalService } from '../../services/approvalService';
import attachmentService, { Attachment } from '../../services/attachmentService';
import { useAuthStore } from '../../store/authStore';

const ApprovalPanel: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [pendingRequests, setPendingRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [budgetImpact, setBudgetImpact] = useState<BudgetImpact[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<'approve' | 'reject'>('approve');
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestAttachments, setRequestAttachments] = useState<Attachment[]>([]);

  // Fetch pending approvals
  useEffect(() => {
    fetchPendingApprovals();
  }, []);

  const fetchPendingApprovals = async () => {
    try {
      setIsLoading(true);
      const response = await approvalService.getPendingApprovals();
      if (response.success && response.data) {
        setPendingRequests(response.data);
      }
    } catch (error) {
      toast.error('Failed to load pending approvals');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch budget impact when selecting a request
  const handleViewBudgetImpact = async (request: Request) => {
    setSelectedRequest(request);
    try {
      const response = await approvalService.getBudgetImpact(request.id);
      if (response.success && response.data) {
        setBudgetImpact(response.data);
      }
    } catch (error) {
      toast.error('Failed to load budget impact');
    }
  };

  // Open approval/rejection dialog
  const handleOpenDialog = (request: Request, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setDialogAction(action);
    setComments('');
    setIsDialogOpen(true);
    setRequestAttachments([]);
    
    // Fetch attachments for this request
    attachmentService.getEntityAttachments('REQUEST', request.id)
      .then(data => setRequestAttachments(data))
      .catch(() => console.log('Failed to fetch attachments'));
    
    if (action === 'approve') {
      handleViewBudgetImpact(request);
    }
  };

  // Submit approval/rejection
  const handleSubmit = async () => {
    if (!selectedRequest) return;

    // Check for insufficient funds on approval
    if (dialogAction === 'approve' && budgetImpact.some(bi => bi.hasInsufficientFunds)) {
      toast.error('Cannot approve: Insufficient budget funds');
      return;
    }

    try {
      setIsSubmitting(true);
      
      const payload: ApprovalPayload = {
        action: dialogAction === 'approve' ? 'APPROVED' : 'REJECTED',
        comments: comments || undefined,
        version: selectedRequest.version
      };

      const response = dialogAction === 'approve'
        ? await approvalService.approve(selectedRequest.id, payload)
        : await approvalService.reject(selectedRequest.id, payload);

      if (response.success) {
        toast.success(
          dialogAction === 'approve' 
            ? 'Request approved successfully' 
            : 'Request rejected'
        );
        setIsDialogOpen(false);
        fetchPendingApprovals();
      }
    } catch (error: any) {
      if (error.response?.data?.code === 'VERSION_CONFLICT') {
        toast.error('Request was modified by another user. Refreshing...');
        fetchPendingApprovals();
      } else if (error.response?.data?.code === 'INSUFFICIENT_BUDGET') {
        toast.error(error.response.data.error);
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

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Pending Approvals
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review and approve or reject procurement requests awaiting your action.
        </Typography>
      </Paper>

      {pendingRequests.length === 0 ? (
        <Paper elevation={1} sx={{ p: 4, textAlign: 'center' }}>
          <InfoIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No pending approvals
          </Typography>
          <Typography variant="body2" color="text.secondary">
            You're all caught up! Check back later for new requests.
          </Typography>
        </Paper>
      ) : (
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
                <TableCell sx={{ fontWeight: 'bold' }}>Submitted</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pendingRequests.map((request) => (
                <TableRow 
                  key={request.id}
                  hover
                  sx={{ '&:hover': { backgroundColor: 'grey.50' } }}
                >
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
                    <Typography fontWeight="medium">
                      ${parseFloat(String(request.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={request.priority} 
                      color={getPriorityColor(request.priority)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={request.status.replace(/_/g, ' ')} 
                      color={getStatusColor(request.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {request.submitted_at 
                      ? format(new Date(request.submitted_at), 'MMM d, yyyy HH:mm')
                      : '-'}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="View Details">
                      <IconButton 
                        size="small"
                        onClick={() => navigate(`/finance/requests/${request.id}`)}
                      >
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Approve">
                      <IconButton 
                        size="small" 
                        color="success"
                        onClick={() => handleOpenDialog(request, 'approve')}
                      >
                        <ApproveIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Reject">
                      <IconButton 
                        size="small" 
                        color="error"
                        onClick={() => handleOpenDialog(request, 'reject')}
                      >
                        <RejectIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Approval/Rejection Dialog */}
      <Dialog 
        open={isDialogOpen} 
        onClose={() => setIsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {dialogAction === 'approve' ? 'Approve Request' : 'Reject Request'}
        </DialogTitle>
        <DialogContent>
          {selectedRequest && (
            <Box>
              {/* Request Summary */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Request Number</Typography>
                      <Typography fontWeight="medium">{selectedRequest.request_code}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Total Amount</Typography>
                      <Typography fontWeight="medium">
                        ${parseFloat(String(selectedRequest.total_amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">Justification</Typography>
                      <Typography>{selectedRequest.justification}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Budget Impact Preview (for approvals) */}
              {dialogAction === 'approve' && budgetImpact.length > 0 && (
                <Box mb={2}>
                  <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                    Budget Impact Preview
                  </Typography>
                  {budgetImpact.map((impact) => (
                    <Card 
                      key={impact.budget_line_id} 
                      variant="outlined" 
                      sx={{ 
                        mb: 1,
                        borderColor: impact.hasInsufficientFunds ? 'error.main' : 'grey.300'
                      }}
                    >
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                          <Typography fontWeight="medium">
                            {impact.budget_code} - {impact.budget_name}
                          </Typography>
                          {impact.hasInsufficientFunds && (
                            <Chip 
                              icon={<WarningIcon />} 
                              label="Insufficient Funds" 
                              color="error" 
                              size="small"
                            />
                          )}
                        </Box>
                        <Grid container spacing={2}>
                          <Grid item xs={3}>
                            <Typography variant="caption" color="text.secondary">Current Balance</Typography>
                            <Typography>${impact.current_balance.toLocaleString()}</Typography>
                          </Grid>
                          <Grid item xs={3}>
                            <Typography variant="caption" color="text.secondary">Requested</Typography>
                            <Typography color="error">-${impact.requested_amount.toLocaleString()}</Typography>
                          </Grid>
                          <Grid item xs={3}>
                            <Typography variant="caption" color="text.secondary">After Approval</Typography>
                            <Typography color={impact.hasInsufficientFunds ? 'error' : 'success.main'}>
                              ${impact.balanceAfterApproval.toLocaleString()}
                            </Typography>
                          </Grid>
                          <Grid item xs={3}>
                            <Typography variant="caption" color="text.secondary">Utilization</Typography>
                            <Box display="flex" alignItems="center" gap={1}>
                              <LinearProgress 
                                variant="determinate" 
                                value={Math.min(parseFloat(impact.utilizationAfterPercent), 100)}
                                color={parseFloat(impact.utilizationAfterPercent) > 90 ? 'error' : 'primary'}
                                sx={{ flex: 1, height: 8, borderRadius: 4 }}
                              />
                              <Typography variant="body2">{impact.utilizationAfterPercent}%</Typography>
                            </Box>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}

              {/* Insufficient Budget Warning */}
              {dialogAction === 'approve' && budgetImpact.some(bi => bi.hasInsufficientFunds) && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <strong>Cannot Approve:</strong> One or more budget lines have insufficient funds. 
                  The request must be rejected or the budget must be topped up first.
                </Alert>
              )}

              {/* Attached Documents */}
              {requestAttachments.length > 0 && (
                <Box mb={2}>
                  <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                    Attached Documents
                  </Typography>
                  {requestAttachments.map((att) => (
                    <Card key={att.id} variant="outlined" sx={{ mb: 1 }}>
                      <CardContent sx={{ py: 1, '&:last-child': { pb: 1 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {attachmentService.getFileIcon(att.file_type)} {att.original_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {att.attachment_type} &bull; {attachmentService.formatFileSize(att.file_size)} &bull; Uploaded by {att.first_name} {att.last_name}
                          </Typography>
                        </Box>
                        <Tooltip title="Download">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => attachmentService.downloadAttachment(att.id, att.original_name)}
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}

              {/* Comments Field */}
              <TextField
                label={dialogAction === 'approve' ? 'Comments (optional)' : 'Reason for rejection'}
                multiline
                rows={3}
                fullWidth
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                required={dialogAction === 'reject'}
                error={dialogAction === 'reject' && !comments}
                helperText={dialogAction === 'reject' && !comments ? 'Please provide a reason for rejection' : ''}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={dialogAction === 'approve' ? 'success' : 'error'}
            onClick={handleSubmit}
            disabled={
              isSubmitting || 
              (dialogAction === 'reject' && !comments) ||
              (dialogAction === 'approve' && budgetImpact.some(bi => bi.hasInsufficientFunds))
            }
            startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : 
              (dialogAction === 'approve' ? <ApproveIcon /> : <RejectIcon />)}
          >
            {dialogAction === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApprovalPanel;
