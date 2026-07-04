/**
 * Dispatch Desk Component
 * View ALL requests (dispatched and non-dispatched) with full detail view
 */

import React, { useState, useEffect } from 'react';
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
  CircularProgress,
  TextField,
  MenuItem,
  Grid,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Tabs,
  Tab,
  TablePagination
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  LocalShipping as DispatchIcon,
  CheckCircle as ApprovedIcon,
  Receipt as ReconcileIcon,
  Undo as UndoIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

import { Request, Department } from '../../types';
import { requestService } from '../../services/requestService';
import { reconciliationService } from '../../services/reconciliationService';
import api from '../../services/api';
import { downloadHTMLAsPDF, buildTravelClaimPageHTML, buildDigitalStamp } from '../../utils/pdfUtils';
import perDiemService from '../../services/perDiemService';

const DispatchDesk: React.FC = () => {
  // ── HARDCODED BRANDING ────────────────────────────────────────────────
  const POWERED_BY = 'Powered By Kudakwashe C Marufu' as const;
  const DOC_TITLE  = 'Float Requisition' as const;
  // ──────────────────────────────────────────────────────────────────
  const [requests, setRequests] = useState<Request[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<{id: number; project_name: string; project_code: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [filters, setFilters] = useState({
    status: '',
    departmentId: '',
    projectId: '',
    startDate: '',
    endDate: ''
  });
  const [selectedRequests, setSelectedRequests] = useState<number[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<any>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [detailApprovalTrail, setDetailApprovalTrail] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Dispatch confirmation dialog
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [dispatchTargetId, setDispatchTargetId] = useState<number | null>(null);

  // Reverse dispatch dialog
  const [reverseDispatchOpen, setReverseDispatchOpen] = useState(false);
  const [reverseDispatchTargetId, setReverseDispatchTargetId] = useState<number | null>(null);
  const [reverseDispatchReason, setReverseDispatchReason] = useState('');
  const [reconSubFilter, setReconSubFilter] = useState('');
  const [searchText, setSearchText] = useState('');

  // Fetch data on mount
  useEffect(() => {
    fetchDepartments();
    fetchRequests();
  }, [filters]);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      if (response.data.success) {
        setDepartments(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  useEffect(() => {
    api.get('/projects').then(res => { if (res.data.success) setProjects(res.data.data); }).catch(() => {});
  }, []);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);

      const statusToFetch = filters.status || undefined;

      const response = await requestService.getAll({
        status: statusToFetch,
        limit: 100
      });

      if (response.success && response.data) {
        let filteredRequests = Array.isArray(response.data)
          ? response.data
          : (response.data.requests || []);

        // Show ALL completed/dispatched/recon statuses when no filter
        if (!filters.status) {
          filteredRequests = filteredRequests.filter(
            r => ['APPROVED', 'REJECTED', 'DISPATCHED', 'PENDING_RECONCILIATION', 'RECONCILED',
                  'RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE'].includes(r.status)
          );
        } else {
          // Keep server-side filtered results as-is, but ensure DISPATCHED appears in recon tab
          filteredRequests = filteredRequests.filter(r => r.status === filters.status);
        }

        // Apply department filter
        if (filters.departmentId) {
          filteredRequests = filteredRequests.filter(
            r => r.department_id === parseInt(filters.departmentId) || r.routing_department_id === parseInt(filters.departmentId)
          );
        }

        // Apply project filter
        if (filters.projectId) {
          filteredRequests = filteredRequests.filter(
            r => String(r.project_id) === filters.projectId
          );
        }

        // Apply date filters
        if (filters.startDate) {
          filteredRequests = filteredRequests.filter(
            r => new Date(r.submitted_at || r.created_at) >= new Date(filters.startDate)
          );
        }
        if (filters.endDate) {
          filteredRequests = filteredRequests.filter(
            r => new Date(r.submitted_at || r.created_at) <= new Date(filters.endDate)
          );
        }

        setRequests(filteredRequests);
      } else {
        setRequests([]);
      }
    } catch (error: any) {
      console.error('Error fetching requests for dispatch:', error);
      toast.error(error?.response?.data?.error || 'Failed to load requests');
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Open detail view dialog
  const handleViewDetail = async (request: any) => {
    try {
      setLoadingDetail(true);
      setDetailOpen(true);
      const response = await requestService.getById(request.id);
      if (response.success && response.data) {
        setDetailRequest(response.data);
        setDetailItems(response.data.items || []);
        setDetailApprovalTrail(response.data.approvalTrail || []);
      }
    } catch (error) {
      toast.error('Failed to load request details');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Download PDF for a single float requisition (client-side HTML generation)
  const handleDownloadPDF = async (requestId: number, requestCode: string) => {
    try {
      toast.info('Generating PDF…');
      const resp = await requestService.getById(requestId);
      if (!resp.success || !resp.data) { toast.error('Could not load request data'); return; }
      const req = resp.data as any;
      const items: any[] = req.items || [];
      const trail: any[] = req.approvalTrail || [];
      const total = items.reduce((s: number, it: any) => s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0);

      // Fetch per diem claim silently (null if not attached)
      let perDiemClaim: any = null;
      try { perDiemClaim = await perDiemService.getClaim(requestId); } catch { /* no claim */ }

      const itemRows = items.map((it: any, i: number) => `
        <tr>
          <td>${i + 1}</td><td>${it.budget_code || '—'}</td><td>${it.item_description || it.description || '—'}</td>
          <td align="right">${Number(it.quantity)}</td><td>${it.unit_of_measure || ''}</td>
          <td align="right">$${Number(it.unit_price || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
          <td align="right">$${(Number(it.unit_price || 0) * Number(it.quantity || 0)).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        </tr>`).join('');
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
  <p><strong>${req.request_code}</strong> &nbsp;|&nbsp; ${req.department_name || ''} &nbsp;|&nbsp; ${req.requester_first_name || ''} ${req.requester_last_name || ''}</p>
  <p>Status: <strong>${req.status?.replace(/_/g,' ')}</strong> &nbsp;|&nbsp; Total: <strong>$${Number(req.total_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}</strong></p>
</div>
<div class="meta-grid">
  <div class="meta-item"><label>Reference</label><span>${req.request_code}</span></div>
  <div class="meta-item"><label>Department</label><span>${req.department_name || '—'}</span></div>
  <div class="meta-item"><label>Requester</label><span>${req.requester_first_name||''} ${req.requester_last_name||''}</span></div>
  <div class="meta-item"><label>Status</label><span>${req.status?.replace(/_/g,' ')}</span></div>
  <div class="meta-item"><label>Partner / Donor</label><span>${req.donor_name || '—'}${req.donor_code ? ` (${req.donor_code})` : ''}</span></div>
  <div class="meta-item"><label>Project</label><span>${req.project_name ? `${req.project_code} — ${req.project_name}` : '—'}</span></div>
  <div class="meta-item"><label>Submitted</label><span>${req.submitted_at ? format(new Date(req.submitted_at),'dd MMM yyyy') : '—'}</span></div>
  <div class="meta-item meta-full"><label>Purpose of Float</label><span>${req.justification||'—'}</span></div>
  ${(req.is_activity_request || req.activity_start_date || req.activity_end_date) ? `
  <div class="meta-item meta-full" style="background:#fff8e1;border-left:4px solid #f9a825;padding:6px 10px;border-radius:0 4px 4px 0;">
    <label style="color:#f57f17">Activity Request</label>
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
${buildDigitalStamp(req.status || '')}
${perDiemClaim ? buildTravelClaimPageHTML(perDiemClaim, req.request_code, POWERED_BY) : ''}
</body></html>`;
      downloadHTMLAsPDF(html, `float-requisition-${requestCode}-${format(new Date(), 'yyyy-MM-dd')}`);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('Failed to generate PDF');
    }
  };

  // Download Excel for a request (client-side)
  const handleDownloadExcel = async (requestId: number, requestCode: string) => {
    try {
      const resp = await requestService.getById(requestId);
      if (!resp.success || !resp.data) { toast.error('Could not load request data'); return; }
      const req = resp.data;
      const items: any[] = req.items || [];
      const trail: any[] = req.approvalTrail || [];

      // Fetch per diem claim silently
      let perDiemClaim: any = null;
      try { perDiemClaim = await perDiemService.getClaim(requestId); } catch { /* no claim */ }

      const wb = XLSX.utils.book_new();
      // Sheet 1: Info
      const infoData = [
        ['Field', 'Value'],
        ['Reference', req.request_code],
        ['Department', req.department_name || ''],
        ['Requester', `${req.requester_first_name||''} ${req.requester_last_name||''}`.trim()],
        ['Status', (req.status || '').replace(/_/g, ' ')],
        ['Priority', req.priority || 'MEDIUM'],
        ['Total Amount', Number(req.total_amount || 0)],
        ['Purpose of Float', req.justification || ''],
        ['Submitted', req.submitted_at ? format(new Date(req.submitted_at), 'dd MMM yyyy') : ''],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(infoData);
      ws1['!cols'] = [{ wch: 18 }, { wch: 35 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Requisition Info');
      // Sheet 2: Items
      const itemHeaders = ['#', 'Budget Code', 'Description', 'Qty', 'Unit', 'Unit Price ($)', 'Subtotal ($)'];
      const itemRows2 = items.map((it: any, i: number) => [
        i + 1, it.budget_code || '', it.item_description || it.description || '',
        Number(it.quantity), it.unit_of_measure || '',
        Number(it.unit_price || 0), Number(it.unit_price || 0) * Number(it.quantity || 0)
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows2]);
      ws2['!cols'] = [4, 14, 32, 6, 10, 14, 14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws2, 'Items');
      // Sheet 3: Trail
      const trailHeaders = ['Action', 'By', 'Role', 'Comments', 'Date'];
      const trailRows2 = trail.map((t: any) => [
        t.action, `${t.approver_first_name || t.actor_name || ''} ${t.approver_last_name || ''}`.trim(),
        (t.approver_role || t.actor_role || '').replace(/_/g, ' '),
        t.comments || t.comment || '', t.created_at ? format(new Date(t.created_at), 'dd MMM yyyy HH:mm') : ''
      ]);
      const ws3 = XLSX.utils.aoa_to_sheet([trailHeaders, ...trailRows2]);
      ws3['!cols'] = [14, 22, 22, 35, 18].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws3, 'Approval Trail');
      // Sheet 4: Travel Claim (if attached)
      if (perDiemClaim) {
        const cl = perDiemClaim;
        const claimRows: any[][] = [
          ['TRAVEL & SUBSISTENCE CLAIM'],
          [`Reference: ${req.request_code}`],
          [],
          ['A. EMPLOYEE & TRIP ASSIGNMENT'],
          ['Staff Name', cl.full_name || ''],
          ['Designation', cl.designation || ''],
          ['Project', cl.project_name ? `${cl.project_code} — ${cl.project_name}` : ''],
          ['Budget Line', cl.budget_name ? `${cl.budget_code} — ${cl.budget_name}` : ''],
          ...(cl.strategic_focus ? [['Purpose of the visit', cl.strategic_focus]] : []),
          [],
          ['B. TRIP ITEMS'],
          ['Date', 'From', 'To', 'Departure', 'Arrival', 'Purpose', 'Breakfast ($)', 'Lunch ($)', 'Dinner ($)', 'Out of Pocket ($)', 'Accommodation ($)', 'Line Total ($)'],
          ...(cl.trip_items || []).map((t: any) => [
            t.trip_date ? new Date(t.trip_date).toLocaleDateString('en-GB') : '',
            t.from_location || '', t.to_location || '', t.departure_time || '', t.arrival_time || '', t.purpose || '',
            Number(t.rate_breakfast || 0).toFixed(2), Number(t.rate_lunch || 0).toFixed(2),
            Number(t.rate_dinner || 0).toFixed(2), Number(t.rate_overnight || 0).toFixed(2),
            Number(t.rate_accommodation || 0).toFixed(2), Number(t.line_total || 0).toFixed(2),
          ]),
          ['', '', '', '', '', 'TOTAL CLAIMED:', '', '', '', '', '', Number(cl.total_claimed || 0).toFixed(2)],
          [],
          ['C. FINANCIAL SUMMARY'],
          ['Total Claimed ($)', Number(cl.total_claimed || 0).toFixed(2)],
          ['Less Outstanding Advance ($)', Number(cl.less_outstanding_advance || 0).toFixed(2)],
          [Number(cl.amount_payable) >= 0 ? 'Amount Payable ($)' : 'Surplus to Refund ($)', Math.abs(Number(cl.amount_payable || 0)).toFixed(2)],
          ...(cl.advance_reconciliation_due ? [['Reconciliation Due', new Date(cl.advance_reconciliation_due).toLocaleDateString('en-GB')]] : []),
          ...((cl.cost_distribution || []).length > 0 ? [
            [], ['D. COST DISTRIBUTION'],
            ['Account Name', 'Account Code', 'Partner / Project', 'Amount ($)'],
            ...(cl.cost_distribution || []).map((d: any) => [d.account_name, d.account_code, d.partner_project || '', Number(d.amount || 0).toFixed(2)])
          ] : []),
        ];
        const ws4 = XLSX.utils.aoa_to_sheet(claimRows);
        ws4['!cols'] = [22, 18, 18, 12, 12, 30, 14, 12, 12, 16, 16, 14].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws4, 'Travel Claim');
      }
      XLSX.writeFile(wb, `float-requisition-${requestCode}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Excel exported successfully');
    } catch (err) {
      toast.error('Failed to export Excel');
    }
  };

  // Bulk export selected requests (client-side Excel + PDF)
  const handleBulkExport = () => {
    const targets = selectedRequests.length > 0
      ? displayedRequests.filter(r => selectedRequests.includes(r.id))
      : displayedRequests;
    if (targets.length === 0) { toast.warning('No requests to export'); return; }
    // Excel
    const wb = XLSX.utils.book_new();
    const headers = ['#', 'Reference', 'Requester', 'Department', 'Priority', 'Total ($)', 'Status', 'Date'];
    const rows = targets.map((r, i) => [
      i + 1, r.request_code,
      `${r.requester_first_name || ''} ${r.requester_last_name || ''}`.trim(),
      r.department_name || r.department_code || '',
      r.priority || 'MEDIUM',
      Number(r.total_amount || 0),
      r.status.replace(/_/g, ' '),
      (r as any).submitted_at ? format(new Date((r as any).submitted_at), 'dd MMM yyyy') : r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : ''
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [4, 16, 22, 20, 10, 14, 22, 14].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Dispatch Report');
    XLSX.writeFile(wb, `dispatch-bulk-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success(`Exported ${targets.length} records to Excel`);
    setSelectedRequests([]);
  };

  // Bulk PDF print (client-side)
  const handleBulkPDF = () => {
    const targets = selectedRequests.length > 0
      ? displayedRequests.filter(r => selectedRequests.includes(r.id))
      : displayedRequests;
    if (targets.length === 0) { toast.warning('No requests to print'); return; }
    const total = targets.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const tableRows = targets.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.request_code}</strong></td>
        <td>${`${r.requester_first_name || ''} ${r.requester_last_name || ''}`.trim()}</td>
        <td>${r.department_name || r.department_code || '—'}</td>
        <td>${r.priority || 'MEDIUM'}</td>
        <td align="right">$${Number(r.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td>${r.status.replace(/_/g, ' ')}</td>
        <td>${(r as any).submitted_at ? format(new Date((r as any).submitted_at), 'dd MMM yyyy') : r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : '—'}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${DOC_TITLE} — Dispatch Report</title>
<style>
  *{box-sizing:border-box;} body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;margin:0;padding:20px;}
  .doc-header{background:white;border-bottom:2px solid #006064;color:#006064;padding:12px 0 12px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-end;}
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
  <div><div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div><h1>${DOC_TITLE} — Dispatch Report</h1><p>Records: <strong>${targets.length}</strong> &nbsp;|&nbsp; Total: <strong>$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p></div>
  <div style="font-size:10px;color:#666">Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</div>
</div>
<h3>Dispatch Summary (${targets.length} records)</h3>
<table>
  <thead><tr><th>#</th><th>Reference</th><th>Requester</th><th>Department</th><th>Priority</th><th align="right">Amount ($)</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>${tableRows}
  <tr class="total-row"><td colspan="5" align="right">TOTAL:</td><td align="right">$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td colspan="2"></td></tr>
  </tbody>
</table>
<div class="page-footer">
  <div class="footer-left"><div>Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</div><div>ERP Connect - Zimbabwe Council of Churches | CONFIDENTIAL</div></div>
  <div class="footer-right">${POWERED_BY}</div>
</div>
${buildDigitalStamp('')}
</body></html>`;
    downloadHTMLAsPDF(html, `dispatch-report-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  // Toggle request selection
  const toggleSelection = (requestId: number) => {
    setSelectedRequests(prev => 
      prev.includes(requestId)
        ? prev.filter(id => id !== requestId)
        : [...prev, requestId]
    );
  };

  // Select all visible requests
  const toggleSelectAll = () => {
    if (selectedRequests.length === requests.length) {
      setSelectedRequests([]);
    } else {
      setSelectedRequests(requests.map(r => r.id));
    }
  };

  // Mark request as dispatched
  const handleMarkDispatched = async (requestId: number) => {
    setDispatchTargetId(requestId);
    setDispatchConfirmOpen(true);
  };

  const confirmDispatch = async () => {
    if (!dispatchTargetId) return;
    try {
      const result = await reconciliationService.markAsDispatched(dispatchTargetId);
      if (result.success) {
        toast.success('Request marked as dispatched');
        setDispatchConfirmOpen(false);
        setDispatchTargetId(null);
        fetchRequests();
      } else {
        toast.error(result.error || 'Failed to mark as dispatched');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to mark as dispatched');
    }
  };

  // Reverse dispatch (Finance / Admin)
  const handleReverseDispatch = (requestId: number) => {
    setReverseDispatchTargetId(requestId);
    setReverseDispatchReason('');
    setReverseDispatchOpen(true);
  };

  const confirmReverseDispatch = async () => {
    if (!reverseDispatchTargetId) return;
    try {
      const result = await reconciliationService.reverseDispatch(reverseDispatchTargetId, reverseDispatchReason);
      if (result.success) {
        toast.success('Dispatch reversed. Request is back to APPROVED status.');
        setReverseDispatchOpen(false);
        setReverseDispatchTargetId(null);
        fetchRequests();
      } else {
        toast.error(result.error || 'Failed to reverse dispatch');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to reverse dispatch');
    }
  };

  const getStatusColor = (status: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
    switch (status) {
      case 'APPROVED': return 'success';
      case 'DISPATCHED': return 'info';
      case 'REJECTED': return 'error';
      case 'PENDING_RECONCILIATION': return 'warning';
      case 'RECON_PENDING_LEAD': return 'warning';
      case 'RECON_PENDING_FINANCE': return 'warning';
      case 'RECONCILED': return 'success';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'RECON_PENDING_LEAD': return 'On Lead/HOP Review';
      case 'RECON_PENDING_FINANCE': return 'On Finance Review';
      case 'DISPATCHED': return 'Awaiting Reconciliation';
      case 'PENDING_RECONCILIATION': return 'Pending Reconciliation';
      default: return status.replace(/_/g, ' ');
    }
  };

  // Filtered counts
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
  const dispatchedCount = requests.filter(r => r.status === 'DISPATCHED').length;
  const reconciledCount = requests.filter(r =>
    ['PENDING_RECONCILIATION', 'RECONCILED', 'RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE'].includes(r.status)
  ).length;

  // Tab-based filtering
  const applySearchFilter = (reqs: any[]) => {
    if (!searchText.trim()) return reqs;
    const lc = searchText.toLowerCase();
    return reqs.filter(r =>
      (r.request_code || '').toLowerCase().includes(lc) ||
      (`${r.requester_first_name || ''} ${r.requester_last_name || ''}`).toLowerCase().includes(lc) ||
      (r.department_name || '').toLowerCase().includes(lc) ||
      (r.department_code || '').toLowerCase().includes(lc) ||
      (r.project_name || '').toLowerCase().includes(lc) ||
      (r.project_code || '').toLowerCase().includes(lc) ||
      (r.donor_name || '').toLowerCase().includes(lc)
    );
  };

  const getTabRequests = () => {
    let base: any[];
    switch (activeTab) {
      case 0: base = requests; break; // All
      case 1: base = requests.filter(r => r.status === 'APPROVED'); break; // Pending Dispatch
      case 2: base = requests.filter(r => r.status === 'DISPATCHED'); break; // Dispatched
      case 3: {
        // Include DISPATCHED (awaiting reconciliation) + all reconciliation workflow statuses
        const reconStatuses = ['DISPATCHED', 'PENDING_RECONCILIATION', 'RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE', 'RECONCILED'];
        let reconReqs = requests.filter(r => reconStatuses.includes(r.status));
        if (reconSubFilter === 'AWAITING') reconReqs = reconReqs.filter(r => r.status === 'DISPATCHED' || r.status === 'PENDING_RECONCILIATION');
        else if (reconSubFilter) reconReqs = reconReqs.filter(r => r.status === reconSubFilter);
        base = reconReqs;
        break;
      }
      default: base = requests;
    }
    return applySearchFilter(base);
  };

  const displayedRequests = getTabRequests();
  const pagedRequests = displayedRequests.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Dispatch Desk
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View all requests, manage dispatch, and generate printable documents. Track dispatched and non-dispatched requests.
        </Typography>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography color="text.secondary" variant="caption">Total Requests</Typography>
              <Typography variant="h4">{requests.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ borderLeft: '4px solid #2e7d32' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography color="text.secondary" variant="caption">Pending Dispatch</Typography>
              <Typography variant="h4" color="success.main">{approvedCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ borderLeft: '4px solid #1976d2' }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography color="text.secondary" variant="caption">Dispatched</Typography>
              <Typography variant="h4" color="info.main">{dispatchedCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography color="text.secondary" variant="caption">Total Amount</Typography>
              <Typography variant="h5">
                ${requests.reduce((sum, r) => sum + Number(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper elevation={1} sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={(_, v) => { setActiveTab(v as number); setPage(0); }} variant="scrollable" scrollButtons="auto">
          <Tab label={`All (${requests.length})`} />
          <Tab icon={<ApprovedIcon />} iconPosition="start" label={`Pending Dispatch (${approvedCount})`} />
          <Tab icon={<DispatchIcon />} iconPosition="start" label={`Dispatched (${dispatchedCount})`} />
          <Tab icon={<ReconcileIcon />} iconPosition="start" label={`Reconciliation (${reconciledCount})`} />
        </Tabs>
      </Paper>

      {/* Filters */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              label="Search (Ref, Requestor, Partner, Project)"
              size="small"
              fullWidth
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setPage(0); }}
              InputProps={{ startAdornment: <FilterIcon sx={{ mr: 0.5, color: 'text.secondary', fontSize: 18 }} /> }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Status"
              size="small"
              fullWidth
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <MenuItem value="">All Statuses</MenuItem>
              <MenuItem value="APPROVED">Pending Dispatch</MenuItem>
              <MenuItem value="DISPATCHED">Dispatched</MenuItem>
              <MenuItem value="RECON_PENDING_LEAD">On Lead/HOP Review</MenuItem>
              <MenuItem value="RECON_PENDING_FINANCE">On Finance Review</MenuItem>
              <MenuItem value="PENDING_RECONCILIATION">Waiting for Reconciliation</MenuItem>
              <MenuItem value="RECONCILED">Reconciled</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Department"
              size="small"
              fullWidth
              value={filters.departmentId}
              onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
            >
              <MenuItem value="">All Departments</MenuItem>
              {departments.map(dept => (
                <MenuItem key={dept.id} value={dept.id}>
                  {dept.department_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Project"
              size="small"
              fullWidth
              value={filters.projectId}
              onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
            >
              <MenuItem value="">All Projects</MenuItem>
              {projects.map(p => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.project_code} — {p.project_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              type="date"
              label="From Date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              type="date"
              label="To Date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Box display="flex" gap={1}>
              <Button
                variant="outlined"
                startIcon={<FilterIcon />}
                onClick={fetchRequests}
              >
                Apply Filters
              </Button>
              {selectedRequests.length > 0 && (
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={handleBulkExport}
                >
                  Export Excel ({selectedRequests.length})
                </Button>
              )}
              {selectedRequests.length > 0 && (
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<PdfIcon />}
                  onClick={handleBulkPDF}
                >
                  Print PDF ({selectedRequests.length})
                </Button>
              )}
              {selectedRequests.length === 0 && displayedRequests.length > 0 && (
                <Button variant="outlined" color="error" startIcon={<PdfIcon />} onClick={handleBulkPDF}>
                  Print All PDF
                </Button>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Reconciliation sub-filter (only on tab 3) */}
      {activeTab === 3 && (
        <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm="auto">
              <Typography variant="subtitle2" color="text.secondary">Reconciliation Filter:</Typography>
            </Grid>
            <Grid item xs={12} sm={4} md={3}>
              <TextField
                select label="Reconciliation Status" size="small" fullWidth
                value={reconSubFilter}
                onChange={e => { setReconSubFilter(e.target.value); setPage(0); }}
              >
                <MenuItem value="">All Reconciliation</MenuItem>
                <MenuItem value="AWAITING">Awaiting Reconciliation</MenuItem>
                <MenuItem value="RECON_PENDING_LEAD">On Lead/HOP Review</MenuItem>
                <MenuItem value="RECON_PENDING_FINANCE">On Finance Review</MenuItem>
                <MenuItem value="RECONCILED">Reconciled</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Requests Table */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'grey.100' }}>
                <TableCell padding="checkbox">
                  <input
                    type="checkbox"
                    checked={selectedRequests.length === pagedRequests.length && pagedRequests.length > 0}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Request #</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Requester</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Priority</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayedRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No requests found for the selected filter</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                pagedRequests.map((request) => (
                  <TableRow 
                    key={request.id}
                    hover
                    selected={selectedRequests.includes(request.id)}
                  >
                    <TableCell padding="checkbox">
                      <input
                        type="checkbox"
                        checked={selectedRequests.includes(request.id)}
                        onChange={() => toggleSelection(request.id)}
                      />
                    </TableCell>
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
                      ${Number(request.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={request.priority || 'MEDIUM'}
                        size="small"
                        color={request.priority === 'URGENT' ? 'error' : request.priority === 'HIGH' ? 'warning' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={getStatusLabel(request.status)} 
                        color={getStatusColor(request.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {request.submitted_at 
                        ? format(new Date(request.submitted_at), 'MMM d, yyyy')
                        : request.created_at ? format(new Date(request.created_at), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" gap={0.5} justifyContent="center">
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleViewDetail(request)}
                          >
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                        {request.status === 'APPROVED' && (
                          <Tooltip title="Mark as Dispatched">
                            <Button
                              size="small"
                              variant="contained"
                              color="primary"
                              startIcon={<DispatchIcon />}
                              onClick={() => handleMarkDispatched(request.id)}
                            >
                              Dispatch
                            </Button>
                          </Tooltip>
                        )}
                        {request.status === 'DISPATCHED' && (
                          <Tooltip title="Reverse Dispatch">
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              startIcon={<UndoIcon />}
                              onClick={() => handleReverseDispatch(request.id)}
                            >
                              Undo
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip title="Download PDF">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDownloadPDF(request.id, request.request_code)}
                          >
                            <PdfIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download Excel">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={() => handleDownloadExcel(request.id, request.request_code)}
                          >
                            <ExcelIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={displayedRequests.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 15, 25, 50]}
        />
        </>
      )}

      {/* ==================== REQUEST DETAIL DIALOG ==================== */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <ViewIcon color="primary" />
            <Typography variant="h6">Request Details: {detailRequest?.request_code}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loadingDetail ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : detailRequest ? (
            <Box>
              {/* Request Info */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Requester</Typography>
                  <Typography fontWeight={500}>
                    {detailRequest.requester_first_name} {detailRequest.requester_last_name}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Department</Typography>
                  <Typography fontWeight={500}>{detailRequest.department_name}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <Box mt={0.5}>
                    <Chip label={getStatusLabel(detailRequest.status)} color={getStatusColor(detailRequest.status)} size="small" />
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Priority</Typography>
                  <Box mt={0.5}>
                    <Chip 
                      label={detailRequest.priority || 'MEDIUM'} 
                      size="small"
                      color={detailRequest.priority === 'URGENT' ? 'error' : detailRequest.priority === 'HIGH' ? 'warning' : 'default'}
                    />
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Total Amount</Typography>
                  <Typography variant="h6" fontWeight={600} color="primary.main">
                    ${Number(detailRequest.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Submitted</Typography>
                  <Typography fontWeight={500}>
                    {detailRequest.submitted_at ? format(new Date(detailRequest.submitted_at), 'MMM d, yyyy HH:mm') : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Finance Approved</Typography>
                  <Typography fontWeight={500}>
                    {detailRequest.finance_approved_at ? format(new Date(detailRequest.finance_approved_at), 'MMM d, yyyy HH:mm') : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Request Code</Typography>
                  <Typography fontWeight={500}>{detailRequest.request_code}</Typography>
                </Grid>
                {(detailRequest.is_activity_request || detailRequest.activity_start_date || detailRequest.activity_end_date) && (
                  <>
                    <Grid item xs={12}>
                      <Chip label="Activity Request" color="warning" size="small" sx={{ mb: 1 }} />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Activity Start Date</Typography>
                      <Typography fontWeight={500} color="warning.dark">
                        {detailRequest.activity_start_date ? format(new Date(detailRequest.activity_start_date), 'MMM d, yyyy') : '—'}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">Activity End Date</Typography>
                      <Typography fontWeight={500} color="warning.dark">
                        {detailRequest.activity_end_date ? format(new Date(detailRequest.activity_end_date), 'MMM d, yyyy') : '—'}
                      </Typography>
                    </Grid>
                  </>
                )}
              </Grid>

              {detailRequest.justification && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Justification</Typography>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2">{detailRequest.justification}</Typography>
                  </Paper>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Line Items */}
              {detailItems.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Request Items</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 600 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Unit</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Unit Price</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Total</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Budget Code</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detailItems.map((item: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell>{item.item_description}</TableCell>
                            <TableCell align="right">{item.quantity}</TableCell>
                            <TableCell>{item.unit_of_measure}</TableCell>
                            <TableCell align="right">${Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell align="right">${(Number(item.quantity || 1) * Number(item.unit_price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell><Chip label={item.budget_code} size="small" variant="outlined" /></TableCell>
                          </TableRow>
                        ))}
                        <TableRow sx={{ backgroundColor: 'primary.light' }}>
                          <TableCell colSpan={5} align="right"><Typography fontWeight={600}>Grand Total:</Typography></TableCell>
                          <TableCell align="right">
                            <Typography fontWeight={600}>
                              ${Number(detailRequest.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </Typography>
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Approval Trail */}
              {detailApprovalTrail.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Approval Trail</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>By</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Comments</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detailApprovalTrail.map((log: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Chip
                                label={log.action}
                                size="small"
                                color={log.action === 'APPROVED' ? 'success' : log.action === 'REJECTED' ? 'error' : 'default'}
                              />
                            </TableCell>
                            <TableCell>{log.approver_first_name || log.actor_name} {log.approver_last_name || ''}</TableCell>
                            <TableCell>{(log.approver_role || log.actor_role || '').replace(/_/g, ' ')}</TableCell>
                            <TableCell>{log.comments || log.comment || '-'}</TableCell>
                            <TableCell>{log.created_at ? format(new Date(log.created_at), 'MMM d, yyyy HH:mm') : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          {detailRequest?.status === 'APPROVED' && (
            <Button variant="contained" startIcon={<DispatchIcon />} onClick={() => { handleMarkDispatched(detailRequest.id); setDetailOpen(false); }}>
              Mark as Dispatched
            </Button>
          )}
          {detailRequest?.status === 'DISPATCHED' && (
            <Button variant="outlined" color="warning" startIcon={<UndoIcon />} onClick={() => { handleReverseDispatch(detailRequest.id); setDetailOpen(false); }}>
              Reverse Dispatch
            </Button>
          )}
          <Button variant="outlined" color="error" onClick={() => handleDownloadPDF(detailRequest?.id, detailRequest?.request_code)} startIcon={<PdfIcon />}>
            Print PDF
          </Button>
          <Button variant="outlined" color="success" onClick={() => handleDownloadExcel(detailRequest?.id, detailRequest?.request_code)} startIcon={<ExcelIcon />}>
            Export Excel
          </Button>
          <Button onClick={() => setDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ==================== DISPATCH CONFIRMATION DIALOG ==================== */}
      <Dialog open={dispatchConfirmOpen} onClose={() => setDispatchConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <DispatchIcon color="primary" />
            <Typography variant="h6">Confirm Dispatch</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to dispatch this request? Once dispatched, the requester will be notified to proceed with reconciliation.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDispatchConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" color="primary" startIcon={<DispatchIcon />} onClick={confirmDispatch}>
            Yes, Dispatch
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== REVERSE DISPATCH DIALOG ==================== */}
      <Dialog open={reverseDispatchOpen} onClose={() => setReverseDispatchOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <WarningIcon color="warning" />
            <Typography variant="h6">Reverse Dispatch</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            This will move the request back to <strong>APPROVED</strong> status. The dispatch action will be logged for audit purposes.
          </Typography>
          <TextField
            label="Reason for reversing dispatch *"
            multiline
            rows={3}
            fullWidth
            value={reverseDispatchReason}
            onChange={(e) => setReverseDispatchReason(e.target.value)}
            placeholder="e.g. Items not yet collected, error in dispatch..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReverseDispatchOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<UndoIcon />}
            onClick={confirmReverseDispatch}
            disabled={!reverseDispatchReason.trim()}
          >
            Reverse Dispatch
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DispatchDesk;
