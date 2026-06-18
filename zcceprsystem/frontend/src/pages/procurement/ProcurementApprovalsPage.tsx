/**
 * Procurement Approval Queue Page
 * Shows requests pending action by the current user's role.
 *
 * PROGRAM_LEAD / HEAD_OF_PROGRAMS  → PENDING_DEPT_APPROVAL
 * FINANCE_CLERK                     → PENDING_FINANCE_APPROVAL + PENDING_FINAL_FINANCE
 * PROCUREMENT_OFFICER               → PENDING_PROCUREMENT  (upload quotations, submit to committee)
 * PROCUREMENT_COMMITTEE             → PENDING_COMMITTEE
 * ADMIN                             → all pending statuses
 */

import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Chip, Button, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, TablePagination, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton,
  Stack, Tooltip, Avatar, alpha, useTheme, Tab, Tabs, Divider, MenuItem, Autocomplete,
  InputAdornment
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Visibility as ViewIcon,
  Gavel as CommitteeIcon,
  CloudUpload as UploadIcon,
  Refresh as RefreshIcon,
  HourglassEmpty as PendingIcon,
  Assignment as RequestIcon,
  TableChart as ExportIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  Undo as UndoIcon,
  HowToVote as VoteIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../store/authStore';
import {
  getPurchaseRequests,
  approveDeptLevel,
  approveFinanceLevel,
  rejectProcurementRequest,
  finalFinanceApproval,
  committeeDecision,
  getCommitteeVotes,
  submitToCommittee,
  uploadQuotation,
  getVendors,
  reverseFinalApproval,
  reverseDeptApproval,
  PROC_STATUS_LABELS,
  PROC_STATUS_COLORS
} from '../../services/procurementService';
import { ProcRequest, ProcVendor } from '../../types';
import api from '../../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────
type ActionType =
  | 'approve_dept'
  | 'approve_finance'
  | 'final_finance'
  | 'reject'
  | 'committee'
  | 'submit_committee';

interface ActionState {
  type: ActionType;
  request: ProcRequest;
}

// ─── Role → tab/status config ─────────────────────────────────────────────
// Only exclude DRAFT from history tabs so completed/forwarded items are ALWAYS visible
const ACTED_ON_EXCLUDED = ['DRAFT'];

const getRoleTabs = (role: string) => {
  switch (role) {
    case 'PROGRAM_LEAD':
    case 'HEAD_OF_PROGRAMS':
      return [
        { label: 'Awaiting My Approval', status: 'PENDING_DEPT_APPROVAL', actedOn: false },
        { label: 'All Records', status: '', actedOn: true }
      ];
    case 'FINANCE_CLERK':
      return [
        { label: 'Final Finance Approval', status: 'PENDING_FINAL_FINANCE', actedOn: false },
        { label: 'All Finance Records', status: '', actedOn: true }
      ];
    case 'PROCUREMENT_OFFICER':
      return [
        { label: 'Procurement Queue', status: 'PENDING_PROCUREMENT', actedOn: false },
        { label: 'All Records', status: '', actedOn: true }
      ];
    case 'PROCUREMENT_COMMITTEE':
      return [
        { label: 'Committee Review', status: 'PENDING_COMMITTEE', actedOn: false },
        { label: 'All Records', status: '', actedOn: true }
      ];
    case 'ADMIN':
      return [
        { label: 'Dept Approval', status: 'PENDING_DEPT_APPROVAL', actedOn: false },
        { label: 'Procurement', status: 'PENDING_PROCUREMENT', actedOn: false },
        { label: 'Committee', status: 'PENDING_COMMITTEE', actedOn: false },
        { label: 'Final Finance', status: 'PENDING_FINAL_FINANCE', actedOn: false },
        { label: 'All Records', status: '', actedOn: true }
      ];
    default:
      return [];
  }
};

// ─── Priority chip ────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  LOW: 'default', MEDIUM: 'info', HIGH: 'warning', URGENT: 'error'
};

// ─── Component ────────────────────────────────────────────────────────────
const ProcurementApprovalsPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const role = user?.role || '';
  const tabs = getRoleTabs(role);

  const [tabIdx, setTabIdx] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [approvalSearch, setApprovalSearch] = useState('');
  const [approvalDeptFilter, setApprovalDeptFilter] = useState('');
  const [approvalPriorityFilter, setApprovalPriorityFilter] = useState('');
  const [departments, setDepartments] = useState<{id: number; department_name: string}[]>([]);

  useEffect(() => {
    api.get('/departments').then(res => { if (res.data.success) setDepartments(res.data.data); }).catch(() => {});
  }, []);
  const [action, setAction] = useState<ActionState | null>(null);
  const [comments, setComments] = useState('');
  const [committeeDecisionVal, setCommitteeDecisionVal] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [selectedQuotId, setSelectedQuotId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [popFileQueue, setPopFileQueue] = useState<File | null>(null);
  const [committeeVotes, setCommitteeVotes] = useState<any[]>([]);
  const [votesLoading, setVotesLoading] = useState(false);

  // Post-action confirmation dialogs
  const [deptConfirmData, setDeptConfirmData] = useState<{
    comments: string; requestId: number;
  } | null>(null);
  const [reversingDept, setReversingDept] = useState(false);
  const [committeeConfirmData, setCommitteeConfirmData] = useState<{
    decision: string; comments: string; result: any; request: ProcRequest;
  } | null>(null);
  const [popConfirmData, setPopConfirmData] = useState<{
    fileName: string; comments: string; requestId: number;
  } | null>(null);
  const [reversingPOP, setReversingPOP] = useState(false);

  // Load committee votes when the committee dialog opens
  useEffect(() => {
    if (action?.type === 'committee' && action.request?.id) {
      setVotesLoading(true);
      getCommitteeVotes(action.request.id)
        .then(v => setCommitteeVotes(v))
        .catch(() => setCommitteeVotes([]))
        .finally(() => setVotesLoading(false));
    } else {
      setCommitteeVotes([]);
    }
  }, [action?.type, action?.request?.id]);

  // Quotation upload state (for PROCUREMENT_OFFICER)
  const [uploadTarget, setUploadTarget] = useState<ProcRequest | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [quotForm, setQuotForm] = useState({
    vendor_name: '', vendor_email: '', vendor_phone: '',
    quotation_number: '', total_amount: '', currency: 'USD',
    validity_date: '', delivery_timeline: '', notes: ''
  });
  const [uploadLoading, setUploadLoading] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<ProcVendor | null>(null);

  const { data: vendors = [] } = useQuery({
    queryKey: ['proc-vendors-list'],
    queryFn: () => getVendors({ limit: 200 } as any),
    staleTime: 60000
  });

  const currentTab = tabs[tabIdx];
  const currentStatus = currentTab?.status;
  const isActedOnTab = currentTab?.actedOn === true;

  const { data: rawRequests = [], isLoading, error, refetch } = useQuery({
    queryKey: ['proc-approvals', role, currentStatus, isActedOnTab],
    queryFn: () => getPurchaseRequests(isActedOnTab ? { limit: 100 } : { status: currentStatus, limit: 100 }),
    enabled: Boolean(currentTab),
    refetchInterval: 30000
  });

  // For acted-on tab: only exclude DRAFT so ALL completed/forwarded items remain visible
  const rawFiltered = isActedOnTab
    ? (rawRequests as ProcRequest[]).filter(r => !ACTED_ON_EXCLUDED.includes(r.status))
    : rawRequests as ProcRequest[];

  const requests = rawFiltered.filter(r => {
    if (approvalSearch) {
      const s = approvalSearch.toLowerCase();
      if (!(
        r.request_code?.toLowerCase().includes(s) ||
        (r.title || '').toLowerCase().includes(s) ||
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(s)
      )) return false;
    }
    if (approvalDeptFilter && String((r as any).department_id) !== approvalDeptFilter) return false;
    if (approvalPriorityFilter && r.priority !== approvalPriorityFilter) return false;
    return true;
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['proc-approvals'] });
    qc.invalidateQueries({ queryKey: ['proc-requests'] });
    qc.invalidateQueries({ queryKey: ['proc-dashboard'] });
  };

  // ─── Execute approval action ────────────────────────────────────────────
  const doAction = async () => {
    if (!action) return;
    if (action.type === 'reject' && !comments.trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    if (action.type === 'final_finance' && !popFileQueue) {
      toast.error('Proof of Payment (POP) document is required for final approval');
      return;
    }
    setActionLoading(true);
    try {
      const id = action.request.id;
      switch (action.type) {
        case 'approve_dept': {
          await approveDeptLevel(id, comments);
          toast.success('Approved — forwarded to Procurement');
          const capturedDeptComments = comments;
          const capturedDeptId = id;
          setAction(null);
          setComments('');
          invalidate();
          setDeptConfirmData({ comments: capturedDeptComments, requestId: capturedDeptId });
          return;
        }
        case 'approve_finance':
          await approveFinanceLevel(id, comments);
          toast.success('Approved — forwarded to Procurement team');
          break;
        case 'final_finance': {
          const fd = new FormData();
          fd.append('file', popFileQueue!);
          if (comments) fd.append('comments', comments);
          await finalFinanceApproval(id, fd);
          toast.success('Final approval granted — Procurement COMPLETED!');
          const capturedFile = popFileQueue!.name;
          const capturedComments = comments;
          const capturedId = id;
          setPopFileQueue(null);
          setAction(null);
          setComments('');
          invalidate();
          setPopConfirmData({ fileName: capturedFile, comments: capturedComments, requestId: capturedId });
          return;
        }
        case 'reject':
          await rejectProcurementRequest(id, comments);
          toast.success('Request rejected');
          break;
        case 'committee': {
          const result = await committeeDecision(id, committeeDecisionVal, selectedQuotId ?? undefined, comments);
          toast.success('Decision recorded successfully.');
          setAction(null);
          setComments('');
          setSelectedQuotId(null);
          invalidate();
          setCommitteeConfirmData({ decision: committeeDecisionVal, comments, result, request: action.request });
          return;
        }
        case 'submit_committee':
          await submitToCommittee(id, selectedQuotId ?? undefined, comments);
          toast.success('Submitted to Procurement Committee');
          break;
      }
      setAction(null);
      setComments('');
      setSelectedQuotId(null);
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Upload quotation ────────────────────────────────────────────────────
  const handleUploadQuotation = async () => {
    if (!uploadTarget) return;
    if (!quotForm.vendor_name.trim() || !quotForm.total_amount) {
      toast.error('Vendor name and total amount are required');
      return;
    }
    setUploadLoading(true);
    try {
      const fd = new FormData();
      Object.entries(quotForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (uploadFile) fd.append('file', uploadFile);
      await uploadQuotation(uploadTarget.id, fd);
      toast.success('Quotation uploaded successfully');
      setUploadTarget(null);
      setUploadFile(null);
      setSelectedVendor(null);
      setQuotForm({ vendor_name: '', vendor_email: '', vendor_phone: '', quotation_number: '', total_amount: '', currency: 'USD', validity_date: '', delivery_timeline: '', notes: '' });
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Upload failed');
    } finally {
      setUploadLoading(false);
    }
  };

  // ─── Action buttons per row ──────────────────────────────────────────────
  const renderActions = (req: ProcRequest) => {
    const btns: React.ReactNode[] = [];

    // Always allow view
    btns.push(
      <Tooltip title="View details" key="view">
        <IconButton size="small" onClick={() => navigate(`/procurement/requests/${req.id}`)}>
          <ViewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );

    if (role === 'PROGRAM_LEAD' || role === 'HEAD_OF_PROGRAMS') {
      if (req.status === 'PENDING_DEPT_APPROVAL') {
        btns.push(
          <Button key="approve" size="small" variant="contained" color="success" startIcon={<ApproveIcon />}
            onClick={() => { setAction({ type: 'approve_dept', request: req }); setComments(''); }}>
            Approve
          </Button>,
          <Button key="reject" size="small" variant="outlined" color="error" startIcon={<RejectIcon />}
            onClick={() => { setAction({ type: 'reject', request: req }); setComments(''); }}>
            Reject
          </Button>
        );
      }
      // Allow reversing dept approval within 12 hours (before quotations are added)
      if (req.status === 'PENDING_PROCUREMENT') {
        const deptAt = (req as any).dept_approved_at;
        const withinWindow = !deptAt || ((Date.now() - new Date(deptAt).getTime()) / (1000 * 60 * 60)) <= 12;
        if (withinWindow) {
          btns.push(
            <Button key="reversedept" size="small" variant="outlined" color="warning"
              onClick={() => setDeptConfirmData({ requestId: req.id, comments: '' })}>
              Reverse / Undo Approval
            </Button>
          );
        }
      }
    }

    if (role === 'FINANCE_CLERK') {
      if (req.status === 'PENDING_FINAL_FINANCE') {
        btns.push(
          <Button key="finalapprove" size="small" variant="contained" color="success" startIcon={<ApproveIcon />}
            onClick={() => { setAction({ type: 'final_finance', request: req }); setComments(''); }}>
            Final Approve
          </Button>,
          <Button key="reject" size="small" variant="outlined" color="error" startIcon={<RejectIcon />}
            onClick={() => { setAction({ type: 'reject', request: req }); setComments(''); }}>
            Reject
          </Button>
        );
      }
    }

    if (role === 'PROCUREMENT_OFFICER') {
      if (req.status === 'PENDING_PROCUREMENT') {
        btns.push(
          <Button key="upload" size="small" variant="outlined" color="primary" startIcon={<UploadIcon />}
            onClick={() => setUploadTarget(req)}>
            Upload Quotation
          </Button>,
          <Button key="committee" size="small" variant="contained" color="primary" startIcon={<CommitteeIcon />}
            onClick={() => { setAction({ type: 'submit_committee', request: req }); setComments(''); setSelectedQuotId(null); }}>
            Send to Committee
          </Button>
        );
      }
    }

    if (role === 'PROCUREMENT_COMMITTEE') {
      if (req.status === 'PENDING_COMMITTEE') {
        btns.push(
          <Button key="decision" size="small" variant="contained" color="primary" startIcon={<CommitteeIcon />}
            onClick={() => { setAction({ type: 'committee', request: req }); setComments(''); setCommitteeDecisionVal('APPROVED'); setSelectedQuotId(null); }}>
            Record Decision
          </Button>
        );
      }
    }

    if (role === 'ADMIN') {
      // Admin gets contextual buttons based on current tab's status
      if (req.status === 'PENDING_DEPT_APPROVAL') {
        btns.push(
          <Button key="approve" size="small" variant="contained" color="success" startIcon={<ApproveIcon />}
            onClick={() => { setAction({ type: 'approve_dept', request: req }); setComments(''); }}>Approve</Button>,
          <Button key="reject" size="small" variant="outlined" color="error" startIcon={<RejectIcon />}
            onClick={() => { setAction({ type: 'reject', request: req }); setComments(''); }}>Reject</Button>
        );
      } else if (req.status === 'PENDING_FINAL_FINANCE') {
        btns.push(
          <Button key="finalapprove" size="small" variant="contained" color="success" startIcon={<ApproveIcon />}
            onClick={() => { setAction({ type: 'final_finance', request: req }); setComments(''); }}>Final Approve</Button>,
          <Button key="reject" size="small" variant="outlined" color="error" startIcon={<RejectIcon />}
            onClick={() => { setAction({ type: 'reject', request: req }); setComments(''); }}>Reject</Button>
        );
      } else if (req.status === 'PENDING_COMMITTEE') {
        btns.push(
          <Button key="decision" size="small" variant="contained" color="primary" startIcon={<CommitteeIcon />}
            onClick={() => { setAction({ type: 'committee', request: req }); setComments(''); setCommitteeDecisionVal('APPROVED'); }}>Record Decision</Button>
        );
      }
    }

    return <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>{btns}</Stack>;
  };

  const exportToExcel = () => {
    if (requests.length === 0) return;
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
    ws['!cols'] = [14, 40, 22, 24, 20, 10, 16, 22, 14].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Approvals');
    XLSX.writeFile(wb, `approvals-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  // ─── No access ─────────────────────────────────────────────────────────
  if (tabs.length === 0) {
    return (
      <Box textAlign="center" py={6}>
        <RequestIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">No approval actions available for your role.</Typography>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/procurement')}>Back to Dashboard</Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, background: `linear-gradient(135deg, #e65100 0%, #bf360c 100%)`, color: 'white', borderRadius: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <PendingIcon sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>Procurement Approval Queue</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                Items requiring your action — {user?.role?.replace(/_/g, ' ')}
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title={requests.length === 0 ? 'No records to export' : `Export ${requests.length} records to Excel`}>
              <span>
                <Button
                  variant="outlined" size="small" startIcon={<ExportIcon />}
                  onClick={exportToExcel} disabled={requests.length === 0}
                  sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
                >
                  Export Excel
                </Button>
              </span>
            </Tooltip>
            <IconButton onClick={() => refetch()} sx={{ color: 'white' }}><RefreshIcon /></IconButton>
          </Stack>
        </Box>
      </Paper>

      {/* Tabs */}
      <Paper elevation={1} sx={{ borderRadius: 2 }}>
            {tabs.length > 1 && (
          <Tabs value={tabIdx} onChange={(_, v) => { setTabIdx(v); setPage(0); }} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
            {tabs.map((t, i) => (
              <Tab
                key={t.status || `tab-${i}`}
                label={
                  <Box display="flex" alignItems="center" gap={1}>
                    {t.label}
                    {!isLoading && tabIdx === i && requests.length > 0 && (
                      <Chip label={requests.length} size="small" color={t.actedOn ? 'default' : 'error'} />
                    )}
                  </Box>
                }
              />
            ))}
          </Tabs>
        )}

        <Box sx={{ p: 2 }}>
          {/* Filter Panel */}
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
              <FilterIcon fontSize="small" color="action" />
              <TextField
                size="small" placeholder="Search code, title, requester..." sx={{ minWidth: 240, flex: 2 }}
                value={approvalSearch} onChange={e => setApprovalSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              />
              <TextField select size="small" label="Department" sx={{ minWidth: 180, flex: 1 }}
                value={approvalDeptFilter} onChange={e => setApprovalDeptFilter(e.target.value)}
              >
                <MenuItem value="">All Departments</MenuItem>
                {departments.map(d => (
                  <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Priority" sx={{ minWidth: 130, flex: 1 }}
                value={approvalPriorityFilter} onChange={e => setApprovalPriorityFilter(e.target.value)}
              >
                <MenuItem value="">All Priorities</MenuItem>
                {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map(p => (
                  <MenuItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</MenuItem>
                ))}
              </TextField>
              {(approvalSearch || approvalDeptFilter || approvalPriorityFilter) && (
                <Button size="small" startIcon={<ClearIcon />} onClick={() => { setApprovalSearch(''); setApprovalDeptFilter(''); setApprovalPriorityFilter(''); }}>
                  Clear
                </Button>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                {requests.length} {requests.length === 1 ? 'result' : 'results'}
              </Typography>
            </Stack>
          </Paper>

          {isLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : error ? (
            <Alert severity="error">Failed to load requests.</Alert>
          ) : requests.length === 0 ? (
            <Box textAlign="center" py={5}>
              <ApproveIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
              <Typography variant="h6" color="text.secondary">
                {isActedOnTab ? 'No requests actioned yet' : 'No items pending your action'}
              </Typography>
              <Typography variant="body2" color="text.disabled" mt={0.5}>
                {isActedOnTab ? 'Requests you approve or reject will appear here for tracking.' : 'All caught up! Check back later.'}
              </Typography>
            </Box>
          ) : (
            <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell>Request Code</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Department</TableCell>
                    <TableCell>Requester</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell align="right">Amount ($)</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((req) => (
                    <TableRow
                      key={req.id}
                      sx={{ '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) } }}
                    >
                      <TableCell>
                        <Typography
                          variant="body2" fontWeight={700} color="primary"
                          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                          onClick={() => navigate(`/procurement/requests/${req.id}`)}
                        >
                          {req.request_code}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {req.department_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Avatar sx={{ width: 24, height: 24, fontSize: '0.65rem', bgcolor: theme.palette.primary.light, color: theme.palette.primary.dark }}>
                            {(req.first_name?.[0] || '') + (req.last_name?.[0] || '')}
                          </Avatar>
                          <Typography variant="caption">{req.first_name} {req.last_name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={req.priority} size="small" color={PRIORITY_COLOR[req.priority] || 'default'} />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {Number(req.total_estimated_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                          {req.created_at ? format(new Date(req.created_at), 'dd MMM yyyy') : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>{renderActions(req)}</TableCell>
                    </TableRow>
                  ))}
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
            </>
          )}
        </Box>
      </Paper>

      {/* ─── Action Confirm Dialog ─────────────────────────────────────────── */}
      <Dialog open={Boolean(action)} onClose={() => { if (!actionLoading) { setAction(null); setPopFileQueue(null); } }} maxWidth="sm" fullWidth>
        <DialogTitle>
          {action?.type === 'approve_dept' && 'Approve — Department Level'}
          {action?.type === 'approve_finance' && 'Approve — Finance Review'}
          {action?.type === 'final_finance' && 'Final Finance Approval'}
          {action?.type === 'reject' && 'Reject Request'}
          {action?.type === 'submit_committee' && 'Submit to Procurement Committee'}
          {action?.type === 'committee' && 'Record Committee Vote'}
        </DialogTitle>
        <DialogContent>
          <Box pt={1}>
            {action && (
              <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 1, bgcolor: 'grey.50' }}>
                <Typography variant="caption" color="text.secondary">Request</Typography>
                <Typography variant="body2" fontWeight={600}>{action.request.request_code} — {action.request.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Estimated: ${Number(action.request.total_estimated_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Typography>
              </Paper>
            )}

            {action?.type === 'committee' && (
              <Box mb={2}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>
                  Committee Votes
                </Typography>
                {votesLoading ? (
                  <Box display="flex" justifyContent="center" py={1}><CircularProgress size={20} /></Box>
                ) : (
                  <Box>
                    {(() => {
                      const votes: any[] = committeeVotes;
                      const approvedVotes = votes.filter((v: any) => v.vote === 'APPROVED');
                      const otherVotes = votes.filter((v: any) => v.vote !== 'APPROVED');
                      const remaining = 3 - votes.length;
                      return (
                        <>
                          {approvedVotes.map((v: any) => (
                            <Box key={v.id ?? v.committee_seat} display="flex" alignItems="center" gap={1} mb={0.75}
                              sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(46,125,50,0.08)', border: '1px solid', borderColor: 'success.300' }}>
                              <Box sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: '50%', bgcolor: 'success.main' }} />
                              <Typography variant="caption" fontWeight={700} sx={{ flex: 1 }}>{v.first_name} {v.last_name}</Typography>
                              <Chip label="Approved" size="small" color="success" sx={{ height: 18, fontSize: '0.65rem' }} />
                            </Box>
                          ))}
                          {otherVotes.map((v: any) => (
                            <Box key={v.id ?? v.committee_seat} display="flex" alignItems="center" gap={1} mb={0.75}
                              sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(255,152,0,0.08)', border: '1px solid', borderColor: 'warning.400' }}>
                              <Box sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: '50%', bgcolor: 'warning.main' }} />
                              <Typography variant="caption" fontWeight={700} sx={{ flex: 1 }}>{v.first_name} {v.last_name}</Typography>
                              <Chip label="Not approved (can re-vote)" size="small" color="warning" sx={{ height: 18, fontSize: '0.65rem' }} />
                            </Box>
                          ))}
                          {remaining > 0 && (
                            <Box display="flex" alignItems="center" gap={1} mb={0.75}
                              sx={{ p: 1, borderRadius: 1, bgcolor: 'grey.100', border: '1px solid', borderColor: 'grey.300' }}>
                              <PendingIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                              <Typography variant="caption" color="text.secondary" fontStyle="italic" sx={{ flex: 1 }}>
                                {remaining} vote{remaining > 1 ? 's' : ''} remaining
                              </Typography>
                            </Box>
                          )}
                        </>
                      );
                    })()}
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {committeeVotes.filter((v: any) => v.vote === 'APPROVED').length}/3 approved — all three must approve to advance.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {action?.type === 'committee' && (
              <TextField
                select fullWidth label="Your Vote" value={committeeDecisionVal}
                onChange={e => setCommitteeDecisionVal(e.target.value as any)}
                sx={{ mb: 2 }}
              >
                <MenuItem value="APPROVED">Approve</MenuItem>
                <MenuItem value="REJECTED">Reject</MenuItem>
              </TextField>
            )}

            {(action?.type === 'submit_committee' || action?.type === 'committee') && action.request.quotation_count && action.request.quotation_count > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                This request has {action.request.quotation_count} quotation(s). Navigate to the request detail to select the recommended quotation before submitting.
              </Alert>
            )}

            {action?.type === 'final_finance' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                A Proof of Payment (POP) document is <strong>required</strong> to complete final approval.
              </Alert>
            )}
            {action?.type === 'final_finance' && (
              <Button
                variant={popFileQueue ? 'outlined' : 'contained'}
                component="label"
                startIcon={<UploadIcon />}
                fullWidth
                color={popFileQueue ? 'success' : 'primary'}
                sx={{ mb: 2 }}
              >
                {popFileQueue ? `✓ ${popFileQueue.name}` : 'Upload Proof of Payment (POP) *'}
                <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={e => setPopFileQueue(e.target.files?.[0] || null)} />
              </Button>
            )}

            <TextField
              fullWidth multiline rows={3}
              label={action?.type === 'reject' ? 'Rejection Reason *' : 'Comments (optional)'}
              value={comments}
              onChange={e => setComments(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAction(null); setPopFileQueue(null); }} disabled={actionLoading}>Cancel</Button>
          <Button
            variant="contained"
            color={action?.type === 'reject' ? 'error' : 'primary'}
            onClick={doAction}
            disabled={actionLoading || (action?.type === 'final_finance' && !popFileQueue)}
            startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
          >
            {action?.type === 'final_finance' && !popFileQueue ? 'Upload POP to Continue' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Upload Quotation Dialog (Procurement Officer) ─────────────────── */}
      <Dialog open={Boolean(uploadTarget)} onClose={() => !uploadLoading && setUploadTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Quotation — {uploadTarget?.request_code}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            <Autocomplete
              options={vendors as ProcVendor[]}
              getOptionLabel={(v) => typeof v === 'string' ? v : v.company_name || ''}
              value={selectedVendor}
              onChange={(_, newVal) => {
                if (newVal && typeof newVal !== 'string') {
                  setSelectedVendor(newVal);
                  setQuotForm(f => ({
                    ...f,
                    vendor_name: newVal.company_name || '',
                    vendor_email: newVal.email || '',
                    vendor_phone: newVal.phone || ''
                  }));
                } else {
                  setSelectedVendor(null);
                }
              }}
              freeSolo
              renderInput={(params) => (
                <TextField
                  {...params}
                  fullWidth
                  required
                  label="Vendor / Supplier Name *"
                  value={quotForm.vendor_name}
                  onChange={e => setQuotForm(f => ({ ...f, vendor_name: e.target.value }))}
                />
              )}
            />
            <Box display="flex" gap={2}>
              <TextField fullWidth label="Quotation Ref #" value={quotForm.quotation_number}
                onChange={e => setQuotForm(f => ({ ...f, quotation_number: e.target.value }))} />
              <TextField required fullWidth type="number" label="Total Amount *" value={quotForm.total_amount}
                onChange={e => setQuotForm(f => ({ ...f, total_amount: e.target.value }))}
                inputProps={{ min: 0, step: 0.01 }} />
            </Box>
            <Box display="flex" gap={2}>
              <TextField fullWidth label="Currency" value={quotForm.currency}
                onChange={e => setQuotForm(f => ({ ...f, currency: e.target.value }))} />
              <TextField fullWidth type="date" label="Valid Until" InputLabelProps={{ shrink: true }}
                value={quotForm.validity_date} onChange={e => setQuotForm(f => ({ ...f, validity_date: e.target.value }))} />
            </Box>
            <Box display="flex" gap={2}>
              <TextField fullWidth label="Vendor Email" value={quotForm.vendor_email}
                onChange={e => setQuotForm(f => ({ ...f, vendor_email: e.target.value }))} />
              <TextField fullWidth label="Delivery Timeline" placeholder="e.g. 2 weeks" value={quotForm.delivery_timeline}
                onChange={e => setQuotForm(f => ({ ...f, delivery_timeline: e.target.value }))} />
            </Box>
            <TextField fullWidth multiline rows={2} label="Notes" value={quotForm.notes}
              onChange={e => setQuotForm(f => ({ ...f, notes: e.target.value }))} />
            <Button variant="outlined" component="label" startIcon={<UploadIcon />}>
              {uploadFile ? uploadFile.name : 'Attach Document (PDF / Image)'}
              <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => setUploadFile(e.target.files?.[0] || null)} />
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadTarget(null)} disabled={uploadLoading}>Cancel</Button>
          <Button variant="contained" onClick={handleUploadQuotation} disabled={uploadLoading}
            startIcon={uploadLoading ? <CircularProgress size={16} /> : <UploadIcon />}>
            Upload Quotation
          </Button>
        </DialogActions>
      </Dialog>

      {/* Post-Dept Approval Confirmation Dialog */}
      <Dialog open={Boolean(deptConfirmData)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ApproveIcon color="success" />
          Department Approval Recorded
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            The request has been approved and forwarded to the <strong>Procurement team</strong>.
          </Alert>
          {deptConfirmData?.comments && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, mb: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">Your Comments</Typography>
              <Typography variant="body2">{deptConfirmData.comments}</Typography>
            </Paper>
          )}
          <Alert severity="info" icon={false} sx={{ fontSize: '0.8rem' }}>
            If you approved by mistake, click <strong>Undo Approval</strong> to return the request. This is only possible before the Procurement team adds quotations.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            color="warning"
            startIcon={reversingDept ? <CircularProgress size={14} /> : <UndoIcon />}
            disabled={reversingDept}
            onClick={async () => {
              if (!deptConfirmData?.requestId) return;
              setReversingDept(true);
              try {
                await reverseDeptApproval(String(deptConfirmData.requestId));
                toast.success('Approval reversed. Request returned to Pending Department Approval.');
                setDeptConfirmData(null);
                invalidate();
              } catch (err: any) {
                toast.error(err?.response?.data?.error || 'Cannot reverse — procurement actions may have already been taken.');
              } finally {
                setReversingDept(false);
              }
            }}
          >
            Undo Approval
          </Button>
          <Button variant="contained" onClick={() => setDeptConfirmData(null)} disabled={reversingDept}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Post-Committee Decision Confirmation Dialog */}
      <Dialog open={Boolean(committeeConfirmData)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <VoteIcon color="primary" />
          Decision Recorded Successfully
        </DialogTitle>
        <DialogContent>
          <Alert severity={committeeConfirmData?.decision === 'APPROVED' ? 'success' : 'warning'} sx={{ mb: 2 }}>
            Your committee decision has been recorded as <strong>{committeeConfirmData?.decision}</strong>.
          </Alert>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, mb: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">Decision</Typography>
            <Typography variant="body2" fontWeight={700}>{committeeConfirmData?.decision}</Typography>
            {committeeConfirmData?.comments && (
              <>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mt={1}>Comments</Typography>
                <Typography variant="body2">{committeeConfirmData.comments}</Typography>
              </>
            )}
            {committeeConfirmData?.result?.message && (
              <>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mt={1}>Workflow Status</Typography>
                <Typography variant="body2" color="text.secondary">{committeeConfirmData.result.message}</Typography>
              </>
            )}
          </Paper>
          <Typography variant="body2" color="text.secondary">
            You may change your vote by recording a new decision from the request actions panel.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            startIcon={<CommitteeIcon />}
            onClick={() => {
              const req = committeeConfirmData?.request;
              setCommitteeConfirmData(null);
              if (req) {
                setAction({ type: 'committee', request: req });
                setCommitteeDecisionVal('APPROVED');
                setSelectedQuotId(null);
                setComments('');
                if (req.id) {
                  setVotesLoading(true);
                  getCommitteeVotes(String(req.id)).then(v => { setCommitteeVotes(v); setVotesLoading(false); }).catch(() => setVotesLoading(false));
                }
              }
            }}
          >
            Change My Vote
          </Button>
          <Button variant="contained" onClick={() => setCommitteeConfirmData(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Post-POP Upload Confirmation & Reversal Dialog */}
      <Dialog open={Boolean(popConfirmData)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ApproveIcon color="success" />
          Final Approval Submitted
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            The Proof of Payment (POP) has been uploaded and the request is now <strong>Completed</strong>.
          </Alert>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, mb: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">Document Uploaded</Typography>
            <Typography variant="body2" fontWeight={700}>{popConfirmData?.fileName}</Typography>
            {popConfirmData?.comments && (
              <>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mt={1}>Comments</Typography>
                <Typography variant="body2">{popConfirmData.comments}</Typography>
              </>
            )}
          </Paper>
          <Alert severity="info" icon={false} sx={{ fontSize: '0.8rem' }}>
            If you need to reverse this approval (e.g., incorrect document uploaded), click <strong>Reverse Approval</strong> to return the request to Pending Final Approval.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            color="error"
            startIcon={reversingPOP ? <CircularProgress size={14} /> : <UndoIcon />}
            disabled={reversingPOP}
            onClick={async () => {
              if (!popConfirmData?.requestId) return;
              setReversingPOP(true);
              try {
                await reverseFinalApproval(String(popConfirmData.requestId));
                toast.success('Final approval reversed. Request returned to Pending Final Approval.');
                setPopConfirmData(null);
                invalidate();
              } catch (err: any) {
                toast.error(err?.response?.data?.error || 'Failed to reverse approval');
              } finally {
                setReversingPOP(false);
              }
            }}
          >
            Reverse Approval
          </Button>
          <Button variant="contained" onClick={() => setPopConfirmData(null)} disabled={reversingPOP}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProcurementApprovalsPage;
