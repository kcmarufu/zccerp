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
  TableContainer, TableHead, TableRow, TablePagination, Button, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid,
  IconButton, Tooltip, Alert, Divider, Card, CardContent, InputAdornment,
  useTheme, useMediaQuery, alpha, List, ListItem, ListItemIcon, ListItemText, MenuItem
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
  ListAlt as MyReconsIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Search as SearchIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

import { useAuthStore } from '../store/authStore';
import { reconciliationService } from '../services/reconciliationService';
import { requestService } from '../services/requestService';
import attachmentService from '../services/attachmentService';
import { Request, RequestItem } from '../types';
import { downloadHTMLAsPDF, buildTravelClaimPageHTML, buildDigitalStamp } from '../utils/pdfUtils';
import perDiemService from '../services/perDiemService';

interface ReconciliationFormItem {
  requestItemId?: number;
  description: string;
  budgetedAmount: number;
  actualAmount: number;
  notes: string;
}

/** Shows a coloured chip indicating whether a reconciliation was submitted on time or late */
const SubmissionTimeliness: React.FC<{ timeliness?: string | null; days?: number | null }> = ({ timeliness, days }) => {
  if (!timeliness) return null;
  const isLate = timeliness === 'LATE';
  return (
    <Box display="flex" flexDirection="column" alignItems="flex-start" gap={0.3}>
      <Chip
        label={isLate ? 'Late Submission' : 'On Time'}
        color={isLate ? 'error' : 'success'}
        size="small"
        icon={isLate ? <WarningIcon /> : <ApproveIcon />}
      />
      {days != null && (
        <Typography variant="caption" color="text.secondary">
          {days} working day{days !== 1 ? 's' : ''}
        </Typography>
      )}
    </Box>
  );
};

/** Count Mon–Fri working days from day after startDate to today (or endDate). */
function calcWorkingDaysFromNow(startDate: string | Date | null | undefined): number | null {
  if (!startDate) return null;
  let count = 0;
  const start = new Date(startDate);
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const ReconciliationPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, hasRole } = useAuthStore();
  const isFinance = hasRole('FINANCE_CLERK');
  const isAdmin = hasRole('ADMIN');
  const isLead = hasRole('PROGRAM_LEAD');
  const isHOP = hasRole('HEAD_OF_PROGRAMS');
  const isLeadOrHOP = isLead || isHOP;
  // Admin and Finance can approve reconciliations directly (combined authority)
  const canDirectApprove = isFinance || isAdmin;
  // Lead Review tab: Lead, HOP, and Admin all see RECON_PENDING_LEAD items
  const canReviewLead = isLeadOrHOP || isAdmin;
  // All finance team + admin can see pending reviews and full history
  const isFinanceOrAdmin = isFinance || isAdmin || isLead || isHOP;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── HARDCODED BRANDING ─────────────────────────────────────────────────
  const POWERED_BY = 'Powered By Kudakwashe C Marufu' as const;
  const DOC_TITLE  = 'Reconciliation' as const;
  // ───────────────────────────────────────────────────────────────────────

  // Download PDF for a single reconciliation (client-side HTML generation)
  const handleDownloadReconPDF = async (recon: any) => {
    try {
      const requestId = recon.request_id || recon.id;
      const requestCode = recon.request_code || `REQ-${requestId}`;
      toast.info('Generating PDF…');

      // Fetch full request data (includes partner/project)
      const reqResp = await requestService.getById(requestId);
      if (!reqResp.success || !reqResp.data) { toast.error('Could not load request data'); return; }
      const req = reqResp.data as any;

      // Fetch reconciliation details
      let reconDetail: any = null;
      let reconItems: any[] = [];
      try {
        const reconResp = await reconciliationService.getReconciliation(requestId);
        if (reconResp.success && reconResp.data) {
          reconDetail = reconResp.data;
          reconItems = (reconDetail as any).items || [];
        }
      } catch { /* reconciliation may not exist */ }

      const trail: any[] = req.approvalTrail || [];
      const totalBudgeted = reconItems.reduce((s: number, i: any) => s + Number(i.budgeted_amount || 0), 0);
      const totalActual = reconItems.reduce((s: number, i: any) => s + Number(i.actual_amount || 0), 0);

      const reconItemRows = reconItems.map((it: any, i: number) => {
        const budgeted = Number(it.budgeted_amount || 0);
        const actual = Number(it.actual_amount || 0);
        const variance = budgeted - actual;
        const vColor = variance >= 0 ? '#2e7d32' : '#c62828';
        return `<tr>
          <td>${i + 1}</td>
          <td>${it.description || '—'}</td>
          <td align="right">$${budgeted.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
          <td align="right">$${actual.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
          <td align="right" style="color:${vColor};font-weight:bold">$${Math.abs(variance).toLocaleString(undefined,{minimumFractionDigits:2})} ${variance >= 0 ? '↓' : '↑'}</td>
          <td>${it.notes || '—'}</td>
        </tr>`;
      }).join('');

      const trailRows = trail.map((t: any) => `
        <tr>
          <td class="act-${t.action}">${t.action}</td>
          <td>${t.approver_first_name || t.actor_name || ''} ${t.approver_last_name || ''}</td>
          <td>${(t.approver_role || t.actor_role || '').replace(/_/g, ' ')}</td>
          <td>${t.comments || t.comment || '—'}</td>
          <td>${t.created_at ? format(new Date(t.created_at), 'dd MMM yyyy HH:mm') : '—'}</td>
        </tr>`).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${DOC_TITLE} — ${requestCode}</title>
<style>
  * {box-sizing:border-box;}
  body {font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;margin:0;padding:20px;}
  .doc-header {background:white;border-bottom:2px solid #006064;color:#006064;padding:12px 0 12px;margin-bottom:18px;}
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
  <p><strong>${requestCode}</strong> &nbsp;|&nbsp; ${req.department_name || ''} &nbsp;|&nbsp; ${req.requester_first_name || ''} ${req.requester_last_name || ''}</p>
  <p>Status: <strong>${req.status?.replace(/_/g,' ')}</strong>${reconDetail ? ` &nbsp;|&nbsp; Spent: <strong>$${Number(reconDetail.total_spent||0).toLocaleString(undefined,{minimumFractionDigits:2})}</strong> &nbsp;|&nbsp; Returned: <strong>$${Number(reconDetail.total_returned||0).toLocaleString(undefined,{minimumFractionDigits:2})}</strong>` : ''}</p>
</div>
<div class="meta-grid">
  <div class="meta-item"><label>Reference</label><span>${requestCode}</span></div>
  <div class="meta-item"><label>Department</label><span>${req.department_name || '—'}</span></div>
  <div class="meta-item"><label>Requester</label><span>${req.requester_first_name||''} ${req.requester_last_name||''}</span></div>
  <div class="meta-item"><label>Status</label><span>${req.status?.replace(/_/g,' ')}</span></div>
  <div class="meta-item"><label>Partner / Donor</label><span>${req.donor_name || '—'}${req.donor_code ? ` (${req.donor_code})` : ''}</span></div>
  <div class="meta-item"><label>Project</label><span>${req.project_name ? `${req.project_code} — ${req.project_name}` : '—'}</span></div>
  ${reconDetail ? `<div class="meta-item"><label>Total Spent</label><span style="color:#c62828">$${Number(reconDetail.total_spent||0).toLocaleString(undefined,{minimumFractionDigits:2})}</span></div>
  <div class="meta-item"><label>Total Returned</label><span style="color:#2e7d32">$${Number(reconDetail.total_returned||0).toLocaleString(undefined,{minimumFractionDigits:2})}</span></div>` : ''}
  ${reconDetail?.notes ? `<div class="meta-item meta-full"><label>Notes</label><span>${reconDetail.notes}</span></div>` : ''}
  <div class="meta-item meta-full"><label>Purpose of Float</label><span>${req.justification||'—'}</span></div>
  ${(req.is_activity_request || req.activity_start_date || req.activity_end_date) ? `
  <div class="meta-item meta-full" style="background:#fff8e1;border-left:4px solid #f9a825;padding:6px 10px;border-radius:0 4px 4px 0;">
    <label style="color:#f57f17">Activity Request</label>
    <span style="font-weight:bold;color:#f57f17">YES — Scheduled Activity</span>
  </div>
  <div class="meta-item"><label>Activity Start Date</label><span>${req.activity_start_date ? new Date(req.activity_start_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</span></div>
  <div class="meta-item"><label>Activity End Date</label><span>${req.activity_end_date ? new Date(req.activity_end_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</span></div>
  ` : ''}
</div>
${reconItems.length > 0 ? `
<h3>Reconciliation Items</h3>
<table><thead><tr><th>#</th><th>Description</th><th align="right">Budgeted ($)</th><th align="right">Actual Spent ($)</th><th align="right">Variance</th><th>Notes</th></tr></thead>
<tbody>${reconItemRows}
<tr class="total-row">
  <td colspan="2" align="right">TOTALS:</td>
  <td align="right">$${totalBudgeted.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
  <td align="right">$${totalActual.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
  <td align="right" style="color:${totalBudgeted - totalActual >= 0 ? '#2e7d32' : '#c62828'}">$${Math.abs(totalBudgeted - totalActual).toLocaleString(undefined,{minimumFractionDigits:2})} ${totalBudgeted - totalActual >= 0 ? 'returned' : 'overspent'}</td>
  <td></td>
</tr></tbody></table>` : ''}
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
</body></html>`;
      downloadHTMLAsPDF(html, `reconciliation-${requestCode}-${format(new Date(), 'yyyy-MM-dd')}`);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Failed to generate PDF');
    }
  };

  // Bulk PDF for History tab (uses available summary data, no API call)
  const handleHistoryBulkPDF = () => {
    if (history.length === 0) { toast.warning('No records to print'); return; }
    const totalSpentAll = history.reduce((s: number, r: any) => s + Number(r.total_spent || 0), 0);
    const totalReturnedAll = history.reduce((s: number, r: any) => s + Number(r.total_returned || 0), 0);
    const tableRows = history.map((rec: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${rec.request_code}</strong></td>
        <td>${`${rec.requester_first_name || ''} ${rec.requester_last_name || ''}`.trim()}</td>
        <td align="right">$${Number(rec.total_spent || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        <td align="right">$${Number(rec.total_returned || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        <td>${rec.reconciliation_status || '—'}</td>
        <td>${`${rec.reviewer_first_name || ''} ${rec.reviewer_last_name || ''}`.trim()}</td>
        <td>${rec.reviewed_at ? format(new Date(rec.reviewed_at), 'dd MMM yyyy') : '—'}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${DOC_TITLE} History Report</title>
<style>
  *{box-sizing:border-box;} body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;margin:0;padding:20px;}
  .doc-header{border-bottom:2px solid #006064;color:#1a1a1a;padding:10px 0 12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end;}
  .doc-header .org{font-size:11px;font-weight:bold;color:#006064;letter-spacing:.4px;margin-bottom:4px;}
  .doc-header h1{font-size:18px;margin:0;color:#006064;} .doc-header p{margin:3px 0;font-size:11px;color:#444;}
  h3{font-size:11px;color:#006064;border-bottom:1.5px solid #006064;padding-bottom:3px;margin:12px 0 7px;text-transform:uppercase;}
  table{width:100%;border-collapse:collapse;font-size:10px;}
  thead th{background:#006064;color:white;padding:6px 8px;text-align:left;}
  tbody td{padding:5px 8px;border-bottom:1px solid #e0e0e0;}
  tbody tr:nth-child(even) td{background:#f7f7f7;}
  .total-row td{font-weight:bold;background:#e0f2f1 !important;border-top:1.5px solid #006064;}
  .page-footer{margin-top:24px;padding-top:8px;border-top:1.5px solid #e0e0e0;display:flex;justify-content:space-between;}
  .footer-left{font-size:9px;color:#999;} .footer-right{font-size:9px;font-weight:bold;color:#006064;}
</style></head><body>
<div class="doc-header">
  <div><div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div><h1>${DOC_TITLE} History Report</h1><p>Records: <strong>${history.length}</strong> &nbsp;|&nbsp; Total Spent: <strong>$${totalSpentAll.toLocaleString(undefined,{minimumFractionDigits:2})}</strong> &nbsp;|&nbsp; Total Returned: <strong>$${totalReturnedAll.toLocaleString(undefined,{minimumFractionDigits:2})}</strong></p></div>
  <div style="font-size:10px;color:#666">Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</div>
</div>
<h3>Reconciliation History (${history.length} records)</h3>
<table>
  <thead><tr><th>#</th><th>Reference</th><th>Requester</th><th align="right">Spent ($)</th><th align="right">Returned ($)</th><th>Status</th><th>Reviewed By</th><th>Date</th></tr></thead>
  <tbody>${tableRows}
  <tr class="total-row"><td colspan="3" align="right">TOTALS:</td><td align="right">$${totalSpentAll.toLocaleString(undefined,{minimumFractionDigits:2})}</td><td align="right">$${totalReturnedAll.toLocaleString(undefined,{minimumFractionDigits:2})}</td><td colspan="3"></td></tr>
  </tbody>
</table>
${buildDigitalStamp('')}
<div class="page-footer">
  <div class="footer-left"><div>Generated: ${format(new Date(),'dd MMM yyyy HH:mm')}</div><div>ERP Connect - Zimbabwe Council of Churches | CONFIDENTIAL</div></div>
  <div class="footer-right">${POWERED_BY}</div>
</div>
</body></html>`;
    downloadHTMLAsPDF(html, `reconciliation-history-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  // Bulk Excel for History tab
  const handleHistoryBulkExcel = () => {
    if (history.length === 0) { toast.warning('No records to export'); return; }
    const wb = XLSX.utils.book_new();
    const headers = ['#', 'Request #', 'Requester', 'Spent ($)', 'Returned ($)', 'Status', 'Reviewed By', 'Reviewed Date'];
    const rows = history.map((rec: any, i: number) => [
      i + 1, rec.request_code,
      `${rec.requester_first_name || ''} ${rec.requester_last_name || ''}`.trim(),
      Number(rec.total_spent || 0), Number(rec.total_returned || 0),
      rec.reconciliation_status || '',
      `${rec.reviewer_first_name || ''} ${rec.reviewer_last_name || ''}`.trim(),
      rec.reviewed_at ? format(new Date(rec.reviewed_at), 'dd MMM yyyy') : ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [4, 16, 22, 14, 14, 16, 22, 14].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation History');
    XLSX.writeFile(wb, `reconciliation-history-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success(`Exported ${history.length} records to Excel`);
  };

  const [activeTab, setActiveTab] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  // Tab 0 — My Requests pagination + filter
  const [myReqPage, setMyReqPage] = useState(0);
  const [myReqRowsPerPage, setMyReqRowsPerPage] = useState(15);
  const [myRequestsStatusFilter, setMyRequestsStatusFilter] = useState('');
  // Tab 1 — My Reconciliations filters
  const [myReconStatusFilter, setMyReconStatusFilter] = useState('');
  const [myReconTimeliness, setMyReconTimeliness] = useState('');
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [myReconciliations, setMyReconciliations] = useState<any[]>([]);
  const [pendingLeadReviews, setPendingLeadReviews] = useState<any[]>([]);
  const [leadHistory, setLeadHistory] = useState<any[]>([]);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Department & project filter state (shared across tabs)
  const [departments, setDepartments] = useState<{ id: number; department_name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: number; project_name: string; project_code: string }[]>([]);
  const [reconDeptFilter, setReconDeptFilter] = useState<string>('');
  const [reconProjectFilter, setReconProjectFilter] = useState<string>('');
  const [reconSearchFilter, setReconSearchFilter] = useState<string>('');
  const [leadDeptFilter, setLeadDeptFilter] = useState<string>('');
  const [leadProjectFilter, setLeadProjectFilter] = useState<string>('');
  const [historyDeptFilter, setHistoryDeptFilter] = useState<string>('');
  const [historyProjectFilter, setHistoryProjectFilter] = useState<string>('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('');
  const [historySearchFilter, setHistorySearchFilter] = useState<string>('');
  const [historyTimeliness, setHistoryTimeliness] = useState<string>('');
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(15);

  // Reconciliation form dialog
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [requestItems, setRequestItems] = useState<RequestItem[]>([]);
  const [formItems, setFormItems] = useState<ReconciliationFormItem[]>([]);
  const [formNotes, setFormNotes] = useState('');
  const [overspendNotes, setOverspendNotes] = useState('');
  const [actualStartDate, setActualStartDate] = useState('');
  const [actualEndDate, setActualEndDate] = useState('');
  const [extraItems, setExtraItems] = useState<Array<{ description: string; actualAmount: string; notes: string; budgetLineId: number | null }>>([]);
  const [requestBudgetLines, setRequestBudgetLines] = useState<Array<{ id: number; budget_code: string; budget_name: string; category: string }>>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);
  const [editModeReconId, setEditModeReconId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Review dialog
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<any>(null);
  const [reviewReconciliation, setReviewReconciliation] = useState<any>(null);
  const [reviewAttachments, setReviewAttachments] = useState<any[]>([]);
  const [reviewComments, setReviewComments] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewMode, setReviewMode] = useState<'lead' | 'finance'>('finance');

  // View reconciliation detail dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewReconciliation, setViewReconciliation] = useState<any>(null);
  const [viewAttachments, setViewAttachments] = useState<any[]>([]);

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

      // Lead/HOP/Admin: fetch pending reconciliations for lead review
      if (canReviewLead) {
        try {
          const leadRes = await reconciliationService.getPendingLeadReconciliations();
          if (leadRes.success && leadRes.data) {
            setPendingLeadReviews(leadRes.data);
          }
        } catch (err) {
          console.error('Error fetching pending lead reconciliations:', err);
        }

        // Lead history — reconciliations already approved by this lead
        try {
          const leadHistRes = await reconciliationService.getLeadApprovedReconciliations();
          if (leadHistRes.success && leadHistRes.data) {
            setLeadHistory(leadHistRes.data);
          }
        } catch (err) {
          console.error('Error fetching lead reconciliation history:', err);
        }
      }

      // Finance/Admin: fetch pending reconciliations
      if (isFinanceOrAdmin) {
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
  }, [isFinanceOrAdmin, canReviewLead]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const resetFormState = () => {
    setFormNotes('');
    setOverspendNotes('');
    setActualStartDate('');
    setActualEndDate('');
    setExtraItems([]);
    setUploadedFiles([]);
    setExistingAttachments([]);
    setEditModeReconId(null);
    setRequestBudgetLines([]);
  };

  const openReconciliationForm = async (request: any) => {
    try {
      const response = await requestService.getById(request.id);
      if (response.success && response.data) {
        // Preserve dispatched_at from list row in case detail API omits it
        const fullRequest = {
          ...response.data,
          dispatched_at: response.data.dispatched_at || request.dispatched_at
        };
        setSelectedRequest(fullRequest);
        const items: RequestItem[] = response.data.items || [];
        setRequestItems(items);
        setFormItems(
          items.map(item => ({
            requestItemId: item.id,
            description: item.item_description || (item as any).description || '',
            budgetedAmount: (item.quantity || 1) * (item.unit_price || 0),
            actualAmount: 0,
            notes: ''
          }))
        );
        // Reset form fields first (this also clears requestBudgetLines to [])
        resetFormState();
        // Collect unique budget lines from request items for extra cost selection
        // Must be set AFTER resetFormState so the reset doesn't overwrite them
        const blMap = new Map<number, any>();
        for (const item of items) {
          const blId = (item as any).budget_line_id;
          if (blId && !blMap.has(blId)) {
            blMap.set(blId, {
              id: blId,
              budget_code: (item as any).budget_code || '',
              budget_name: (item as any).budget_name || (item as any).item_description || '',
              category: (item as any).category || ''
            });
          }
        }
        setRequestBudgetLines(Array.from(blMap.values()));
        setFormOpen(true);
      }
    } catch (error) {
      toast.error('Failed to load request details');
    }
  };

  // Open reconciliation form in edit mode (for SUBMITTED reconciliations under review)
  const openEditReconciliation = async (recon: any) => {
    try {
      const reqId = recon.request_id;
      const [requestRes, reconRes] = await Promise.all([
        requestService.getById(reqId),
        reconciliationService.getReconciliation(reqId)
      ]);
      if (!requestRes.success || !requestRes.data) {
        toast.error('Failed to load request details');
        return;
      }
      setSelectedRequest(requestRes.data as any);
      if (reconRes.success && reconRes.data) {
        const existingRecon = reconRes.data as any;
        setFormItems(
          (existingRecon.items || []).map((item: any) => ({
            requestItemId: item.request_item_id,
            description: item.description || '',
            budgetedAmount: Number(item.budgeted_amount) || 0,
            actualAmount: Number(item.actual_amount) || 0,
            notes: item.notes || ''
          }))
        );
        setFormNotes(existingRecon.notes || '');
        setOverspendNotes(existingRecon.overspend_notes || '');
        setEditModeReconId(existingRecon.id);
        // Pre-fill actual dates if previously saved
        if (existingRecon.actual_start_date) {
          setActualStartDate(existingRecon.actual_start_date.substring(0, 10));
        }
        if (existingRecon.actual_end_date) {
          setActualEndDate(existingRecon.actual_end_date.substring(0, 10));
        }
      }
      try {
        const attRes = await attachmentService.getEntityAttachments('REQUEST', reqId);
        const attList = Array.isArray(attRes) ? attRes : (attRes as any)?.data || [];
        setExistingAttachments(attList);
      } catch { setExistingAttachments([]); }
      setUploadedFiles([]);
      setFormOpen(true);
    } catch (error) {
      toast.error('Failed to load reconciliation for editing');
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
      if (f.size > 8 * 1024 * 1024) {
        toast.warning(`${f.name} exceeds 8MB limit`);
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
  const totalActualOriginal = formItems.reduce((s, i) => s + (Number(i.actualAmount) || 0), 0);
  const totalActualExtra = extraItems.reduce((s, i) => s + (Number(i.actualAmount) || 0), 0);
  const totalActual = totalActualOriginal + totalActualExtra;
  const totalVariance = totalBudgeted - totalActual;

  const handleSubmitReconciliation = async () => {
    if (!selectedRequest) return;
    if (formItems.length === 0) {
      toast.warning('No reconciliation items found');
      return;
    }

    // Validate: at least one actual amount must be entered
    const hasAmounts = formItems.some(i => Number(i.actualAmount) > 0);
    if (!hasAmounts) {
      toast.warning('Please enter actual amounts spent for at least one item');
      return;
    }

    // Validate: attachments required (either new uploads or existing ones)
    if (uploadedFiles.length === 0 && existingAttachments.length === 0) {
      toast.warning('Please attach at least one receipt or invoice before submitting');
      return;
    }

    // Validate: overspend notes required when there is an overspend
    if (totalVariance < 0 && !overspendNotes.trim()) {
      toast.warning('Overspend notes are required when actual spend exceeds the float amount');
      return;
    }

    // Validate: actual end date required for activity requests
    if ((selectedRequest as any).is_activity_request && !actualEndDate) {
      toast.warning('Actual End Date is required for activity requests');
      return;
    }

    // Validate: extra cost items must have description, amount, budget line, and mandatory notes
    for (const ei of extraItems) {
      if (!ei.description.trim()) {
        toast.warning('All additional cost items must have a description');
        return;
      }
      if (!Number(ei.actualAmount) || Number(ei.actualAmount) <= 0) {
        toast.warning('All additional cost items must have an amount greater than 0');
        return;
      }
      if (!ei.budgetLineId) {
        toast.warning('Please select a budget line for each additional cost item');
        return;
      }
      if (!ei.notes.trim()) {
        toast.warning('Notes / reason is mandatory for all additional costs');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const surplus   = Math.max(0, totalVariance);
      const overspend = Math.max(0, -totalVariance);
      const payload = {
        items: [
          ...formItems.map(item => ({
            requestItemId: item.requestItemId,
            description: item.description,
            budgetedAmount: Number(item.budgetedAmount),
            actualAmount: Number(item.actualAmount),
            notes: item.notes || undefined
          })),
          // Additional costs: no requestItemId, budgetedAmount = 0; budget_line_id from picker
          ...extraItems.map(ei => ({
            requestItemId: undefined,
            budgetLineId: ei.budgetLineId || undefined,
            description: ei.description,
            budgetedAmount: 0,
            actualAmount: Number(ei.actualAmount),
            notes: ei.notes
          }))
        ],
        notes: formNotes || undefined,
        overspendNotes: overspendNotes.trim() || undefined,
        totalSpent: totalActual,
        totalReturned: surplus,
        totalOverspend: overspend,
        actualStartDate: actualStartDate || undefined,
        actualEndDate: actualEndDate || undefined
      };

      let result: any;
      if (editModeReconId !== null) {
        result = await reconciliationService.updateReconciliation(selectedRequest.id, payload);
      } else {
        result = await reconciliationService.submitReconciliation(selectedRequest.id, payload);
      }

      if (result.success) {
        // Upload new receipts/invoices if any
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
            toast.warning(`Reconciliation ${editModeReconId ? 'updated' : 'submitted'} but some files failed to upload`);
          }
        }
        toast.success(`Reconciliation ${editModeReconId ? 'updated' : 'submitted'} successfully`);
        setFormOpen(false);
        resetFormState();
        fetchData();
      } else {
        toast.error(result.error || `Failed to ${editModeReconId ? 'update' : 'submit'} reconciliation`);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || `Failed to ${editModeReconId ? 'update' : 'submit'} reconciliation`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openReviewDialog = async (request: any, mode: 'lead' | 'finance' = 'finance') => {
    setReviewRequest(request);
    setReviewComments('');
    setReviewMode(mode);
    setReviewAttachments([]);
    try {
      const reconRes = await reconciliationService.getReconciliation(request.id);
      if (reconRes.success && reconRes.data) {
        setReviewReconciliation(reconRes.data);
      }
    } catch (err) {
      console.error('Error fetching reconciliation:', err);
    }
    try {
      const attRes = await attachmentService.getEntityAttachments('REQUEST', request.id);
      const attList = Array.isArray(attRes) ? attRes : (attRes as any)?.data || [];
      setReviewAttachments(attList);
    } catch (err) {
      console.error('Error fetching attachments:', err);
    }
    setReviewOpen(true);
  };

  const openViewDialog = async (recon: any) => {
    setViewAttachments([]);
    try {
      const reqId = recon.request_id || recon.id;
      const reconRes = await reconciliationService.getReconciliation(reqId);
      if (reconRes.success && reconRes.data) {
        setViewReconciliation({ ...reconRes.data, request_code: recon.request_code });
      } else {
        setViewReconciliation(recon);
      }
      try {
        const attRes = await attachmentService.getEntityAttachments('REQUEST', reqId);
        const attList = Array.isArray(attRes) ? attRes : (attRes as any)?.data || [];
        setViewAttachments(attList);
      } catch (err) {
        console.error('Error fetching attachments:', err);
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
      {/* ── Reconciliation Desk Alert for approvers ──────────────────────── */}
      {(canDirectApprove || canReviewLead) && (() => {
        const myPending = canReviewLead ? pendingLeadReviews.length : 0;
        const finPending = canDirectApprove ? pendingReviews.length : 0;
        const totalOnDesk = myPending + finPending;
        if (totalOnDesk === 0) return null;

        // Average working days taken (from history)
        const reviewedItems = history.filter((h: any) => h.working_days_taken != null);
        const avgDays = reviewedItems.length > 0
          ? (reviewedItems.reduce((s: number, h: any) => s + Number(h.working_days_taken || 0), 0) / reviewedItems.length).toFixed(1)
          : null;

        return (
          <Alert
            severity="warning"
            icon={<WarningIcon />}
            sx={{ mb: 2, alignItems: 'flex-start' }}
          >
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {totalOnDesk} Reconciliation{totalOnDesk !== 1 ? 's' : ''} Awaiting Your Review
              {avgDays !== null && ` · Average Review Time: ${avgDays} working day${Number(avgDays) !== 1 ? 's' : ''}`}
            </Typography>
            {myPending > 0 && (
              <Typography variant="body2">
                Lead / HOP Review: <strong>{myPending}</strong> pending
              </Typography>
            )}
            {finPending > 0 && (
              <Typography variant="body2">
                Finance Review: <strong>{finPending}</strong> pending
              </Typography>
            )}
            <Typography variant="caption" color="warning.dark" sx={{ display: 'block', mt: 0.5 }}>
              ⚠️ The longer you take to approve or reject a reconciliation, the more it affects overall system reports and accuracy. Please action them promptly.
            </Typography>
          </Alert>
        );
      })()}
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
        <Tabs value={activeTab} onChange={(_, v) => { setActiveTab(v); setPage(0); setMyReqPage(0); setHistoryPage(0); }} sx={{ borderBottom: 1, borderColor: 'divider' }} variant="scrollable" scrollButtons="auto">
          <Tab icon={<DispatchIcon />} label="My Requests" iconPosition="start" />
          <Tab icon={<MyReconsIcon />} label={`My Reconciliations (${myReconciliations.length})`} iconPosition="start" />
          {isLeadOrHOP && <Tab icon={<ReconcileIcon />} label={`Lead Review (${pendingLeadReviews.length})`} iconPosition="start" />}
          {isLeadOrHOP && <Tab icon={<HistoryIcon />} label={`My Approvals History (${leadHistory.length})`} iconPosition="start" />}
          {isAdmin && !isLeadOrHOP && <Tab icon={<ReconcileIcon />} label={`Lead Review (${pendingLeadReviews.length})`} iconPosition="start" />}
          {isAdmin && !isLeadOrHOP && <Tab icon={<HistoryIcon />} label={`My Approvals History (${leadHistory.length})`} iconPosition="start" />}
          {isFinanceOrAdmin && <Tab icon={<ReconcileIcon />} label={`Finance Review (${pendingReviews.length})`} iconPosition="start" />}
          {isFinanceOrAdmin && <Tab icon={<HistoryIcon />} label="All History" iconPosition="start" />}
        </Tabs>
      </Paper>

      {/* Tab 0: My Requests (Dispatched + Reconciled) */}
      {activeTab === 0 && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {/* Filter bar */}
          <Box px={2} pt={2} pb={1}>
            <TextField
              select label="Filter by Status" size="small" sx={{ minWidth: 220 }}
              value={myRequestsStatusFilter}
              onChange={e => { setMyRequestsStatusFilter(e.target.value); setMyReqPage(0); }}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="DISPATCHED">Awaiting Reconciliation</MenuItem>
              <MenuItem value="RECON_PENDING_LEAD">Pending Lead Approval</MenuItem>
              <MenuItem value="RECON_PENDING_FINANCE">Pending Finance Approval</MenuItem>
              <MenuItem value="RECONCILED">Reconciled</MenuItem>
            </TextField>
          </Box>
          {(() => {
            const filteredMyRequests = myRequests.filter(req =>
              !myRequestsStatusFilter || req.status === myRequestsStatusFilter
            );
            const pagedMyRequests = filteredMyRequests.slice(myReqPage * myReqRowsPerPage, myReqPage * myReqRowsPerPage + myReqRowsPerPage);
            return filteredMyRequests.length === 0 ? (
              <Box py={6} textAlign="center">
                <DispatchIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography color="text.secondary">No dispatched or reconciled requests</Typography>
              </Box>
            ) : (
              <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Request #</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Department</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Amount</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Submission Deadline</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedMyRequests.map((req) => {
                      // For activity requests use activity_end_date as base; otherwise use dispatched_at
                      const baseDate = (req.is_activity_request && req.activity_end_date)
                        ? req.activity_end_date
                        : req.dispatched_at;
                      const daysElapsed = req.status === 'DISPATCHED' ? calcWorkingDaysFromNow(baseDate) : null;
                      const isOverdue = daysElapsed !== null && daysElapsed > 4;
                      const daysLeft = daysElapsed !== null ? 4 - daysElapsed : null;
                      return (
                      <TableRow key={req.id} hover>
                        <TableCell><Typography fontWeight={500}>{req.request_code}</Typography></TableCell>
                        <TableCell><Chip label={req.department_code} size="small" variant="outlined" /></TableCell>
                        <TableCell>${Number(req.total_amount || 0).toLocaleString()}</TableCell>
                        <TableCell><Chip label={getStatusLabel(req.status)} color={getStatusColor(req.status)} size="small" /></TableCell>
                        <TableCell>{req.dispatched_at ? format(new Date(req.dispatched_at), 'MMM d, yyyy') : req.updated_at ? format(new Date(req.updated_at), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>
                          {daysElapsed !== null ? (
                            <Box display="flex" flexDirection="column" gap={0.3}>
                              <Chip
                                icon={isOverdue ? <WarningIcon /> : <ScheduleIcon />}
                                label={isOverdue ? `${daysElapsed} days (Late!)` : daysLeft === 0 ? 'Due today!' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
                                color={isOverdue ? 'error' : daysLeft! <= 1 ? 'warning' : 'success'}
                                size="small"
                              />
                              <Typography variant="caption" color="text.secondary">
                                {req.is_activity_request ? '4-day limit (from activity end)' : '4-day limit'}
                              </Typography>
                            </Box>
                          ) : (
                            req.submission_timeliness
                              ? <SubmissionTimeliness timeliness={req.submission_timeliness} days={req.working_days_taken} />
                              : <Typography variant="body2" color="text.disabled">—</Typography>
                          )}
                        </TableCell>
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
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={filteredMyRequests.length}
                page={myReqPage}
                rowsPerPage={myReqRowsPerPage}
                onPageChange={(_, p) => setMyReqPage(p)}
                onRowsPerPageChange={e => { setMyReqRowsPerPage(parseInt(e.target.value, 10)); setMyReqPage(0); }}
                rowsPerPageOptions={[10, 15, 25, 50]}
              />
              </>
            );
          })()}
        </Paper>
      )}

      {/* Tab 1: My Reconciliations */}
      {activeTab === 1 && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {/* Filter bar */}
          <Box px={2} pt={2} pb={1} display="flex" gap={2} flexWrap="wrap">
            <TextField
              select label="Status" size="small" sx={{ minWidth: 200 }}
              value={myReconStatusFilter}
              onChange={e => { setMyReconStatusFilter(e.target.value); setPage(0); }}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="SUBMITTED">Pending Review</MenuItem>
              <MenuItem value="APPROVED">Approved</MenuItem>
              <MenuItem value="REJECTED">Rejected</MenuItem>
            </TextField>
            <TextField
              select label="Timeliness" size="small" sx={{ minWidth: 160 }}
              value={myReconTimeliness}
              onChange={e => { setMyReconTimeliness(e.target.value); setPage(0); }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="ON_TIME">On Time</MenuItem>
              <MenuItem value="LATE">Late</MenuItem>
            </TextField>
          </Box>
          {(() => {
            const filteredMyRecons = myReconciliations.filter(r =>
              (!myReconStatusFilter || r.status === myReconStatusFilter) &&
              (!myReconTimeliness || (r as any).submission_timeliness === myReconTimeliness)
            );
            return filteredMyRecons.length === 0 ? (
            <Box py={6} textAlign="center">
              <MyReconsIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No reconciliations submitted yet</Typography>
            </Box>
          ) : (
            <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Request #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Total Spent</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Returned</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Timeliness</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Lead/HOP Comments</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Finance Comments</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Submitted</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredMyRecons.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((recon) => (
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
                        <SubmissionTimeliness timeliness={(recon as any).submission_timeliness} days={(recon as any).working_days_taken} />
                        {!(recon as any).submission_timeliness && <Typography variant="body2" color="text.disabled">—</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(recon as any).lead_comments || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {recon.finance_comments || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>{recon.created_at ? format(new Date(recon.created_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell align="center">
                        {recon.status === 'SUBMITTED' && (
                          <Tooltip title="Edit Reconciliation">
                            <IconButton size="small" color="primary" onClick={() => openEditReconciliation(recon)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="View Details">
                          <IconButton size="small" onClick={() => openViewDialog(recon)}><ViewIcon /></IconButton>
                        </Tooltip>
                        <Tooltip title="Download PDF">
                          <IconButton size="small" color="error" onClick={() => handleDownloadReconPDF(recon)}><PdfIcon /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={filteredMyRecons.length}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={(_, newPage) => setPage(newPage)}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 15, 25, 50]}
            />
            </>
          );
          })()}
        </Paper>
      )}

      {/* Tab 2: Lead/HOP/Admin Pending Reviews */}
      {activeTab === 2 && canReviewLead && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {/* Filters */}
          <Box p={2} borderBottom={`1px solid ${theme.palette.divider}`}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={5} md={4}>
                <TextField
                  select label="Filter by Department" size="small" fullWidth
                  value={leadDeptFilter} onChange={e => setLeadDeptFilter(e.target.value)}
                >
                  <MenuItem value="">All Departments</MenuItem>
                  {departments.map(d => (
                    <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={5} md={4}>
                <TextField
                  select label="Filter by Project" size="small" fullWidth
                  value={leadProjectFilter} onChange={e => setLeadProjectFilter(e.target.value)}
                >
                  <MenuItem value="">All Projects</MenuItem>
                  {projects.map(p => (
                    <MenuItem key={p.id} value={String(p.id)}>{p.project_code} — {p.project_name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={2} md={2}>
                {(leadDeptFilter || leadProjectFilter) && (
                  <Button size="small" onClick={() => { setLeadDeptFilter(''); setLeadProjectFilter(''); }}>
                    Clear
                  </Button>
                )}
              </Grid>
              <Grid item xs={12} md={2}>
                <Typography variant="body2" color="text.secondary">
                  {(() => {
                    const f = pendingLeadReviews.filter(r => {
                      if (leadDeptFilter && String(r.department_id) !== leadDeptFilter && String(r.routing_department_id) !== leadDeptFilter) return false;
                      if (leadProjectFilter && String(r.project_id) !== leadProjectFilter) return false;
                      return true;
                    });
                    return `${f.length} of ${pendingLeadReviews.length}`;
                  })()}
                </Typography>
              </Grid>
            </Grid>
          </Box>

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
                    <TableCell sx={{ fontWeight: 600 }}>Timeliness</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingLeadReviews
                    .filter(r => {
                      if (leadDeptFilter && String(r.department_id) !== leadDeptFilter && String(r.routing_department_id) !== leadDeptFilter) return false;
                      if (leadProjectFilter && String(r.project_id) !== leadProjectFilter) return false;
                      return true;
                    })
                    .map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell><Typography fontWeight={500}>{req.request_code}</Typography></TableCell>
                      <TableCell>{req.requester_first_name} {req.requester_last_name}</TableCell>
                      <TableCell><Chip label={req.department_code} size="small" variant="outlined" /></TableCell>
                      <TableCell>${Number(req.total_amount || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'error.main', fontWeight: 500 }}>${Number(req.total_spent || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'success.main', fontWeight: 500 }}>${Number(req.total_returned || 0).toLocaleString()}</TableCell>
                      <TableCell>{req.reconciliation_submitted_at ? format(new Date(req.reconciliation_submitted_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell><SubmissionTimeliness timeliness={req.submission_timeliness} days={req.working_days_taken} /></TableCell>
                      <TableCell align="center">
                        <Button size="small" variant="outlined" startIcon={<ViewIcon />}
                          onClick={() => openReviewDialog(req, canDirectApprove ? 'finance' : 'lead')}>
                          Review
                        </Button>
                        <Tooltip title="Download PDF">
                          <IconButton size="small" color="error" sx={{ ml: 0.5 }} onClick={() => handleDownloadReconPDF(req)}><PdfIcon /></IconButton>
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

      {/* Tab 3: Lead/HOP/Admin Approved History */}
      {activeTab === 3 && canReviewLead && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {leadHistory.length === 0 ? (
            <Box py={6} textAlign="center">
              <HistoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No reconciliation approvals yet</Typography>
            </Box>
          ) : (
            <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Request #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Spent</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Returned</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Reviewed</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {leadHistory.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((rec: any, idx: number) => (
                    <TableRow key={idx} hover>
                      <TableCell><Typography fontWeight={500}>{rec.request_code}</Typography></TableCell>
                      <TableCell>{rec.requester_first_name} {rec.requester_last_name}</TableCell>
                      <TableCell sx={{ color: 'error.main', fontWeight: 500 }}>${Number(rec.total_spent || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'success.main', fontWeight: 500 }}>${Number(rec.total_returned || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Chip label={rec.status?.replace(/_/g, ' ') || '—'} color={getStatusColor(rec.status)} size="small" />
                      </TableCell>
                      <TableCell>{rec.lead_approved_at ? format(new Date(rec.lead_approved_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="View Details">
                          <IconButton size="small" color="primary" onClick={() => openViewDialog(rec)}><ViewIcon /></IconButton>
                        </Tooltip>
                        <Tooltip title="Download PDF">
                          <IconButton size="small" color="error" onClick={() => handleDownloadReconPDF(rec)}><PdfIcon /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={leadHistory.length}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={(_, newPage) => setPage(newPage)}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 15, 25, 50]}
            />
            </>
          )}
        </Paper>
      )}

      {/* Tab: Finance Pending Reviews (index depends on whether lead tab exists) */}
      {activeTab === (canReviewLead ? 4 : 2) && isFinanceOrAdmin && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {/* Filters */}
          <Box p={2} borderBottom={`1px solid ${theme.palette.divider}`}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  size="small" fullWidth placeholder="Search by request code or requester..."
                  value={reconSearchFilter} onChange={e => setReconSearchFilter(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select label="Filter by Department" size="small" fullWidth
                  value={reconDeptFilter} onChange={e => setReconDeptFilter(e.target.value)}
                >
                  <MenuItem value="">All Departments</MenuItem>
                  <MenuItem value="__MY_DEPT__">My Department</MenuItem>
                  {departments.map(d => (
                    <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select label="Filter by Project" size="small" fullWidth
                  value={reconProjectFilter} onChange={e => setReconProjectFilter(e.target.value)}
                >
                  <MenuItem value="">All Projects</MenuItem>
                  {projects.map(p => (
                    <MenuItem key={p.id} value={String(p.id)}>{p.project_code} — {p.project_name}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                {(reconDeptFilter || reconProjectFilter || reconSearchFilter) && (
                  <Button size="small" onClick={() => { setReconDeptFilter(''); setReconProjectFilter(''); setReconSearchFilter(''); }}>
                    Clear Filters
                  </Button>
                )}
                <Typography variant="body2" color="text.secondary" display="inline" sx={{ ml: 1 }}>
                  {(() => {
                    const f = pendingReviews.filter(r => {
                      if (reconSearchFilter) {
                        const s = reconSearchFilter.toLowerCase();
                        if (!(r.request_code?.toLowerCase().includes(s) || `${r.requester_first_name} ${r.requester_last_name}`.toLowerCase().includes(s))) return false;
                      }
                      if (reconDeptFilter === '__MY_DEPT__' && r.department_id !== (user as any)?.department_id && r.routing_department_id !== (user as any)?.department_id) return false;
                      if (reconDeptFilter && reconDeptFilter !== '__MY_DEPT__' && String(r.department_id) !== reconDeptFilter && String(r.routing_department_id) !== reconDeptFilter) return false;
                      if (reconProjectFilter && String(r.project_id) !== reconProjectFilter) return false;
                      return true;
                    });
                    return `${f.length} of ${pendingReviews.length}`;
                  })()}
                </Typography>
              </Grid>
            </Grid>
          </Box>

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
                    <TableCell sx={{ fontWeight: 600 }}>Timeliness</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingReviews
                    .filter(r => {
                      if (reconSearchFilter) {
                        const s = reconSearchFilter.toLowerCase();
                        if (!(r.request_code?.toLowerCase().includes(s) || `${r.requester_first_name} ${r.requester_last_name}`.toLowerCase().includes(s))) return false;
                      }
                      if (reconDeptFilter === '__MY_DEPT__' && r.department_id !== (user as any)?.department_id && r.routing_department_id !== (user as any)?.department_id) return false;
                      if (reconDeptFilter && reconDeptFilter !== '__MY_DEPT__' && String(r.department_id) !== reconDeptFilter && String(r.routing_department_id) !== reconDeptFilter) return false;
                      if (reconProjectFilter && String(r.project_id) !== reconProjectFilter) return false;
                      return true;
                    })
                    .map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell><Typography fontWeight={500}>{req.request_code}</Typography></TableCell>
                      <TableCell>{req.requester_first_name} {req.requester_last_name}</TableCell>
                      <TableCell><Chip label={req.department_code} size="small" variant="outlined" /></TableCell>
                      <TableCell>${Number(req.total_amount || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'error.main', fontWeight: 500 }}>${Number(req.total_spent || 0).toLocaleString()}</TableCell>
                      <TableCell sx={{ color: 'success.main', fontWeight: 500 }}>${Number(req.total_returned || 0).toLocaleString()}</TableCell>
                      <TableCell>{req.reconciliation_submitted_at ? format(new Date(req.reconciliation_submitted_at), 'MMM d, yyyy') : '-'}</TableCell>
                      <TableCell><SubmissionTimeliness timeliness={req.submission_timeliness} days={req.working_days_taken} /></TableCell>
                      <TableCell align="center">
                        <Button size="small" variant="outlined" startIcon={<ViewIcon />} onClick={() => openReviewDialog(req, 'finance')}>Review</Button>
                        <Tooltip title="Download PDF">
                          <IconButton size="small" color="error" sx={{ ml: 0.5 }} onClick={() => handleDownloadReconPDF(req)}><PdfIcon /></IconButton>
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

      {/* Tab: History (index depends on whether lead tab exists) */}
      {activeTab === (canReviewLead ? 5 : 3) && isFinanceOrAdmin && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          {history.length === 0 ? (
            <Box py={6} textAlign="center">
              <HistoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No reconciliation history</Typography>
            </Box>
          ) : (
            <>
              {/* History Filters + Export */}
              <Box p={2} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      size="small" fullWidth placeholder="Search by code or requester..."
                      value={historySearchFilter} onChange={e => { setHistorySearchFilter(e.target.value); setHistoryPage(0); }}
                      InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <TextField
                      select size="small" fullWidth label="Department"
                      value={historyDeptFilter} onChange={e => { setHistoryDeptFilter(e.target.value); setHistoryPage(0); }}
                    >
                      <MenuItem value="">All Departments</MenuItem>
                      {departments.map(d => (
                        <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <TextField
                      select size="small" fullWidth label="Status"
                      value={historyStatusFilter} onChange={e => { setHistoryStatusFilter(e.target.value); setHistoryPage(0); }}
                    >
                      <MenuItem value="">All Statuses</MenuItem>
                      <MenuItem value="DISPATCHED">Awaiting Reconciliation</MenuItem>
                      <MenuItem value="RECON_PENDING_LEAD">Pending Lead/HOP Review</MenuItem>
                      <MenuItem value="RECON_PENDING_FINANCE">Pending Finance Review</MenuItem>
                      <MenuItem value="RECONCILED">Reconciled</MenuItem>
                      <MenuItem value="REJECTED">Rejected (Resubmit)</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <TextField
                      select size="small" fullWidth label="Timeliness"
                      value={historyTimeliness} onChange={e => { setHistoryTimeliness(e.target.value); setHistoryPage(0); }}
                    >
                      <MenuItem value="">All</MenuItem>
                      <MenuItem value="ON_TIME">On Time</MenuItem>
                      <MenuItem value="LATE">Late Submission</MenuItem>
                      <MenuItem value="NOT_SUBMITTED">Not Yet Submitted</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6} md={1.5}>
                    <TextField
                      select size="small" fullWidth label="Project"
                      value={historyProjectFilter} onChange={e => { setHistoryProjectFilter(e.target.value); setHistoryPage(0); }}
                    >
                      <MenuItem value="">All Projects</MenuItem>
                      {projects.map(p => (
                        <MenuItem key={p.id} value={String(p.id)}>{p.project_code}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={1.5}>
                    <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                      {(historySearchFilter || historyDeptFilter || historyProjectFilter || historyStatusFilter || historyTimeliness) && (
                        <Button size="small" onClick={() => { setHistorySearchFilter(''); setHistoryDeptFilter(''); setHistoryProjectFilter(''); setHistoryStatusFilter(''); setHistoryTimeliness(''); setHistoryPage(0); }}>
                          Clear
                        </Button>
                      )}
                      <Button variant="outlined" size="small" color="error" startIcon={<PdfIcon />} onClick={handleHistoryBulkPDF}>PDF</Button>
                      <Button variant="outlined" size="small" color="success" startIcon={<ExcelIcon />} onClick={handleHistoryBulkExcel}>Excel</Button>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            {(() => {
              const REQ_STATUSES = ['DISPATCHED', 'RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE', 'RECONCILED'];
              const filtered = history.filter(rec => {
                if (historySearchFilter) {
                  const s = historySearchFilter.toLowerCase();
                  if (!(rec.request_code?.toLowerCase().includes(s) || `${rec.requester_first_name} ${rec.requester_last_name}`.toLowerCase().includes(s))) return false;
                }
                if (historyDeptFilter && String(rec.department_id) !== historyDeptFilter && String(rec.routing_department_id) !== historyDeptFilter) return false;
                if (historyProjectFilter && String(rec.project_id) !== historyProjectFilter) return false;
                if (historyStatusFilter) {
                  if (REQ_STATUSES.includes(historyStatusFilter)) {
                    if (rec.status !== historyStatusFilter) return false;
                  } else {
                    if (rec.reconciliation_status !== historyStatusFilter) return false;
                  }
                }
                if (historyTimeliness === 'ON_TIME' && rec.submission_timeliness !== 'ON_TIME') return false;
                if (historyTimeliness === 'LATE' && rec.submission_timeliness !== 'LATE') return false;
                if (historyTimeliness === 'NOT_SUBMITTED' && rec.reconciliation_id) return false;
                return true;
              });
              const paged = filtered.slice(historyPage * historyRowsPerPage, historyPage * historyRowsPerPage + historyRowsPerPage);
              return (
                <>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ backgroundColor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 600 }}>Request #</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Dept</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Spent</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Returned</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Overall Status</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Timeliness</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Reviewed By</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Reviewed</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paged.map((rec, idx) => {
                        const reqStatus: string = rec.status || '';
                        const reconStatus: string = rec.reconciliation_status || '';
                        const statusChip = (() => {
                          if (reqStatus === 'DISPATCHED') return <Chip label="Awaiting Reconciliation" color="warning" size="small" />;
                          if (reqStatus === 'RECON_PENDING_LEAD') return <Chip label="Pending Lead/HOP" color="warning" size="small" />;
                          if (reqStatus === 'RECON_PENDING_FINANCE') return <Chip label="Pending Finance" color="info" size="small" />;
                          if (reconStatus === 'APPROVED' || reqStatus === 'RECONCILED') return <Chip label="Reconciled / Approved" color="success" size="small" />;
                          if (reconStatus === 'REJECTED') return <Chip label="Rejected" color="error" size="small" />;
                          return <Chip label={reconStatus || reqStatus || '—'} size="small" />;
                        })();
                        return (
                          <TableRow key={idx} hover>
                            <TableCell><Typography fontWeight={500}>{rec.request_code}</Typography></TableCell>
                            <TableCell>{rec.requester_first_name} {rec.requester_last_name}</TableCell>
                            <TableCell><Chip label={rec.department_code || '—'} size="small" variant="outlined" /></TableCell>
                            <TableCell>{rec.total_spent != null ? `$${Number(rec.total_spent).toLocaleString()}` : <Typography variant="body2" color="text.disabled">—</Typography>}</TableCell>
                            <TableCell>{rec.total_returned != null ? `$${Number(rec.total_returned).toLocaleString()}` : <Typography variant="body2" color="text.disabled">—</Typography>}</TableCell>
                            <TableCell>{statusChip}</TableCell>
                            <TableCell>
                              {rec.reconciliation_id
                                ? <SubmissionTimeliness timeliness={rec.submission_timeliness} days={rec.working_days_taken} />
                                : <Chip label="Not Submitted" size="small" variant="outlined" color="default" />}
                            </TableCell>
                            <TableCell>
                              {rec.reviewer_first_name ? `${rec.reviewer_first_name} ${rec.reviewer_last_name}` : <Typography variant="body2" color="text.disabled">—</Typography>}
                            </TableCell>
                            <TableCell>{rec.reviewed_at ? format(new Date(rec.reviewed_at), 'MMM d, yyyy') : '—'}</TableCell>
                            <TableCell align="center">
                              {rec.reconciliation_id && (
                                <Tooltip title="View Details">
                                  <IconButton size="small" color="primary" onClick={() => openViewDialog(rec)}><ViewIcon /></IconButton>
                                </Tooltip>
                              )}
                              {rec.reconciliation_id && (
                                <Tooltip title="Download PDF">
                                  <IconButton size="small" color="error" onClick={() => handleDownloadReconPDF(rec)}><PdfIcon /></IconButton>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {paged.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">No records match the selected filters</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={filtered.length}
                  page={historyPage}
                  rowsPerPage={historyRowsPerPage}
                  onPageChange={(_, p) => setHistoryPage(p)}
                  onRowsPerPageChange={e => { setHistoryRowsPerPage(parseInt(e.target.value, 10)); setHistoryPage(0); }}
                  rowsPerPageOptions={[10, 15, 25, 50]}
                />
                </>
              );
            })()}
            </>
          )}
        </Paper>
      )}

      {/* ==================== RECONCILIATION FORM DIALOG ==================== */}
      <Dialog open={formOpen} onClose={() => { setFormOpen(false); resetFormState(); }} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <ReconcileIcon color="primary" />
            <Typography variant="h6">
              {editModeReconId ? 'Edit Reconciliation' : 'Reconcile'}: {selectedRequest?.request_code}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedRequest && (
            <Box>
              {(() => {
                const isActivity = Boolean((selectedRequest as any).is_activity_request);
                const baseDate = isActivity && (selectedRequest as any).activity_end_date
                  ? (selectedRequest as any).activity_end_date
                  : (selectedRequest as any).dispatched_at;
                const daysElapsed = calcWorkingDaysFromNow(baseDate);
                if (daysElapsed === null) return null;
                const isLate = daysElapsed > 4;
                const daysLeft = 4 - daysElapsed;
                const deadlineLabel = isActivity ? '4-day activity deadline' : '4-day deadline';
                const baseLabel = isActivity ? 'the activity end date' : 'dispatch';
                return (
                  <Alert
                    severity={isLate ? 'error' : daysLeft <= 1 ? 'warning' : 'success'}
                    icon={isLate ? <WarningIcon /> : <ScheduleIcon />}
                    sx={{ mb: 2 }}
                  >
                    {isLate
                      ? <><strong>Late Submission:</strong> You are submitting {daysElapsed} working day{daysElapsed !== 1 ? 's' : ''} after {baseLabel}. The {deadlineLabel} has passed — this will be marked as a late reconciliation.</>
                      : daysLeft === 0
                        ? <><strong>Due Today:</strong> You have used all 4 working days. Submit now to remain on time.</>
                        : <><strong>On Time:</strong> {daysElapsed} working day{daysElapsed !== 1 ? 's' : ''} since {baseLabel} — {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining within the {deadlineLabel}.</>
                    }
                  </Alert>
                );
              })()}
              <Alert severity="info" sx={{ mb: 2 }}>
                Float Amount: <strong>${Number(selectedRequest.total_amount || 0).toLocaleString()}</strong>
                &nbsp;&bull;&nbsp;Enter actual amounts spent for each item and attach receipts/invoices.
              </Alert>
              {(selectedRequest as any).is_activity_request && (
                <>
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    <strong>Activity Request:</strong>
                    {' '}Planned Start:{' '}
                    <strong>
                      {(selectedRequest as any).activity_start_date
                        ? new Date((selectedRequest as any).activity_start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </strong>
                    &nbsp;&bull;&nbsp;Planned End:{' '}
                    <strong>
                      {(selectedRequest as any).activity_end_date
                        ? new Date((selectedRequest as any).activity_end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </strong>
                  </Alert>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2" fontWeight={600} mb={1.5}>
                      Actual Activity Dates <Typography component="span" color="error">*</Typography>
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Actual Start Date"
                          type="date"
                          size="small"
                          fullWidth
                          value={actualStartDate}
                          onChange={(e) => setActualStartDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Actual End Date *"
                          type="date"
                          size="small"
                          fullWidth
                          required
                          value={actualEndDate}
                          onChange={(e) => setActualEndDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          helperText="Reconciliation is due 4 working days after this date"
                          error={!actualEndDate}
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                </>
              )}

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

              {/* Additional Costs Section */}
              <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'warning.main', bgcolor: 'rgba(255,152,0,0.04)' }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700} color="warning.dark">
                      Additional Costs
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Extra costs incurred beyond the original request — Notes/reason is mandatory.
                    </Typography>
                  </Box>
                  <Button size="small" variant="outlined" color="warning"
                    onClick={() => setExtraItems(prev => [...prev, { description: '', actualAmount: '', notes: '', budgetLineId: null }])}>
                    + Add Cost
                  </Button>
                </Box>
                {extraItems.length === 0 && (
                  <Typography variant="body2" color="text.disabled" fontStyle="italic">
                    No additional costs. Click "Add Cost" if you incurred extra expenses.
                  </Typography>
                )}
                {extraItems.map((ei, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 1.5, mb: 1.5, bgcolor: 'background.paper' }}>
                    <Grid container spacing={2} alignItems="flex-start">
                      <Grid item xs={12} sm={4}>
                        <TextField label="Description *" size="small" fullWidth value={ei.description}
                          onChange={(e) => setExtraItems(prev => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                          error={!ei.description.trim()}
                          helperText={!ei.description.trim() ? 'Required' : ''} />
                      </Grid>
                      <Grid item xs={6} sm={2}>
                        <TextField label="Amount *" size="small" type="number" fullWidth value={ei.actualAmount}
                          onChange={(e) => setExtraItems(prev => prev.map((x, i) => i === idx ? { ...x, actualAmount: e.target.value } : x))}
                          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                          error={!Number(ei.actualAmount) || Number(ei.actualAmount) <= 0}
                          helperText={(!Number(ei.actualAmount) || Number(ei.actualAmount) <= 0) ? 'Required' : ''} />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField
                          select label="Budget Line *" size="small" fullWidth
                          value={ei.budgetLineId || ''}
                          onChange={(e) => setExtraItems(prev => prev.map((x, i) => i === idx ? { ...x, budgetLineId: Number(e.target.value) || null } : x))}
                          error={!ei.budgetLineId}
                          helperText={!ei.budgetLineId ? 'Required — select where to deduct' : ''}
                        >
                          {requestBudgetLines.length === 0 && (
                            <MenuItem value="" disabled>No budget lines on this request</MenuItem>
                          )}
                          {requestBudgetLines.map(bl => (
                            <MenuItem key={bl.id} value={bl.id}>
                              {bl.budget_code} — {bl.budget_name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid item xs={6} sm={2.5}>
                        <TextField label="Notes / Reason *" size="small" fullWidth value={ei.notes}
                          onChange={(e) => setExtraItems(prev => prev.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))}
                          error={!ei.notes.trim()}
                          helperText={!ei.notes.trim() ? 'Mandatory' : ''} />
                      </Grid>
                      <Grid item xs={12} sm={0.5} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Button size="small" color="error" variant="text"
                          onClick={() => setExtraItems(prev => prev.filter((_, i) => i !== idx))}>
                          Remove
                        </Button>
                      </Grid>
                    </Grid>
                  </Paper>
                ))}
              </Paper>

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
                    <Typography variant="subtitle2" fontWeight={600}>
                      Receipts &amp; Invoices <Typography component="span" color="error.main" variant="subtitle2">*</Typography>
                    </Typography>
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
                  Attach receipts, invoices, or supporting documents (PDF, images, Office docs - max 8MB each)
                </Typography>
                {/* Existing attachments (edit mode) */}
                {existingAttachments.length > 0 && (
                  <Box mb={1}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Previously uploaded:</Typography>
                    <List dense disablePadding>
                      {existingAttachments.map((att: any, idx: number) => (
                        <ListItem key={`existing-${idx}`}>
                          <ListItemIcon sx={{ minWidth: 32 }}><FileIcon fontSize="small" color="success" /></ListItemIcon>
                          <ListItemText
                            primary={att.file_name || att.original_name || `Attachment ${idx + 1}`}
                            secondary="Already uploaded"
                            primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 500, color: 'success.main' }}
                            secondaryTypographyProps={{ fontSize: '0.7rem' }} />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}
                {/* New files to upload */}
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
                ) : existingAttachments.length === 0 ? (
                  <Alert severity="warning" sx={{ py: 0.5 }}>
                    No files attached yet — at least one receipt or invoice is required.
                  </Alert>
                ) : null}
              </Paper>

              {/* Overspend Notes — required when actual > budgeted */}
              {totalVariance < 0 && (
                <TextField
                  label={<>Overspend Notes / Reason <Typography component="span" color="error.main" variant="body2">*</Typography></>}
                  multiline rows={3} fullWidth required
                  value={overspendNotes} onChange={(e) => setOverspendNotes(e.target.value)}
                  placeholder="Explain why actual spend exceeded the approved float amount..."
                  error={!overspendNotes.trim()}
                  helperText={!overspendNotes.trim() ? 'Overspend notes are required when actual spend exceeds the float amount' : ''}
                  sx={{ mb: 2 }}
                />
              )}

              <TextField label="Additional Notes" multiline rows={3} fullWidth
                value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Provide any additional notes about expenditures, receipts attached, etc." />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => { setFormOpen(false); resetFormState(); }}>Cancel</Button>
          <Button variant="contained" startIcon={isSubmitting ? <CircularProgress size={18} /> : <SubmitIcon />}
            onClick={handleSubmitReconciliation}
            disabled={isSubmitting || formItems.length === 0 || (totalVariance < 0 && !overspendNotes.trim()) || (uploadedFiles.length === 0 && existingAttachments.length === 0)}>
            {editModeReconId ? 'Update Reconciliation' : 'Submit Reconciliation'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== FINANCE REVIEW DIALOG ==================== */}
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
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
                <Grid item xs={6} sm={2}>
                  <Typography variant="caption" color="text.secondary">Float Amount</Typography>
                  <Typography fontWeight={500}>${Number(reviewRequest.total_amount || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6} sm={2}>
                  <Typography variant="caption" color="text.secondary">Total Spent</Typography>
                  <Typography fontWeight={500} color="error.main">${Number(reviewRequest.total_spent || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6} sm={2}>
                  <Typography variant="caption" color="text.secondary">To Return</Typography>
                  <Typography fontWeight={500} color="success.main">${Number(reviewRequest.total_returned || 0).toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Submission Timeliness</Typography>
                  <Box mt={0.5}>
                    <SubmissionTimeliness timeliness={reviewRequest.submission_timeliness} days={reviewRequest.working_days_taken} />
                    {!reviewRequest.submission_timeliness && <Typography variant="body2" color="text.secondary">—</Typography>}
                  </Box>
                </Grid>
              </Grid>
              <Divider sx={{ my: 2 }} />
              {reviewReconciliation?.items && reviewReconciliation.items.length > 0 && (() => {
                const originalItems = reviewReconciliation.items.filter((it: any) => it.request_item_id != null);
                const additionalItems = reviewReconciliation.items.filter((it: any) => it.request_item_id == null);
                return (
                  <Box sx={{ mb: 2 }}>
                    {additionalItems.length > 0 && (
                      <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" fontWeight={700}>
                          ⚠ Additional Expenditure Added ({additionalItems.length} item{additionalItems.length !== 1 ? 's' : ''})
                        </Typography>
                        <Typography variant="body2">
                          This reconciliation includes extra costs totalling{' '}
                          <strong>${additionalItems.reduce((s: number, i: any) => s + Number(i.actual_amount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>{' '}
                          that were not part of the original approved request. Review carefully before approving.
                        </Typography>
                      </Alert>
                    )}
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Line Items</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Description</TableCell>
                          <TableCell>Budget Line</TableCell>
                          <TableCell align="right">Budgeted</TableCell>
                          <TableCell align="right">Actual</TableCell>
                          <TableCell align="right">Variance</TableCell>
                          <TableCell>Notes</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {reviewReconciliation.items.map((item: any, i: number) => (
                          <TableRow key={i} sx={item.request_item_id == null ? { bgcolor: 'warning.50', '& td': { borderLeft: i === originalItems.length ? '3px solid' : undefined, borderLeftColor: 'warning.main' } } : {}}>
                            <TableCell>
                              {item.description}
                              {item.request_item_id == null && (
                                <Chip label="Extra" size="small" color="warning" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
                              )}
                            </TableCell>
                            <TableCell>
                              {item.budget_code ? (
                                <Chip label={`${item.budget_code}${item.budget_name ? ` — ${item.budget_name}` : ''}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                              ) : '—'}
                            </TableCell>
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
                );
              })()}
              {reviewReconciliation?.notes && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">Requester Notes:</Typography>
                  {reviewReconciliation.notes}
                </Alert>
              )}

              {reviewReconciliation?.overspend_notes && (
                <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningIcon />}>
                  <Typography variant="subtitle2" fontWeight={600}>Overspend Notes:</Typography>
                  {reviewReconciliation.overspend_notes}
                </Alert>
              )}

              {reviewReconciliation?.lead_comments && (
                <Alert severity={reviewReconciliation.lead_action === 'REJECTED' ? 'error' : 'info'} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    Lead/HOP Comments{reviewReconciliation.lead_reviewer_name ? ` (${reviewReconciliation.lead_reviewer_name})` : ''}:
                  </Typography>
                  {reviewReconciliation.lead_comments}
                </Alert>
              )}

              {/* Attachments Section */}
              <Box mt={2} mb={2}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Attachments ({reviewAttachments.length})
                </Typography>
                {reviewAttachments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No attachments uploaded.</Typography>
                ) : (
                  <List dense disablePadding>
                    {reviewAttachments.map((att: any) => (
                      <ListItem key={att.id} disablePadding sx={{ py: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <AttachIcon fontSize="small" color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary={att.original_name || att.file_name}
                          secondary={`${att.attachment_type} • ${attachmentService.formatFileSize(att.file_size || 0)}`}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                        <Button size="small" variant="outlined"
                          onClick={() => attachmentService.downloadAttachment(att.id, att.original_name || att.file_name)}>
                          Download
                        </Button>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>

              <TextField label={reviewMode === 'lead' ? 'HOP / Lead Comments' : 'Finance Comments'} multiline rows={3} fullWidth
                value={reviewComments} onChange={(e) => setReviewComments(e.target.value)}
                placeholder="Add comments (required for rejection)" sx={{ mt: 1 }} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setReviewOpen(false)}>Cancel</Button>
          <Button variant="outlined" color="error" startIcon={<PdfIcon />}
            onClick={() => reviewRequest && handleDownloadReconPDF(reviewRequest)}>
            Print PDF
          </Button>
          <Button variant="outlined" color="error" startIcon={isReviewing ? <CircularProgress size={18} /> : <RejectIcon />}
            onClick={reviewMode === 'lead' ? handleLeadRejectReconciliation : handleRejectReconciliation} disabled={isReviewing}>Reject</Button>
          <Button variant="contained" color="success" startIcon={isReviewing ? <CircularProgress size={18} /> : <ApproveIcon />}
            onClick={reviewMode === 'lead' ? handleLeadApproveReconciliation : handleApproveReconciliation} disabled={isReviewing}>
            {reviewMode === 'lead'
              ? 'Approve & Send to Finance'
              : reviewRequest?.status === 'RECON_PENDING_LEAD'
                ? 'Approve (Final — Skip Finance)'
                : 'Approve'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== VIEW RECONCILIATION DETAIL DIALOG ==================== */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
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
              {(viewReconciliation as any).lead_comments && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">HOP / Lead Comments:</Typography>
                  {(viewReconciliation as any).lead_comments}
                </Alert>
              )}

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

              {viewReconciliation.overspend_notes && (
                <Box mt={2}>
                  <Alert severity="warning" icon={<WarningIcon />}>
                    <Typography variant="subtitle2" fontWeight={600}>Overspend Notes:</Typography>
                    <Typography variant="body2">{viewReconciliation.overspend_notes}</Typography>
                  </Alert>
                </Box>
              )}

              {viewReconciliation.lead_comments && (
                <Box mt={2}>
                  <Alert severity={viewReconciliation.lead_action === 'REJECTED' ? 'error' : 'info'}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      Lead/HOP Comments{viewReconciliation.lead_reviewer_name ? ` (${viewReconciliation.lead_reviewer_name})` : ''}:
                    </Typography>
                    <Typography variant="body2">{viewReconciliation.lead_comments}</Typography>
                  </Alert>
                </Box>
              )}

              {/* Attachments Section */}
              <Box mt={2}>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Attachments ({viewAttachments.length})
                </Typography>
                {viewAttachments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No attachments.</Typography>
                ) : (
                  <List dense disablePadding>
                    {viewAttachments.map((att: any) => (
                      <ListItem key={att.id} disablePadding sx={{ py: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <AttachIcon fontSize="small" color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary={att.original_name || att.file_name}
                          secondary={`${att.attachment_type} • ${attachmentService.formatFileSize(att.file_size || 0)}`}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                        <Button size="small" variant="outlined"
                          onClick={() => attachmentService.downloadAttachment(att.id, att.original_name || att.file_name)}>
                          Download
                        </Button>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="error" startIcon={<PdfIcon />}
            onClick={() => viewReconciliation && handleDownloadReconPDF(viewReconciliation)}>
            Print PDF
          </Button>
          <Button onClick={() => setViewOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReconciliationPage;
