/**
 * Project Management Page
 * Lists all projects with budget lines and activity drill-down.
 * Includes PDF/Excel export for both the list and individual project detail.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Grid, CircularProgress, Alert, Tooltip, Card,
  CardContent, InputAdornment, Stack, LinearProgress,
  Tabs, Tab, Badge, alpha, useTheme, FormControl, InputLabel,
  Select, MenuItem, Divider, ButtonGroup
} from '@mui/material';
import {
  AccountTree as ProjectsIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  ArrowBack as BackIcon,
  AttachMoney as MoneyIcon,
  TrendingUp as TrendIcon,
  CheckCircle as ActiveIcon,
  PauseCircle as InactiveIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  FileDownload as DownloadIcon,
  FilterList as FilterIcon,
  ClearAll as ClearIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { downloadHTMLAsPDF } from '../utils/pdfUtils';
import projectService from '../services/projectService';
import api from '../services/api';
import { Project } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmtMoney = (v: number | string | undefined, currency = 'USD') => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  if (isNaN(n)) return '$0.00';
  const sym = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : `${currency} `;
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; }
};

const statusColor = (status: string): 'default' | 'warning' | 'success' | 'error' | 'info' => {
  switch (status?.toUpperCase()) {
    case 'APPROVED': return 'success';
    case 'PENDING': case 'PENDING_HOF': case 'PENDING_FINANCE': return 'warning';
    case 'REJECTED': return 'error';
    case 'DISPATCHED': return 'info';
    default: return 'default';
  }
};

// ─── Constants ───────────────────────────────────────────────────────────────

const SYSTEM_NAME = 'ERP Connect - Zimbabwe Council of Churches';
const POWERED_BY  = 'Powered by KC Marufu';

// ─── PDF Styles (shared) ─────────────────────────────────────────────────────

const PDF_BASE_STYLES = `
*{box-sizing:border-box;}
body{font-family:Arial,sans-serif;font-size:10px;color:#1a1a1a;margin:0;padding:16px;}
.doc-header{background:white;border-bottom:2px solid #006064;color:#006064;padding:12px 0 12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;}
.doc-header .org{font-size:11px;font-weight:bold;color:#006064;letter-spacing:.4px;margin-bottom:4px;}
.doc-header h1{font-size:17px;margin:0 0 4px;color:#006064;}.doc-header p{font-size:10px;margin:2px 0;color:#444;}
h3{font-size:10px;color:#006064;border-bottom:1.5px solid #006064;padding-bottom:3px;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.4px;}
table{width:100%;border-collapse:collapse;font-size:9px;}
thead th{background:#006064;color:white;padding:5px 7px;text-align:left;}
thead th.right,tbody td.right{text-align:right;}
tbody td{padding:4px 7px;border-bottom:1px solid #e0e0e0;}
tbody tr:nth-child(even) td{background:#f7f7f7;}
.total-row td{font-weight:bold;background:#e0f2f1 !important;border-top:1.5px solid #006064;}
.chip{display:inline-block;padding:1px 6px;border-radius:10px;font-size:8px;font-weight:700;}
.chip-success{background:#e8f5e9;color:#2e7d32;}.chip-error{background:#ffebee;color:#c62828;}
.chip-warning{background:#fff3e0;color:#e65100;}.chip-info{background:#e3f2fd;color:#1565c0;}
.chip-default{background:#f5f5f5;color:#424242;}
.doc-footer{margin-top:20px;padding-top:8px;border-top:1.5px solid #e0e0e0;display:flex;justify-content:space-between;font-size:8px;color:#999;}
.doc-footer strong{color:#006064;}
.stat-row{display:flex;gap:16px;background:#f5f5f5;border-radius:4px;padding:8px 12px;margin-bottom:10px;flex-wrap:wrap;}
.stat-item{text-align:center;min-width:80px;}.stat-item .val{font-size:13px;font-weight:700;color:#006064;}
.stat-item .lbl{font-size:8px;color:#666;}
`;

// ─── Export: Projects List PDF ───────────────────────────────────────────────

function exportListPDF(projects: Project[], filters: string) {
  const rows = projects.map((p, i) => {
    const budget  = parseFloat(String(p.total_budget  ?? 0));
    const spent   = parseFloat(String(p.total_spent   ?? 0));
    const balance = budget - spent;
    const util    = budget > 0 ? ((spent / budget) * 100).toFixed(1) : '0.0';
    return `<tr>
      <td>${i + 1}</td>
      <td><strong>${p.project_code}</strong><br/><span style="color:#555">${p.project_name}</span></td>
      <td>${p.donor_name ?? '—'}<br/><span style="color:#888;font-size:8px">${p.donor_code ?? ''}</span></td>
      <td>${p.department_name ?? '—'}</td>
      <td class="right">${fmtMoney(budget, p.currency_code)}</td>
      <td class="right">${fmtMoney(spent,  p.currency_code)}</td>
      <td class="right">${fmtMoney(balance, p.currency_code)}</td>
      <td class="right">${util}%</td>
      <td class="right">${p.budget_lines_count ?? 0}</td>
      <td><span class="chip ${p.is_active ? 'chip-success' : 'chip-default'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
    </tr>`;
  }).join('');

  const totalBudget  = projects.reduce((s, p) => s + parseFloat(String(p.total_budget  ?? 0)), 0);
  const totalSpent   = projects.reduce((s, p) => s + parseFloat(String(p.total_spent   ?? 0)), 0);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Projects Report</title>
<style>${PDF_BASE_STYLES}</style></head><body>
<div class="doc-header">
  <div>
    <div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div>
    <h1>Project Management Report</h1>
    <p>Total: <strong>${projects.length}</strong> &nbsp;|&nbsp; Active: <strong>${projects.filter(p => p.is_active).length}</strong></p>
    ${filters ? `<p>Filters: <strong>${filters}</strong></p>` : ''}
  </div>
  <div style="text-align:right;font-size:9px;color:#666"><div>Generated: ${format(new Date(),'dd MMM yyyy HH:mm')}</div><div>${SYSTEM_NAME}</div></div>
</div>
<div class="stat-row">
  <div class="stat-item"><div class="val">${fmtMoney(totalBudget)}</div><div class="lbl">Total Budget</div></div>
  <div class="stat-item"><div class="val">${fmtMoney(totalSpent)}</div><div class="lbl">Total Spent</div></div>
  <div class="stat-item"><div class="val">${fmtMoney(totalBudget - totalSpent)}</div><div class="lbl">Balance</div></div>
  <div class="stat-item"><div class="val">${totalBudget > 0 ? ((totalSpent / totalBudget)*100).toFixed(1) : 0}%</div><div class="lbl">Utilization</div></div>
</div>
<table>
  <thead><tr><th>#</th><th>Project</th><th>Donor</th><th>Department</th><th class="right">Budget</th><th class="right">Spent</th><th class="right">Balance</th><th class="right">Util%</th><th class="right">Lines</th><th>Status</th></tr></thead>
  <tbody>
    ${rows}
    <tr class="total-row"><td colspan="4" align="right">TOTALS:</td>
    <td style="text-align:right">${fmtMoney(totalBudget)}</td>
    <td style="text-align:right">${fmtMoney(totalSpent)}</td>
    <td style="text-align:right">${fmtMoney(totalBudget - totalSpent)}</td>
    <td colspan="3"></td></tr>
  </tbody>
</table>
<div class="doc-footer">
  <div>${SYSTEM_NAME} | CONFIDENTIAL | Generated: ${format(new Date(),'dd MMM yyyy HH:mm')}</div>
  <div><strong>${POWERED_BY}</strong></div>
</div>
</body></html>`;
  downloadHTMLAsPDF(html, `projects-report-${format(new Date(),'yyyy-MM-dd')}`);
}

// ─── Export: Projects List Excel ─────────────────────────────────────────────

function exportListExcel(projects: Project[]) {
  const wb = XLSX.utils.book_new();
  const headers = ['#','Project Code','Project Name','Donor / Partner','Donor Code','Department','Currency',
    'Total Budget','Total Allocated','Total Spent','Balance','Utilization %','Budget Lines','Status','Start Date','End Date','Created At'];
  const rows = projects.map((p, i) => {
    const budget    = parseFloat(String(p.total_budget    ?? 0));
    const allocated = parseFloat(String(p.total_allocated ?? 0));
    const spent     = parseFloat(String(p.total_spent     ?? 0));
    return [i+1, p.project_code, p.project_name, p.donor_name??'', p.donor_code??'', p.department_name??'',
      p.currency_code??'USD', budget, allocated, spent, budget-spent,
      budget > 0 ? parseFloat(((spent/budget)*100).toFixed(2)) : 0,
      p.budget_lines_count??0, p.is_active?'Active':'Inactive',
      p.start_date?fmtDate(p.start_date):'', p.end_date?fmtDate(p.end_date):'', fmtDate(p.created_at)];
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [4,16,30,22,12,20,10,14,14,14,14,12,8,10,14,14,14].map(w => ({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Projects');
  XLSX.writeFile(wb, `projects-report-${format(new Date(),'yyyy-MM-dd')}.xlsx`);
  toast.success('Exported to Excel');
}

// ─── Export: Individual Project PDF ─────────────────────────────────────────

function exportProjectPDF(project: Project, activity: {budget_lines:any[];budget_transactions:any[];requests:any[]}) {
  const budget  = parseFloat(String(project.total_budget  ?? 0));
  const spent   = parseFloat(String(project.total_spent   ?? 0));
  const balance = budget - spent;
  const util    = budget > 0 ? ((spent/budget)*100).toFixed(1) : '0.0';
  const cur     = project.currency_code || 'USD';

  const blRows = activity.budget_lines.map(bl => {
    const bal = parseFloat(bl.balance);
    return `<tr><td>${bl.budget_code}</td><td>${bl.budget_name}</td><td>${bl.department_name||'—'}</td>
    <td class="right">${fmtMoney(parseFloat(bl.allocated_amount),cur)}</td>
    <td class="right">${fmtMoney(parseFloat(bl.spent_amount),cur)}</td>
    <td class="right" style="color:${bal<0?'#c62828':'#2e7d32'};font-weight:700">${fmtMoney(bal,cur)}</td>
    <td><span class="chip ${bl.is_active?'chip-success':'chip-default'}">${bl.is_active?'Active':'Suspended'}</span></td></tr>`;
  }).join('') || '<tr><td colspan="7" align="center" style="color:#888;padding:8px">No budget lines</td></tr>';

  const txRows = activity.budget_transactions.map(tx => {
    const isDebit = ['DEDUCTION','SPEND'].includes(tx.transaction_type);
    return `<tr><td>${fmtDate(tx.created_at)}</td><td>${tx.budget_code||'—'}</td>
    <td><span class="chip ${isDebit?'chip-error':'chip-success'}">${tx.transaction_type}</span></td>
    <td class="right" style="color:${isDebit?'#c62828':'#2e7d32'};font-weight:700">${tx.amount<0?'':'+'}${fmtMoney(Math.abs(tx.amount),cur)}</td>
    <td class="right">${fmtMoney(tx.balance_after,cur)}</td>
    <td>${(tx.performed_by_first||'')} ${(tx.performed_by_last||'')}</td>
    <td>${tx.description||'—'}</td></tr>`;
  }).join('') || '<tr><td colspan="7" align="center" style="color:#888;padding:8px">No transactions</td></tr>';

  const rqRows = activity.requests.map(rq => {
    const cls = rq.status==='APPROVED'?'chip-success':rq.status==='REJECTED'?'chip-error':rq.status?.includes('PENDING')?'chip-warning':rq.status==='DISPATCHED'?'chip-info':'chip-default';
    return `<tr><td>${rq.request_code}</td><td>${(rq.requester_first||'')} ${(rq.requester_last||'')}</td>
    <td>${rq.department_name||'—'}</td><td class="right">${fmtMoney(rq.total_amount)}</td>
    <td><span class="chip ${cls}">${rq.status}</span></td><td>${fmtDate(rq.created_at)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" align="center" style="color:#888;padding:8px">No requests</td></tr>';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${project.project_code}</title>
<style>${PDF_BASE_STYLES}</style></head><body>
<div class="doc-header">
  <div>
    <div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div>
    <h1>${project.project_name}</h1>
    <p>Code: <strong>${project.project_code}</strong> | Donor: <strong>${project.donor_name??'—'}</strong> | Dept: <strong>${project.department_name??'—'}</strong></p>
    <p>${project.start_date?`Period: ${fmtDate(project.start_date)} – ${fmtDate(project.end_date)}`:''} | <strong>${project.is_active?'Active':'Inactive'}</strong></p>
  </div>
  <div style="text-align:right;font-size:9px;color:#666"><div>Generated: ${format(new Date(),'dd MMM yyyy HH:mm')}</div><div>${SYSTEM_NAME}</div></div>
</div>
<div class="stat-row">
  <div class="stat-item"><div class="val">${fmtMoney(budget,cur)}</div><div class="lbl">Total Budget</div></div>
  <div class="stat-item"><div class="val">${fmtMoney(spent,cur)}</div><div class="lbl">Total Spent</div></div>
  <div class="stat-item"><div class="val">${fmtMoney(balance,cur)}</div><div class="lbl">Balance</div></div>
  <div class="stat-item"><div class="val">${util}%</div><div class="lbl">Utilization</div></div>
  <div class="stat-item"><div class="val">${activity.budget_lines.length}</div><div class="lbl">Budget Lines</div></div>
  <div class="stat-item"><div class="val">${activity.requests.length}</div><div class="lbl">Requests</div></div>
</div>
${project.description?`<p style="font-size:9px;color:#555;margin-bottom:10px">${project.description}</p>`:''}
<h3>Budget Lines (${activity.budget_lines.length})</h3>
<table><thead><tr><th>Code</th><th>Name</th><th>Department</th><th class="right">Allocated</th><th class="right">Spent</th><th class="right">Balance</th><th>Status</th></tr></thead><tbody>${blRows}</tbody></table>
<h3 style="margin-top:14px">Transactions (${activity.budget_transactions.length})</h3>
<table><thead><tr><th>Date</th><th>Budget Line</th><th>Type</th><th class="right">Amount</th><th class="right">Bal After</th><th>Performed By</th><th>Description</th></tr></thead><tbody>${txRows}</tbody></table>
<h3 style="margin-top:14px">Requests (${activity.requests.length})</h3>
<table><thead><tr><th>Reference</th><th>Requester</th><th>Department</th><th class="right">Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>${rqRows}</tbody></table>
<div class="doc-footer">
  <div>${SYSTEM_NAME} | CONFIDENTIAL | Generated: ${format(new Date(),'dd MMM yyyy HH:mm')}</div>
  <div><strong>${POWERED_BY}</strong></div>
</div>
</body></html>`;
  downloadHTMLAsPDF(html, `project-${project.project_code}-${format(new Date(),'yyyy-MM-dd')}`);
}

// ─── Export: Individual Project Excel ────────────────────────────────────────

function exportProjectExcel(project: Project, activity: {budget_lines:any[];budget_transactions:any[];requests:any[]}) {
  const cur = project.currency_code || 'USD';
  const wb  = XLSX.utils.book_new();

  // Summary
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['Field','Value'],
    ['Project Code', project.project_code], ['Project Name', project.project_name],
    ['Donor', project.donor_name??''], ['Donor Code', project.donor_code??''],
    ['Department', project.department_name??''], ['Currency', cur],
    ['Total Budget',    parseFloat(String(project.total_budget??0))],
    ['Total Allocated', parseFloat(String(project.total_allocated??0))],
    ['Total Spent',     parseFloat(String(project.total_spent??0))],
    ['Balance', parseFloat(String(project.total_budget??0)) - parseFloat(String(project.total_spent??0))],
    ['Status', project.is_active?'Active':'Inactive'],
    ['Start Date', project.start_date?fmtDate(project.start_date):''],
    ['End Date', project.end_date?fmtDate(project.end_date):''],
    ['Description', project.description??''],
    ['Budget Lines', activity.budget_lines.length],
    ['Transactions', activity.budget_transactions.length],
    ['Requests', activity.requests.length],
    ['Generated', format(new Date(),'dd MMM yyyy HH:mm')],
  ]);
  ws1['!cols'] = [{wch:20},{wch:40}];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  // Budget Lines
  const blH = ['Code','Name','Department',`Allocated (${cur})`,`Spent (${cur})`,`Balance (${cur})`,'Fiscal Year','Status'];
  const blR = activity.budget_lines.map(bl => [bl.budget_code, bl.budget_name, bl.department_name??'',
    parseFloat(bl.allocated_amount), parseFloat(bl.spent_amount), parseFloat(bl.balance), bl.fiscal_year, bl.is_active?'Active':'Suspended']);
  const ws2 = XLSX.utils.aoa_to_sheet([blH,...blR]);
  ws2['!cols'] = [14,30,20,16,14,14,10,10].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws2, 'Budget Lines');

  // Transactions
  const txH = ['Date','Budget Code','Budget Name','Type','Amount','Balance Before','Balance After','Performed By','Description','Request Ref'];
  const txR = activity.budget_transactions.map(tx => [
    tx.created_at?format(new Date(tx.created_at),'dd MMM yyyy HH:mm'):'',
    tx.budget_code??'', tx.budget_name??'', tx.transaction_type,
    parseFloat(tx.amount??0), parseFloat(tx.balance_before??0), parseFloat(tx.balance_after??0),
    `${tx.performed_by_first??''} ${tx.performed_by_last??''}`.trim(),
    tx.description??'', tx.request_code??''
  ]);
  const ws3 = XLSX.utils.aoa_to_sheet([txH,...txR]);
  ws3['!cols'] = [18,14,28,14,12,14,14,20,35,14].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws3, 'Transactions');

  // Requests
  const rqH = ['Reference','Requester','Department','Amount','Status','Date'];
  const rqR = activity.requests.map(rq => [
    rq.request_code, `${rq.requester_first??''} ${rq.requester_last??''}`.trim(),
    rq.department_name??'', parseFloat(rq.total_amount??0), rq.status, rq.created_at?fmtDate(rq.created_at):''
  ]);
  const ws4 = XLSX.utils.aoa_to_sheet([rqH,...rqR]);
  ws4['!cols'] = [16,22,20,14,20,14].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws4, 'Requests');

  XLSX.writeFile(wb, `project-${project.project_code}-${format(new Date(),'yyyy-MM-dd')}.xlsx`);
  toast.success('Project exported to Excel');
}

// ─── ProjectDetailPanel ─────────────────────────────────────────────────────

interface ProjectDetailPanelProps {
  project: Project;
  onClose: () => void;
  onDelete: (p: Project) => void;
  onEdit: (p: Project) => void;
  canManage: boolean;
}

const ProjectDetailPanel: React.FC<ProjectDetailPanelProps> = ({ project, onClose, onDelete, onEdit, canManage }) => {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [activity, setActivity] = useState<{ budget_lines: any[]; budget_transactions: any[]; requests: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectService.getProjectActivity(project.id);
      setActivity(data);
    } catch {
      toast.error('Failed to load project activity');
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const allocated = parseFloat(String(project.total_allocated ?? 0));
  const spent = parseFloat(String(project.total_spent ?? 0));
  const budgetTotal = parseFloat(String(project.total_budget ?? 0));
  const balance = budgetTotal - spent;
  const utilPct = budgetTotal > 0 ? Math.min((spent / budgetTotal) * 100, 100) : 0;

  return (
    <Box>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 2,
          background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
          color: 'white',
          borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={2}>
          <Box>
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <IconButton onClick={onClose} size="small" sx={{ color: 'white' }}>
                <BackIcon />
              </IconButton>
              <Chip
                label={project.project_code}
                size="small"
                sx={{ bgcolor: alpha('#fff', 0.2), color: 'white', fontWeight: 700 }}
              />
              <Chip
                label={project.is_active ? 'Active' : 'Inactive'}
                size="small"
                icon={project.is_active ? <ActiveIcon style={{ color: 'white' }} /> : <InactiveIcon style={{ color: 'white' }} />}
                sx={{ bgcolor: alpha('#fff', 0.15), color: 'white' }}
              />
            </Box>
            <Typography variant="h5" fontWeight={700}>{project.project_name}</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              {project.donor_name} {project.donor_code ? `(${project.donor_code})` : ''}
              {project.department_name ? ` · ${project.department_name}` : ''}
            </Typography>
            {project.description && (
              <Typography variant="body2" sx={{ opacity: 0.75, mt: 0.5 }}>{project.description}</Typography>
            )}
            <Typography variant="caption" sx={{ opacity: 0.7, mt: 0.5, display: 'block' }}>
              {project.start_date ? `${fmtDate(project.start_date)} – ${fmtDate(project.end_date)}` : ''}
            </Typography>
          </Box>
          {/* Export + Delete actions */}
          <Stack direction="row" spacing={1} alignItems="flex-start">
            {activity && (
              <>
                <Tooltip title="Download project detail as PDF">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<PdfIcon />}
                    onClick={() => exportProjectPDF(project, activity)}
                    sx={{ color: 'white', borderColor: alpha('#fff', 0.5), whiteSpace: 'nowrap',
                          '&:hover': { borderColor: 'white', bgcolor: alpha('#fff', 0.1) } }}
                  >
                    PDF
                  </Button>
                </Tooltip>
                <Tooltip title="Export project detail to Excel">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ExcelIcon />}
                    onClick={() => exportProjectExcel(project, activity)}
                    sx={{ color: 'white', borderColor: alpha('#fff', 0.5), whiteSpace: 'nowrap',
                          '&:hover': { borderColor: 'white', bgcolor: alpha('#fff', 0.1) } }}
                  >
                    Excel
                  </Button>
                </Tooltip>
              </>
            )}
            {canManage && (
              <Tooltip title="Edit Project">
                <IconButton onClick={() => onEdit(project)} sx={{ color: alpha('#fff', 0.8), '&:hover': { color: '#bbdefb' } }}>
                  <EditIcon />
                </IconButton>
              </Tooltip>
            )}
            {canManage && (
              <Tooltip title="Delete Project">
                <IconButton onClick={() => onDelete(project)} sx={{ color: alpha('#fff', 0.8), '&:hover': { color: '#ffcdd2' } }}>
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>

        {/* Budget summary bar */}
        <Box mt={2}>
          <Box display="flex" justifyContent="space-between" mb={0.5}>
            <Typography variant="caption">Budget utilization</Typography>
            <Typography variant="caption" fontWeight={700}>{utilPct.toFixed(1)}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={utilPct}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: alpha('#fff', 0.2),
              '& .MuiLinearProgress-bar': {
                bgcolor: utilPct > 90 ? '#f44336' : utilPct > 70 ? '#ff9800' : '#4caf50',
                borderRadius: 4
              }
            }}
          />
          <Grid container spacing={2} mt={0.5}>
            <Grid item xs={4}>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>Total Budget</Typography>
              <Typography variant="body2" fontWeight={700}>{fmtMoney(budgetTotal, project.currency_code)}</Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>Spent</Typography>
              <Typography variant="body2" fontWeight={700}>{fmtMoney(spent, project.currency_code)}</Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>Balance</Typography>
              <Typography variant="body2" fontWeight={700}>{fmtMoney(balance, project.currency_code)}</Typography>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label={
          <Badge badgeContent={activity?.budget_lines?.length || 0} color="primary" max={99}>
            <Box pr={1}>Budget Lines</Box>
          </Badge>
        } />
        <Tab label={
          <Badge badgeContent={activity?.budget_transactions?.length || 0} color="secondary" max={99}>
            <Box pr={1}>Transactions</Box>
          </Badge>
        } />
        <Tab label={
          <Badge badgeContent={activity?.requests?.length || 0} color="info" max={99}>
            <Box pr={1}>Requests</Box>
          </Badge>
        } />
      </Tabs>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : !activity ? (
        <Alert severity="error">Failed to load activity data</Alert>
      ) : (
        <>
          {/* ── Tab 0: Budget Lines ── */}
          {tab === 0 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
                    <TableCell><strong>Code</strong></TableCell>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Department</strong></TableCell>
                    <TableCell align="right"><strong>Allocated</strong></TableCell>
                    <TableCell align="right"><strong>Spent</strong></TableCell>
                    <TableCell align="right"><strong>Balance</strong></TableCell>
                    <TableCell align="center"><strong>Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activity.budget_lines.length === 0 ? (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>No budget lines</TableCell></TableRow>
                  ) : activity.budget_lines.map(bl => {
                    const alloc = parseFloat(bl.allocated_amount);
                    const sp = parseFloat(bl.spent_amount);
                    const bal = parseFloat(bl.balance);
                    return (
                      <TableRow key={bl.id} hover>
                        <TableCell><Chip label={bl.budget_code} size="small" variant="outlined" /></TableCell>
                        <TableCell>{bl.budget_name}</TableCell>
                        <TableCell>{bl.department_name || '—'}</TableCell>
                        <TableCell align="right">{fmtMoney(alloc, project.currency_code)}</TableCell>
                        <TableCell align="right">{fmtMoney(sp, project.currency_code)}</TableCell>
                        <TableCell align="right" sx={{ color: bal < 0 ? 'error.main' : 'success.main', fontWeight: 600 }}>
                          {fmtMoney(bal, project.currency_code)}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={bl.is_active ? 'Active' : 'Suspended'}
                            size="small"
                            color={bl.is_active ? 'success' : 'default'}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* ── Tab 1: Budget Transactions ── */}
          {tab === 1 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(theme.palette.secondary.main, 0.06) }}>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Budget Line</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell align="right"><strong>Amount</strong></TableCell>
                    <TableCell align="right"><strong>Balance After</strong></TableCell>
                    <TableCell><strong>Performed By</strong></TableCell>
                    <TableCell><strong>Description</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activity.budget_transactions.length === 0 ? (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>No transactions</TableCell></TableRow>
                  ) : activity.budget_transactions.map(tx => (
                    <TableRow key={tx.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(tx.created_at)}</TableCell>
                      <TableCell>
                        <Chip label={tx.budget_code} size="small" variant="outlined" />
                        <Typography variant="caption" display="block" color="text.secondary">{tx.budget_name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={tx.transaction_type}
                          size="small"
                          color={tx.transaction_type === 'DEDUCTION' || tx.transaction_type === 'SPEND' ? 'error' : 'success'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: tx.amount < 0 ? 'error.main' : 'success.main' }}>
                        {tx.amount < 0 ? '-' : '+'}{fmtMoney(Math.abs(tx.amount), project.currency_code)}
                      </TableCell>
                      <TableCell align="right">{fmtMoney(tx.balance_after, project.currency_code)}</TableCell>
                      <TableCell>{tx.performed_by_first} {tx.performed_by_last}</TableCell>
                      <TableCell sx={{ maxWidth: 200 }}>
                        <Typography variant="caption" color="text.secondary">{tx.description}</Typography>
                        {tx.request_code && (
                          <Chip label={tx.request_code} size="small" sx={{ ml: 0.5 }} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* ── Tab 2: Requests ── */}
          {tab === 2 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(theme.palette.info.main, 0.06) }}>
                    <TableCell><strong>Code</strong></TableCell>
                    <TableCell><strong>Requester</strong></TableCell>
                    <TableCell><strong>Department</strong></TableCell>
                    <TableCell align="right"><strong>Amount</strong></TableCell>
                    <TableCell align="center"><strong>Status</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activity.requests.length === 0 ? (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>No requests found</TableCell></TableRow>
                  ) : activity.requests.map(rq => (
                    <TableRow key={rq.id} hover>
                      <TableCell>
                        <Chip label={rq.request_code} size="small" color="primary" variant="outlined" />
                      </TableCell>
                      <TableCell>{rq.requester_first} {rq.requester_last}</TableCell>
                      <TableCell>{rq.department_name || '—'}</TableCell>
                      <TableCell align="right">{fmtMoney(rq.total_amount)}</TableCell>
                      <TableCell align="center">
                        <Chip label={rq.status} size="small" color={statusColor(rq.status)} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(rq.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const ProjectManagementPage: React.FC = () => {
  const theme = useTheme();
  const { hasRole, isFinanceManager } = useAuthStore();
  const canManage = isFinanceManager();

  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [searchTerm,       setSearchTerm]       = useState('');
  const [statusFilter,     setStatusFilter]     = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [donorFilter,      setDonorFilter]      = useState('ALL');
  const [deptFilter,       setDeptFilter]       = useState('ALL');
  const [fiscalYearFilter, setFiscalYearFilter] = useState('ALL');
  const [utilFilter,       setUtilFilter]       = useState<'ALL' | 'OVER90' | 'OVER70' | 'UNDER50'>('ALL');
  const [page, setPage]               = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  // Detail view
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteOpen,   setDeleteOpen]   = useState(false);
  const [deleting,     setDeleting]     = useState(false);

  // Edit
  const [editTarget,   setEditTarget]   = useState<Project | null>(null);
  const [editOpen,     setEditOpen]     = useState(false);
  const [editSaving,   setEditSaving]   = useState(false);
  const [editForm,     setEditForm]     = useState({ project_name: '', project_code: '', description: '', start_date: '', end_date: '', department_id: '' });
  const [departments,  setDepartments]  = useState<{ id: number; department_name: string }[]>([]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const [data, deptRes] = await Promise.all([
        projectService.getAllProjects(),
        api.get('/departments')
      ]);
      setProjects(data);
      setDepartments(deptRes.data?.data || deptRes.data || []);
    } catch {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // Derived filter options
  const donorOptions = useMemo(() => {
    const seen = new Set<string>();
    return projects.filter(p => p.donor_name && !seen.has(p.donor_name) && seen.add(p.donor_name))
      .map(p => p.donor_name!);
  }, [projects]);

  const deptOptions = useMemo(() => {
    const seen = new Set<string>();
    return projects.filter(p => p.department_name && !seen.has(p.department_name) && seen.add(p.department_name))
      .map(p => p.department_name!);
  }, [projects]);

  const fiscalYearOptions = useMemo(() => {
    const years = new Set<number>();
    projects.forEach(p => { if (p.start_date) { try { years.add(new Date(p.start_date).getFullYear()); } catch {} } });
    return Array.from(years).sort((a, b) => b - a);
  }, [projects]);

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'ALL' || donorFilter !== 'ALL' ||
    deptFilter !== 'ALL' || fiscalYearFilter !== 'ALL' || utilFilter !== 'ALL';

  const clearFilters = () => {
    setSearchTerm(''); setStatusFilter('ALL'); setDonorFilter('ALL');
    setDeptFilter('ALL'); setFiscalYearFilter('ALL'); setUtilFilter('ALL'); setPage(0);
  };

  const handleOpenDelete = (p: Project) => { setDeleteTarget(p); setDeleteOpen(true); setSelectedProject(null); };

  const handleOpenEdit = (p: Project) => {
    setEditTarget(p);
    setEditForm({
      project_name:  p.project_name ?? '',
      project_code:  p.project_code ?? '',
      description:   (p as any).description ?? '',
      start_date:    p.start_date ? p.start_date.split('T')[0] : '',
      end_date:      p.end_date   ? p.end_date.split('T')[0]   : '',
      department_id: String((p as any).department_id ?? ''),
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    if (!editForm.project_name.trim()) { toast.error('Project name is required'); return; }
    if (!editForm.project_code.trim()) { toast.error('Project code is required'); return; }
    setEditSaving(true);
    try {
      await projectService.updateProject(editTarget.id, {
        project_name:  editForm.project_name.trim(),
        project_code:  editForm.project_code.trim(),
        description:   editForm.description.trim() || undefined,
        start_date:    editForm.start_date || undefined,
        end_date:      editForm.end_date   || undefined,
        department_id: editForm.department_id ? Number(editForm.department_id) : null,
      });
      toast.success('Project updated successfully');
      setEditOpen(false);
      setEditTarget(null);
      // Refresh list and update selected project if in detail view
      await fetchProjects();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update project');
    } finally { setEditSaving(false); }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await projectService.deleteProject(deleteTarget.id);
      toast.success('Project deleted successfully');
      setDeleteOpen(false); setDeleteTarget(null);
      fetchProjects();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete project');
    } finally { setDeleting(false); }
  };

  // Filtered list
  const filtered = useMemo(() => projects.filter(p => {
    if (statusFilter === 'ACTIVE'   && !p.is_active) return false;
    if (statusFilter === 'INACTIVE' &&  p.is_active) return false;
    if (donorFilter !== 'ALL' && p.donor_name !== donorFilter) return false;
    if (deptFilter  !== 'ALL' && p.department_name !== deptFilter) return false;
    if (fiscalYearFilter !== 'ALL') {
      const yr = p.start_date ? new Date(p.start_date).getFullYear() : null;
      if (yr !== parseInt(fiscalYearFilter)) return false;
    }
    if (utilFilter !== 'ALL') {
      const budget = parseFloat(String(p.total_budget ?? 0));
      const spent  = parseFloat(String(p.total_spent  ?? 0));
      const util   = budget > 0 ? (spent / budget) * 100 : 0;
      if (utilFilter === 'OVER90'  && util <= 90) return false;
      if (utilFilter === 'OVER70'  && util <= 70) return false;
      if (utilFilter === 'UNDER50' && util >= 50) return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!p.project_name.toLowerCase().includes(q) && !p.project_code.toLowerCase().includes(q) &&
          !(p.donor_name||'').toLowerCase().includes(q) && !(p.department_name||'').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [projects, searchTerm, statusFilter, donorFilter, deptFilter, fiscalYearFilter, utilFilter]);

  const paginated = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const totalBudget    = filtered.reduce((s, p) => s + parseFloat(String(p.total_budget    ?? 0)), 0);
  const totalAllocated = filtered.reduce((s, p) => s + parseFloat(String(p.total_allocated ?? 0)), 0);
  const totalSpent     = filtered.reduce((s, p) => s + parseFloat(String(p.total_spent     ?? 0)), 0);

  const activeFilterDesc = [
    donorFilter      !== 'ALL' && `Donor: ${donorFilter}`,
    deptFilter       !== 'ALL' && `Dept: ${deptFilter}`,
    statusFilter     !== 'ALL' && `Status: ${statusFilter}`,
    fiscalYearFilter !== 'ALL' && `Year: ${fiscalYearFilter}`,
    utilFilter       !== 'ALL' && `Utilization: ${utilFilter}`,
    searchTerm       && `Search: "${searchTerm}"`
  ].filter(Boolean).join(' | ');

  // ── If a project is selected, show detail panel ──
  if (selectedProject) {
    return (
      <Box>
        <ProjectDetailPanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onDelete={handleOpenDelete}
          onEdit={handleOpenEdit}
          canManage={canManage}
        />
        <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Delete Project</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>This action is permanent and cannot be undone.</Alert>
            <Typography>
              Are you sure you want to delete project <strong>{deleteTarget?.project_code} — {deleteTarget?.project_name}</strong>?
            </Typography>
            {(deleteTarget?.budget_lines_count ?? 0) > 0 && (
              <Alert severity="error" sx={{ mt: 2 }}>This project has {deleteTarget?.budget_lines_count} budget line(s). Remove them first.</Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleConfirmDelete}
              disabled={deleting || (deleteTarget?.budget_lines_count ?? 0) > 0}
              startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit project dialog (detail view) */}
        <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Edit Project — {editTarget?.project_code}</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid item xs={12} sm={6}>
                <TextField label="Project Code" fullWidth required value={editForm.project_code}
                  onChange={e => setEditForm(f => ({ ...f, project_code: e.target.value }))} disabled={editSaving} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Project Name" fullWidth required value={editForm.project_name}
                  onChange={e => setEditForm(f => ({ ...f, project_name: e.target.value }))} disabled={editSaving} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Start Date" fullWidth type="date" InputLabelProps={{ shrink: true }}
                  value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} disabled={editSaving} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="End Date" fullWidth type="date" InputLabelProps={{ shrink: true }}
                  value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} disabled={editSaving} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth disabled={editSaving}>
                  <InputLabel>Department</InputLabel>
                  <Select
                    value={editForm.department_id}
                    label="Department"
                    onChange={e => setEditForm(f => ({ ...f, department_id: String(e.target.value) }))}
                  >
                    <MenuItem value=""><em>— Not assigned —</em></MenuItem>
                    {departments.map(d => (
                      <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField label="Description" fullWidth multiline rows={3} value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} disabled={editSaving} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
            <Button variant="contained" onClick={handleSaveEdit} disabled={editSaving}
              startIcon={editSaving ? <CircularProgress size={16} color="inherit" /> : <EditIcon />}>
              Save Changes
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // ── Projects list ──
  return (
    <Box>
      {/* Header */}
      <Paper elevation={0}
        sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)', color: 'white', borderRadius: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <ProjectsIcon sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>Project Management</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                View and manage all projects — budget lines, transactions, and request activity
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <ButtonGroup variant="outlined" size="small">
              <Tooltip title="Export filtered list as PDF">
                <Button startIcon={<PdfIcon />}
                  onClick={() => { if (!filtered.length) { toast.warning('No data to export'); return; } exportListPDF(filtered, activeFilterDesc); }}
                  sx={{ color: 'white', borderColor: alpha('#fff', 0.4), '&:hover': { borderColor: 'white', bgcolor: alpha('#fff', 0.15) } }}>
                  PDF
                </Button>
              </Tooltip>
              <Tooltip title="Export filtered list to Excel">
                <Button startIcon={<ExcelIcon />}
                  onClick={() => { if (!filtered.length) { toast.warning('No data to export'); return; } exportListExcel(filtered); }}
                  sx={{ color: 'white', borderColor: alpha('#fff', 0.4), '&:hover': { borderColor: 'white', bgcolor: alpha('#fff', 0.15) } }}>
                  Excel
                </Button>
              </Tooltip>
            </ButtonGroup>
            <Tooltip title="Refresh">
              <IconButton sx={{ color: 'white' }} onClick={fetchProjects}><RefreshIcon /></IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}><ProjectsIcon color="primary" fontSize="small" /><Typography variant="body2" color="text.secondary">Showing</Typography></Box>
              <Typography variant="h5" fontWeight={700}>{filtered.length}</Typography>
              <Typography variant="caption" color="text.secondary">{filtered.filter(p => p.is_active).length} active · {filtered.filter(p => !p.is_active).length} inactive</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}><MoneyIcon color="info" fontSize="small" /><Typography variant="body2" color="text.secondary">Total Budget</Typography></Box>
              <Typography variant="h5" fontWeight={700}>{fmtMoney(totalBudget)}</Typography>
              <Typography variant="caption" color="text.secondary">Allocated: {fmtMoney(totalAllocated)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}><TrendIcon color="warning" fontSize="small" /><Typography variant="body2" color="text.secondary">Total Spent</Typography></Box>
              <Typography variant="h5" fontWeight={700}>{fmtMoney(totalSpent)}</Typography>
              <Typography variant="caption" color="text.secondary">{totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0}% utilization</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}><DownloadIcon color="success" fontSize="small" /><Typography variant="body2" color="text.secondary">Balance</Typography></Box>
              <Typography variant="h5" fontWeight={700} color={totalBudget - totalSpent < 0 ? 'error.main' : 'inherit'}>{fmtMoney(totalBudget - totalSpent)}</Typography>
              <Typography variant="caption" color="text.secondary">{totalBudget > 0 ? (100 - (totalSpent / totalBudget) * 100).toFixed(1) : 100}% remaining</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <FilterIcon fontSize="small" color="action" />
          <Typography variant="subtitle2" fontWeight={600}>Filters</Typography>
          {hasActiveFilters && (
            <Chip label="Clear all" size="small" icon={<ClearIcon />} onClick={clearFilters}
              color="warning" variant="outlined" sx={{ height: 22, fontSize: '0.72rem' }} />
          )}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {filtered.length} of {projects.length} project{projects.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={4} md={3}>
            <TextField size="small" fullWidth placeholder="Search by name, code, donor…" value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={statusFilter} onChange={e => { setStatusFilter(e.target.value as any); setPage(0); }}>
                <MenuItem value="ALL">All Statuses</MenuItem>
                <MenuItem value="ACTIVE">Active</MenuItem>
                <MenuItem value="INACTIVE">Inactive</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Donor / Partner</InputLabel>
              <Select label="Donor / Partner" value={donorFilter} onChange={e => { setDonorFilter(e.target.value); setPage(0); }}>
                <MenuItem value="ALL">All Donors</MenuItem>
                {donorOptions.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Department</InputLabel>
              <Select label="Department" value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(0); }}>
                <MenuItem value="ALL">All Departments</MenuItem>
                {deptOptions.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Start Year</InputLabel>
              <Select label="Start Year" value={fiscalYearFilter} onChange={e => { setFiscalYearFilter(e.target.value); setPage(0); }}>
                <MenuItem value="ALL">All Years</MenuItem>
                {fiscalYearOptions.map(y => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={1}>
            <FormControl size="small" fullWidth>
              <InputLabel>Util%</InputLabel>
              <Select label="Util%" value={utilFilter} onChange={e => { setUtilFilter(e.target.value as any); setPage(0); }}>
                <MenuItem value="ALL">All</MenuItem>
                <MenuItem value="OVER90">&gt; 90%</MenuItem>
                <MenuItem value="OVER70">&gt; 70%</MenuItem>
                <MenuItem value="UNDER50">&lt; 50%</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
                <TableCell sx={{ py: 1 }}><strong>Project</strong></TableCell>
                <TableCell sx={{ py: 1 }}><strong>Partner / Donor</strong></TableCell>
                <TableCell sx={{ py: 1 }}><strong>Department</strong></TableCell>
                <TableCell align="right" sx={{ py: 1 }}><strong>Budget</strong></TableCell>
                <TableCell align="right" sx={{ py: 1 }}><strong>Allocated</strong></TableCell>
                <TableCell align="right" sx={{ py: 1 }}><strong>Spent / Util</strong></TableCell>
                <TableCell align="center" sx={{ py: 1 }}><strong>Lines</strong></TableCell>
                <TableCell align="center" sx={{ py: 1 }}><strong>Status</strong></TableCell>
                <TableCell align="center" sx={{ py: 1, width: 80 }}><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    {hasActiveFilters ? 'No projects match the selected filters.' : 'No projects found.'}
                  </TableCell>
                </TableRow>
              ) : paginated.map(p => {
                const budget    = parseFloat(String(p.total_budget    ?? 0));
                const spent     = parseFloat(String(p.total_spent     ?? 0));
                const allocated = parseFloat(String(p.total_allocated ?? 0));
                const util      = budget > 0 ? (spent / budget) * 100 : 0;
                const utilColor = util > 90 ? 'error.main' : util > 70 ? 'warning.main' : 'success.main';
                return (
                  <TableRow key={p.id} hover sx={{ '& td': { py: 0.75 } }}>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                        <Chip label={p.project_code} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                        {(p.start_date || p.end_date) && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                            {fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                          </Typography>
                        )}
                      </Box>
                      <Typography variant="body2" fontWeight={500} sx={{ mt: 0.25, lineHeight: 1.3 }}>{p.project_name}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 160 }}>
                      <Typography variant="body2" noWrap>{p.donor_name}</Typography>
                      {p.donor_code && <Typography variant="caption" color="text.secondary">{p.donor_code}</Typography>}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={p.department_name ? 'text.primary' : 'text.disabled'} noWrap>
                        {p.department_name || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>{fmtMoney(budget, p.currency_code)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{fmtMoney(allocated, p.currency_code)}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ minWidth: 110 }}>
                      <Typography variant="body2" fontWeight={500} sx={{ color: utilColor }}>{fmtMoney(spent, p.currency_code)}</Typography>
                      <LinearProgress variant="determinate" value={Math.min(util, 100)}
                        sx={{ height: 3, borderRadius: 2, mt: 0.25, bgcolor: alpha(theme.palette.grey[400], 0.3),
                              '& .MuiLinearProgress-bar': { bgcolor: utilColor } }} />
                      <Typography variant="caption" sx={{ color: utilColor, fontSize: '0.65rem' }}>{util.toFixed(1)}%</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={p.budget_lines_count ?? 0} size="small"
                        color={(p.budget_lines_count ?? 0) > 0 ? 'primary' : 'default'} variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }} />
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={p.is_active ? 'Active' : 'Inactive'} size="small"
                        color={p.is_active ? 'success' : 'default'} sx={{ height: 20, fontSize: '0.7rem' }} />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0} justifyContent="center">
                        <Tooltip title="View Project Details">
                          <IconButton size="small" color="primary" onClick={() => setSelectedProject(p)}>
                            <ViewIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        {canManage && (
                          <Tooltip title="Edit Project">
                            <IconButton size="small" color="info" onClick={() => handleOpenEdit(p)}>
                              <EditIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canManage && (
                          <Tooltip title="Delete Project">
                            <IconButton size="small" color="error" onClick={() => handleOpenDelete(p)}>
                              <DeleteIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination component="div" count={filtered.length} page={page}
            onPageChange={(_, p) => setPage(p)} rowsPerPage={rowsPerPage}
            onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 15, 25, 50]} />
        </TableContainer>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>This action is permanent and cannot be undone.</Alert>
          <Typography>
            Are you sure you want to delete project{' '}
            <strong>{deleteTarget?.project_code} — {deleteTarget?.project_name}</strong>?
          </Typography>
          {(deleteTarget?.budget_lines_count ?? 0) > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              This project has {deleteTarget?.budget_lines_count} budget line(s). Remove all budget lines before deleting.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
          <Button
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleting || (deleteTarget?.budget_lines_count ?? 0) > 0}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            Delete Project
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit project dialog */}
      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Project — {editTarget?.project_code}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Project Code" fullWidth required
                value={editForm.project_code}
                onChange={e => setEditForm(f => ({ ...f, project_code: e.target.value }))}
                disabled={editSaving}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Project Name" fullWidth required
                value={editForm.project_name}
                onChange={e => setEditForm(f => ({ ...f, project_name: e.target.value }))}
                disabled={editSaving}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Start Date" fullWidth type="date" InputLabelProps={{ shrink: true }}
                value={editForm.start_date}
                onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))}
                disabled={editSaving}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="End Date" fullWidth type="date" InputLabelProps={{ shrink: true }}
                value={editForm.end_date}
                onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))}
                disabled={editSaving}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description" fullWidth multiline rows={3}
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                disabled={editSaving}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit}
            disabled={editSaving} startIcon={editSaving ? <CircularProgress size={16} color="inherit" /> : <EditIcon />}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectManagementPage;
