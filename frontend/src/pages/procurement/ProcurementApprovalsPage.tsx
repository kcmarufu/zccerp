/**
 * Procurement Approval Queue Page
 * Shows requests pending action by the current user's role.
 *
 * PROGRAM_LEAD / HEAD_OF_PROGRAMS  → PENDING_DEPT_APPROVAL
 * FINANCE_CLERK                     → PENDING_FINANCE_APPROVAL + PENDING_FINAL_FINANCE
 * Finance's own LEAD / HOD           → as a Finance Clerk, plus the high-value seat
 * PROCUREMENT_OFFICER               → PENDING_PROCUREMENT  (upload quotations, submit to committee)
 * PROCUREMENT_COMMITTEE             → PENDING_COMMITTEE
 * ADMIN                             → all pending statuses
 */

import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Chip, Button, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, TablePagination, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton,
  Stack, Tooltip, alpha, useTheme, Tab, Tabs, MenuItem,
  InputAdornment, Menu, ListItemIcon, ListItemText
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
  Clear as ClearIcon,
  Undo as UndoIcon,
  HowToVote as VoteIcon,
  Download as DownloadIcon,
  PictureAsPdf as PdfIcon,
  MoreVert as MoreIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from '../../utils/datetime';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../store/authStore';
import {
  getPurchaseRequests,
  getPurchaseRequestById,
  approveDeptLevel,
  approveFinanceLevel,
  rejectProcurementRequest,
  finalFinanceApproval,
  highValueDecision,
  committeeDecision,
  getCommitteeVotes,
  submitToCommittee,
  reverseFinalApproval,
  reverseDeptApproval,
  PROC_STATUS_LABELS,
  PROC_STATUS_COLORS,
  isWorkflowV2,
  getPopObligations,
} from '../../services/procurementService';
import { ProcRequest } from '../../types';
import { PopObligationsAlert } from '../../components/procurement/PrFloatPanels';

import api from '../../services/api';
import { downloadPurchaseOrderPDF } from '../../utils/pdfUtils';
import { stickyActionCell, stickyActionHeadCell } from '../../utils/tableStyles';
import { formatRoleLabel } from '../../utils/roleUtils';
import { usePersistentState } from '../../utils/navigationState';

// ─── Types ───────────────────────────────────────────────────────────────────
type ActionType =
  | 'approve_dept'
  | 'approve_finance'
  | 'final_finance'
  | 'reject'
  | 'committee'
  | 'submit_committee'
  | 'high_value';

interface ActionState {
  type: ActionType;
  request: ProcRequest;
}

// ─── Role → tab/status config ─────────────────────────────────────────────
// Only exclude DRAFT from history tabs so completed/forwarded items are ALWAYS visible
const ACTED_ON_EXCLUDED = ['DRAFT'];

const getRoleTabs = (role: string, isAdminHr: boolean = false, isFinanceLead: boolean = false) => {
  switch (role) {
    case 'PROGRAM_LEAD':
    case 'HEAD_OF_PROGRAMS':
      if (isAdminHr) {
        // Admin/HR LEAD/HOD: dept approval + full org-wide procurement view
        return [
          { label: 'Awaiting My Approval', status: 'PENDING_DEPT_APPROVAL', actedOn: false },
          { label: 'Confirm Award',         status: 'PENDING_DEPT_CONFIRMATION', actedOn: false },
          { label: 'High-Value Approval',   status: 'PENDING_HIGH_VALUE_APPROVAL', actedOn: false },
          { label: 'Procurement Queue',     status: 'PENDING_PROCUREMENT',   actedOn: false },
          { label: 'At Committee',          status: 'PENDING_COMMITTEE',     actedOn: false },
          { label: 'Final Finance',         status: 'PENDING_FINAL_FINANCE', actedOn: false },
          { label: 'All Records',           status: '',                      actedOn: true  }
        ];
      }
      // Only Finance's Lead / Head of Department holds the second high-value
      // seat, so only they get the queue for it. They also hold every power
      // the Finance Clerk has at the Finance desk.
      return [
        { label: 'Awaiting My Approval', status: 'PENDING_DEPT_APPROVAL', actedOn: false },
        { label: 'Confirm Award', status: 'PENDING_DEPT_CONFIRMATION', actedOn: false },
        ...(isFinanceLead
          ? [
              { label: 'Final Finance Approval', status: 'PENDING_FINAL_FINANCE', actedOn: false },
              { label: 'Awaiting Payment', status: 'PENDING_PAYMENT', actedOn: false },
              { label: 'High-Value Approval', status: 'PENDING_HIGH_VALUE_APPROVAL', actedOn: false },
              // Heads of Department's requests with the General Secretary — view only.
              { label: 'Awaiting GS (view only)', status: 'PENDING_GS_APPROVAL', actedOn: false }
            ]
          : []),
        { label: 'All Records', status: '', actedOn: true }
      ];
    case 'FINANCE_CLERK':
      return [
        { label: 'Final Finance Approval', status: 'PENDING_FINAL_FINANCE', actedOn: false },
        { label: 'Awaiting Payment', status: 'PENDING_PAYMENT', actedOn: false },
        { label: 'All Finance Records', status: '', actedOn: true }
      ];
    case 'PROCUREMENT_OFFICER':
      return [
        { label: 'Procurement Queue', status: 'PENDING_PROCUREMENT', actedOn: false },
        { label: 'Returned for Amendment', status: 'RETURNED_TO_PROCUREMENT', actedOn: false },
        { label: 'All Records', status: '', actedOn: true }
      ];
    case 'PROCUREMENT_COMMITTEE':
      return [
        { label: 'Committee Review', status: 'PENDING_COMMITTEE', actedOn: false },
        { label: 'Recommended', status: 'PENDING_HIGH_VALUE_APPROVAL', actedOn: false },
        { label: 'All Records', status: '', actedOn: true }
      ];
    case 'ADMIN':
      return [
        // Heads of Department's own requests — decided by the General Secretary.
        { label: 'Awaiting GS Approval', status: 'PENDING_GS_APPROVAL', actedOn: false },
        { label: 'Dept Approval', status: 'PENDING_DEPT_APPROVAL', actedOn: false },
        { label: 'High-Value Approval', status: 'PENDING_HIGH_VALUE_APPROVAL', actedOn: false },
        { label: 'Procurement', status: 'PENDING_PROCUREMENT', actedOn: false },
        { label: 'Committee', status: 'PENDING_COMMITTEE', actedOn: false },
        { label: 'Dept Confirmation', status: 'PENDING_DEPT_CONFIRMATION', actedOn: false },
        { label: 'Returned to Procurement', status: 'RETURNED_TO_PROCUREMENT', actedOn: false },
        { label: 'Final Finance', status: 'PENDING_FINAL_FINANCE', actedOn: false },
        { label: 'Awaiting Payment', status: 'PENDING_PAYMENT', actedOn: false },
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
  const { user, isAdminHrManager } = useAuthStore();

  const role = user?.role || '';
  const isAdminHr = isAdminHrManager();
  /** Finance's own Lead / Head of Department — the Finance desk's powers. */
  const isFinanceLead = ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS'].includes(role) &&
    user?.department_code === 'FOS';
  /** Finance's Head of Department — the only one who fills the second high-value seat. */
  const isFinanceHod = role === 'HEAD_OF_PROGRAMS' && user?.department_code === 'FOS';
  const tabs = getRoleTabs(role, isAdminHr, isFinanceLead);

  // Tab, page and filters are remembered so that viewing a request and coming
  // back returns to the same place in the queue.
  const [storedTabIdx, setTabIdx] = usePersistentState('procApprovals.tab', 0);
  const tabIdx = Math.min(storedTabIdx, Math.max(tabs.length - 1, 0));
  const [page, setPage] = usePersistentState('procApprovals.page', 0);
  const [rowsPerPage, setRowsPerPage] = usePersistentState('procApprovals.rowsPerPage', 15);
  const [approvalSearch, setApprovalSearch] = usePersistentState('procApprovals.search', '');
  const [approvalDeptFilter, setApprovalDeptFilter] = usePersistentState('procApprovals.dept', '');
  const [approvalPriorityFilter, setApprovalPriorityFilter] = usePersistentState('procApprovals.priority', '');
  const [departments, setDepartments] = useState<{id: number; department_name: string}[]>([]);

  useEffect(() => {
    api.get('/departments').then(res => { if (res.data.success) setDepartments(res.data.data); }).catch(() => {});
  }, []);
  const [action, setAction] = useState<ActionState | null>(null);
  const [comments, setComments] = useState('');
  const [committeeDecisionVal, setCommitteeDecisionVal] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [highValueDecisionVal, setHighValueDecisionVal] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [selectedQuotId, setSelectedQuotId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  // Payments are often settled in batches, so several POP documents may be
  // attached in one go; more can be added later from the request detail page.
  const [popFileQueue, setPopFileQueue] = useState<File[]>([]);
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


  const currentTab = tabs[tabIdx];
  const currentStatus = currentTab?.status;
  const isActedOnTab = currentTab?.actedOn === true;

  const { data: rawRequests = [], isLoading, error, refetch } = useQuery({
    queryKey: ['proc-approvals', role, currentStatus, isActedOnTab],
    queryFn: () => getPurchaseRequests(isActedOnTab ? { limit: 100 } : { status: currentStatus, limit: 100 }),
    enabled: Boolean(currentTab),
    refetchInterval: 30000
  });

  // Everything this user can see, once, so every tab can show its count.
  // Overdue proof of payment on a request this user approved blocks their approvals.
  const { data: popObligations } = useQuery({
    queryKey: ['proc-pop-obligations'],
    queryFn: getPopObligations,
    staleTime: 30000
  });

  const { data: allVisible = [], refetch: refetchCounts } = useQuery({
    queryKey: ['proc-approvals-counts', role],
    queryFn: () => getPurchaseRequests({ limit: 1000 }),
    enabled: tabs.length > 0,
    refetchInterval: 30000
  });
  const tabCount = (t: { status: string; actedOn: boolean }) =>
    (allVisible as ProcRequest[]).filter(r => (t.actedOn ? !ACTED_ON_EXCLUDED.includes(r.status) : r.status === t.status)).length;

  // For acted-on tab: only exclude DRAFT so ALL completed/forwarded items remain visible
  const rawFiltered = isActedOnTab
    ? (rawRequests as ProcRequest[]).filter(r => !ACTED_ON_EXCLUDED.includes(r.status))
    : rawRequests as ProcRequest[];

  const requests = rawFiltered
    .filter(r => {
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
    })
    .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['proc-approvals'] });
    qc.invalidateQueries({ queryKey: ['proc-approvals-counts'] });
    qc.invalidateQueries({ queryKey: ['proc-requests'] });
    qc.invalidateQueries({ queryKey: ['proc-dashboard'] });
  };

  // ─── Generate & download Purchase Order PDF for a completed request ──────
  const [poDownloading, setPoDownloading] = useState(false);
  const downloadPurchaseOrderForRequest = async (requestId: number) => {
    setPoDownloading(true);
    try {
      const request = await getPurchaseRequestById(String(requestId)) as any;
      if (!request) { toast.error('Could not load request details'); return; }
      // A split award prints one page per supplier, in one PDF.
      downloadPurchaseOrderPDF(request, `PO-${request.request_code}-${format(new Date(), 'yyyy-MM-dd')}`);
    } catch {
      toast.error('Failed to generate Purchase Order PDF');
    } finally {
      setPoDownloading(false);
    }
  };

  // ─── Execute approval action ────────────────────────────────────────────
  const doAction = async () => {
    if (!action) return;
    if (action.type === 'reject' && !comments.trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    if (action.type === 'final_finance' && popFileQueue.length === 0) {
      toast.error('At least one Proof of Payment (POP) document is required for final approval');
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
          popFileQueue.forEach(f => fd.append('files', f));
          if (comments) fd.append('comments', comments);
          await finalFinanceApproval(id, fd);
          toast.success('Final approval granted — Procurement COMPLETED!');
          const capturedFile = popFileQueue.map(f => f.name).join(', ');
          const capturedComments = comments;
          const capturedId = id;
          setPopFileQueue([]);
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
        case 'high_value': {
          if (highValueDecisionVal === 'REJECTED' && !comments.trim()) {
            toast.error('A reason is required when rejecting');
            setActionLoading(false);
            return;
          }
          const hv = await highValueDecision(id, highValueDecisionVal, comments);
          toast.success(hv.message);
          break;
        }
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

  // ─── Row actions ─────────────────────────────────────────────────────────
  // Each row offers what THIS user may do on it, decided by stage and by who
  // owns the decision: the Lead / HOD of the department the partner's project
  // belongs to, Finance, Procurement, the Committee, or the Super Admin. A
  // Lead / HOD of any other department — including Admin & HR — sees the row
  // but gets no action on it. The server enforces the same rules.
  type RowAction = {
    key: string;
    label: string;
    icon?: React.ReactNode;
    color?: 'primary' | 'success' | 'error' | 'warning' | 'secondary' | 'inherit';
    onClick: () => void;
  };

  const rowActions = (req: ProcRequest): RowAction[] => {
    const acts: RowAction[] = [];
    const open = () => navigate(`/procurement/requests/${req.id}`);
    const start = (type: ActionType, extra?: () => void) => () => {
      setAction({ type, request: req }); setComments(''); extra?.();
    };
    const isAdmin = role === 'ADMIN';
    const ownsProject = ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS'].includes(role) &&
      Number(user?.department_id) === Number((req as any).routing_department_id || req.department_id);
    const isFinanceDesk = role === 'FINANCE_CLERK' || isFinanceLead || isAdmin;
    const isProcurement = role === 'PROCUREMENT_OFFICER' || isAdmin;
    const v2 = isWorkflowV2(req);
    const reject: RowAction = { key: 'reject', label: 'Reject', icon: <RejectIcon fontSize="small" />, color: 'error', onClick: start('reject') };

    switch (req.status) {
      case 'PENDING_DEPT_APPROVAL':
        if (ownsProject || isAdmin) {
          acts.push({ key: 'approve', label: 'Approve', icon: <ApproveIcon fontSize="small" />, color: 'success', onClick: start('approve_dept') }, reject);
        }
        break;
      case 'PENDING_GS_APPROVAL':
        if (isAdmin) {
          acts.push({ key: 'approve', label: 'Approve (GS)', icon: <ApproveIcon fontSize="small" />, color: 'success', onClick: start('approve_dept') }, reject);
        }
        break;
      case 'PENDING_PROCUREMENT': {
        // Pricing and awarding needs the request's own items, so it is done
        // on the request page.
        if (isProcurement) acts.push({ key: 'quote', label: 'Quotations & Award', icon: <UploadIcon fontSize="small" />, onClick: open });
        const deptAt = (req as any).dept_approved_at;
        const withinWindow = !deptAt || ((Date.now() - new Date(deptAt).getTime()) / 36e5) <= 12;
        if ((ownsProject || isAdmin) && withinWindow) {
          acts.push({ key: 'reverse', label: 'Undo approval', icon: <UndoIcon fontSize="small" />, color: 'warning',
            onClick: () => setDeptConfirmData({ requestId: req.id, comments: '' }) });
        }
        if (role === 'PROCUREMENT_OFFICER' || isAdmin) acts.push({ ...reject, key: 'reject-proc' });
        break;
      }
      case 'PENDING_COMMITTEE':
        if (role === 'PROCUREMENT_COMMITTEE' || isAdmin) {
          acts.push({ key: 'vote', label: 'Vote', icon: <CommitteeIcon fontSize="small" />,
            onClick: start('committee', () => { setCommitteeDecisionVal('APPROVED'); setSelectedQuotId(null); }) });
        }
        break;
      case 'PENDING_HIGH_VALUE_APPROVAL':
        // The Super Admin and Finance's Head of Department only.
        if (isAdmin || isFinanceHod) {
          if (v2) {
            acts.push({ key: 'hv', label: 'Review & Decide', icon: <ApproveIcon fontSize="small" />, color: 'success', onClick: open });
          } else {
            acts.push(
              { key: 'hv-approve', label: 'Approve', icon: <ApproveIcon fontSize="small" />, color: 'success',
                onClick: start('high_value', () => setHighValueDecisionVal('APPROVED')) },
              { key: 'hv-reject', label: 'Reject', icon: <RejectIcon fontSize="small" />, color: 'error',
                onClick: start('high_value', () => setHighValueDecisionVal('REJECTED')) }
            );
          }
        }
        break;
      case 'PENDING_DEPT_CONFIRMATION':
        if (ownsProject) acts.push({ key: 'confirm', label: 'Confirm Award', icon: <ApproveIcon fontSize="small" />, color: 'success', onClick: open });
        break;
      case 'PENDING_FINAL_FINANCE':
        if (isFinanceDesk) {
          if (v2) {
            acts.push({ key: 'pay', label: 'Approve for Payment', icon: <ApproveIcon fontSize="small" />, color: 'success', onClick: open });
          } else {
            acts.push({ key: 'final', label: 'Final Approve', icon: <ApproveIcon fontSize="small" />, color: 'success', onClick: start('final_finance') }, reject);
          }
        }
        break;
      case 'PENDING_PAYMENT':
        if (isFinanceDesk) acts.push({ key: 'payment', label: 'Add Payment', icon: <ApproveIcon fontSize="small" />, onClick: open });
        break;
      case 'RETURNED_TO_PROCUREMENT':
        if (isProcurement) acts.push({ key: 'amend', label: 'Amend & Resubmit', icon: <UndoIcon fontSize="small" />, color: 'warning', onClick: open });
        break;
      case 'COMPLETED':
        if (isFinanceDesk || isProcurement) {
          acts.push({ key: 'po', label: 'Purchase Order', icon: <PdfIcon fontSize="small" />, color: 'inherit',
            onClick: () => downloadPurchaseOrderForRequest(req.id) });
        }
        break;
      default:
        break;
    }
    return acts;
  };

  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; actions: RowAction[] } | null>(null);

  /**
   * One consistent layout per row: open, the main action, Reject beside it
   * where it applies, and anything else in the ⋮ menu.
   */
  const renderActions = (req: ProcRequest) => {
    const acts = rowActions(req);
    const [primary, ...others] = acts;
    const inline = others.find(a => a.color === 'error' && (a.key === 'reject' || a.key === 'hv-reject'));
    const menu = others.filter(a => a !== inline);
    const compact = { minWidth: 0, px: 1.25, py: 0.25, fontSize: '0.75rem', whiteSpace: 'nowrap' as const, lineHeight: 1.6 };
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
        <Tooltip title="Open request">
          <IconButton size="small" onClick={() => navigate(`/procurement/requests/${req.id}`)}>
            <ViewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {primary ? (
          <Button size="small" variant="contained" disableElevation
            color={primary.color === 'inherit' ? 'primary' : (primary.color || 'primary')}
            onClick={primary.onClick} sx={compact}>
            {primary.label}
          </Button>
        ) : (
          <Typography variant="caption" color="text.disabled" sx={{ px: 0.5, whiteSpace: 'nowrap' }}>View only</Typography>
        )}
        {inline && (
          <Button size="small" variant="outlined" color="error" onClick={inline.onClick} sx={compact}>
            {inline.label}
          </Button>
        )}
        {menu.length > 0 && (
          <IconButton size="small" onClick={e => setRowMenu({ anchor: e.currentTarget, actions: menu })}>
            <MoreIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
    );
  };

  // Requests waiting on this user specifically (a Purchase Order download on a
  // completed request is not "waiting").
  const actionableCount = (allVisible as ProcRequest[])
    .filter(r => r.status !== 'COMPLETED' && rowActions(r).length > 0).length;

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
      {/* Header — compact */}
      <Paper elevation={0} sx={{ px: 2.5, py: 1.5, mb: 2, background: `linear-gradient(135deg, #e65100 0%, #bf360c 100%)`, color: 'white', borderRadius: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <PendingIcon sx={{ fontSize: 28 }} />
            <Box>
              <Typography variant="h6" fontWeight={700} lineHeight={1.2}>Procurement Approval Queue</Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                {formatRoleLabel(user?.role, (user as any)?.job_title)}
                {actionableCount > 0 ? ` · ${actionableCount} need${actionableCount === 1 ? 's' : ''} your action` : ' · nothing waiting on you'}
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Tooltip title={requests.length === 0 ? 'No records to export' : `Export ${requests.length} records to Excel`}>
              <span>
                <IconButton size="small" onClick={exportToExcel} disabled={requests.length === 0} sx={{ color: 'white' }}>
                  <ExportIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={() => { refetch(); refetchCounts(); }} sx={{ color: 'white' }}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Paper>

      <PopObligationsAlert obligations={popObligations} />

      <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {/* Tabs — every tab shows how many items it holds */}
        {tabs.length > 1 && (
          <Tabs
            value={tabIdx}
            onChange={(_, v) => { setTabIdx(v); setPage(0); }}
            variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
            sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5, px: 1.5, textTransform: 'none', fontSize: '0.82rem' } }}
          >
            {tabs.map((t, i) => {
              const n = tabCount(t);
              return (
                <Tab
                  key={t.status || `tab-${i}`}
                  label={
                    <Box display="flex" alignItems="center" gap={0.75}>
                      {t.label}
                      {n > 0 && (
                        <Chip label={n} size="small" color={t.actedOn ? 'default' : 'error'}
                          sx={{ height: 18, fontSize: '0.68rem', '& .MuiChip-label': { px: 0.75 } }} />
                      )}
                    </Box>
                  }
                />
              );
            })}
          </Tabs>
        )}

        {/* Filters — one line */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}
          sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
          <TextField
            size="small" placeholder="Search code, title, requester…" sx={{ flex: 2, minWidth: 200, bgcolor: 'background.paper' }}
            value={approvalSearch} onChange={e => { setApprovalSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <TextField select size="small" label="Department" sx={{ flex: 1, minWidth: 160, bgcolor: 'background.paper' }}
            value={approvalDeptFilter} onChange={e => { setApprovalDeptFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All departments</MenuItem>
            {departments.map(d => <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Priority" sx={{ width: { sm: 130 }, bgcolor: 'background.paper' }}
            value={approvalPriorityFilter} onChange={e => { setApprovalPriorityFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map(p => (
              <MenuItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</MenuItem>
            ))}
          </TextField>
          {(approvalSearch || approvalDeptFilter || approvalPriorityFilter) && (
            <Button size="small" startIcon={<ClearIcon />} onClick={() => { setApprovalSearch(''); setApprovalDeptFilter(''); setApprovalPriorityFilter(''); }}>
              Clear
            </Button>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' }, whiteSpace: 'nowrap' }}>
            {requests.length} {requests.length === 1 ? 'request' : 'requests'}
          </Typography>
        </Stack>

        {isLoading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress size={28} /></Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>Failed to load requests.</Alert>
        ) : requests.length === 0 ? (
          <Box textAlign="center" py={4}>
            <ApproveIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 0.5 }} />
            <Typography variant="subtitle1" color="text.secondary">
              {isActedOnTab ? 'No requests here yet' : 'Nothing waiting in this queue'}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {isActedOnTab ? 'Requests you can see will appear here for tracking.' : 'All caught up — check back later.'}
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small" sx={{ '& td, & th': { py: 0.75 } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50', '& th': { fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.3 } }}>
                    <TableCell>Request</TableCell>
                    <TableCell>Requester</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Updated</TableCell>
                    <TableCell align="right" sx={{ ...stickyActionHeadCell('grey.50') }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((req) => {
                    const amount = Number((req as any).selected_quotation_amount || req.total_estimated_amount || 0);
                    return (
                      <TableRow key={req.id} hover sx={{ '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) } }}>
                        <TableCell sx={{ maxWidth: 320 }}>
                          <Box display="flex" alignItems="center" gap={0.75}>
                            <Typography variant="body2" fontWeight={700} color="primary"
                              sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                              onClick={() => navigate(`/procurement/requests/${req.id}`)}>
                              {req.request_code}
                            </Typography>
                            {Number((req as any).is_high_value) === 1 && (
                              <Tooltip title="USD 5,000 or more — approved by the Super Admin and the Finance Head of Department only">
                                <Chip label="HIGH VALUE" size="small" color="error" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }} />
                              </Tooltip>
                            )}
                          </Box>
                          <Typography variant="caption" color="text.secondary" display="block" noWrap title={req.title}>
                            {req.title}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>{req.first_name} {req.last_name}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap display="block">{req.department_name}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600} noWrap>
                            ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </Typography>
                          {(req as any).selected_quotation_amount != null && (
                            <Typography variant="caption" color="text.secondary" display="block">awarded</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={PROC_STATUS_LABELS[req.status] || req.status}
                            color={PROC_STATUS_COLORS[req.status] as any || 'default'}
                            size="small" sx={{ height: 22, fontSize: '0.72rem' }}
                          />
                          <Box display="flex" alignItems="center" gap={0.5} mt={0.25}>
                            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: `${PRIORITY_COLOR[req.priority] === 'default' ? 'grey' : PRIORITY_COLOR[req.priority]}.main` }} />
                            <Typography variant="caption" color="text.secondary">
                              {req.priority ? req.priority.charAt(0) + req.priority.slice(1).toLowerCase() : ''} priority
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {format(new Date(req.updated_at ?? req.created_at), 'dd MMM yyyy')}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ ...stickyActionCell() }}>{renderActions(req)}</TableCell>
                      </TableRow>
                    );
                  })}
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
              sx={{ borderTop: 1, borderColor: 'divider' }}
            />
          </>
        )}
      </Paper>

      {/* Secondary row actions */}
      <Menu anchorEl={rowMenu?.anchor} open={Boolean(rowMenu)} onClose={() => setRowMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {(rowMenu?.actions || []).map(a => (
          <MenuItem key={a.key} dense onClick={() => { setRowMenu(null); a.onClick(); }}>
            {a.icon && <ListItemIcon sx={{ color: a.color && a.color !== 'inherit' ? `${a.color}.main` : undefined }}>{a.icon}</ListItemIcon>}
            <ListItemText>{a.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      {/* ─── Action Confirm Dialog ─────────────────────────────────────────── */}
      <Dialog open={Boolean(action)} onClose={() => { if (!actionLoading) { setAction(null); setPopFileQueue(null); } }} maxWidth="sm" fullWidth>
        <DialogTitle>
          {action?.type === 'approve_dept' && 'Approve — Department Level'}
          {action?.type === 'approve_finance' && 'Approve — Finance Review'}
          {action?.type === 'final_finance' && 'Final Finance Approval'}
          {action?.type === 'reject' && 'Reject Request'}
          {action?.type === 'submit_committee' && 'Submit to Procurement Committee'}
          {action?.type === 'committee' && 'Record Committee Vote'}
          {action?.type === 'high_value' && 'High-Value Approval'}
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
                      {committeeVotes.filter((v: any) => v.vote === 'APPROVED').length}/3 approved — 3 total approvals needed to advance.{Number((action?.request as any)?.is_high_value) === 1 ? ' This request is high-value: the committee recommends, then the Super Admin and the Finance Lead / Head of Department must both approve.' : ''}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {action?.type === 'high_value' && (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  The Procurement Committee has <strong>recommended</strong> this request.
                  It proceeds to the Finance desk only once <strong>both</strong> the Super Admin
                  and the Finance Lead / Head of Department have approved.
                  A rejection by either returns it to be amended and resubmitted.
                </Alert>
                <TextField
                  select fullWidth label="Your Decision" value={highValueDecisionVal}
                  onChange={e => setHighValueDecisionVal(e.target.value as any)}
                  sx={{ mb: 2 }}
                >
                  <MenuItem value="APPROVED">Approve</MenuItem>
                  <MenuItem value="REJECTED">Reject</MenuItem>
                </TextField>
              </>
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

            {action?.type === 'committee' && Boolean(action.request.quotation_count) && (
              <Alert
                severity="info" sx={{ mb: 2 }}
                action={
                  <Button size="small" onClick={() => navigate(`/procurement/requests/${action.request.id}`)}>
                    Open Bid Comparison
                  </Button>
                }
              >
                This request has {action.request.quotation_count} quotation(s). The Bid Comparison
                on the request page shows what each supplier quoted for every requested item.
              </Alert>
            )}

            {action?.type === 'final_finance' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                At least one Proof of Payment (POP) document is <strong>required</strong> to complete final approval.
                You can attach several at once if the payment was made in batches, and add more later from the request detail page.
              </Alert>
            )}
            {action?.type === 'final_finance' && (
              <Box sx={{ mb: 2 }}>
                <Button
                  variant={popFileQueue.length ? 'outlined' : 'contained'}
                  component="label"
                  startIcon={<UploadIcon />}
                  fullWidth
                  color={popFileQueue.length ? 'success' : 'primary'}
                >
                  {popFileQueue.length
                    ? `✓ ${popFileQueue.length} document${popFileQueue.length === 1 ? '' : 's'} selected — add more`
                    : 'Upload Proof of Payment (POP) *'}
                  <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={e => {
                      const picked = Array.from(e.target.files || []);
                      // Append rather than replace so batches can be chosen in
                      // separate passes, skipping duplicates.
                      setPopFileQueue(prev => [
                        ...prev,
                        ...picked.filter(f => !prev.some(p => p.name === f.name && p.size === f.size))
                      ].slice(0, 10));
                      e.target.value = '';
                    }} />
                </Button>
                {popFileQueue.length > 0 && (
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {popFileQueue.map((f, i) => (
                      <Chip
                        key={`${f.name}-${i}`}
                        label={`${f.name} (${(f.size / 1024).toFixed(0)} KB)`}
                        size="small"
                        onDelete={() => setPopFileQueue(prev => prev.filter((_, idx) => idx !== i))}
                        sx={{ justifyContent: 'space-between' }}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            )}

            <TextField
              fullWidth multiline rows={3}
              label={
                action?.type === 'reject' ||
                (action?.type === 'high_value' && highValueDecisionVal === 'REJECTED')
                  ? 'Rejection Reason *'
                  : 'Comments (optional)'
              }
              value={comments}
              onChange={e => setComments(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAction(null); setPopFileQueue([]); }} disabled={actionLoading}>Cancel</Button>
          <Button
            variant="contained"
            color={action?.type === 'reject' ? 'error' : 'primary'}
            onClick={doAction}
            disabled={actionLoading || (action?.type === 'final_finance' && popFileQueue.length === 0)}
            startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
          >
            {action?.type === 'final_finance' && popFileQueue.length === 0 ? 'Upload POP to Continue' : 'Confirm'}
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
            disabled={reversingPOP || poDownloading}
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
          <Button
            variant="contained"
            color="success"
            startIcon={poDownloading ? <CircularProgress size={16} /> : <DownloadIcon />}
            disabled={poDownloading || reversingPOP}
            onClick={() => popConfirmData?.requestId && downloadPurchaseOrderForRequest(popConfirmData.requestId)}
          >
            Download PO
          </Button>
          <Button variant="outlined" onClick={() => setPopConfirmData(null)} disabled={reversingPOP || poDownloading}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProcurementApprovalsPage;
