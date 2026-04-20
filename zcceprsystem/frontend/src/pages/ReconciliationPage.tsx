/**
 * Reconciliation Page
 * - Requesters: reconcile dispatched requests with receipt/invoice uploads
 * - Requesters: view all their reconciliations (approved, rejected, pending)
 * - Finance: review, approve/reject reconciliation submissions
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Tabs, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Button, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid,
  IconButton, Tooltip, Alert, Divider, Card, CardContent, InputAdornment,
  useTheme, alpha, List, ListItem, ListItemIcon, ListItemText
} from '@mui/material';
import {
  Receipt as ReconcileIcon,
  Visibility as ViewIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Send as SubmitIcon,
  LocalShipping as DispatchIcon,
  History as HistoryIcon,
  CloudUpload as UploadIcon,
  AttachFile as AttachIcon,
  InsertDriveFile as FileIcon,
  ListAlt as MyReconsIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

import { useAuthStore } from '../store/authStore';
import { reconciliationService } from '../services/reconciliationService';
import { requestService } from '../services/requestService';
import attachmentService from '../services/attachmentService';
import { Request, RequestItem } from '../types';

interface ReconciliationFormItem {
  requestItemId?: number;
  description: string;
  budgetedAmount: number;
  actualAmount: number;
  notes: string;
}

const ReconciliationPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user, hasRole } = useAuthStore();
  const isFinance = hasRole('FINANCE_CLERK');
  const isLead = hasRole('PROGRAM_LEAD');
  const isHOP = hasRole('HEAD_OF_PROGRAMS');
  const isLeadOrHOP = isLead || isHOP;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState(0);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [myReconciliations, setMyReconciliations] = useState<any[]>([]);
  const [pendingLeadReviews, setPendingLeadReviews] = useState<any[]>([]);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Reconciliation form dialog
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [requestItems, setRequestItems] = useState<RequestItem[]>([]);
  const [formItems, setFormItems] = useState<ReconciliationFormItem[]>([]);
  const [formNotes, setFormNotes] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Review dialog
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<any>(null);
  const [reviewReconciliation, setReviewReconciliation] = useState<any>(null);
  const [reviewComments, setReviewComments] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewMode, setReviewMode] = useState<'lead' | 'finance'>('finance');

  // View reconciliation detail dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewReconciliation, setViewReconciliation] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch user's dispatched requests (for reconciliation)
      try {
        const myRes = await reconciliationService.getMyDispatchedRequests();
        if (myRes.success && myRes.data) {
          setMyRequests(myRes.data);
        }
      } catch (err) {
        console.error('Error fetching my dispatched requests:', err);
      }

      // Fetch user's submitted reconciliations (all statuses)
      try {
        const reconRes = await reconciliationService.getMyReconciliations();
        if (reconRes.success && reconRes.data) {
          setMyReconciliations(reconRes.data);
        }
      } catch (err) {
        console.error('Error fetching my reconciliations:', err);
      }

      // Lead/HOP: fetch pending reconciliations for lead review
      if (isLeadOrHOP) {
        try {
          const leadRes = await reconciliationService.getPendingLeadReconciliations();
          if (leadRes.success && leadRes.data) {
            setPendingLeadReviews(leadRes.data);
          }
        } catch (err) {
          console.error('Error fetching pending lead reconciliations:', err);
        }
      }

      // Finance: fetch pending reconciliations
      if (isFinance) {
        try {
          const pendingRes = await reconciliationService.getPendingReconciliations();
          if (pendingRes.success && pendingRes.data) {
            setPendingReviews(pendingRes.data);
          }
        } catch (err) {
          console.error('Error fetching pending reconciliations:', err);
        }

        try {
          const historyRes = await reconciliationService.getReconciliationHistory();
          if (historyRes.success && historyRes.data) {
            setHistory(historyRes.data);
          }
        } catch (err) {
          console.error('Error fetching reconciliation history:', err);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [isFinance, isLeadOrHOP]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openReconciliationForm = async (request: any) => {
    try {
      const response = await requestService.getById(request.id);
      if (response.success && response.data) {
        setSelectedRequest(response.data);
        const items: RequestItem[] = response.data.items || [];
        setRequestItems(items);
        setFormItems(
          items.map(item => ({
            requestItemId: item.id,
            description: item.item_description || item.description || '',
            budgetedAmount: (item.quantity || 1) * (item.unit_price || 0),
            actualAmount: 0,
            notes: ''
          }))
        );
        setFormNotes('');
        setUploadedFiles([]);
        setFormOpen(true);
      }
    } catch (error) {
      toast.error('Failed to load request details');
    }
  };

  const addFormItem = () => {
    // Disabled - users cannot add items during reconciliation
    toast.warning('You cannot add new items during reconciliation. Only reconcile existing approved items.');
  };

  const removeFormItem = (index: number) => {
    // Disabled - users cannot delete items during reconciliation
    toast.warning('You cannot remove items from an approved request during reconciliation.');
  };

  const updateFormItem = (index: number, field: keyof ReconciliationFormItem, value: any) => {
    // Only allow editing actualAmount and notes - not description or budgetedAmount
    if (field === 'description' || field === 'budgetedAmount') {
      toast.warning('You cannot modify the original request details during reconciliation.');
      return;
    }
    setFormItems(formItems.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    const newFiles = Array.from(files);
    const validFiles = newFiles.filter(f => {
      if (f.size > 10 * 1024 * 1024) {
        toast.warning(`${f.name} exceeds 10MB limit`);
        return false;
      }
      return true;
    });
    setUploadedFiles(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const totalBudgeted = formItems.reduce((s, i) => s + (Number(i.budgetedAmount) || 0), 0);
  const totalActual = formItems.reduce((s, i) => s + (Number(i.actualAmount) || 0), 0);
  const totalVariance = totalBudgeted - totalActual;

  const handleSubmitReconciliation = async () => {
    if (!selectedRequest) return;
    if (formItems.length === 0) {
      toast.warning('Please add at least one reconciliation item');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        items: formItems.map(item => ({
          requestItemId: item.requestItemId,
          description: item.description,
          budgetedAmount: Number(item.budgetedAmount),
          actualAmount: Number(item.actualAmount),
          notes: item.notes || undefined
        })),
        notes: formNotes || undefined,
        totalSpent: totalActual,
        totalReturned: Math.max(0, totalVariance)
      };

      const result = await reconciliationService.submitReconciliation(selectedRequest.id, payload);
      if (result.success) {
        // Upload receipts/invoices if any
        if (uploadedFiles.length > 0) {
          try {
            for (const file of uploadedFiles) {
              const isReceipt = file.name.toLowerCase().includes('receipt');
              await attachmentService.uploadAttachment({
                file,
                attachment_type: isReceipt ? 'RECEIPT' : 'INVOICE',
                entity_type: 'REQUEST',
                entity_id: selectedRequest.id,
                description: `Reconciliation - ${file.name}`
              });
            }
          } catch (uploadErr) {
            console.error('Some files failed to upload:', uploadErr);
            toast.warning('Reconciliation submitted but some files failed to upload');
          }
        }
        toast.success('Reconciliation submitted successfully');
        setFormOpen(false);
        fetchData();
      } else {
        toast.error(result.error || 'Failed to submit reconciliation');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to submit reconciliation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openReviewDialog = async (request: any, mode: 'lead' | 'finance' = 'finance') => {
    setReviewRequest(request);
    setReviewComments('');
    setReviewMode(mode);
    try {
      const reconRes = await reconciliationService.getReconciliation(request.id);
      if (reconRes.success && reconRes.data) {
        setReviewReconciliation(reconRes.data);
      }
    } catch (err) {
      console.error('Error fetching reconciliation:', err);
    }
    setReviewOpen(true);
  };

  const openViewDialog = async (recon: any) => {
    try {
      const reconRes = await reconciliationService.getReconciliation(recon.request_id || recon.id);
      if (reconRes.success && reconRes.data) {
        setViewReconciliation({ ...reconRes.data, request_code: recon.request_code });
      } else {
        setViewReconciliation(recon);
      }
    } catch (err) {
      setViewReconciliation(recon);
    }
    setViewOpen(true);
  };

  const handleApproveReconciliation = async () => {
    if (!reviewRequest) return;
    try {
      setIsReviewing(true);
      const result = await reconciliationService.approveReconciliation(reviewRequest.id, reviewComments);
      if (result.success) {
        toast.success('Reconciliation approved');
        setReviewOpen(false);
        fetchData();
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to approve');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleRejectReconciliation = async () => {
    if (!reviewRequest) return;
    if (!reviewComments.trim()) {
      toast.warning('Please provide a reason for rejection');
      return;
    }
    try {
      setIsReviewing(true);
      const result = await reconciliationService.rejectReconciliation(reviewRequest.id, reviewComments);
      if (result.success) {
        toast.success('Reconciliation rejected. Requester can resubmit.');
        setReviewOpen(false);
        fetchData();
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to reject');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleLeadApproveReconciliation = async () => {
    if (!reviewRequest) return;
    try {
      setIsReviewing(true);
      const result = await reconciliationService.approveReconciliationAsLead(reviewRequest.id, reviewComments);
      if (result.success) {
        toast.success('Reconciliation approved - sent to Finance for final review');
        setReviewOpen(false);
        fetchData();
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to approve');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleLeadRejectReconciliation = async () => {
    if (!reviewRequest) return;
    if (!reviewComments.trim()) {
      toast.warning('Please provide a reason for rejection');
      return;
    }
    try {
      setIsReviewing(true);
      const result = await reconciliationService.rejectReconciliationAsLead(reviewRequest.id, reviewComments);
      if (result.success) {
        toast.success('Reconciliation rejected. Requester can resubmit.');
        setReviewOpen(false);
        fetchData();
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to reject');
    } finally {
      setIsReviewing(false);
    }
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    switch (status) {
      case 'DISPATCHED': return 'info';
      case 'PENDING_RECONCILIATION': case 'SUBMITTED': case 'RECON_PENDING_LEAD': case 'RECON_PENDING_FINANCE': return 'warning';
      case 'RECONCILED': case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'DISPATCHED': return 'Awaiting Reconciliation';
      case 'RECON_PENDING_LEAD': return 'Pending Lead Approval';
      case 'RECON_PENDING_FINANCE': return 'Pending Finance Approval';
      case 'PENDING_RECONCILIATION': return 'Pending Review';
      case 'RECONCILED': return 'Reconciled';
      case 'SUBMITTED': return 'Pending Review';
      default: return status.replace(/_/g, ' ');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  }

  return (
    <Box>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: 3, mb: 3,
          background: `linear-gradient(135deg, ${theme.palette.info.main} 0%, ${theme.palette.info.dark} 100%)`,
          color: 'white', borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <ReconcileIcon sx={{ fontSize: 36 }} />
          <Box>
            <Typography variant="h5" fontWeight={600}>Reconciliation</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              {isFinance
                ? 'Review reconciliation submissions and manage fund returns'
                : 'Submit reconciliation for dispatched float requests & track status'}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Tabs */}
      <Paper elevation={0} sx={{ mb: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }} variant="scrollable" scrollButtons="auto">
          <Tab icon={<DispatchIcon />} label="My Requests" iconPosition="start" />
          <Tab icon={<MyReconsIcon />} label={`My Reconciliations (${myReconciliations.length})`} iconPosition="start" />
          {isLeadOrHOP && <Tab icon={<ReconcileIcon />} label={`Lead Review (${pendingLeadReviews.length})`} iconPosition="start" />}
          {isFinance && <Tab icon={<ReconcileIcon />} label={`Finance Review (${pendingReviews.length})`} iconPosition="start" />}
          {isFinance && <Tab icon={<HistoryIcon />} label="All History" iconPosition="start" />}
        </Tabs>
      </Paper>

      {/* Tab 0: My Requests (Dispatched + Reconciled) */}
      {activeTab === 0 && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {myRequests.length === 0 ? (
            <Box py={6} textAlign="center">
              <DispatchIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No dispatched or reconciled requests</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Request #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Department</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {myRequests.map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell><Typography fontWeight={500}>{req.request_code}</Typography></TableCell>
                      <TableCell><Chip label={req.department_code} size="small" variant="outlined" /></TableCell>
                      <TableCell>${Number(req.total_amount || 0).toLocaleString()}</TableCell>
                      <TableCell><Chip label={getStatusLabel(req.status)} color={getStatusColor(req.status)} size="small" /></TableCell>
                      <TableCell>{req.updated_at ? format(new Date(req.updated_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell align="center">
                        {req.status === 'DISPATCHED' ? (
                          <Button size="small" variant="contained" color="primary" startIcon={<ReconcileIcon />} onClick={() => openReconciliationForm(req)}>
                            Reconcile
                          </Button>
                        ) : req.status === 'RECONCILED' ? (
                          <Chip label="Reconciled" color="success" size="small" icon={<ApproveIcon />} />
                        ) : (
                          <Chip label={getStatusLabel(req.status)} color={getStatusColor(req.status)} size="small" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Tab 1: My Reconciliations */}
      {activeTab === 1 && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {myReconciliations.length === 0 ? (
            <Box py={6} textAlign="center">
              <MyReconsIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No reconciliations submitted yet</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Request #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Total Spent</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Returned</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Finance Comments</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Submitted</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {myReconciliations.map((recon) => (
                    <TableRow key={recon.id} hover>
                      <TableCell><Typography fontWeight={500}>{recon.request_code}</Typography></TableCell>
                      <TableCell sx={{ color: 'error.main', fontWeight: 500 }}>${Number(recon.total_spent || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'success.main', fontWeight: 500 }}>${Number(recon.total_returned || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusLabel(recon.status)}
                          color={getStatusColor(recon.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {recon.finance_comments || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>{recon.created_at ? format(new Date(recon.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="View Details">
                          <IconButton size="small" onClick={() => openViewDialog(recon)}><ViewIcon /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Tab 2: Lead/HOP Pending Reviews */}
      {activeTab === 2 && isLeadOrHOP && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {pendingLeadReviews.length === 0 ? (
            <Box py={6} textAlign="center">
              <ReconcileIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No reconciliations pending your review</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Request #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Dept</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Float Amount</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Spent</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Returned</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Submitted</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingLeadReviews.map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell><Typography fontWeight={500}>{req.request_code}</Typography></TableCell>
                      <TableCell>{req.requester_first_name} {req.requester_last_name}</TableCell>
                      <TableCell><Chip label={req.department_code} size="small" variant="outlined" /></TableCell>
                      <TableCell>${Number(req.total_amount || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'error.main', fontWeight: 500 }}>${Number(req.total_spent || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'success.main', fontWeight: 500 }}>${Number(req.total_returned || 0).toLocaleString()}</TableCell>
                      <TableCell>{req.reconciliation_submitted_at ? format(new Date(req.reconciliation_submitted_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell align="center">
                        <Button size="small" variant="outlined" startIcon={<ViewIcon />} onClick={() => openReviewDialog(req, 'lead')}>Review</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Tab: Finance Pending Reviews (index depends on whether lead tab exists) */}
      {activeTab === (isLeadOrHOP ? 3 : 2) && isFinance && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {pendingReviews.length === 0 ? (
            <Box py={6} textAlign="center">
              <ReconcileIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No reconciliations pending review</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Request #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Dept</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Float Amount</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Spent</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Returned</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Submitted</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingReviews.map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell><Typography fontWeight={500}>{req.request_code}</Typography></TableCell>
                      <TableCell>{req.requester_first_name} {req.requester_last_name}</TableCell>
                      <TableCell><Chip label={req.department_code} size="small" variant="outlined" /></TableCell>
                      <TableCell>${Number(req.total_amount || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'error.main', fontWeight: 500 }}>${Number(req.total_spent || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'success.main', fontWeight: 500 }}>${Number(req.total_returned || 0).toLocaleString()}</TableCell>
                      <TableCell>{req.reconciliation_submitted_at ? format(new Date(req.reconciliation_submitted_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell align="center">
                        <Button size="small" variant="outlined" startIcon={<ViewIcon />} onClick={() => openReviewDialog(req, 'finance')}>Review</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Tab: History (index depends on whether lead tab exists) */}
      {activeTab === (isLeadOrHOP ? 4 : 3) && isFinance && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {history.length === 0 ? (
            <Box py={6} textAlign="center">
              <HistoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No reconciliation history</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Request #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Spent</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Returned</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Reviewed By</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Reviewed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map((rec, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell><Typography fontWeight={500}>{rec.request_code}</Typography></TableCell>
                      <TableCell>{rec.requester_first_name} {rec.requester_last_name}</TableCell>
                      <TableCell>${Number(rec.total_spent || 0).toLocaleString()}</TableCell>
                      <TableCell>${Number(rec.total_returned || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Chip label={rec.reconciliation_status} color={rec.reconciliation_status === 'APPROVED' ? 'success' : 'error'} size="small" />
                      </TableCell>
                      <TableCell>{rec.reviewer_first_name} {rec.reviewer_last_name}</TableCell>
                      <TableCell>{rec.reviewed_at ? format(new Date(rec.reviewed_at), 'MMM d, yyyy') : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* ==================== RECONCILIATION FORM DIALOG ==================== */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <ReconcileIcon color="primary" />
            <Typography variant="h6">Reconcile: {selectedRequest?.request_code}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedRequest && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                Float Amount: <strong>${Number(selectedRequest.total_amount || 0).toLocaleString()}</strong>
                &nbsp;&bull;&nbsp;Enter actual amounts spent for each item and attach receipts/invoices.
              </Alert>

              {/* Line Items */}
              {formItems.map((item, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 2, mb: 2 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={4}>
                      <TextField label="Description" size="small" fullWidth value={item.description}
                        disabled
                        InputProps={{ readOnly: true }}
                        sx={{ '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: 'rgba(0,0,0,0.87)' } }} />
                    </Grid>
                    <Grid item xs={6} sm={2.5}>
                      <TextField label="Budgeted" size="small" type="number" fullWidth value={item.budgetedAmount}
                        disabled
                        InputProps={{ readOnly: true, startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                        sx={{ '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: 'rgba(0,0,0,0.87)' } }} />
                    </Grid>
                    <Grid item xs={6} sm={2.5}>
                      <TextField label="Actual Spent" size="small" type="number" fullWidth value={item.actualAmount}
                        onChange={(e) => updateFormItem(index, 'actualAmount', e.target.value)}
                        InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <TextField label="Notes" size="small" fullWidth value={item.notes}
                        onChange={(e) => updateFormItem(index, 'notes', e.target.value)} />
                    </Grid>
                  </Grid>
                </Paper>
              ))}

              <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>Note:</strong> You cannot modify descriptions, budgeted amounts, or remove items from the approved request. Only enter actual amounts spent and attach receipts.
              </Alert>

              <Divider sx={{ my: 2 }} />

              {/* Totals */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={4}>
                  <Card variant="outlined">
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">Total Budgeted</Typography>
                      <Typography variant="h6">${totalBudgeted.toLocaleString()}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={4}>
                  <Card variant="outlined">
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">Total Spent</Typography>
                      <Typography variant="h6" color="error.main">${totalActual.toLocaleString()}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={4}>
                  <Card variant="outlined" sx={{ borderColor: totalVariance >= 0 ? 'success.main' : 'error.main' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary">{totalVariance >= 0 ? 'To Return' : 'Overspend'}</Typography>
                      <Typography variant="h6" color={totalVariance >= 0 ? 'success.main' : 'error.main'}>${Math.abs(totalVariance).toLocaleString()}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* File Upload - Receipts / Invoices */}
              <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: alpha(theme.palette.info.main, 0.03) }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <AttachIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2" fontWeight={600}>Receipts & Invoices</Typography>
                  </Box>
                  <Button variant="outlined" size="small" startIcon={<UploadIcon />}
                    onClick={() => fileInputRef.current?.click()}>
                    Upload Files
                  </Button>
                  <input ref={fileInputRef} type="file" hidden multiple
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    onChange={handleFileSelect} />
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Attach receipts, invoices, or supporting documents (PDF, images, Office docs - max 10MB each)
                </Typography>
                {uploadedFiles.length > 0 ? (
                  <List dense disablePadding>
                    {uploadedFiles.map((file, idx) => (
                      <ListItem key={idx} secondaryAction={
                        <IconButton edge="end" size="small" onClick={() => removeFile(idx)}><DeleteIcon fontSize="small" /></IconButton>
                      }>
                        <ListItemIcon sx={{ minWidth: 32 }}><FileIcon fontSize="small" color="primary" /></ListItemIcon>
                        <ListItemText primary={file.name} secondary={formatFileSize(file.size)}
                          primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 500 }}
                          secondaryTypographyProps={{ fontSize: '0.7rem' }} />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.disabled" sx={{ py: 1, textAlign: 'center' }}>
                    No files attached yet
                  </Typography>
                )}
              </Paper>

              <TextField label="Additional Notes" multiline rows={3} fullWidth
                value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Provide any additional notes about expenditures, receipts attached, etc." />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={isSubmitting ? <CircularProgress size={18} /> : <SubmitIcon />}
            onClick={handleSubmitReconciliation} disabled={isSubmitting || formItems.length === 0}>
            Submit Reconciliation
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== FINANCE REVIEW DIALOG ==================== */}
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <ViewIcon color="primary" />
            <Typography variant="h6">Review Reconciliation: {reviewRequest?.request_code}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {reviewRequest && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Requester</Typography>
                  <Typography fontWeight={500}>{reviewRequest.requester_first_name} {reviewRequest.requester_last_name}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Float Amount</Typography>
                  <Typography fontWeight={500}>${Number(reviewRequest.total_amount || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Total Spent</Typography>
                  <Typography fontWeight={500} color="error.main">${Number(reviewRequest.total_spent || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">To Return</Typography>
                  <Typography fontWeight={500} color="success.main">${Number(reviewRequest.total_returned || 0).toLocaleString()}</Typography>
                </Grid>
              </Grid>
              <Divider sx={{ my: 2 }} />
              {reviewReconciliation?.items && reviewReconciliation.items.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Line Items</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Description</TableCell>
                          <TableCell align="right">Budgeted</TableCell>
                          <TableCell align="right">Actual</TableCell>
                          <TableCell align="right">Variance</TableCell>
                          <TableCell>Notes</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {reviewReconciliation.items.map((item: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{item.description}</TableCell>
                            <TableCell align="right">${Number(item.budgeted_amount || 0).toLocaleString()}</TableCell>
                            <TableCell align="right">${Number(item.actual_amount || 0).toLocaleString()}</TableCell>
                            <TableCell align="right" sx={{ color: (Number(item.budgeted_amount) - Number(item.actual_amount)) >= 0 ? 'success.main' : 'error.main' }}>
                              ${Math.abs(Number(item.budgeted_amount) - Number(item.actual_amount)).toLocaleString()}
                            </TableCell>
                            <TableCell>{item.notes || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
              {reviewReconciliation?.notes && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">Requester Notes:</Typography>
                  {reviewReconciliation.notes}
                </Alert>
              )}
              <TextField label="Finance Comments" multiline rows={3} fullWidth
                value={reviewComments} onChange={(e) => setReviewComments(e.target.value)}
                placeholder="Add comments (required for rejection)" sx={{ mt: 1 }} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setReviewOpen(false)}>Cancel</Button>
          <Button variant="outlined" color="error" startIcon={isReviewing ? <CircularProgress size={18} /> : <RejectIcon />}
            onClick={reviewMode === 'lead' ? handleLeadRejectReconciliation : handleRejectReconciliation} disabled={isReviewing}>Reject</Button>
          <Button variant="contained" color="success" startIcon={isReviewing ? <CircularProgress size={18} /> : <ApproveIcon />}
            onClick={reviewMode === 'lead' ? handleLeadApproveReconciliation : handleApproveReconciliation} disabled={isReviewing}>
            {reviewMode === 'lead' ? 'Approve & Send to Finance' : 'Approve'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== VIEW RECONCILIATION DETAIL DIALOG ==================== */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <ViewIcon color="primary" />
            <Typography variant="h6">Reconciliation Details: {viewReconciliation?.request_code}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {viewReconciliation && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Box mt={0.5}>
                    <Chip
                      label={viewReconciliation.status === 'SUBMITTED' ? 'Pending Review' : viewReconciliation.status}
                      color={getStatusColor(viewReconciliation.status)} size="small"
                    />
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Total Spent</Typography>
                  <Typography fontWeight={500} color="error.main">${Number(viewReconciliation.total_spent || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Returned</Typography>
                  <Typography fontWeight={500} color="success.main">${Number(viewReconciliation.total_returned || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Submitted</Typography>
                  <Typography fontWeight={500}>{viewReconciliation.created_at ? format(new Date(viewReconciliation.created_at), 'MMM d, yyyy') : '-'}</Typography>
                </Grid>
              </Grid>

              {viewReconciliation.finance_comments && (
                <Alert severity={viewReconciliation.status === 'APPROVED' ? 'success' : 'error'} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">Finance Comments:</Typography>
                  {viewReconciliation.finance_comments}
                </Alert>
              )}

              {viewReconciliation.reviewed_at && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Reviewed on {format(new Date(viewReconciliation.reviewed_at), 'MMM d, yyyy HH:mm')}
                  {viewReconciliation.reviewer_first_name && ` by ${viewReconciliation.reviewer_first_name} ${viewReconciliation.reviewer_last_name}`}
                </Typography>
              )}

              <Divider sx={{ my: 2 }} />

              {viewReconciliation.items && viewReconciliation.items.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Line Items</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Description</TableCell>
                          <TableCell align="right">Budgeted</TableCell>
                          <TableCell align="right">Actual</TableCell>
                          <TableCell align="right">Variance</TableCell>
                          <TableCell>Notes</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {viewReconciliation.items.map((item: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{item.description}</TableCell>
                            <TableCell align="right">${Number(item.budgeted_amount || 0).toLocaleString()}</TableCell>
                            <TableCell align="right">${Number(item.actual_amount || 0).toLocaleString()}</TableCell>
                            <TableCell align="right" sx={{ color: (Number(item.budgeted_amount) - Number(item.actual_amount)) >= 0 ? 'success.main' : 'error.main' }}>
                              ${Math.abs(Number(item.budgeted_amount) - Number(item.actual_amount)).toLocaleString()}
                            </TableCell>
                            <TableCell>{item.notes || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {viewReconciliation.notes && (
                <Box mt={2}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Your Notes</Typography>
                  <Typography variant="body2">{viewReconciliation.notes}</Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReconciliationPage;
