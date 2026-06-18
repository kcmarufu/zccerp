/**
 * Purchase Request Detail Page
 * Full view with approval timeline, quotations, committee review & actions
 */

import React, { useState } from 'react';
import {
  Box, Paper, Typography, Grid, Chip, Button, Divider, CircularProgress, Alert,
  Table, TableHead, TableRow, TableCell, TableBody, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, IconButton, Tooltip, Stack,
  Stepper, Step, StepLabel, Avatar, List, ListItem, ListItemText,
  ListItemAvatar, alpha, useTheme, Tab, Tabs, MenuItem, Autocomplete
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Gavel as CommitteeIcon,
  Send as SendIcon,
  Edit as EditIcon,
  AttachFile as FileIcon,
  Timeline as TimelineIcon,
  Store as VendorIcon,
  Assignment as RequestIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExportIcon,
  Undo as UndoIcon,
  HowToVote as VoteIcon,
  HourglassEmpty as PendingIcon
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../store/authStore';
import {
  getPurchaseRequestById,
  approveDeptLevel,
  approveFinanceLevel,
  rejectProcurementRequest,
  submitToCommittee,
  committeeDecision,
  finalFinanceApproval,
  uploadQuotation,
  deleteQuotation,
  updateQuotation,
  downloadQuotationFile,
  downloadPOP,
  getRequestAttachments,
  downloadRequestAttachment,
  reverseFinalApproval,
  reverseDeptApproval,
  getCommitteeVotes,
  PROC_STATUS_LABELS,
  PROC_STATUS_COLORS,
  PROC_WORKFLOW_STEPS,
  submitPurchaseRequest,
  getVendors
} from '../../services/procurementService';
import { ProcQuotation, ProcVendor } from '../../types';
import { downloadHTMLAsPDF } from '../../utils/pdfUtils';
import * as XLSX from 'xlsx';

interface TabPanelProps { value: number; index: number; children: React.ReactNode; }
const TabPanel: React.FC<TabPanelProps> = ({ value, index, children }) => (
  <Box role="tabpanel" hidden={value !== index} sx={{ pt: 2 }}>{value === index && children}</Box>
);

const PurchaseRequestDetail: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, hasPermission, hasRole } = useAuthStore();
  const qc = useQueryClient();

  const [tab, setTab] = useState(0);
  const [actionDialog, setActionDialog] = useState<null | 'approve_dept' | 'reject' | 'submit_committee' | 'committee' | 'final_finance'>(null);
  const [comments, setComments] = useState('');
  const [committeeDecisionVal, setCommitteeDecisionVal] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [selectedQuotId, setSelectedQuotId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [quotForm, setQuotForm] = useState({ vendor_name: '', vendor_email: '', vendor_phone: '', quotation_number: '', total_amount: '', currency: 'USD', validity_date: '', delivery_timeline: '', notes: '' });
  const [selectedVendor, setSelectedVendor] = useState<ProcVendor | null>(null);

  // Quotation edit state
  const [editQuotDialog, setEditQuotDialog] = useState(false);
  const [editingQuot, setEditingQuot] = useState<ProcQuotation | null>(null);
  const [editQuotForm, setEditQuotForm] = useState({ vendor_name: '', vendor_email: '', vendor_phone: '', quotation_number: '', total_amount: '', currency: 'USD', validity_date: '', delivery_timeline: '', notes: '' });

  // POP upload state (for final finance approval)
  const [popFile, setPopFile] = useState<File | null>(null);

  // Post-action confirmation dialogs
  const [deptConfirmData, setDeptConfirmData] = useState<{
    comments: string;
  } | null>(null);
  const [reversingDept, setReversingDept] = useState(false);
  const [committeeConfirmData, setCommitteeConfirmData] = useState<{
    decision: string; comments: string; result: any;
  } | null>(null);
  const [popConfirmData, setPopConfirmData] = useState<{
    fileName: string; comments: string;
  } | null>(null);
  const [reversingPOP, setReversingPOP] = useState(false);

  const { data: vendors = [] } = useQuery({
    queryKey: ['proc-vendors-list'],
    queryFn: () => getVendors({ limit: 200 } as any),
    staleTime: 60000
  });

  const { data: request, isLoading, error, refetch } = useQuery({
    queryKey: ['proc-request', id],
    queryFn: () => getPurchaseRequestById(id!),
    enabled: Boolean(id)
  });

  const { data: committeeVotes = [], refetch: refetchVotes } = useQuery({
    queryKey: ['proc-committee-votes', id],
    queryFn: () => getCommitteeVotes(id!),
    enabled: Boolean(id),
    refetchInterval: request?.status === 'PENDING_COMMITTEE' ? 15000 : false
  });

  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ['proc-attachments', id],
    queryFn: () => getRequestAttachments(id!),
    enabled: Boolean(id)
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['proc-request', id] });
    qc.invalidateQueries({ queryKey: ['proc-committee-votes', id] });
    qc.invalidateQueries({ queryKey: ['proc-attachments', id] });
  };

  const currentStepIndex = PROC_WORKFLOW_STEPS.findIndex(s => s.status === request?.status);

  // Role checks
  const canApproveDept = (hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'ADMIN') && ['PENDING_DEPT_APPROVAL'].includes(request?.status || ''));
  // HOP/Lead can reverse dept approval within 12 hours (before quotations are added)
  const canReverseDept = (
    hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'ADMIN') &&
    request?.status === 'PENDING_PROCUREMENT' &&
    (() => {
      const deptAt = (request as any)?.dept_approved_at;
      if (!deptAt) return true;
      const hoursElapsed = (Date.now() - new Date(deptAt).getTime()) / (1000 * 60 * 60);
      return hoursElapsed <= 12;
    })()
  );
  const canReject = (
    (hasPermission('approve_purchase_request') && ['PENDING_DEPT_APPROVAL'].includes(request?.status || '')) ||
    (hasPermission('manage_quotations') && ['PENDING_PROCUREMENT'].includes(request?.status || '')) ||
    (hasPermission('proc_finance_approve') && ['PENDING_FINAL_FINANCE'].includes(request?.status || '')) ||
    (hasRole('ADMIN') && ['PENDING_DEPT_APPROVAL', 'PENDING_PROCUREMENT', 'PENDING_COMMITTEE', 'PENDING_FINAL_FINANCE'].includes(request?.status || ''))
  );
  const canUploadQuotation = hasPermission('manage_quotations') && request?.status === 'PENDING_PROCUREMENT';
  const canSubmitCommittee = hasPermission('manage_quotations') && request?.status === 'PENDING_PROCUREMENT';
  const canCommitteeDecide = hasPermission('committee_review') && request?.status === 'PENDING_COMMITTEE';
  const canFinalApprove = hasPermission('proc_finance_approve') && request?.status === 'PENDING_FINAL_FINANCE';
  const canEdit = ['DRAFT', 'REJECTED'].includes(request?.status || '') && (Number(request?.requester_id) === Number(user?.id) || hasRole('ADMIN'));
  const canSubmit = ['DRAFT', 'REJECTED'].includes(request?.status || '') && (Number(request?.requester_id) === Number(user?.id) || hasRole('ADMIN'));

  const doAction = async () => {
    setActionLoading(true);
    try {
      switch (actionDialog) {
        case 'approve_dept': {
          await approveDeptLevel(id!, comments);
          toast.success('Request approved — forwarded to Procurement team');
          const capturedComments = comments;
          setActionDialog(null);
          setComments('');
          invalidate();
          setDeptConfirmData({ comments: capturedComments });
          return;
        }
        case 'reject':
          if (!comments.trim()) { toast.error('Rejection reason required'); return; }
          await rejectProcurementRequest(id!, comments);
          toast.success('Request rejected');
          break;
        case 'submit_committee':
          await submitToCommittee(id!, selectedQuotId, comments);
          toast.success('Submitted to Procurement Committee');
          break;
        case 'committee': {
          const result = await committeeDecision(id!, committeeDecisionVal, selectedQuotId, comments);
          toast.success('Decision recorded successfully.');
          setActionDialog(null);
          setComments('');
          invalidate();
          setCommitteeConfirmData({ decision: committeeDecisionVal, comments, result });
          return;
        }
        case 'final_finance': {
          if (!popFile) { toast.error('Proof of Payment (POP) document is required'); setActionLoading(false); return; }
          const fd = new FormData();
          fd.append('file', popFile);
          if (comments) fd.append('comments', comments);
          await finalFinanceApproval(id!, fd);
          toast.success('Final approval granted — Procurement completed!');
          const capturedFileName = popFile.name;
          const capturedComments = comments;
          setPopFile(null);
          setActionDialog(null);
          setComments('');
          invalidate();
          setPopConfirmData({ fileName: capturedFileName, comments: capturedComments });
          return;
        }
      }
      setActionDialog(null);
      setComments('');
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitRequest = async () => {
    setActionLoading(true);
    try {
      await submitPurchaseRequest(id!);
      toast.success('Request submitted for approval');
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to submit');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadQuotation = async () => {
    if (!quotForm.vendor_name || !quotForm.total_amount) {
      toast.error('Vendor name and total amount are required');
      return;
    }
    setActionLoading(true);
    try {
      const fd = new FormData();
      Object.entries(quotForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (uploadFile) fd.append('file', uploadFile);
      await uploadQuotation(id!, fd);
      toast.success('Quotation uploaded');
      setUploadDialog(false);
      setQuotForm({ vendor_name: '', vendor_email: '', vendor_phone: '', quotation_number: '', total_amount: '', currency: 'USD', validity_date: '', delivery_timeline: '', notes: '' });
      setUploadFile(null);
      setSelectedVendor(null);
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Upload failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteQuotation = async (quotationId: number) => {
    if (!window.confirm('Delete this quotation?')) return;
    try {
      await deleteQuotation(id!, quotationId);
      toast.success('Quotation deleted');
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to delete');
    }
  };

  const openEditQuot = (quot: ProcQuotation) => {
    setEditingQuot(quot);
    setEditQuotForm({
      vendor_name: quot.vendor_name || '',
      vendor_email: quot.vendor_email || '',
      vendor_phone: quot.vendor_phone || '',
      quotation_number: quot.quotation_number || '',
      total_amount: String(quot.total_amount || ''),
      currency: quot.currency || 'USD',
      validity_date: quot.validity_date ? quot.validity_date.split('T')[0] : '',
      delivery_timeline: quot.delivery_timeline || '',
      notes: quot.notes || ''
    });
    setEditQuotDialog(true);
  };

  const handleUpdateQuotation = async () => {
    if (!editingQuot) return;
    if (!editQuotForm.vendor_name || !editQuotForm.total_amount) {
      toast.error('Vendor name and total amount are required');
      return;
    }
    setActionLoading(true);
    try {
      await updateQuotation(id!, editingQuot.id, {
        vendor_name: editQuotForm.vendor_name,
        vendor_email: editQuotForm.vendor_email || undefined,
        vendor_phone: editQuotForm.vendor_phone || undefined,
        quotation_number: editQuotForm.quotation_number || undefined,
        total_amount: parseFloat(editQuotForm.total_amount) as any,
        currency: editQuotForm.currency,
        validity_date: editQuotForm.validity_date || undefined,
        delivery_timeline: editQuotForm.delivery_timeline || undefined,
        notes: editQuotForm.notes || undefined
      });
      toast.success('Quotation updated');
      setEditQuotDialog(false);
      setEditingQuot(null);
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadQuotation = async (quotId: number, fileName?: string) => {
    try {
      await downloadQuotationFile(id!, quotId, fileName);
    } catch (e: any) {
      toast.error('File not available for download. The attachment may not have been uploaded.');
    }
  };

  const exportToExcel = () => {
    if (!request) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Request Info
    const infoData = [
      ['Field', 'Value'],
      ['Reference', request.request_code],
      ['Title', request.title],
      ['Requester', `${request.first_name} ${request.last_name}`],
      ['Department', `${request.department_name} (${request.department_code})`],
      ['Donor', request.donor_name || '—'],
      ['Priority', request.priority],
      ['Status', PROC_STATUS_LABELS[request.status] || request.status],
      ['Total Estimated Amount', Number(request.total_estimated_amount || 0).toFixed(2)],
      ['Date Created', request.created_at ? format(new Date(request.created_at), 'dd MMM yyyy') : ''],
      ['Date Submitted', request.submitted_at ? format(new Date(request.submitted_at), 'dd MMM yyyy') : ''],
      ['Justification', request.justification]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoData), 'Request Info');

    // Sheet 2: Items
    if (request.items && request.items.length > 0) {
      const itemHeaders = ['#', 'Description', 'Specifications', 'Qty', 'UOM', 'Unit Price (USD)', 'Total (USD)', 'Budget Line'];
      const itemRows = request.items.map((item, i) => [
        i + 1,
        item.item_description,
        item.specifications || '',
        item.quantity,
        item.unit_of_measure,
        Number(item.estimated_unit_price || 0).toFixed(2),
        Number((item.quantity || 1) * (item.estimated_unit_price || 0)).toFixed(2),
        (item as any).budget_code || ''
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]), 'Items');
    }

    // Sheet 3: Quotations
    if (request.quotations && request.quotations.length > 0) {
      const qHeaders = ['Vendor', 'Reference', 'Amount', 'Currency', 'Valid Until', 'Delivery', 'Selected', 'Notes'];
      const qRows = request.quotations.map(q => [
        q.vendor_name,
        q.quotation_number || '',
        Number(q.total_amount || 0).toFixed(2),
        q.currency,
        q.validity_date ? format(new Date(q.validity_date), 'dd MMM yyyy') : '',
        q.delivery_timeline || '',
        q.is_selected ? 'YES' : 'NO',
        q.notes || ''
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([qHeaders, ...qRows]), 'Quotations');
    }

    // Sheet 4: Approval Trail
    if (request.approvalTrail && request.approvalTrail.length > 0) {
      const tHeaders = ['Date', 'Actor', 'Role', 'Action', 'Comments'];
      const tRows = request.approvalTrail.map(log => [
        format(new Date(log.created_at), 'dd MMM yyyy HH:mm'),
        `${log.actor_first_name} ${log.actor_last_name}`,
        log.actor_role.replace(/_/g, ' '),
        log.action.replace(/_/g, ' '),
        log.comments || ''
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([tHeaders, ...tRows]), 'Approval Trail');
    }

    XLSX.writeFile(wb, `${request.request_code}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const downloadAsPDF = () => {
    if (!request) return;
    const items = request.items || [];
    const quotations = request.quotations || [];
    const trail = request.approvalTrail || [];
    const votes = (committeeVotes || []) as any[];
    const allCommitteeApproved = votes.length >= 3 && votes.every((v: any) => v.vote === 'APPROVED');
    // ── HARDCODED BRANDING ─────────────────────────────────────────────────
    const POWERED_BY = 'Powered By Kudakwashe C Marufu';
    const DOC_TITLE  = 'Purchase Request';
    // ──────────────────────────────────────────────────────────────────────
    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${DOC_TITLE} — ${request.request_code}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; padding: 24px; background: #fff; }
  .doc-header { display: flex; align-items: flex-start; justify-content: space-between; background: white; border-bottom: 2px solid #006064; color: #1a1a1a; padding: 10px 0 12px; margin-bottom: 16px; }
  .doc-header-left .org { font-size: 11px; font-weight: bold; color: #006064; letter-spacing: 0.4px; margin-bottom: 4px; }
  .doc-header-left h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: 0.3px; color: #006064; }
  .doc-header-left h2 { font-size: 12px; margin: 0 0 6px; color: #444; font-weight: normal; }
  .doc-header-left p  { margin: 2px 0; font-size: 11px; color: #444; }
  .doc-header-right   { text-align: right; min-width: 180px; }
  .doc-header-right .ref { font-size: 16px; font-weight: bold; letter-spacing: 1px; color: #006064; }
  .doc-header-right .date { font-size: 10px; color: #555; margin-top: 4px; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-top: 6px; background: #e0f2f1; color: #006064; border: 1px solid #80cbc4; }
  .status-rejected  { background: #ffebee; color: #b71c1c; border-color: #ef9a9a; }
  .status-completed { background: #e8f5e9; color: #1b5e20; border-color: #a5d6a7; }
  ${request.status === 'DRAFT' ? `.watermark { position: fixed; top: 40%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg); font-size: 80px; color: rgba(0,0,0,0.06); font-weight: bold; pointer-events: none; z-index: 0; white-space: nowrap; }` : ''}
  h3 { font-size: 13px; color: #006064; border-bottom: 1.5px solid #006064; padding-bottom: 4px; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-bottom: 14px; }
  .meta-item { display: flex; flex-direction: column; gap: 2px; }
  .meta-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; font-weight: bold; }
  .meta-value { font-size: 12px; color: #1a1a1a; }
  .meta-full  { grid-column: 1 / -1; }
  .rejection-box { grid-column: 1/-1; background: #ffebee; border-left: 4px solid #c62828; padding: 8px 12px; border-radius: 0 4px 4px 0; }
  .rejection-box .meta-label { color: #c62828; }
  .rejection-box .meta-value { color: #b71c1c; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
  thead th { background: #006064; color: white; padding: 7px 9px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
  tbody td { padding: 6px 9px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f7f7f7; }
  .total-row td { font-weight: bold; background: #e0f2f1 !important; font-size: 12px; border-top: 1.5px solid #006064; }
  .selected-badge { display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 1px 7px; border-radius: 10px; font-size: 10px; border: 1px solid #a5d6a7; font-weight: bold; margin-left: 4px; }
  .pri-URGENT { color: #b71c1c; font-weight: bold; }
  .pri-HIGH   { color: #e65100; font-weight: bold; }
  .pri-MEDIUM { color: #f57f17; }
  .pri-LOW    { color: #388e3c; }
  .action-APPROVED { color: #2e7d32; font-weight: bold; }
  .action-REJECTED { color: #c62828; font-weight: bold; }
  .action-RESUBMITTED { color: #1565c0; font-weight: bold; }
  .committee-declaration { margin-top: 24px; padding: 14px 16px; background: #e8f5e9; border-left: 4px solid #2e7d32; border-radius: 0 4px 4px 0; font-size: 11px; color: #1b5e20; font-style: italic; }
  .committee-declaration strong { font-style: normal; }
  .page-footer { margin-top: 28px; padding-top: 10px; border-top: 2px solid #e0e0e0; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-left { font-size: 10px; color: #999; }
  .footer-right { font-size: 10px; font-weight: bold; color: #006064; letter-spacing: 0.3px; }
</style></head><body>
${request.status === 'DRAFT' ? '<div class="watermark">DRAFT</div>' : ''}

<div class="doc-header">
  <div class="doc-header-left">
    <div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div>
    <h1>${DOC_TITLE}</h1>
    <h2>${request.title}</h2>
    <p>Requester: <strong>${request.first_name} ${request.last_name}</strong> &nbsp;|&nbsp; Dept: <strong>${request.department_name}</strong>${request.department_code ? ` (${request.department_code})` : ''}</p>
    <p>Partner: <strong>${(request as any).donor_name || '—'}</strong> &nbsp;|&nbsp; Project: <strong>${(request as any).project_name || '—'}</strong></p>
    <p>Priority: <strong>${request.priority}</strong> &nbsp;|&nbsp; Total: <strong>USD ${Number(request.total_estimated_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></p>
    <div><span class="status-badge ${request.status === 'REJECTED' ? 'status-rejected' : request.status === 'COMPLETED' ? 'status-completed' : ''}">${PROC_STATUS_LABELS[request.status] || request.status.replace(/_/g, ' ')}</span></div>
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
  <div class="meta-item"><span class="meta-label">Date Created</span><span class="meta-value">${request.created_at ? new Date(request.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></div>
  <div class="meta-item"><span class="meta-label">Department</span><span class="meta-value">${request.department_name}${request.department_code ? ` (${request.department_code})` : ''}</span></div>
  <div class="meta-item"><span class="meta-label">Partner</span><span class="meta-value">${(request as any).donor_name || '—'}</span></div>
  <div class="meta-item"><span class="meta-label">Project</span><span class="meta-value">${(request as any).project_name || '—'}</span></div>
  <div class="meta-item"><span class="meta-label">Priority Level</span><span class="meta-value ${`pri-${request.priority}`}">${request.priority}</span></div>
  <div class="meta-item"><span class="meta-label">Expected Delivery</span><span class="meta-value">${request.expected_delivery_date ? new Date(request.expected_delivery_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></div>
  <div class="meta-item meta-full"><span class="meta-label">Justification</span><span class="meta-value">${request.justification || '—'}</span></div>
  ${request.rejection_reason ? `<div class="meta-item rejection-box"><span class="meta-label">Rejection Reason</span><span class="meta-value">${request.rejection_reason}</span></div>` : ''}
</div>

<h3>Items &amp; Budget Lines (${items.length})</h3>
<table>
  <thead><tr><th style="width:30px">#</th><th>Description</th><th>Specifications</th><th style="width:40px">Qty</th><th>UOM</th><th style="width:60px">Budget Code</th><th align="right" style="width:90px">Unit Price (USD)</th><th align="right" style="width:80px">Total (USD)</th></tr></thead>
  <tbody>
    ${items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.item_description}</td><td>${item.specifications || '—'}</td><td>${item.quantity}</td><td>${item.unit_of_measure}</td><td>${(item as any).budget_code || '—'}</td><td align="right">${Number(item.estimated_unit_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td align="right">${Number((item.quantity || 1) * (item.estimated_unit_price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>`).join('')}
    <tr class="total-row"><td colspan="7" align="right">TOTAL ESTIMATED AMOUNT:</td><td align="right">USD ${Number(request.total_estimated_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
  </tbody>
</table>

${quotations.length > 0 ? `
<h3>Bid Analysis (${quotations.length})</h3>
<table>
  <thead><tr><th>Vendor</th><th>Quotation Ref</th><th align="right">Amount</th><th>Currency</th><th>Valid Until</th><th>Lead Time</th><th>Notes</th></tr></thead>
  <tbody>
    ${quotations.map(q => `<tr><td>${q.vendor_name}${q.is_selected ? '<span class="selected-badge">✓ SELECTED</span>' : ''}</td><td>${q.quotation_number || '—'}</td><td align="right">${Number(q.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td>${q.currency}</td><td>${q.validity_date ? new Date(q.validity_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td><td>${q.delivery_timeline || '—'}</td><td>${q.notes || '—'}</td></tr>`).join('')}
  </tbody>
</table>` : ''}

${trail.length > 0 ? `
<h3>Approval Trail (Bid Analysis) (${trail.length} actions)</h3>
<table>
  <thead><tr><th>Date &amp; Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Comments</th></tr></thead>
  <tbody>
    ${trail.map(log => `<tr><td>${new Date(log.created_at).toLocaleString('en-GB')}</td><td>${log.actor_first_name} ${log.actor_last_name}</td><td>${log.actor_role.replace(/_/g, ' ')}</td><td class="action-${log.action}">${log.action.replace(/_/g, ' ')}</td><td>${log.comments || '—'}</td></tr>`).join('')}
  </tbody>
</table>` : ''}

${allCommitteeApproved ? `
<div class="committee-declaration">
  <strong>Procurement Committee Declaration:</strong><br/>
  "The Committee hereby declares that it has no actual, potential, or perceived conflict of interest in relation to this procurement process or any of the bidders being evaluated."
</div>` : ''}

<div class="page-footer">
  <div class="footer-left">
    <div>Generated: ${new Date().toLocaleString('en-GB')}</div>
    <div>ERP Connect - Zimbabwe Council of Churches &nbsp;|&nbsp; CONFIDENTIAL</div>
  </div>
  <div class="footer-right">${POWERED_BY}</div>
</div>
</body></html>`;
    downloadHTMLAsPDF(html, `${request.request_code}-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const handleDownloadAttachment = async (attachmentId: number, fileName?: string) => {
    try {
      await downloadRequestAttachment(attachmentId, fileName);
    } catch (e: any) {
      toast.error('Failed to download attachment. The file may no longer be available.');
    }
  };

  const handleReversePOP = async () => {
    setReversingPOP(true);
    try {
      await reverseFinalApproval(id!, 'Finance approval reversed by Finance user');
      toast.success('Final approval reversed. Request returned to Pending Final Approval.');
      setPopConfirmData(null);
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to reverse approval');
    } finally {
      setReversingPOP(false);
    }
  };

  const handleReverseDept = async () => {
    setReversingDept(true);
    try {
      await reverseDeptApproval(id!);
      toast.success('Department approval reversed. Request returned to Pending Department Approval.');
      setDeptConfirmData(null);
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Cannot reverse — procurement actions have already been taken.');
    } finally {
      setReversingDept(false);
    }
  };

  if (isLoading) return <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>;
  if (error || !request) return <Alert severity="error" sx={{ m: 2 }}>Request not found.</Alert>;

  const lowestQuotation = request.quotations && request.quotations.length > 0
    ? [...request.quotations].sort((a, b) => a.total_amount - b.total_amount)[0]
    : null;

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={2} flexWrap="wrap" gap={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate('/procurement/requests')}><BackIcon /></IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700}>{request.request_code}</Typography>
            <Typography variant="body2" color="text.secondary">{request.title}</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip
            label={PROC_STATUS_LABELS[request.status] || request.status}
            color={PROC_STATUS_COLORS[request.status] as any || 'default'}
          />
          <Chip label={request.priority} size="small" variant="outlined" />
          <Tooltip title="Download PDF">
            <IconButton size="small" onClick={downloadAsPDF}><PdfIcon /></IconButton>
          </Tooltip>
          <Tooltip title="Export to Excel">
            <IconButton size="small" onClick={exportToExcel}><ExportIcon /></IconButton>
          </Tooltip>
          {canEdit && (
            <Button size="small" startIcon={<EditIcon />} onClick={() => navigate(`/procurement/requests/${id}/edit`)} variant="outlined">
              {request.status === 'REJECTED' ? 'Edit & Resubmit' : 'Edit'}
            </Button>
          )}
          {canSubmit && (
            <Button size="small" startIcon={<SendIcon />} variant="contained" onClick={handleSubmitRequest} disabled={actionLoading}>
              {request.status === 'REJECTED' ? 'Resubmit for Approval' : 'Submit for Approval'}
            </Button>
          )}
        </Stack>
      </Box>

      {/* Rejection Reason Banner */}
      {request.status === 'REJECTED' && request.rejection_reason && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={700}>Rejection Reason:</Typography>
          <Typography variant="body2">{request.rejection_reason}</Typography>
        </Alert>
      )}

      {/* Workflow Stepper */}
      <Paper elevation={1} sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stepper alternativeLabel activeStep={currentStepIndex}>
          {PROC_WORKFLOW_STEPS.map((step, idx) => (
            <Step key={step.status} completed={currentStepIndex > idx || request.status === 'COMPLETED'}>
              <StepLabel
                error={request.status === 'REJECTED' && idx === currentStepIndex}
                StepIconProps={{ style: { color: idx <= currentStepIndex ? theme.palette.primary.main : undefined } }}
              >
                <Typography variant="caption" fontWeight={idx === currentStepIndex ? 700 : 400}>
                  {step.label}
                </Typography>
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Action Buttons */}
      {(canApproveDept || canReverseDept || canReject || canSubmitCommittee || canCommitteeDecide || canFinalApprove) && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.04), border: `1px solid ${theme.palette.primary.light}` }}>
          <Typography variant="body2" fontWeight={600} mb={1}>Actions Available:</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {canApproveDept && (
              <Button variant="contained" color="success" startIcon={<ApproveIcon />} size="small" onClick={() => setActionDialog('approve_dept')}>
                Approve (Dept Level)
              </Button>
            )}
            {canReverseDept && (
              <Button variant="outlined" color="warning" startIcon={<RejectIcon />} size="small" onClick={handleReverseDept} disabled={reversingDept}>
                Reverse / Undo Approval
              </Button>
            )}
            {canSubmitCommittee && (
              <Button variant="contained" color="primary" startIcon={<CommitteeIcon />} size="small" onClick={() => { setSelectedQuotId(lowestQuotation?.id || null); setActionDialog('submit_committee'); }}>
                Submit to Committee
              </Button>
            )}
            {canCommitteeDecide && (
              <Button variant="contained" color="primary" startIcon={<CommitteeIcon />} size="small" onClick={() => { setSelectedQuotId(request.quotations?.find(q => q.is_selected)?.id || lowestQuotation?.id || null); setActionDialog('committee'); }}>
                Record Committee Decision
              </Button>
            )}
            {canFinalApprove && (
              <Button variant="contained" color="success" startIcon={<ApproveIcon />} size="small" onClick={() => setActionDialog('final_finance')}>
                Final Finance Approval
              </Button>
            )}
            {canReject && (
              <Button variant="outlined" color="error" startIcon={<RejectIcon />} size="small" onClick={() => setActionDialog('reject')}>
                Reject
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      {/* Committee Review Status Banner */}
      {['PENDING_COMMITTEE', 'PENDING_FINAL_FINANCE', 'COMPLETED'].includes(request.status) && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: alpha(theme.palette.secondary.main, 0.05), border: `1px solid ${theme.palette.secondary.light}` }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1.5} color="secondary.dark" display="flex" alignItems="center" gap={0.5}>
            <VoteIcon fontSize="small" /> Committee Review
            {request.status === 'PENDING_COMMITTEE' && (
              <Chip label="Under Review" color="secondary" size="small" sx={{ ml: 1 }} />
            )}
            {request.status !== 'PENDING_COMMITTEE' && (
              <Chip label="Decision Recorded" color="success" size="small" sx={{ ml: 1 }} />
            )}
          </Typography>

          {(() => {
            const votes = committeeVotes as any[];
            const approvedVotes = votes.filter(v => v.vote === 'APPROVED');
            const remainingCount = 3 - votes.length;

            return (
              <Stack spacing={1}>
                {/* Approved votes — show approver names */}
                {approvedVotes.map((v: any) => (
                  <Box key={v.id ?? v.committee_seat} display="flex" alignItems="center" gap={1}>
                    <ApproveIcon fontSize="small" color="success" />
                    <Typography variant="body2" fontWeight={600}>
                      {v.first_name} {v.last_name}
                    </Typography>
                    <Chip label="Approved" color="success" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  </Box>
                ))}

                {/* Rejected votes — show name */}
                {votes.filter((v: any) => v.vote !== 'APPROVED').map((v: any) => (
                  <Box key={v.id ?? v.committee_seat} display="flex" alignItems="center" gap={1}>
                    <RejectIcon fontSize="small" color="warning" />
                    <Typography variant="body2" fontWeight={600}>
                      {v.first_name} {v.last_name}
                    </Typography>
                    <Chip label="Not Approved" color="warning" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  </Box>
                ))}

                {/* Remaining votes */}
                {remainingCount > 0 && request.status === 'PENDING_COMMITTEE' && (
                  <Box display="flex" alignItems="center" gap={1}>
                    <PendingIcon fontSize="small" color="disabled" />
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">
                      {remainingCount} vote{remainingCount > 1 ? 's' : ''} remaining
                    </Typography>
                  </Box>
                )}

                {votes.length === 0 && request.status === 'PENDING_COMMITTEE' && (
                  <Typography variant="body2" color="text.secondary" fontStyle="italic">
                    3 votes remaining — awaiting committee members
                  </Typography>
                )}

                {/* Committee declaration — shown once all 3 votes are APPROVED */}
                {votes.length >= 3 && votes.every((v: any) => v.vote === 'APPROVED') && (
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 1 }}>
                    <Typography variant="caption" fontWeight={700} color="success.dark" display="block" mb={0.5}>
                      Procurement Committee Declaration
                    </Typography>
                    <Typography variant="caption" color="success.dark" fontStyle="italic">
                      "The Committee hereby declares that it has no actual, potential, or perceived conflict of interest in relation to this procurement process or any of the bidders being evaluated."
                    </Typography>
                  </Box>
                )}
              </Stack>
            );
          })()}
        </Paper>
      )}

      {/* Tabs */}
      <Paper elevation={1} sx={{ borderRadius: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label="Overview" />
          <Tab label={`Items (${request.items?.length || 0})`} />
          <Tab label={`Bid Analysis (${request.quotations?.length || 0})`} />
          <Tab label={`Attachments (${(attachments as any[]).length})`} />
          <Tab label="Approval Trail (Bid Analysis)" />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {/* TAB 0: Overview */}
          <TabPanel value={tab} index={0}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.5}>
                  {[
                    { label: 'Requester', value: `${request.first_name} ${request.last_name}` },
                    { label: 'Department', value: `${request.department_name} (${request.department_code})` },
                    { label: 'Donor', value: request.donor_name || '—' },
                    { label: 'Expected Delivery', value: request.expected_delivery_date ? format(new Date(request.expected_delivery_date), 'dd MMM yyyy') : '—' },
                    { label: 'Created', value: format(new Date(request.created_at), 'dd MMM yyyy HH:mm') },
                    { label: 'Submitted', value: request.submitted_at ? format(new Date(request.submitted_at), 'dd MMM yyyy HH:mm') : '—' }
                  ].map(row => (
                    <Box key={row.label} display="flex" gap={2}>
                      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>{row.label}:</Typography>
                      <Typography variant="body2" fontWeight={500}>{row.value}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} mb={1}>Justification</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                    {request.justification}
                  </Typography>
                </Paper>
                <Box mt={2} textAlign="right">
                  <Typography variant="caption" color="text.secondary">Total Estimated Amount</Typography>
                  <Typography variant="h4" fontWeight={700} color="primary">
                    ${Number(request.total_estimated_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
                {(request as any).pop_file_name && (
                  <Box mt={2} textAlign="right">
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<DownloadIcon />}
                      onClick={async () => {
                        try {
                          await downloadPOP(id!, (request as any).pop_file_name);
                        } catch (err: any) {
                          toast.error(err?.message || 'Failed to download POP document');
                        }
                      }}
                    >
                      Download POP
                    </Button>
                  </Box>
                )}
              </Grid>
            </Grid>
          </TabPanel>

          {/* TAB 1: Items */}
          <TabPanel value={tab} index={1}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>#</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Specifications</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell>UOM</TableCell>
                  <TableCell align="right">Unit Price</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Budget Line</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {request.items?.map((item, idx) => (
                  <TableRow key={item.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell><Typography variant="body2" fontWeight={500}>{item.item_description}</Typography></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{item.specifications || '—'}</Typography></TableCell>
                    <TableCell align="right">{item.quantity} {item.unit_of_measure}</TableCell>
                    <TableCell>{item.unit_of_measure}</TableCell>
                    <TableCell align="right">${Number(item.estimated_unit_price || 0).toFixed(2)}</TableCell>
                    <TableCell align="right"><Typography fontWeight={600}>${Number(item.estimated_total || (item.quantity * item.estimated_unit_price) || 0).toFixed(2)}</Typography></TableCell>
                    <TableCell>
                      {item.budget_code ? (
                        <Chip label={item.budget_code} size="small" variant="outlined" />
                      ) : <Typography variant="caption" color="text.disabled">Not assigned</Typography>}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell colSpan={6} align="right"><strong>Total Estimated</strong></TableCell>
                  <TableCell align="right">
                    <strong>${Number(request.total_estimated_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TabPanel>

          {/* TAB 2: Quotations */}
          <TabPanel value={tab} index={2}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight={600}>Bid Analysis</Typography>
              {canUploadQuotation && (
                <Button startIcon={<UploadIcon />} variant="contained" size="small" onClick={() => setUploadDialog(true)}>
                  Upload Quotation
                </Button>
              )}
            </Box>

            {(!request.quotations || request.quotations.length === 0) ? (
              <Box textAlign="center" py={4}>
                <FileIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No quotations uploaded yet</Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {request.quotations.map((quot) => (
                  <Paper
                    key={quot.id}
                    variant="outlined"
                    sx={{
                      p: 2, borderRadius: 2,
                      borderColor: quot.is_selected ? theme.palette.success.main : theme.palette.divider,
                      bgcolor: quot.is_selected ? alpha(theme.palette.success.main, 0.04) : 'inherit'
                    }}
                  >
                    <Box display="flex" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                      <Box>
                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                          <VendorIcon fontSize="small" color="action" />
                          <Typography variant="subtitle2" fontWeight={700}>{quot.vendor_name}</Typography>
                          {quot.is_selected && <Chip label="Selected" color="success" size="small" />}
                          {quot.is_prequalified && <Chip label="Prequalified" color="info" size="small" />}
                        </Box>
                        <Grid container spacing={2} sx={{ mt: 0.5 }}>
                          {[
                            { label: 'Ref', value: quot.quotation_number || '—' },
                            { label: 'Amount', value: `${quot.currency} ${Number(quot.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
                            { label: 'Valid Until', value: quot.validity_date ? format(new Date(quot.validity_date), 'dd MMM yyyy') : '—' },
                            { label: 'Delivery', value: quot.delivery_timeline || '—' }
                          ].map(f => (
                            <Grid item key={f.label}>
                              <Typography variant="caption" color="text.secondary">{f.label}</Typography>
                              <Typography variant="body2" fontWeight={500}>{f.value}</Typography>
                            </Grid>
                          ))}
                        </Grid>
                        {quot.notes && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            Note: {quot.notes}
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        {quot.file_name && (
                          <Tooltip title="Download file">
                            <IconButton size="small" onClick={() => handleDownloadQuotation(quot.id, quot.file_name ?? undefined)}>
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canUploadQuotation && (
                          <Tooltip title="Edit quotation">
                            <IconButton size="small" color="primary" onClick={() => openEditQuot(quot)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canUploadQuotation && (
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDeleteQuotation(quot.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Box>
                  </Paper>
                ))}
              </Stack>
            )}
          </TabPanel>

          {/* TAB 3: Attachments */}
          <TabPanel value={tab} index={3}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight={600}>Supporting Documents</Typography>
              <Typography variant="caption" color="text.secondary">
                Documents uploaded by the requester and procurement team
              </Typography>
            </Box>
            {(attachments as any[]).length === 0 ? (
              <Box textAlign="center" py={4}>
                <FileIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No attachments uploaded</Typography>
              </Box>
            ) : (
              <Stack spacing={1}>
                {(attachments as any[]).map((att: any) => (
                  <Paper key={att.id} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <FileIcon color="action" />
                    <Box flex={1} minWidth={0}>
                      <Typography variant="body2" fontWeight={600} noWrap>{att.original_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {att.attachment_type} &middot; {att.file_size ? `${(att.file_size / 1024).toFixed(1)} KB` : ''} &middot; Uploaded by {att.first_name} {att.last_name}
                      </Typography>
                      {att.description && (
                        <Typography variant="caption" color="text.disabled" display="block">{att.description}</Typography>
                      )}
                    </Box>
                    <Tooltip title="Download">
                      <IconButton size="small" color="primary" onClick={() => handleDownloadAttachment(att.id, att.original_name)}>
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Paper>
                ))}
              </Stack>
            )}
          </TabPanel>

          {/* TAB 4: Approval Trail */}
          <TabPanel value={tab} index={4}>
            {(!request.approvalTrail || request.approvalTrail.length === 0) ? (
              <Box textAlign="center" py={4}>
                <TimelineIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No activity recorded yet</Typography>
              </Box>
            ) : (
              <List disablePadding>
                {request.approvalTrail.map((log, idx) => (
                  <React.Fragment key={log.id}>
                    {idx > 0 && <Divider component="li" variant="inset" />}
                    <ListItem alignItems="flex-start">
                      <ListItemAvatar>
                        <Avatar
                          sx={{
                            bgcolor: log.action.includes('APPROVED') || log.action === 'FINAL_APPROVED' || log.action === 'COMMITTEE_APPROVED'
                              ? alpha(theme.palette.success.main, 0.15)
                              : log.action.includes('REJECT') || log.action === 'COMMITTEE_REJECTED'
                              ? alpha(theme.palette.error.main, 0.15)
                              : alpha(theme.palette.primary.main, 0.15),
                            color: log.action.includes('APPROVED') || log.action === 'FINAL_APPROVED' || log.action === 'COMMITTEE_APPROVED'
                              ? theme.palette.success.main
                              : log.action.includes('REJECT') || log.action === 'COMMITTEE_REJECTED'
                              ? theme.palette.error.main
                              : theme.palette.primary.main,
                            width: 36, height: 36, fontSize: '0.75rem'
                          }}
                        >
                          {(log.actor_first_name?.[0] || '') + (log.actor_last_name?.[0] || '')}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                            <Typography variant="body2" fontWeight={600}>
                              {log.actor_first_name} {log.actor_last_name}
                            </Typography>
                            <Chip
                              label={log.actor_role === 'PROCUREMENT_COMMITTEE'
                                ? `Committee Member`
                                : log.actor_role.replace(/_/g, ' ')}
                              size="small" variant="outlined" sx={{ fontSize: '0.65rem' }}
                            />
                            <Chip
                              label={log.action.replace(/_/g, ' ')}
                              size="small"
                              color={
                                log.action.includes('APPROVED') ? 'success'
                                : log.action.includes('REJECT') ? 'error'
                                : 'info'
                              }
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            {log.comments && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                "{log.comments}"
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.disabled">
                              {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            )}
          </TabPanel>
        </Box>
      </Paper>

      {/* Action Dialog */}
      <Dialog open={Boolean(actionDialog)} onClose={() => !actionLoading && setActionDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionDialog === 'approve_dept' && 'Approve (Department Level)'}
          {actionDialog === 'reject' && 'Reject Request'}
          {actionDialog === 'submit_committee' && 'Submit to Procurement Committee'}
          {actionDialog === 'committee' && 'Record Committee Decision'}
          {actionDialog === 'final_finance' && 'Final Finance Approval'}
        </DialogTitle>
        <DialogContent>
          {actionDialog === 'committee' && (
            <TextField
              select fullWidth label="Decision" value={committeeDecisionVal}
              onChange={e => setCommitteeDecisionVal(e.target.value as any)}
              sx={{ mb: 2, mt: 1 }}
            >
              <MenuItem value="APPROVED">Approved</MenuItem>
              <MenuItem value="REJECTED">Rejected</MenuItem>
            </TextField>
          )}
          {(actionDialog === 'submit_committee' || actionDialog === 'committee') && request.quotations && request.quotations.length > 0 && (
            <TextField
              select fullWidth label="Selected Quotation" value={selectedQuotId || ''}
              onChange={e => setSelectedQuotId(e.target.value ? Number(e.target.value) : null)}
              sx={{ mb: 2 }}
            >
              <MenuItem value="">None selected</MenuItem>
              {request.quotations.map(q => (
                <MenuItem key={q.id} value={q.id}>
                  {q.vendor_name} — {q.currency} {Number(q.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </MenuItem>
              ))}
            </TextField>
          )}
          {actionDialog === 'final_finance' && (
            <Alert severity="warning" sx={{ mb: 2, mt: 1 }}>
              A Proof of Payment (POP) document is <strong>required</strong> to complete this approval.
            </Alert>
          )}
          {actionDialog === 'final_finance' && (
            <Button
              variant={popFile ? 'outlined' : 'contained'}
              component="label"
              startIcon={<UploadIcon />}
              fullWidth
              color={popFile ? 'success' : 'primary'}
              sx={{ mb: 2 }}
            >
              {popFile ? `✓ ${popFile.name}` : 'Upload Proof of Payment (POP) *'}
              <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => setPopFile(e.target.files?.[0] || null)} />
            </Button>
          )}
          <TextField
            fullWidth multiline rows={3}
            label={actionDialog === 'reject' ? 'Rejection Reason *' : 'Comments (optional)'}
            value={comments} onChange={e => setComments(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setActionDialog(null); setPopFile(null); }} disabled={actionLoading}>Cancel</Button>
          <Button
            variant="contained"
            color={actionDialog === 'reject' ? 'error' : 'primary'}
            onClick={doAction}
            disabled={actionLoading || (actionDialog === 'final_finance' && !popFile)}
            startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
          >
            {actionDialog === 'final_finance' && !popFile ? 'Upload POP to Continue' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Quotation Dialog */}
      <Dialog open={uploadDialog} onClose={() => !actionLoading && setUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Supplier Quotation</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
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
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Quotation Reference #" value={quotForm.quotation_number} onChange={e => setQuotForm(f => ({ ...f, quotation_number: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth required type="number" label="Total Amount *" value={quotForm.total_amount} onChange={e => setQuotForm(f => ({ ...f, total_amount: e.target.value }))} inputProps={{ min: 0, step: 0.01 }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Currency" value={quotForm.currency} onChange={e => setQuotForm(f => ({ ...f, currency: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Vendor Email" value={quotForm.vendor_email} onChange={e => setQuotForm(f => ({ ...f, vendor_email: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Vendor Phone" value={quotForm.vendor_phone} onChange={e => setQuotForm(f => ({ ...f, vendor_phone: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth type="date" label="Valid Until" InputLabelProps={{ shrink: true }} value={quotForm.validity_date} onChange={e => setQuotForm(f => ({ ...f, validity_date: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Delivery Timeline" placeholder="e.g. 2 weeks" value={quotForm.delivery_timeline} onChange={e => setQuotForm(f => ({ ...f, delivery_timeline: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline rows={2} label="Notes" value={quotForm.notes} onChange={e => setQuotForm(f => ({ ...f, notes: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <Button variant="outlined" component="label" startIcon={<UploadIcon />} fullWidth>
                {uploadFile ? uploadFile.name : 'Attach Document (PDF/Image)'}
                <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialog(false)} disabled={actionLoading}>Cancel</Button>
          <Button variant="contained" onClick={handleUploadQuotation} disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} /> : <UploadIcon />}>
            Upload
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Quotation Dialog */}
      <Dialog open={editQuotDialog} onClose={() => !actionLoading && setEditQuotDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Quotation</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField fullWidth required label="Vendor / Supplier Name *" value={editQuotForm.vendor_name}
                onChange={e => setEditQuotForm(f => ({ ...f, vendor_name: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Quotation Reference #" value={editQuotForm.quotation_number}
                onChange={e => setEditQuotForm(f => ({ ...f, quotation_number: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth required type="number" label="Total Amount *" value={editQuotForm.total_amount}
                onChange={e => setEditQuotForm(f => ({ ...f, total_amount: e.target.value }))} inputProps={{ min: 0, step: 0.01 }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Currency" value={editQuotForm.currency}
                onChange={e => setEditQuotForm(f => ({ ...f, currency: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Vendor Email" value={editQuotForm.vendor_email}
                onChange={e => setEditQuotForm(f => ({ ...f, vendor_email: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Vendor Phone" value={editQuotForm.vendor_phone}
                onChange={e => setEditQuotForm(f => ({ ...f, vendor_phone: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth type="date" label="Valid Until" InputLabelProps={{ shrink: true }}
                value={editQuotForm.validity_date}
                onChange={e => setEditQuotForm(f => ({ ...f, validity_date: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Delivery Timeline" placeholder="e.g. 2 weeks" value={editQuotForm.delivery_timeline}
                onChange={e => setEditQuotForm(f => ({ ...f, delivery_timeline: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline rows={2} label="Notes" value={editQuotForm.notes}
                onChange={e => setEditQuotForm(f => ({ ...f, notes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditQuotDialog(false)} disabled={actionLoading}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateQuotation} disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} /> : <EditIcon />}>
            Save Changes
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
            If you approved by mistake, click <strong>Undo Approval</strong> to return the request to Department Approval. This is only possible if the Procurement team has not yet taken any action.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            color="warning"
            startIcon={reversingDept ? <CircularProgress size={14} /> : <UndoIcon />}
            onClick={handleReverseDept}
            disabled={reversingDept}
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
            You may change your vote by recording a new decision from the actions panel.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => {
              setCommitteeConfirmData(null);
              setActionDialog('committee');
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
            If you need to reverse this approval (e.g., incorrect document uploaded), click <strong>Reverse Approval</strong> below to return the request to Pending Final Approval.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            color="error"
            startIcon={reversingPOP ? <CircularProgress size={14} /> : <UndoIcon />}
            onClick={handleReversePOP}
            disabled={reversingPOP}
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

export default PurchaseRequestDetail;
