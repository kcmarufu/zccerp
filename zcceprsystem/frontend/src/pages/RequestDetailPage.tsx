/**
 * Request Detail Page Component
 * Shows full request details, items, approval trail, and actions
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Card,
  CardContent,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  Send as SendIcon,
  Download as DownloadIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  LocalShipping as DispatchIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Undo as ReverseIcon,
  AccessTime as TimeIcon
} from '@mui/icons-material';

import { useAuthStore } from '../store/authStore';
import { requestService } from '../services/requestService';
import { approvalService } from '../services/approvalService';
import { exportService } from '../services/exportService';
import attachmentService, { Attachment } from '../services/attachmentService';
import { Request, RequestItem, ApprovalLog, RequestStatus } from '../types';

const APPROVAL_STEPS = [
  { status: 'PENDING_LEAD_APPROVAL', label: 'Program Lead / HOP Review' },
  { status: 'PENDING_FINANCE_APPROVAL', label: 'Finance Clerk Review' },
  { status: 'APPROVED', label: 'Approved' }
];

const RequestDetailPage: React.FC = () => {
  const { id, requestId: routeRequestId } = useParams<{ id: string; requestId: string }>();
  const requestId = id || routeRequestId;
  const navigate = useNavigate();
  const { user, hasRole, hasPermission } = useAuthStore();

  const [request, setRequest] = useState<Request | null>(null);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [approvalLogs, setApprovalLogs] = useState<ApprovalLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialogs
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [approveComment, setApproveComment] = useState('');
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [reverseComment, setReverseComment] = useState('');
  const [reversalInfo, setReversalInfo] = useState<{ canReverse: boolean; hoursRemaining?: string } | null>(null);
  const [showAllApprovalLogs, setShowAllApprovalLogs] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  useEffect(() => {
    if (requestId) {
      fetchRequestDetails();
      fetchAttachments();
    }
  }, [requestId]);

  const fetchAttachments = async () => {
    try {
      setAttachmentsLoading(true);
      const data = await attachmentService.getEntityAttachments('REQUEST', parseInt(requestId!));
      setAttachments(data);
    } catch (err) {
      console.log('Failed to fetch attachments');
    } finally {
      setAttachmentsLoading(false);
    }
  };

  const handleDownloadAttachment = async (attachment: Attachment) => {
    try {
      await attachmentService.downloadAttachment(attachment.id, attachment.original_name);
    } catch (err) {
      setError('Failed to download attachment');
    }
  };

  const fetchRequestDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await requestService.getById(parseInt(requestId!));

      if (response.success && response.data) {
        // Handle both response structures
        const data = response.data as any;
        if (data.request) {
          setRequest(data.request);
          setItems(data.items || []);
          setApprovalLogs(data.approvalLogs || []);
        } else {
          setRequest(data);
          setItems(data.items || []);
          setApprovalLogs(data.approvalTrail || []);
        }

        // Check if reversal is possible for approvers
        if (hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK')) {
          try {
            const reversalResponse = await approvalService.canReverseApproval(requestId!);
            if (reversalResponse.success && reversalResponse.data) {
              setReversalInfo(reversalResponse.data);
            }
          } catch (err) {
            // Silently fail - reversal check is optional
            console.log('Reversal check not available');
          }
        }
      } else {
        setError(response.message || 'Failed to fetch request details');
      }
    } catch (err) {
      setError('An error occurred while fetching request details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitForApproval = async () => {
    try {
      setIsSubmitting(true);
      const response = await requestService.submit(requestId!);
      if (response.success) {
        fetchRequestDetails();
      } else {
        setError(response.message || 'Failed to submit request');
      }
    } catch (err) {
      setError('An error occurred while submitting');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    try {
      setIsSubmitting(true);
      const response = await approvalService.approve(requestId!, {
        action: 'APPROVED',
        comments: approveComment,
        version: request?.version || 1
      });
      if (response.success) {
        setShowApproveDialog(false);
        setApproveComment('');
        fetchRequestDetails();
      } else {
        setError(response.message || 'Failed to approve request');
      }
    } catch (err) {
      setError('An error occurred while approving');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectComment.trim()) {
      setError('Rejection reason is required');
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await approvalService.reject(requestId!, {
        action: 'REJECTED',
        comments: rejectComment,
        version: request?.version || 1
      });
      if (response.success) {
        setShowRejectDialog(false);
        setRejectComment('');
        fetchRequestDetails();
      } else {
        setError(response.message || 'Failed to reject request');
      }
    } catch (err) {
      setError('An error occurred while rejecting');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispatch = async () => {
    try {
      setIsSubmitting(true);
      const response = await approvalService.dispatch(requestId!);
      if (response.success) {
        fetchRequestDetails();
      } else {
        setError(response.message || 'Failed to dispatch');
      }
    } catch (err) {
      setError('An error occurred while dispatching');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await exportService.downloadDispatchPdf(requestId!);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dispatch-${request?.request_code}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to download PDF');
    }
  };

  const handleDownloadExcel = async () => {
    try {
      const blob = await exportService.downloadDispatchExcel(requestId!);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dispatch-${request?.request_code}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to download Excel');
    }
  };

  const getStatusColor = (status: RequestStatus): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    switch (status) {
      case 'APPROVED':
        return 'success';
      case 'REJECTED':
        return 'error';
      case 'DRAFT':
        return 'default';
      case 'PENDING_LEAD_APPROVAL':
      case 'PENDING_HOP_APPROVAL':
      case 'PENDING_FINANCE_APPROVAL':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getActiveStep = () => {
    if (!request) return 0;
    const index = APPROVAL_STEPS.findIndex(s => s.status === request.status);
    return index >= 0 ? index : 0;
  };

  const canApprove = () => {
    if (!request || !user) return false;

    // Program Lead can approve PENDING_LEAD_APPROVAL requests from their department
    if (request.status === 'PENDING_LEAD_APPROVAL' && hasRole('PROGRAM_LEAD')) {
      return request.department_id === user.department_id;
    }

    // HOP can also approve PENDING_LEAD_APPROVAL requests (2-tier: either Lead or HOP)
    if (request.status === 'PENDING_LEAD_APPROVAL' && hasRole('HEAD_OF_PROGRAMS')) {
      return true;
    }

    // HOP can also approve legacy PENDING_HOP_APPROVAL requests
    if (request.status === 'PENDING_HOP_APPROVAL' && hasRole('HEAD_OF_PROGRAMS')) {
      return true;
    }

    // Finance Clerk can approve PENDING_FINANCE_APPROVAL requests
    if (request.status === 'PENDING_FINANCE_APPROVAL' && hasRole('FINANCE_CLERK')) {
      return true;
    }

    return false;
  };

  const canDispatch = () => {
    return request?.status === 'APPROVED' && hasRole('FINANCE_CLERK');
  };

  // Helper function to get approval log for a specific step
  const getApprovalForStep = (stepIndex: number): ApprovalLog | undefined => {
    // Map step index to the role that would approve at that step
    const roleMap: { [key: number]: string[] } = {
      0: ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS'], // Step 0: Lead or HOP Review
      1: ['FINANCE_CLERK']                      // Step 1: Finance Clerk Review
    };

    const expectedRoles = roleMap[stepIndex];
    if (!expectedRoles) return undefined;

    // Find an approval log where the approver's role matches and action is APPROVED
    return approvalLogs.find(log =>
      expectedRoles.includes(log.approver_role || log.actor_role || '') &&
      (log.action === 'APPROVED' || log.action === 'APPROVE')
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number | string | null | undefined) => {
    const numAmount = Number(amount || 0);
    return `$${numAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !request) {
    return (
      <Box>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/finance/requests')} sx={{ mb: 2 }}>
          Back to Requests
        </Button>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!request) {
    return null;
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <IconButton onClick={() => navigate('/finance/requests')}>
          <BackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ flex: 1 }}>
          Request {request.request_code}
        </Typography>
        <Chip
          label={request.status.replace(/_/g, ' ')}
          color={getStatusColor(request.status)}
          size="medium"
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Request Info */}
        <Grid item xs={12} md={8}>
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Request Information
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  Request Number
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {request.request_code}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  Department
                </Typography>
                <Typography variant="body1">
                  {request.department_name}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  Created By
                </Typography>
                <Typography variant="body1">
                  {request.requester_first_name} {request.requester_last_name}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  Created Date
                </Typography>
                <Typography variant="body1">
                  {formatDate(request.created_at)}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  Priority
                </Typography>
                <Chip label={request.priority} size="small" color={request.priority === 'URGENT' ? 'error' : request.priority === 'HIGH' ? 'warning' : 'default'} />
              </Grid>
              {request.justification && (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Justification
                  </Typography>
                  <Typography variant="body1">
                    {request.justification}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>

          {/* Items Table */}
          <Paper elevation={2} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Request Items
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Budget Line</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Subtotal</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{item.budget_code}</TableCell>
                      <TableCell>{item.description || item.item_description}</TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell>{item.unit_of_measure}</TableCell>
                      <TableCell align="right">{formatCurrency(item.unit_price)}</TableCell>
                      <TableCell align="right">{formatCurrency(item.subtotal || item.total_price || (item.quantity * item.unit_price))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={6} align="right">
                      <Typography fontWeight="bold">Total:</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight="bold">
                        {formatCurrency(request.total_amount)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Attachments Section */}
          <Paper elevation={2} sx={{ p: 3, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Attachments & Documents
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {attachmentsLoading ? (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress size={24} />
              </Box>
            ) : attachments.length === 0 ? (
              <Typography color="text.secondary" textAlign="center" py={2}>
                No attachments uploaded for this request
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>File</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Uploaded By</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="center">Download</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {attachments.map((att) => (
                    <TableRow key={att.id}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body2">
                            {attachmentService.getFileIcon(att.file_type)} {att.original_name}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {attachmentService.formatFileSize(att.file_size)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={att.attachment_type} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {att.first_name} {att.last_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatDate(att.uploaded_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Download">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleDownloadAttachment(att)}
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          {/* Actions */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Actions
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box display="flex" flexDirection="column" gap={2}>
              {/* Draft Actions */}
              {request.status === 'DRAFT' && request.requester_id === user?.id && (
                <>
                  <Button
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => navigate(`/finance/requests/${requestId}/edit`)}
                    fullWidth
                  >
                    Edit Request
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<SendIcon />}
                    onClick={handleSubmitForApproval}
                    disabled={isSubmitting}
                    fullWidth
                  >
                    Submit for Approval
                  </Button>
                </>
              )}

              {/* Approval Actions */}
              {canApprove() && (
                <>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<ApproveIcon />}
                    onClick={() => setShowApproveDialog(true)}
                    disabled={isSubmitting}
                    fullWidth
                  >
                    Approve
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<RejectIcon />}
                    onClick={() => setShowRejectDialog(true)}
                    disabled={isSubmitting}
                    fullWidth
                  >
                    Reject
                  </Button>
                </>
              )}

              {/* Dispatch Action */}
              {canDispatch() && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<DispatchIcon />}
                  onClick={handleDispatch}
                  disabled={isSubmitting}
                  fullWidth
                >
                  Mark as Dispatched
                </Button>
              )}

              {/* Export Actions */}
              {request.status === 'APPROVED' && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    Export Documents
                  </Typography>
                  <Box display="flex" gap={1}>
                    <Button
                      variant="outlined"
                      startIcon={<PdfIcon />}
                      onClick={handleDownloadPdf}
                      sx={{ flex: 1 }}
                    >
                      PDF
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<ExcelIcon />}
                      onClick={handleDownloadExcel}
                      sx={{ flex: 1 }}
                    >
                      Excel
                    </Button>
                  </Box>
                </>
              )}

              {/* No Actions Available */}
              {!canApprove() && !canDispatch() && 
               request.status !== 'APPROVED' && request.status !== 'DRAFT' && (
                <Typography color="text.secondary" textAlign="center">
                  No actions available
                </Typography>
              )}
            </Box>
          </Paper>

          {/* Approval Progress */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Approval Progress
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {request.status === 'REJECTED' ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography fontWeight="medium">Request was rejected</Typography>
                {approvalLogs.filter(l => l.action === 'REJECTED').map(log => (
                  <Box key={log.id} sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      By: {log.actor_name || `${log.approver_first_name} ${log.approver_last_name}`} ({log.actor_role?.replace(/_/g, ' ') || log.approver_role?.replace(/_/g, ' ')})
                    </Typography>
                    <Typography variant="body2">
                      Date: {formatDate(log.created_at)}
                    </Typography>
                    {(log.comment || log.comments) && (
                      <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                        Reason: "{log.comment || log.comments}"
                      </Typography>
                    )}
                  </Box>
                ))}
              </Alert>
            ) : (
              <Stepper activeStep={getActiveStep()} orientation="vertical">
                {APPROVAL_STEPS.map((step, index) => {
                  const stepApproval = getApprovalForStep(index);
                  const isCompleted = index < getActiveStep();
                  const isCurrent = index === getActiveStep();

                  return (
                    <Step key={step.status}>
                      <StepLabel>
                        <Box>
                          <Typography fontWeight={isCurrent ? 'bold' : 'normal'}>{step.label}</Typography>
                          {isCompleted && stepApproval && (
                            <Typography variant="caption" color="success.main">
                              ✓ Approved by {stepApproval.actor_name || stepApproval.approver_first_name}
                            </Typography>
                          )}
                        </Box>
                      </StepLabel>
                      <StepContent>
                        <Typography variant="body2" color="text.secondary">
                          {isCurrent ? 'Awaiting approval...' : 'Completed'}
                        </Typography>
                        {isCompleted && stepApproval && stepApproval.created_at && (
                          <Box sx={{ mt: 1, p: 1, bgcolor: 'success.light', borderRadius: 1 }}>
                            <Typography variant="caption">
                              {formatDate(stepApproval.created_at)}
                            </Typography>
                            {(stepApproval.comment || stepApproval.comments) && (
                              <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                                "{stepApproval.comment || stepApproval.comments}"
                              </Typography>
                            )}
                          </Box>
                        )}
                      </StepContent>
                    </Step>
                  );
                })}
              </Stepper>
            )}
          </Paper>

          {/* Approval Trail */}
          <Paper elevation={2} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Approval Trail
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Complete history of all actions taken on this request
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {approvalLogs.length === 0 ? (
              <Typography color="text.secondary">
                No approval actions yet
              </Typography>
            ) : (
              <Box>
                {(showAllApprovalLogs ? approvalLogs : approvalLogs.slice(0, 2)).map((log, index) => {
                  const getActionColor = (action: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
                    if (action === 'APPROVED' || action === 'APPROVE') return 'success';
                    if (action === 'REJECTED' || action === 'REJECT') return 'error';
                    if (action === 'REVERSED') return 'warning';
                    if (action === 'SUBMITTED') return 'info';
                    return 'default';
                  };

                  const getActionIcon = (action: string) => {
                    if (action === 'APPROVED' || action === 'APPROVE') return '✓';
                    if (action === 'REJECTED' || action === 'REJECT') return '✗';
                    if (action === 'REVERSED') return '↩';
                    if (action === 'SUBMITTED') return '→';
                    return '•';
                  };

                  return (
                    <Card
                      key={log.id}
                      variant="outlined"
                      sx={{
                        mb: 2,
                        borderLeft: 4,
                        borderLeftColor: `${getActionColor(log.action)}.main`
                      }}
                    >
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Chip
                              label={`${getActionIcon(log.action)} ${log.action}`}
                              size="small"
                              color={getActionColor(log.action)}
                            />
                            <Typography variant="body2" fontWeight="medium">
                              {log.actor_name || `${log.approver_first_name} ${log.approver_last_name}`}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(log.created_at)}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {(log.actor_role || log.approver_role)?.replace(/_/g, ' ')}
                        </Typography>
                        {log.previous_status && log.new_status && (
                          <Box sx={{ mt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              Status: {log.previous_status.replace(/_/g, ' ')} → {log.new_status.replace(/_/g, ' ')}
                            </Typography>
                          </Box>
                        )}
                        {(log.comment || log.comments) && (
                          <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                              "{log.comment || log.comments}"
                            </Typography>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {approvalLogs.length > 2 && (
                  <Box textAlign="center" mt={1}>
                    <Button
                      size="small"
                      onClick={() => setShowAllApprovalLogs(!showAllApprovalLogs)}
                    >
                      {showAllApprovalLogs ? 'Show Less' : `View All (${approvalLogs.length} entries)`}
                    </Button>
                  </Box>
                )}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onClose={() => setShowApproveDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Approve Request</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Are you sure you want to approve this request?
          </Typography>
          <TextField
            label="Comment (optional)"
            fullWidth
            multiline
            rows={3}
            value={approveComment}
            onChange={(e) => setApproveComment(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowApproveDialog(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            variant="contained"
            color="success"
            disabled={isSubmitting}
          >
            {isSubmitting ? <CircularProgress size={24} /> : 'Approve'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onClose={() => setShowRejectDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Request</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Please provide a reason for rejecting this request.
          </Typography>
          <TextField
            label="Rejection Reason"
            fullWidth
            multiline
            rows={3}
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            required
            error={!rejectComment.trim()}
            helperText={!rejectComment.trim() ? 'Reason is required' : ''}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRejectDialog(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleReject}
            variant="contained"
            color="error"
            disabled={isSubmitting || !rejectComment.trim()}
          >
            {isSubmitting ? <CircularProgress size={24} /> : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RequestDetailPage;
