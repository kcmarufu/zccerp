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
  Tooltip,
  Collapse,
  useTheme,
  useMediaQuery
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
  AccessTime as TimeIcon,
  Print as PrintIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';

import { useAuthStore } from '../store/authStore';
import { requestService } from '../services/requestService';
import { approvalService } from '../services/approvalService';
import { exportService } from '../services/exportService';
import attachmentService, { Attachment } from '../services/attachmentService';
import perDiemService from '../services/perDiemService';
import { Request, RequestItem, ApprovalLog, RequestStatus, PerDiemClaim } from '../types';
import TravelClaimSection from '../components/requests/TravelClaimSection';
import { buildTravelClaimPageHTML } from '../utils/pdfUtils';
import * as XLSX from 'xlsx';

const APPROVAL_STEPS = [
  { status: 'PENDING_ADMIN_APPROVAL', label: 'Admin / HR Lead Approval' },
  { status: 'PENDING_FINANCE_APPROVAL', label: 'Finance Clerk Review' },
  { status: 'APPROVED', label: 'Approved' }
];

const RequestDetailPage: React.FC = () => {
  const { id, requestId: routeRequestId } = useParams<{ id: string; requestId: string }>();
  const requestId = id || routeRequestId;
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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
  const [showApprovalTrail, setShowApprovalTrail] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [perDiemClaim, setPerDiemClaim] = useState<PerDiemClaim | null>(null);

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
        const resolvedRequest = data.request || data;
        if (data.request) {
          setRequest(data.request);
          setItems(data.items || []);
          setApprovalLogs(data.approvalLogs || []);
        } else {
          setRequest(data);
          setItems(data.items || []);
          setApprovalLogs(data.approvalTrail || []);
        }

        // Load per diem claim if present
        if (resolvedRequest.has_per_diem_claim) {
          try {
            const claim = await perDiemService.getClaim(parseInt(requestId!));
            setPerDiemClaim(claim);
          } catch (_) { /* no claim yet */ }
        } else {
          setPerDiemClaim(null);
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
      case 'PENDING_ADMIN_APPROVAL':
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

    // Admin can approve at PENDING_ADMIN_APPROVAL and any other pending stage
    if (hasRole('ADMIN') && [
      'PENDING_ADMIN_APPROVAL',
      'PENDING_LEAD_APPROVAL',
      'PENDING_HOP_APPROVAL',
      'PENDING_FINANCE_APPROVAL'
    ].includes(request.status)) {
      return true;
    }

    // Program Lead can approve at PENDING_ADMIN_APPROVAL (Admin requests — no dept check)
    // at PENDING_LEAD_APPROVAL (own department only), or at PENDING_FINANCE_APPROVAL (Finance Lead authority)
    if (hasRole('PROGRAM_LEAD')) {
      if (request.status === 'PENDING_ADMIN_APPROVAL') return true;
      if (request.status === 'PENDING_LEAD_APPROVAL') return request.department_id === user.department_id;
      if (request.status === 'PENDING_FINANCE_APPROVAL') return true;
    }

    // HOP can approve at all pending stages including Finance (Finance HOP authority)
    if (hasRole('HEAD_OF_PROGRAMS') && [
      'PENDING_ADMIN_APPROVAL',
      'PENDING_LEAD_APPROVAL',
      'PENDING_HOP_APPROVAL',
      'PENDING_FINANCE_APPROVAL'
    ].includes(request.status)) {
      return true;
    }

    // Finance Clerk can approve PENDING_FINANCE_APPROVAL requests
    if (request.status === 'PENDING_FINANCE_APPROVAL' && hasRole('FINANCE_CLERK')) {
      return true;
    }

    return false;
  };

  const canDispatch = () => {
    return request?.status === 'APPROVED' && (hasRole('FINANCE_CLERK') || hasRole('ADMIN'));
  };

  // Helper function to get approval log for a specific step
  const getApprovalForStep = (stepIndex: number): ApprovalLog | undefined => {
    // Map step index to the role that would approve at that step
    const roleMap: { [key: number]: string[] } = {
      0: ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'ADMIN'], // Step 0: Lead, HOP, or Admin
      1: ['FINANCE_CLERK', 'ADMIN']                     // Step 1: Finance or Admin (combined authority)
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

  // ── HARDCODED BRANDING ────────────────────────────────────────────────────
  const POWERED_BY = 'Powered By Kudakwashe C Marufu' as const;
  const DOC_TITLE  = 'Float Requisition' as const;
  // ─────────────────────────────────────────────────────────────────────────

  const getStatusLabel = (status: string) => status.replace(/_/g, ' ');

  const printFloatRequisitionPDF = () => {
    if (!request) return;

    // Use the shared travel-claim builder so PDF stays consistent across modules
    const buildClaimPage = () => perDiemClaim
      ? buildTravelClaimPageHTML(perDiemClaim, request.request_code, POWERED_BY)
      : '';

    const statusColor = {
      APPROVED: '#2e7d32', REJECTED: '#c62828', DRAFT: '#616161',
      PENDING_ADMIN_APPROVAL: '#6a1b9a',
      PENDING_LEAD_APPROVAL: '#e65100', PENDING_HOP_APPROVAL: '#e65100', PENDING_FINANCE_APPROVAL: '#1565c0'
    } as Record<string, string>;
    const statusBg = {
      APPROVED: '#e8f5e9', REJECTED: '#ffebee', DRAFT: '#f5f5f5',
      PENDING_ADMIN_APPROVAL: '#f3e5f5',
      PENDING_LEAD_APPROVAL: '#fff3e0', PENDING_HOP_APPROVAL: '#fff3e0', PENDING_FINANCE_APPROVAL: '#e3f2fd'
    } as Record<string, string>;
    const sc = statusColor[request.status] || '#1565c0';
    const sbg = statusBg[request.status] || '#e3f2fd';

    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${DOC_TITLE} — ${request.request_code}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; padding: 24px; background: #fff; }
  /* ── Header ── */
  .doc-header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #006064; color: #1a1a1a; padding: 10px 0 12px; margin-bottom: 16px; }
  .doc-header-left h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: 0.3px; color: #006064; }
  .doc-header-left .org { font-size: 11px; font-weight: bold; color: #006064; letter-spacing: 0.4px; margin-bottom: 4px; }
  .doc-header-left h2 { font-size: 12px; margin: 0 0 6px; color: #444; font-weight: normal; }
  .doc-header-left p  { margin: 2px 0; font-size: 11px; color: #444; }
  .doc-header-right   { text-align: right; min-width: 160px; }
  .doc-header-right .ref  { font-size: 16px; font-weight: bold; letter-spacing: 1px; color: #006064; }
  .doc-header-right .date { font-size: 10px; color: #555; margin-top: 4px; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-top: 6px; background: ${sbg}; color: ${sc}; border: 1px solid ${sc}40; }
  /* ── Section headings ── */
  h3 { font-size: 13px; color: #006064; border-bottom: 2px solid #006064; padding-bottom: 4px; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  /* ── Meta grid ── */
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-bottom: 14px; }
  .meta-item { display: flex; flex-direction: column; gap: 2px; }
  .meta-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; font-weight: bold; }
  .meta-value { font-size: 12px; color: #1a1a1a; }
  .meta-full  { grid-column: 1 / -1; }
  .rejection-box { grid-column: 1/-1; background: #ffebee; border-left: 4px solid #c62828; padding: 8px 12px; border-radius: 0 4px 4px 0; }
  .rejection-box .meta-label { color: #c62828; }
  .rejection-box .meta-value { color: #b71c1c; font-style: italic; }
  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
  thead th { background: #006064; color: white; padding: 7px 9px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
  tbody td { padding: 6px 9px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f7f7f7; }
  .total-row td { font-weight: bold; background: #e0f2f1 !important; font-size: 12px; border-top: 1.5px solid #006064; }
  /* ── Priority ── */
  .pri-URGENT { color: #b71c1c; font-weight: bold; }
  .pri-HIGH   { color: #e65100; font-weight: bold; }
  .pri-MEDIUM { color: #f57f17; }
  .pri-LOW    { color: #388e3c; }
  /* ── Approval trail ── */
  .action-APPROVED  { color: #2e7d32; font-weight: bold; }
  .action-REJECTED  { color: #c62828; font-weight: bold; }
  .action-REVERSED  { color: #e65100; font-weight: bold; }
  .action-SUBMITTED { color: #1565c0; font-weight: bold; }
  /* ── Signature block ── */
  .sig-block { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 24px; }
  .sig-item { border-top: 1px solid #555; padding-top: 6px; }
  .sig-label { font-size: 10px; color: #666; }
  .sig-name  { font-size: 11px; font-weight: bold; color: #1a1a1a; margin-top: 2px; }
  .sig-date  { font-size: 10px; color: #999; }
  /* ── Footer ── */
  .page-footer { margin-top: 28px; padding-top: 10px; border-top: 2px solid #e0e0e0; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-left  { font-size: 10px; color: #999; }
  .footer-right { font-size: 10px; font-weight: bold; color: #006064; letter-spacing: 0.3px; }
  @media print {
    body { padding: 12px; }
    .no-print { display: none; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style></head><body>

<div class="doc-header">
  <div class="doc-header-left">
    <div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div>
    <h1>${DOC_TITLE}</h1>
    <h2>${(request as any).description || request.request_code}</h2>
    <p>Requester: <strong>${request.requester_first_name} ${request.requester_last_name}</strong> &nbsp;|&nbsp; Department: <strong>${request.department_name}</strong></p>
    <p>Total: <strong>$${Number(request.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></p>
    <div><span class="status-badge">${getStatusLabel(request.status)}</span></div>
  </div>
  <div class="doc-header-right">
    <div class="ref">${request.request_code}</div>
    <div class="date">Created: ${request.created_at ? new Date(request.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
    ${request.submitted_at ? `<div class="date">Submitted: ${new Date(request.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>` : ''}
  </div>
</div>

<h3>Requisition Details</h3>
<div class="meta-grid">
  <div class="meta-item"><span class="meta-label">Reference Number</span><span class="meta-value">${request.request_code}</span></div>
  <div class="meta-item"><span class="meta-label">Date Submitted</span><span class="meta-value">${request.submitted_at ? new Date(request.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></div>
  <div class="meta-item"><span class="meta-label">Department</span><span class="meta-value">${request.department_name}</span></div>
  <div class="meta-item"><span class="meta-label">Status</span><span class="meta-value" style="color:${sc};font-weight:bold">${getStatusLabel(request.status)}</span></div>
  <div class="meta-item"><span class="meta-label">Total Amount</span><span class="meta-value" style="font-weight:bold">$${Number(request.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
  ${(request as any).donor_name ? `<div class="meta-item"><span class="meta-label">Partner / Donor</span><span class="meta-value">${(request as any).donor_name}${(request as any).donor_code ? ` (${(request as any).donor_code})` : ''}</span></div>` : ''}
  ${(request as any).project_name ? `<div class="meta-item"><span class="meta-label">Project</span><span class="meta-value">${(request as any).project_name}${(request as any).project_code ? ` (${(request as any).project_code})` : ''}</span></div>` : ''}
  ${(request as any).is_activity_request ? `
    <div class="meta-item meta-full" style="background:#fff8e1;border-left:4px solid #f9a825;padding:8px 12px;border-radius:0 4px 4px 0;">
      <span class="meta-label" style="color:#f57f17">Activity Request</span>
      <span class="meta-value" style="font-weight:bold;color:#f57f17">YES — Scheduled Activity</span>
    </div>
    <div class="meta-item"><span class="meta-label">Activity Start Date</span><span class="meta-value">${(request as any).activity_start_date ? new Date((request as any).activity_start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></div>
    <div class="meta-item"><span class="meta-label">Activity End Date</span><span class="meta-value">${(request as any).activity_end_date ? new Date((request as any).activity_end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></div>
  ` : ''}
  ${(request as any).justification ? `<div class="meta-item meta-full"><span class="meta-label">Event / Purpose</span><span class="meta-value">${(request as any).justification}</span></div>` : ''}
  ${approvalLogs.filter(l => l.action === 'REJECTED').length > 0 ? `<div class="meta-item rejection-box"><span class="meta-label">Rejection Reason</span><span class="meta-value">${approvalLogs.filter(l => l.action === 'REJECTED').map(l => l.comment || l.comments || '').join('; ')}</span></div>` : ''}
</div>

<h3>Float Items &amp; Budget Lines (${items.length})</h3>
<table>
  <thead><tr><th style="width:28px">#</th><th>Budget Line / Code</th><th>Description</th><th style="width:40px">Qty</th><th>Unit</th><th align="right" style="width:90px">Unit Price ($)</th><th align="right" style="width:90px">Subtotal ($)</th></tr></thead>
  <tbody>
    ${items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.budget_code || '—'}</td><td>${item.description || item.item_description || '—'}</td><td>${item.quantity}</td><td>${item.unit_of_measure}</td><td align="right">${Number(item.unit_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td align="right">${Number(item.subtotal || item.total_price || (item.quantity * item.unit_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>`).join('')}
    <tr class="total-row"><td colspan="6" align="right">TOTAL AMOUNT:</td><td align="right">$${Number(request.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
  </tbody>
</table>

${approvalLogs.length > 0 ? `
<h3>Approval Trail (${approvalLogs.length} actions)</h3>
<table>
  <thead><tr><th>Date &amp; Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Status Change</th><th>Comments</th></tr></thead>
  <tbody>
    ${approvalLogs.map(log => `<tr><td>${new Date(log.created_at).toLocaleString('en-GB')}</td><td>${log.actor_name || `${log.approver_first_name || ''} ${log.approver_last_name || ''}`.trim()}</td><td>${(log.actor_role || log.approver_role || '').replace(/_/g, ' ')}</td><td class="action-${log.action}">${log.action.replace(/_/g, ' ')}</td><td>${log.previous_status && log.new_status ? `${log.previous_status.replace(/_/g, ' ')} → ${log.new_status.replace(/_/g, ' ')}` : '—'}</td><td>${log.comment || log.comments || '—'}</td></tr>`).join('')}
  </tbody>
</table>` : ''}

<div class="sig-block">
  <div class="sig-item">
    <div class="sig-label">Requested By</div>
    <div class="sig-name">${request.requester_first_name} ${request.requester_last_name}</div>
    <div class="sig-date">Signature: ___________________</div>
  </div>
  <div class="sig-item">
    <div class="sig-label">Program Lead / HOP</div>
    <div class="sig-name">${approvalLogs.find(l => ['PROGRAM_LEAD','HEAD_OF_PROGRAMS'].includes(l.actor_role || l.approver_role || '') && l.action === 'APPROVED') ? (approvalLogs.find(l => ['PROGRAM_LEAD','HEAD_OF_PROGRAMS'].includes(l.actor_role || l.approver_role || '') && l.action === 'APPROVED')!.actor_name || 'Approved') : '___________________'}</div>
    <div class="sig-date">Signature: ___________________</div>
  </div>
  <div class="sig-item">
    <div class="sig-label">Finance Clerk</div>
    <div class="sig-name">${approvalLogs.find(l => (l.actor_role || l.approver_role || '').includes('FINANCE') && l.action === 'APPROVED') ? (approvalLogs.find(l => (l.actor_role || l.approver_role || '').includes('FINANCE') && l.action === 'APPROVED')!.actor_name || 'Approved') : '___________________'}</div>
    <div class="sig-date">Signature: ___________________</div>
  </div>
</div>

<div class="page-footer">
  <div class="footer-left">
    <div>Generated: ${new Date().toLocaleString('en-GB')}</div>
    <div>ERP Connect - Zimbabwe Council of Churches &nbsp;|&nbsp; CONFIDENTIAL</div>
  </div>
  <div class="footer-right">${POWERED_BY}</div>
</div>
${buildClaimPage()}
</body></html>`;
    const w = window.open('', '_blank', 'width=960,height=750');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.focus(); w.print(); }, 600);
    }
  };

  const exportToExcel = () => {
    if (!request) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Info
    const infoData = [
      ['Field', 'Value'],
      ['Reference', request.request_code],
      ['Requester', `${request.requester_first_name} ${request.requester_last_name}`],
      ['Department', request.department_name],
      ['Status', getStatusLabel(request.status)],
      ['Total Amount', `$${Number(request.total_amount || 0).toFixed(2)}`],
      ['Date Created', request.created_at ? new Date(request.created_at).toLocaleDateString('en-GB') : ''],
      ['Date Submitted', request.submitted_at ? new Date(request.submitted_at).toLocaleDateString('en-GB') : '']
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoData), 'Requisition Info');

    // Sheet 2: Items
    if (items.length > 0) {
      const itemHeaders = ['#', 'Budget Code', 'Description', 'Qty', 'Unit', 'Unit Price ($)', 'Subtotal ($)'];
      const itemRows = items.map((item, i) => [
        i + 1,
        item.budget_code || '',
        item.description || item.item_description || '',
        item.quantity,
        item.unit_of_measure,
        Number(item.unit_price || 0).toFixed(2),
        Number(item.subtotal || item.total_price || (item.quantity * item.unit_price) || 0).toFixed(2)
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
      ws2['!cols'] = [6, 18, 40, 8, 12, 14, 14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws2, 'Items');
    }

    // Sheet 3: Approval Trail
    if (approvalLogs.length > 0) {
      const tHeaders = ['Date & Time', 'Actor', 'Role', 'Action', 'Status Change', 'Comments'];
      const tRows = approvalLogs.map(log => [
        new Date(log.created_at).toLocaleString('en-GB'),
        log.actor_name || `${log.approver_first_name || ''} ${log.approver_last_name || ''}`.trim(),
        (log.actor_role || log.approver_role || '').replace(/_/g, ' '),
        log.action,
        log.previous_status && log.new_status ? `${log.previous_status.replace(/_/g, ' ')} → ${log.new_status.replace(/_/g, ' ')}` : '',
        log.comment || log.comments || ''
      ]);
      const ws3 = XLSX.utils.aoa_to_sheet([tHeaders, ...tRows]);
      ws3['!cols'] = [20, 22, 22, 16, 30, 30].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws3, 'Approval Trail');
    }

    // Sheet 4: Travel & Per Diem Claim (if attached)
    if (perDiemClaim) {
      const claimRows: any[][] = [
        ['TRAVEL & SUBSISTENCE CLAIM'],
        [`Reference: ${request.request_code}`],
        [],
        ['A. EMPLOYEE & TRIP ASSIGNMENT'],
        ['Staff Name',      perDiemClaim.full_name || ''],
        ['Designation',     perDiemClaim.designation || ''],
        ['Project',         perDiemClaim.project_name ? `${perDiemClaim.project_code} — ${perDiemClaim.project_name}` : ''],
        ['Budget Line',     perDiemClaim.budget_name ? `${perDiemClaim.budget_code} — ${perDiemClaim.budget_name}` : ''],
        ...(perDiemClaim.strategic_focus ? [['Purpose of the visit', perDiemClaim.strategic_focus]] : []),
        [],
        ['B. TRIP ITEMS'],
        ['Date', 'From', 'To', 'Departure', 'Arrival', 'Purpose', 'Breakfast ($)', 'Lunch ($)', 'Dinner ($)', 'Out of Pocket ($)', 'Accommodation ($)', 'Line Total ($)'],
        ...perDiemClaim.trip_items.map(t => [
          t.trip_date ? new Date(t.trip_date).toLocaleDateString('en-GB') : '',
          t.from_location || '',
          t.to_location || '',
          t.departure_time || '',
          t.arrival_time || '',
          t.purpose || '',
          Number(t.rate_breakfast     || 0).toFixed(2),
          Number(t.rate_lunch         || 0).toFixed(2),
          Number(t.rate_dinner        || 0).toFixed(2),
          Number(t.rate_overnight     || 0).toFixed(2),
          Number(t.rate_accommodation || 0).toFixed(2),
          Number(t.line_total         || 0).toFixed(2),
        ]),
        ['', '', '', '', '', 'TOTAL CLAIMED:', '', '', '', '', '', Number(perDiemClaim.total_claimed || 0).toFixed(2)],
        [],
        ['C. FINANCIAL SUMMARY'],
        ['Total Claimed ($)',            Number(perDiemClaim.total_claimed             || 0).toFixed(2)],
        ['Less Outstanding Advance ($)', Number(perDiemClaim.less_outstanding_advance  || 0).toFixed(2)],
        [
          Number(perDiemClaim.amount_payable) >= 0 ? 'Amount Payable to Employee ($)' : 'Surplus to Refund ($)',
          Math.abs(Number(perDiemClaim.amount_payable || 0)).toFixed(2)
        ],
        ...(perDiemClaim.advance_reconciliation_due
          ? [['Reconciliation Due', new Date(perDiemClaim.advance_reconciliation_due).toLocaleDateString('en-GB')]]
          : []),
        ...(perDiemClaim.cost_distribution.length > 0 ? [
          [],
          ['D. COST DISTRIBUTION'],
          ['Account Name', 'Account Code', 'Partner / Project', 'Amount ($)'],
          ...perDiemClaim.cost_distribution.map(d => [
            d.account_name, d.account_code, d.partner_project || '', Number(d.amount || 0).toFixed(2)
          ])
        ] : []),
      ];
      const ws4 = XLSX.utils.aoa_to_sheet(claimRows);
      ws4['!cols'] = [22, 18, 18, 12, 12, 30, 14, 12, 12, 16, 16, 14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws4, 'Travel Claim');
    }

    XLSX.writeFile(wb, `float-requisition-${request.request_code}-${new Date().toISOString().slice(0,10)}.xlsx`);
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
      <Box display="flex" alignItems="center" gap={2} mb={3} flexWrap="wrap">
        <IconButton onClick={() => navigate('/finance/requests')}>
          <BackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ flex: 1 }}>
          {DOC_TITLE} — {request.request_code}
        </Typography>
        <Chip
          label={request.status.replace(/_/g, ' ')}
          color={getStatusColor(request.status)}
          size="medium"
        />
        <Tooltip title="Print / Save as PDF">
          <IconButton color="primary" onClick={printFloatRequisitionPDF}>
            <PrintIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Export to Excel">
          <IconButton color="success" onClick={exportToExcel}>
            <ExcelIcon />
          </IconButton>
        </Tooltip>
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
              {(request as any).donor_name && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Partner / Donor</Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {(request as any).donor_name}
                    {(request as any).donor_code ? ` (${(request as any).donor_code})` : ''}
                  </Typography>
                </Grid>
              )}
              {(request as any).project_name && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Project</Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {(request as any).project_name}
                    {(request as any).project_code ? ` (${(request as any).project_code})` : ''}
                  </Typography>
                </Grid>
              )}
              {(request as any).justification && (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">Event / Purpose</Typography>
                  <Typography variant="body1">{(request as any).justification}</Typography>
                </Grid>
              )}
              {/* Activity Request info — visible to all viewers including approvers */}
              {(request as any).is_activity_request ? (
                <>
                  <Grid item xs={12}>
                    <Alert severity="warning" icon={false} sx={{ py: 0.5 }}>
                      <Typography variant="body2" fontWeight={700}>Activity Request</Typography>
                      <Typography variant="caption">
                        Reconciliation is due <strong>4 working days</strong> after the Activity End Date.
                      </Typography>
                    </Alert>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Activity Start Date</Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {(request as any).activity_start_date
                        ? new Date((request as any).activity_start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Activity End Date</Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {(request as any).activity_end_date
                        ? new Date((request as any).activity_end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </Typography>
                  </Grid>
                </>
              ) : (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    Activity Request: <strong>No</strong>
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
              {/* Draft/Rejected owner actions */}
              {['DRAFT', 'REJECTED'].includes(request.status) && request.requester_id === user?.id && (
                <>
                  <Button
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => navigate(`/finance/requests/${requestId}/edit`)}
                    fullWidth
                  >
                    {request.status === 'REJECTED' ? 'Edit Rejected Request' : 'Edit Request'}
                  </Button>
                  {request.status === 'DRAFT' && (
                    <Button
                      variant="contained"
                      startIcon={<SendIcon />}
                      onClick={handleSubmitForApproval}
                      disabled={isSubmitting}
                      fullWidth
                    >
                      Submit for Approval
                    </Button>
                  )}
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
              {(request.status === 'APPROVED' || request.status === 'DISPATCHED' || request.status === 'RECONCILED') && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    Export Documents
                  </Typography>
                  <Box display="flex" gap={1}>
                    <Button
                      variant="outlined"
                      startIcon={<PrintIcon />}
                      onClick={printFloatRequisitionPDF}
                      sx={{ flex: 1 }}
                    >
                      Print PDF
                    </Button>
                    <Button
                      variant="outlined"
                      color="success"
                      startIcon={<ExcelIcon />}
                      onClick={exportToExcel}
                      sx={{ flex: 1 }}
                    >
                      Excel
                    </Button>
                  </Box>
                </>
              )}

              {/* No Actions Available */}
              {!canApprove() && !canDispatch() && 
               request.status !== 'APPROVED' && request.status !== 'DRAFT' && request.status !== 'REJECTED' && (
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
          <Paper elevation={2} sx={{ p: 0 }}>
            <Box
              display="flex" alignItems="center" justifyContent="space-between"
              sx={{ px: 3, py: 2, cursor: 'pointer', borderRadius: showApprovalTrail ? '8px 8px 0 0' : 2 }}
              onClick={() => setShowApprovalTrail(v => !v)}
            >
              <Box>
                <Typography variant="h6">Approval Trail</Typography>
                <Typography variant="body2" color="text.secondary">
                  {approvalLogs.length} action{approvalLogs.length !== 1 ? 's' : ''} — click to {showApprovalTrail ? 'collapse' : 'expand'}
                </Typography>
              </Box>
              <IconButton size="small">
                {showApprovalTrail ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            <Collapse in={showApprovalTrail}>
            <Divider />
            <Box sx={{ p: 3 }}>
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
            </Box>
            </Collapse>
          </Paper>
        </Grid>

        {/* Travel & Per Diem Claim — full width below both columns */}
        {perDiemClaim && (
          <Grid item xs={12}>
            <TravelClaimSection mode="readonly" claim={perDiemClaim} />
          </Grid>
        )}
      </Grid>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onClose={() => setShowApproveDialog(false)} maxWidth="lg" fullWidth fullScreen={isMobile}>
        <DialogTitle>Approve Request</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Are you sure you want to approve this request?
          </Typography>
          {perDiemClaim && (
            <Box sx={{ mt: 2 }}>
              <TravelClaimSection mode="readonly" claim={perDiemClaim} />
            </Box>
          )}
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
      <Dialog open={showRejectDialog} onClose={() => setShowRejectDialog(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
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
