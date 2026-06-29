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
  TablePagination,
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
  Divider,
  InputAdornment,
  MenuItem,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery
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
  Description as DescriptionIcon,
  TableChart as ExcelIcon,
  Print as PrintIcon,
  PictureAsPdf as PdfIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  AttachFile as AttachIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { format, formatDistanceToNow } from 'date-fns';
import { downloadHTMLAsPDF, buildDigitalStamp, buildTravelClaimPageHTML } from '../utils/pdfUtils';

import { Request, RequestItem, BudgetImpact, ApprovalPayload, PerDiemClaim } from '../types';
import { approvalService } from '../services/approvalService';
import { requestService } from '../services/requestService';
import attachmentService from '../services/attachmentService';
import perDiemService from '../services/perDiemService';
import { useAuthStore } from '../store/authStore';
import TravelClaimSection from '../components/requests/TravelClaimSection';
import { reconciliationService } from '../services/reconciliationService';

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // ── HARDCODED BRANDING ────────────────────────────────────────────────────
  const POWERED_BY = 'Powered By Kudakwashe C Marufu' as const;
  const DOC_TITLE  = 'Float Requisition' as const;
  // ──────────────────────────────────────────────────────────────────────────
  
  const [tabValue, setTabValue] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
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
  const [dialogAction, setDialogAction] = useState<'approve' | 'reject' | 'reverse' | 'view'>('approve');
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogPerDiemClaim, setDialogPerDiemClaim] = useState<PerDiemClaim | null>(null);

  // ── Filter state ─────────────────────────────────────────────────────────
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // ── Post-approval PDF download ────────────────────────────────────────────
  const [postApprovalPDFDialog, setPostApprovalPDFDialog] = useState(false);
  const [postApprovalRequest, setPostApprovalRequest] = useState<{ id: number; request_code: string } | null>(null);
  const [departments, setDepartments] = useState<{ id: number; department_name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: number; project_name: string; project_code: string }[]>([]);
  const [dialogAttachments, setDialogAttachments] = useState<any[]>([]);

  useEffect(() => {
    fetchAllData();
  }, []);

  // Fetch departments and projects for filters
  useEffect(() => {
    import('../services/api').then(({ default: api }) => {
      api.get('/departments').then(res => {
        if (res.data?.success) setDepartments(res.data.data || []);
      }).catch(() => {});
      api.get('/projects').then(res => {
        if (res.data?.success) setProjects(res.data.data || []);
      }).catch(() => {});
    });
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

  const handleOpenDialog = async (request: Request, action: 'approve' | 'reject' | 'reverse' | 'view') => {
    setSelectedRequest(request);
    setDialogAction(action);
    setComments('');
    setBudgetImpact([]);
    setFullRequestDetails(null);
    setRequestItems([]);
    setDialogAttachments([]);
    setDialogPerDiemClaim(null);
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
    }

    // Fetch per diem claim if present
    try {
      const pdRes = await perDiemService.getClaim(request.id);
      if (pdRes) setDialogPerDiemClaim(pdRes);
    } catch {
      // no per diem claim for this request
    }

    // Fetch attachments so approvers can download them
    try {
      const attRes = await attachmentService.getEntityAttachments('REQUEST', request.id);
      const attList = Array.isArray(attRes) ? attRes : (attRes as any)?.data || [];
      setDialogAttachments(attList);
    } catch (err) {
      console.error('Failed to load attachments:', err);
    }

    setIsLoadingDetails(false);

    if (action === 'approve' || action === 'view') {
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
          if (dialogAction === 'approve') {
            setPostApprovalRequest({ id: selectedRequest.id, request_code: selectedRequest.request_code });
            setPostApprovalPDFDialog(true);
          } else {
            toast.success('Request rejected');
          }
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
      case 'PENDING_ADMIN_APPROVAL': return 'info';
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

  // ── Client-side filter helper ────────────────────────────────────────────
  const applyFilters = (reqs: Request[]) => {
    return reqs.filter(r => {
      const searchLc = filterSearch.toLowerCase();
      if (filterSearch && !(
        r.request_code?.toLowerCase().includes(searchLc) ||
        (r as any).requester_first_name?.toLowerCase().includes(searchLc) ||
        (r as any).requester_last_name?.toLowerCase().includes(searchLc) ||
        r.department_name?.toLowerCase().includes(searchLc)
      )) return false;
      if (filterDept && String((r as any).department_id) !== filterDept) return false;
      if (filterProject && String((r as any).project_id) !== filterProject) return false;
      if (filterPriority && r.priority !== filterPriority) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterDateFrom && new Date(r.created_at) < new Date(filterDateFrom)) return false;
      if (filterDateTo && new Date(r.created_at) > new Date(filterDateTo + 'T23:59:59')) return false;
      return true;
    });
  };

  const hasFilters = Boolean(filterSearch || filterDept || filterProject || filterPriority || filterStatus || filterDateFrom || filterDateTo);

  const clearFilters = () => {
    setFilterSearch(''); setFilterDept(''); setFilterProject('');
    setFilterPriority(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo('');
  };

  // ── Single-record PDF download (per row) ──────────────────────────────
  const handleDownloadSinglePDF = async (requestId: number) => {
    try {
      toast.info('Generating PDF…');
      const resp = await requestService.getById(requestId);
      if (!resp.success || !resp.data) { toast.error('Could not load request data'); return; }
      const req = resp.data as any;
      const items: any[] = req.items || [];
      const trail: any[] = req.approvalTrail || [];
      const total = items.reduce((s: number, it: any) => s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0);

      let perDiemClaim: any = null;
      try { perDiemClaim = await perDiemService.getClaim(requestId); } catch { /* no claim */ }

      const itemRows = items.map((it: any, i: number) => `
        <tr>
          <td>${i + 1}</td><td>${it.budget_code || '—'}</td><td>${it.item_description || it.description || '—'}</td>
          <td align="right">${Number(it.quantity)}</td><td>${it.unit_of_measure || ''}</td>
          <td align="right">$${Number(it.unit_price || 0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
          <td align="right">$${(Number(it.unit_price||0)*Number(it.quantity||0)).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
        </tr>`).join('');
      const trailRows = trail.map((t: any) => `
        <tr>
          <td class="act-${t.action}">${t.action}</td>
          <td>${t.approver_first_name || t.actor_name || ''} ${t.approver_last_name || ''}</td>
          <td>${(t.approver_role || t.actor_role || '').replace(/_/g,' ')}</td>
          <td>${t.comments || t.comment || '—'}</td>
          <td>${t.created_at ? format(new Date(t.created_at),'dd MMM yyyy HH:mm') : '—'}</td>
        </tr>`).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${DOC_TITLE} — ${req.request_code}</title>
<style>
  * {box-sizing:border-box;}
  body {font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;margin:0;padding:20px;}
  .doc-header {background:white;border-bottom:2px solid #006064;padding:12px 0 12px;margin-bottom:18px;}
  .doc-header .org {font-size:12px;font-weight:bold;color:#006064;letter-spacing:.4px;margin-bottom:4px;}
  .doc-header h1 {font-size:20px;margin:0 0 4px;color:#006064;}
  .doc-header p {margin:2px 0;font-size:12px;color:#444;}
  .meta-grid {display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px;padding:12px;border:1px solid #e0e0e0;border-radius:4px;}
  .meta-item label {display:block;font-size:10px;color:#777;text-transform:uppercase;margin-bottom:2px;}
  .meta-item span {font-weight:600;font-size:13px;}
  .meta-full {grid-column:1/-1;}
  h3 {font-size:13px;color:#006064;border-bottom:1.5px solid #006064;padding-bottom:3px;margin:14px 0 8px;text-transform:uppercase;letter-spacing:.5px;}
  table {width:100%;border-collapse:collapse;font-size:12px;}
  thead th {background:#006064;color:white;padding:7px 9px;text-align:left;}
  tbody td {padding:6px 9px;border-bottom:1px solid #e0e0e0;}
  tbody tr:nth-child(even) td {background:#f7f7f7;}
  .total-row td {font-weight:bold;background:#e0f2f1 !important;border-top:1.5px solid #006064;font-size:13px;}
  .act-APPROVED {color:#2e7d32;font-weight:bold;} .act-REJECTED {color:#c62828;font-weight:bold;} .act-SUBMITTED {color:#1565c0;font-weight:bold;}
  .sig-block {display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:28px;}
  .sig-col {text-align:center;} .sig-line {border-top:1px solid #333;margin-top:40px;padding-top:6px;font-size:11px;color:#555;}
  .page-footer {margin-top:24px;padding-top:8px;border-top:2px solid #e0e0e0;display:flex;justify-content:space-between;}
  .footer-left {font-size:10px;color:#999;} .footer-right {font-size:10px;font-weight:bold;color:#006064;}
</style></head><body>
<div class="doc-header">
  <div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div>
  <h1>${DOC_TITLE}</h1>
  <p><strong>${req.request_code}</strong> &nbsp;|&nbsp; ${req.department_name||''} &nbsp;|&nbsp; ${req.requester_first_name||''} ${req.requester_last_name||''}</p>
  <p>Status: <strong>${req.status?.replace(/_/g,' ')}</strong> &nbsp;|&nbsp; Total: <strong>$${Number(req.total_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}</strong></p>
</div>
<div class="meta-grid">
  <div class="meta-item"><label>Reference</label><span>${req.request_code}</span></div>
  <div class="meta-item"><label>Department</label><span>${req.department_name||'—'}</span></div>
  <div class="meta-item"><label>Requester</label><span>${req.requester_first_name||''} ${req.requester_last_name||''}</span></div>
  <div class="meta-item"><label>Status</label><span>${req.status?.replace(/_/g,' ')}</span></div>
  <div class="meta-item"><label>Partner / Donor</label><span>${req.donor_name||'—'}${req.donor_code ? ` (${req.donor_code})` : ''}</span></div>
  <div class="meta-item"><label>Project</label><span>${req.project_name ? `${req.project_code} — ${req.project_name}` : '—'}</span></div>
  <div class="meta-item"><label>Submitted</label><span>${req.submitted_at ? format(new Date(req.submitted_at),'dd MMM yyyy') : '—'}</span></div>
  <div class="meta-item meta-full"><label>Purpose of Float</label><span>${req.justification||'—'}</span></div>
  ${(req.is_activity_request || req.activity_start_date || req.activity_end_date) ? `
  <div class="meta-item meta-full" style="background:#fff8e1;border-left:4px solid #f9a825;padding:6px 10px;border-radius:0 4px 4px 0;">
    <label style="color:#f57f17">Activity Dates</label>
    <span style="font-weight:bold;color:#f57f17">YES — Scheduled Activity</span>
  </div>
  <div class="meta-item"><label>Activity Start Date</label><span>${req.activity_start_date ? format(new Date(req.activity_start_date),'dd MMM yyyy') : '—'}</span></div>
  <div class="meta-item"><label>Activity End Date</label><span>${req.activity_end_date ? format(new Date(req.activity_end_date),'dd MMM yyyy') : '—'}</span></div>
  ` : ''}
</div>
<h3>Request Items</h3>
<table><thead><tr><th>#</th><th>Budget Code</th><th>Description</th><th align="right">Qty</th><th>Unit</th><th align="right">Unit Price</th><th align="right">Subtotal</th></tr></thead>
<tbody>${itemRows}<tr class="total-row"><td colspan="6" align="right">TOTAL:</td><td align="right">$${total.toLocaleString(undefined,{minimumFractionDigits:2})}</td></tr></tbody></table>
${trail.length>0?`<h3>Approval Trail</h3><table><thead><tr><th>Action</th><th>By</th><th>Role</th><th>Comments</th><th>Date</th></tr></thead><tbody>${trailRows}</tbody></table>`:''}
<div class="sig-block">
  <div class="sig-col"><div class="sig-line">Requester: ${req.requester_first_name||''} ${req.requester_last_name||''}</div></div>
  <div class="sig-col"><div class="sig-line">Programme Lead / HOP</div></div>
  <div class="sig-col"><div class="sig-line">Finance Clerk</div></div>
</div>
<div class="page-footer">
  <div class="footer-left"><div>Generated: ${format(new Date(),'dd MMM yyyy HH:mm')}</div><div>ERP Connect - Zimbabwe Council of Churches | CONFIDENTIAL</div></div>
  <div class="footer-right">${POWERED_BY}</div>
</div>
${buildDigitalStamp(req.status||'')}
${perDiemClaim ? buildTravelClaimPageHTML(perDiemClaim, req.request_code, POWERED_BY) : ''}
</body></html>`;
      downloadHTMLAsPDF(html, `float-requisition-${req.request_code}-${format(new Date(),'yyyy-MM-dd')}`);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Failed to generate PDF');
    }
  };
  // ─────────────────────────────────────────────────────────────────────
  const renderRequestsTable = (requests: Request[], showActions: boolean, type: 'pending' | 'approved' | 'rejected') => {
    const filtered = applyFilters(requests);
    const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    // ── Export helpers scoped to tab ────────────────────────────────────
    const exportTabExcel = () => {
      const wb = XLSX.utils.book_new();
      const label = type === 'pending' ? 'Pending Approvals' : type === 'approved' ? 'Approved' : 'Rejected';
      const headers = ['Reference', 'Requester', 'Department', 'Priority', 'Total Amount ($)', 'Status', 'Submitted Date'];
      const rows = filtered.map(r => [
        r.request_code,
        `${(r as any).requester_first_name || ''} ${(r as any).requester_last_name || ''}`.trim(),
        r.department_name || '',
        r.priority || '',
        Number(r.total_amount || 0).toFixed(2),
        r.status.replace(/_/g, ' '),
        (r as any).submitted_at ? format(new Date((r as any).submitted_at), 'dd MMM yyyy') : r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : ''
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [14, 22, 20, 10, 14, 22, 14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, label);
      XLSX.writeFile(wb, `float-requisitions-${type}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    const exportTabPDF = () => {
      const label = type === 'pending' ? 'Pending Approvals' : type === 'approved' ? 'Approved Requisitions' : 'Rejected Requisitions';
      const total = filtered.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const rows = filtered.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${r.request_code}</strong></td>
          <td>${`${(r as any).requester_first_name || ''} ${(r as any).requester_last_name || ''}`.trim()}</td>
          <td>${r.department_name || '—'}</td>
          <td align="right">$${Number(r.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          <td class="status-${type}">${r.status.replace(/_/g, ' ')}</td>
          <td>${(r as any).submitted_at ? format(new Date((r as any).submitted_at), 'dd MMM yyyy') : r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : '—'}</td>
        </tr>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${DOC_TITLE} — ${label}</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:Arial,sans-serif; font-size:13px; color:#1a1a1a; margin:0; padding:20px; }
  .doc-header { background:white; border-bottom:2px solid #006064; color:#006064; padding:12px 0 12px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:flex-end; }
  .doc-header .org { font-size:12px; font-weight:bold; color:#006064; letter-spacing:.4px; margin-bottom:4px; }
  .doc-header h1 { font-size:20px; margin:0; color:#006064; }
  .doc-header p { margin:3px 0; font-size:12px; color:#444; }
  h3 { font-size:13px; color:#006064; border-bottom:1.5px solid #006064; padding-bottom:3px; margin:14px 0 8px; text-transform:uppercase; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  thead th { background:#006064; color:white; padding:7px 9px; text-align:left; }
  tbody td { padding:6px 9px; border-bottom:1px solid #e0e0e0; }
  tbody tr:nth-child(even) td { background:#f7f7f7; }
  .total-row td { font-weight:bold; background:#e0f2f1 !important; border-top:1.5px solid #006064; font-size:13px; }
  .status-pending { color:#e65100; font-weight:bold; }
  .status-approved { color:#2e7d32; font-weight:bold; }
  .status-rejected { color:#c62828; font-weight:bold; }
  .page-footer { margin-top:24px; padding-top:8px; border-top:2px solid #e0e0e0; display:flex; justify-content:space-between; }
  .footer-left { font-size:10px; color:#999; }
  .footer-right { font-size:10px; font-weight:bold; color:#006064; }
  @media print { body{padding:8px;} thead{display:table-header-group;} tr{page-break-inside:avoid;} }
</style></head><body>
<div class="doc-header">
  <div><div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div><h1>${DOC_TITLE} — ${label}</h1><p>Records: <strong>${filtered.length}</strong> &nbsp;|&nbsp; Total: <strong>$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p></div>
  <div style="font-size:11px;color:#666">Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</div>
</div>
<h3>${label} (${filtered.length} records)</h3>
<table>
  <thead><tr><th>#</th><th>Reference</th><th>Requester</th><th>Department</th><th align="right">Amount ($)</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>${rows}<tr class="total-row"><td colspan="4" align="right">TOTAL:</td><td align="right">$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td colspan="2"></td></tr></tbody>
</table>
<div class="page-footer">
  <div class="footer-left"><div>Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</div><div>ERP Connect - Zimbabwe Council of Churches | CONFIDENTIAL</div></div>
  <div class="footer-right">${POWERED_BY}</div>
</div>
${buildDigitalStamp(type === 'approved' ? 'APPROVED' : type === 'rejected' ? 'REJECTED' : 'PENDING')}
</body></html>`;
      downloadHTMLAsPDF(html, `approvals-${type}-${format(new Date(), 'yyyy-MM-dd')}`);
    };
    // ───────────────────────────────────────────────────────────────────

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
      <Box>
        {/* Export bar */}
        <Box display="flex" gap={1} mb={1.5} justifyContent="flex-end">
          <Button size="small" variant="outlined" color="success" startIcon={<ExcelIcon />} onClick={exportTabExcel}>
            Export Excel ({filtered.length})
          </Button>
          <Button size="small" variant="outlined" color="error" startIcon={<PdfIcon />} onClick={exportTabPDF}>
            Download PDF ({filtered.length})
          </Button>
        </Box>
      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 750 }}>
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
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={type === 'approved' ? 9 : type === 'rejected' ? 9 : 8} align="center" sx={{ py: 4 }}>
                  <InfoIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1, display: 'block', mx: 'auto' }} />
                  <Typography color="text.secondary">
                    {hasFilters ? 'No requests match your filters' : `No ${type} requests`}
                  </Typography>
                  {hasFilters && <Button size="small" onClick={clearFilters} sx={{ mt: 1 }}>Clear Filters</Button>}
                </TableCell>
              </TableRow>
            ) : paged.map((request: any) => {
              const canReverse = type === 'approved' && canReverseRequest(request);
              const reversalTime = type === 'approved' ? getReversalTimeRemaining(request) : '';

              return (
                <TableRow key={request.id} hover>
                  <TableCell>
                    <Typography fontWeight="medium">{request.request_code}</Typography>
                  </TableCell>
                  <TableCell>{request.requester_first_name} {request.requester_last_name}</TableCell>
                  <TableCell>
                    <Chip label={request.department_code} size="small" variant="outlined" />
                    {request.department_name && (
                      <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ maxWidth: 120 }}>
                        {request.department_name}
                      </Typography>
                    )}
                    {request.routing_department_id && (
                      <Tooltip title={`Cross-department request — routed to ${request.routing_department_name || 'another department'} for approval`}>
                        <Chip
                          label={`→ ${request.routing_department_code || 'Cross-Dept'}`}
                          size="small"
                          color="warning"
                          variant="outlined"
                          icon={<WarningIcon />}
                          sx={{ mt: 0.5, fontSize: '0.65rem' }}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
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
                      <IconButton size="small" onClick={() => handleOpenDialog(request, 'view')}>
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Download PDF">
                      <IconButton size="small" color="error" onClick={() => handleDownloadSinglePDF(request.id)}>
                        <PdfIcon />
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
      <TablePagination
        component="div"
        count={filtered.length}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 15, 25, 50]}
      />
      </Box>
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
        {/* ── Filter Panel ─────────────────────────────────────────── */}
        <Paper elevation={0} variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
            <FilterIcon fontSize="small" color="action" />
            <Typography variant="body2" fontWeight={600} color="text.secondary">Filters</Typography>
            {hasFilters && (
              <Button size="small" startIcon={<ClearIcon />} onClick={clearFilters} sx={{ ml: 'auto' }}>
                Clear All
              </Button>
            )}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
            <TextField
              size="small" placeholder="Search by code, requester, dept..." sx={{ minWidth: 240, flex: 2 }}
              value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            <TextField
              select size="small" label="Department" sx={{ minWidth: 180, flex: 1 }}
              value={filterDept} onChange={e => setFilterDept(e.target.value)}
            >
              <MenuItem value="">All Departments</MenuItem>
              {departments.map(d => (
                <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select size="small" label="Project" sx={{ minWidth: 180, flex: 1 }}
              value={filterProject} onChange={e => setFilterProject(e.target.value)}
            >
              <MenuItem value="">All Projects</MenuItem>
              {projects.map(p => (
                <MenuItem key={p.id} value={String(p.id)}>{p.project_code} — {p.project_name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select size="small" label="Priority" sx={{ minWidth: 130, flex: 1 }}
              value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            >
              <MenuItem value="">All Priorities</MenuItem>
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => (
                <MenuItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</MenuItem>
              ))}
            </TextField>
            <TextField
              select size="small" label="Status" sx={{ minWidth: 180, flex: 1 }}
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            >
              <MenuItem value="">All Statuses</MenuItem>
              {[
                { v: 'PENDING_ADMIN_APPROVAL', l: 'Pending Admin' },
                { v: 'PENDING_LEAD_APPROVAL', l: 'Pending Lead' },
                { v: 'PENDING_HOP_APPROVAL', l: 'Pending HOP' },
                { v: 'PENDING_FINANCE_APPROVAL', l: 'Pending Finance' },
                { v: 'APPROVED', l: 'Approved' },
                { v: 'REJECTED', l: 'Rejected' },
                { v: 'DISPATCHED', l: 'Dispatched' },
              ].map(s => <MenuItem key={s.v} value={s.v}>{s.l}</MenuItem>)}
            </TextField>
            <TextField size="small" type="date" label="From Date" InputLabelProps={{ shrink: true }} sx={{ minWidth: 150, flex: 1 }}
              value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            <TextField size="small" type="date" label="To Date" InputLabelProps={{ shrink: true }} sx={{ minWidth: 150, flex: 1 }}
              value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </Stack>
          {hasFilters && (
            <Typography variant="caption" color="text.secondary" mt={1} display="block">
              Filters active — results narrowed below
            </Typography>
          )}
        </Paper>

        <Tabs value={tabValue} onChange={(_, v) => { setTabValue(v); setPage(0); }}>
          <Tab label={<Badge badgeContent={stats.pending} color="warning">Pending Approvals</Badge>} />
          <Tab label={<Badge badgeContent={stats.approved} color="success">Approved</Badge>} />
          <Tab label={<Badge badgeContent={stats.rejected} color="error">Rejected</Badge>} />
          <Tab label={<Badge badgeContent={pendingRequests.length + approvedRequests.length + rejectedRequests.length} color="primary">All Requests</Badge>} />
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
        <TabPanel value={tabValue} index={3}>
          {renderRequestsTable(
            Array.from(
              new Map(
                [...pendingRequests, ...approvedRequests, ...rejectedRequests].map(r => [r.id, r])
              ).values()
            ).sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()),
            false,
            'approved'
          )}
        </TabPanel>
      </Paper>

      {/* Approval/Rejection/Reversal Dialog */}
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} maxWidth="lg" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {dialogAction === 'approve' ? 'Approve Request' : dialogAction === 'reject' ? 'Reject Request' : dialogAction === 'reverse' ? 'Reverse Approval' : 'View Request Details'}
        </DialogTitle>
        <DialogContent>
          {isLoadingDetails ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : selectedRequest && (
            <Box>
              {/* Cross-department routing notice */}
              {selectedRequest.routing_department_id && (
                <Alert severity="info" icon={<WarningIcon />} sx={{ mb: 2 }}>
                  <strong>Cross-Department Request:</strong> This request uses a project assigned to the{' '}
                  <strong>{(fullRequestDetails as any)?.routing_department_name || selectedRequest.routing_department_name || 'project-owning'}</strong> department.
                  Approval is routed to the HOP/Lead of that department instead of the requester's department.
                  After approval it will proceed to Finance as normal.
                </Alert>
              )}

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
                    {((fullRequestDetails as any)?.donor_name || (selectedRequest as any)?.donor_name) && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">Partner / Donor</Typography>
                        <Typography fontWeight="medium">
                          {(fullRequestDetails as any)?.donor_name || (selectedRequest as any)?.donor_name}
                          {((fullRequestDetails as any)?.donor_code || (selectedRequest as any)?.donor_code)
                            ? ` (${(fullRequestDetails as any)?.donor_code || (selectedRequest as any)?.donor_code})`
                            : ''}
                        </Typography>
                      </Grid>
                    )}
                    {((fullRequestDetails as any)?.project_name || (selectedRequest as any)?.project_name) && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">Project</Typography>
                        <Typography fontWeight="medium">
                          {(fullRequestDetails as any)?.project_name || (selectedRequest as any)?.project_name}
                          {((fullRequestDetails as any)?.project_code || (selectedRequest as any)?.project_code)
                            ? ` (${(fullRequestDetails as any)?.project_code || (selectedRequest as any)?.project_code})`
                            : ''}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Card>

              {/* Activity Dates (shown when it is an activity request) */}
              {((fullRequestDetails as any)?.is_activity_request || (fullRequestDetails as any)?.activity_start_date || (fullRequestDetails as any)?.activity_end_date ||
                (selectedRequest as any)?.is_activity_request || (selectedRequest as any)?.activity_start_date || (selectedRequest as any)?.activity_end_date) && (
                <Alert severity="warning" icon={<ScheduleIcon />} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700}>Activity Dates</Typography>
                  <Grid container spacing={2} mt={0.5}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Activity Start Date</Typography>
                      <Typography fontWeight={600}>
                        {((fullRequestDetails as any)?.activity_start_date || (selectedRequest as any)?.activity_start_date)
                          ? format(new Date((fullRequestDetails as any)?.activity_start_date || (selectedRequest as any)?.activity_start_date), 'dd MMM yyyy')
                          : '—'}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Activity End Date</Typography>
                      <Typography fontWeight={600}>
                        {((fullRequestDetails as any)?.activity_end_date || (selectedRequest as any)?.activity_end_date)
                          ? format(new Date((fullRequestDetails as any)?.activity_end_date || (selectedRequest as any)?.activity_end_date), 'dd MMM yyyy')
                          : '—'}
                      </Typography>
                    </Grid>
                  </Grid>
                </Alert>
              )}

              {/* Event / Purpose */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle2" color="primary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DescriptionIcon fontSize="small" /> Event / Purpose
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

              {/* Travel & Per Diem Claim (if applicable) */}
              {dialogPerDiemClaim && (
                <Box sx={{ mb: 2 }}>
                  <TravelClaimSection mode="readonly" claim={dialogPerDiemClaim} />
                </Box>
              )}

              {/* Attachments — approvers can view & download uploaded files */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle2" color="primary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AttachIcon fontSize="small" /> Attachments ({dialogAttachments.length})
                  </Typography>
                  {dialogAttachments.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No attachments uploaded for this request.</Typography>
                  ) : (
                    <List dense disablePadding>
                      {dialogAttachments.map((att: any) => (
                        <ListItem
                          key={att.id}
                          disablePadding
                          sx={{ py: 0.5 }}
                          secondaryAction={
                            <Tooltip title="Download">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => attachmentService.downloadAttachment(att.id, att.original_name || att.file_name)}
                              >
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          }
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <AttachIcon fontSize="small" color="action" />
                          </ListItemIcon>
                          <ListItemText
                            primary={att.original_name || att.file_name}
                            secondary={`${att.attachment_type} • ${attachmentService.formatFileSize(att.file_size || 0)} • Uploaded by ${att.first_name || ''} ${att.last_name || ''}`}
                            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                            secondaryTypographyProps={{ variant: 'caption' }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>

              {(dialogAction === 'approve' || dialogAction === 'view') && budgetImpact.length > 0 && (
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

              {dialogAction === 'view' && budgetImpact.some(bi => bi.hasInsufficientFunds) && (
                <Alert severity="warning" sx={{ mb: 2 }}>Warning: One or more budget lines have insufficient funds.</Alert>
              )}

              {/* Approval Trail */}
              {((fullRequestDetails as any)?.approvalTrail?.length > 0) && (
                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="primary" gutterBottom>
                      Approval Trail ({(fullRequestDetails as any).approvalTrail.length} actions)
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Date &amp; Time</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Actor</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Role</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Action</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Comments</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(fullRequestDetails as any).approvalTrail.map((log: any, idx: number) => (
                          <TableRow key={log.id || idx} hover>
                            <TableCell sx={{ fontSize: '0.75rem' }}>
                              {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                              {log.actor_name || `${log.approver_first_name || ''} ${log.approver_last_name || ''}`.trim()}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>
                              <Chip
                                label={(log.actor_role || log.approver_role || '').replace(/_/g, ' ')}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: '0.65rem', height: 20 }}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={log.action.replace(/_/g, ' ')}
                                size="small"
                                color={
                                  log.action.includes('APPROVED') ? 'success'
                                  : log.action.includes('REJECT') ? 'error'
                                  : 'info'
                                }
                                sx={{ fontSize: '0.65rem', height: 20 }}
                              />
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', fontStyle: 'italic' }}>
                              {log.comment || log.comments || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {dialogAction === 'reverse' && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  You are about to reverse your approval. This will move the request back to the previous stage.
                </Alert>
              )}

              {dialogAction !== 'view' && (
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
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
            {dialogAction === 'view' ? 'Close' : 'Cancel'}
          </Button>
          {dialogAction !== 'view' && (
            <Button
              variant="contained"
              color={dialogAction === 'approve' ? 'success' : dialogAction === 'reject' ? 'error' : 'warning'}
              onClick={handleSubmit}
              disabled={isSubmitting || (dialogAction === 'reject' && !comments) || (dialogAction === 'approve' && budgetImpact.some(bi => bi.hasInsufficientFunds))}
              startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : (dialogAction === 'approve' ? <ApproveIcon /> : dialogAction === 'reject' ? <RejectIcon /> : <ReverseIcon />)}
            >
              {dialogAction === 'approve' ? 'Approve' : dialogAction === 'reject' ? 'Reject' : 'Reverse'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Post-approval PDF download dialog */}
      <Dialog open={postApprovalPDFDialog} onClose={() => { setPostApprovalPDFDialog(false); toast.success('Request approved'); }} maxWidth="xs" fullWidth>
        <DialogTitle>Request Approved</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            The request has been approved successfully. Would you like to download the Float Requisition PDF?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setPostApprovalPDFDialog(false); toast.success('Request approved'); }}>
            Not Now
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PdfIcon />}
            onClick={async () => {
              if (postApprovalRequest) {
                try {
                  await reconciliationService.downloadFloatPDF(postApprovalRequest.id, postApprovalRequest.request_code);
                } catch {
                  toast.error('Failed to download PDF');
                }
              }
              setPostApprovalPDFDialog(false);
              toast.success('Request approved');
            }}
          >
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApprovalsPage;
