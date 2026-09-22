/**
 * Purchase Request Detail Page
 * Full view with approval timeline, quotations, committee review & actions
 */

import React, { useState } from 'react';
import {
  Box, Paper, Typography, Grid, Chip, Button, Divider, CircularProgress, Alert,
  Table, TableContainer, TableHead, TableRow, TableCell, TableBody, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, IconButton, Tooltip, Stack,
  Stepper, Step, StepLabel, Avatar, List, ListItem, ListItemText,
  ListItemAvatar, alpha, useTheme, MenuItem, Autocomplete, Switch
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
  HourglassEmpty as PendingIcon,
  Visibility as ViewIcon,
  Add as AddIcon,
  CompareArrows as CompareIcon
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDate, formatDateTime } from '../../utils/datetime';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../store/authStore';
import {
  getPurchaseRequestById,
  approveDeptLevel,
  approveFinanceLevel,
  rejectProcurementRequest,
  submitToCommittee,
  resubmitToCommittee,
  committeeDecision,
  finalFinanceApproval,
  uploadQuotation,
  deleteQuotation,
  updateQuotation,
  downloadQuotationFile,
  highValueDecision,
  getProofOfPayments,
  addProofOfPayments,
  deleteProofOfPayment,
  downloadProofOfPayment,
  getRequestAttachments,
  downloadRequestAttachment,
  reverseFinalApproval,
  reverseDeptApproval,
  getCommitteeVotes,
  PROC_STATUS_LABELS,
  PROC_STATUS_COLORS,
  PROC_WORKFLOW_STEPS,
  submitPurchaseRequest,
  getVendors,
  isViewableInBrowser,
  viewRequestAttachment,
  viewQuotationFile,
  viewProofOfPayment
} from '../../services/procurementService';
import { ProcQuotation, ProcQuotationItem, ProcRequestItem, ProcVendor } from '../../types';
import { downloadHTMLAsPDF, buildPurchaseOrderHTML } from '../../utils/pdfUtils';
import { formatRoleLabel } from '../../utils/roleUtils';
import { useGoBack } from '../../utils/navigationState';
import * as XLSX from 'xlsx';

// ─── Quotation line items ─────────────────────────────────────────────────────
//
// A quotation is priced against what was actually requested, line by line, so
// the Committee compares like with like instead of three lump sums. Every
// requested item gets a row; where the supplier cannot fill one, the row stays
// and is marked unavailable, and the team can add rows of their own for the
// substitutes or extras the supplier proposes.

/** One editable row in the quotation dialogs. Strings, because they are inputs. */
interface QuotLine {
  /** Stable key for React — rows have no id until they are saved. */
  key: string;
  request_item_id: number | null;
  description: string;
  quantity: string;
  unit_of_measure: string;
  unit_price: string;
  is_available: boolean;
  notes: string;
}

let quotLineSeq = 0;
const nextLineKey = () => `ql-${++quotLineSeq}`;

/** A blank row for something the supplier proposes that nobody asked for. */
const blankQuotLine = (): QuotLine => ({
  key: nextLineKey(),
  request_item_id: null,
  description: '',
  quantity: '1',
  unit_of_measure: 'unit',
  unit_price: '',
  is_available: true,
  notes: '',
});

/**
 * Build the editor's rows: one per requested item, pre-filled from any prices
 * already recorded on this quotation, followed by the manual rows. Re-opening
 * an amended quotation therefore shows exactly what was entered before, which
 * is the point — after a rejection only the problem lines need retyping.
 */
const buildQuotLines = (
  requestItems: ProcRequestItem[],
  existing: ProcQuotationItem[] = []
): QuotLine[] => {
  const byRequestItem = new Map<number, ProcQuotationItem>();
  for (const it of existing) {
    if (it.request_item_id) byRequestItem.set(Number(it.request_item_id), it);
  }

  const rows: QuotLine[] = requestItems.map((ri) => {
    const prior = ri.id ? byRequestItem.get(Number(ri.id)) : undefined;
    return {
      key: nextLineKey(),
      request_item_id: ri.id ?? null,
      description: prior?.description || ri.item_description,
      quantity: String(prior?.quantity ?? ri.quantity ?? 1),
      unit_of_measure: prior?.unit_of_measure || ri.unit_of_measure || 'unit',
      unit_price: prior?.unit_price == null ? '' : String(prior.unit_price),
      is_available: prior ? Boolean(Number(prior.is_available)) : true,
      notes: prior?.notes || '',
    };
  });

  for (const it of existing) {
    if (it.request_item_id) continue;
    rows.push({
      key: nextLineKey(),
      request_item_id: null,
      description: it.description,
      quantity: String(it.quantity ?? 1),
      unit_of_measure: it.unit_of_measure || 'unit',
      unit_price: it.unit_price == null ? '' : String(it.unit_price),
      is_available: Boolean(Number(it.is_available)),
      notes: it.notes || '',
    });
  }
  return rows;
};

/** The quotation total implied by the rows. Mirrors the server's own sum. */
const quotLinesTotal = (lines: QuotLine[]) =>
  lines.reduce(
    (sum, l) =>
      sum + (l.is_available ? (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0) : 0),
    0
  );

/**
 * The first reason these rows are not ready to save, or null when they are.
 * The server enforces the same rules; this is only so the officer is told
 * before the round trip.
 */
const quotLinesError = (lines: QuotLine[]): string | null => {
  for (let idx = 0; idx < lines.length; idx += 1) {
    const l = lines[idx];
    const label = l.description.trim() || `line ${idx + 1}`;
    if (!l.description.trim()) return `Line ${idx + 1} needs a description`;
    if (!(parseFloat(l.quantity) > 0)) return `${label}: quantity must be greater than zero`;
    if (l.is_available && !(parseFloat(l.unit_price) >= 0)) {
      return `${label}: enter the supplier's unit price, or mark it as not available`;
    }
  }
  return null;
};

/** The rows in the shape the API takes. */
const quotLinesPayload = (lines: QuotLine[]) =>
  lines.map((l) => ({
    request_item_id: l.request_item_id,
    description: l.description.trim(),
    quantity: parseFloat(l.quantity) || 0,
    unit_of_measure: l.unit_of_measure || 'unit',
    unit_price: l.is_available ? parseFloat(l.unit_price) || 0 : null,
    is_available: l.is_available,
    notes: l.notes.trim() || null,
  }));

const QuotationLinesEditor: React.FC<{
  lines: QuotLine[];
  currency: string;
  onChange: (lines: QuotLine[]) => void;
}> = ({ lines, currency, onChange }) => {
  const set = (key: string, patch: Partial<QuotLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const requestedCount = lines.filter((l) => l.request_item_id != null).length;
  const error = quotLinesError(lines);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={1}>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>Supplier Pricing</Typography>
          <Typography variant="caption" color="text.secondary">
            Price every requested item. If the supplier cannot supply one, switch it off and
            say why — you can add your own lines for anything they offer in its place.
          </Typography>
        </Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...lines, blankQuotLine()])}>
          Add item
        </Button>
      </Box>

      <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" sx={{ '& td, & th': { py: 0.75 } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '34%' }}>Item</TableCell>
              <TableCell sx={{ width: 90 }} align="right">Qty</TableCell>
              <TableCell sx={{ width: 90 }}>Unit</TableCell>
              <TableCell sx={{ width: 130 }} align="right">Unit Price</TableCell>
              <TableCell sx={{ width: 120 }} align="right">Line Total</TableCell>
              <TableCell sx={{ width: 110 }} align="center">Available</TableCell>
              <TableCell sx={{ width: 56 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  This request has no items. Use “Add item” to enter the supplier's lines.
                </TableCell>
              </TableRow>
            )}
            {lines.map((l, idx) => {
              const isRequested = l.request_item_id != null;
              const lineTotal = l.is_available
                ? (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0)
                : 0;
              return (
                <TableRow key={l.key} sx={!l.is_available ? { opacity: 0.6 } : undefined}>
                  <TableCell>
                    {isRequested ? (
                      <>
                        <Typography variant="body2" fontWeight={600}>{l.description}</Typography>
                        <Typography variant="caption" color="text.secondary">Requested item</Typography>
                      </>
                    ) : (
                      <TextField
                        fullWidth size="small" placeholder="Item the supplier is offering"
                        value={l.description}
                        onChange={(e) => set(l.key, { description: e.target.value })}
                      />
                    )}
                    <TextField
                      fullWidth size="small" variant="standard" sx={{ mt: 0.5 }}
                      placeholder={l.is_available ? 'Note (optional)' : 'Why is it unavailable?'}
                      value={l.notes}
                      onChange={(e) => set(l.key, { notes: e.target.value })}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small" type="number" value={l.quantity}
                      inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }}
                      onChange={(e) => set(l.key, { quantity: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small" value={l.unit_of_measure}
                      onChange={(e) => set(l.key, { unit_of_measure: e.target.value })}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small" type="number" value={l.unit_price}
                      disabled={!l.is_available}
                      placeholder={l.is_available ? '0.00' : '—'}
                      inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                      onChange={(e) => set(l.key, { unit_price: e.target.value })}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={600}>
                      {l.is_available
                        ? `${currency} ${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small" checked={l.is_available}
                      onChange={(e) => set(l.key, { is_available: e.target.checked })}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {!isRequested && (
                      <Tooltip title="Remove this line">
                        <IconButton size="small" color="error"
                          onClick={() => onChange(lines.filter((x) => x.key !== l.key))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {lines.length > 0 && (
              <TableRow>
                <TableCell colSpan={4} align="right">
                  <Typography fontWeight={700}>Quotation Total</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography fontWeight={700}>
                    {currency} {quotLinesTotal(lines).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Typography>
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box mt={1}>
        {error
          ? <Alert severity="warning" sx={{ py: 0.25 }}>{error}</Alert>
          : <Typography variant="caption" color="text.secondary">
              {requestedCount} requested item{requestedCount === 1 ? '' : 's'} priced
              {lines.length > requestedCount
                ? ` · ${lines.length - requestedCount} added by Procurement`
                : ''}
              . The total above is what is saved against this quotation.
            </Typography>}
      </Box>
    </Box>
  );
};

const PurchaseRequestDetail: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  // Back returns to wherever the request was opened from (the approval queue,
  // a filtered list) rather than always to the purchase request list.
  const goBack = useGoBack('/procurement/requests');
  const { id } = useParams<{ id: string }>();
  const { user, hasPermission, hasRole } = useAuthStore();
  const qc = useQueryClient();

  const [actionDialog, setActionDialog] = useState<null | 'approve_dept' | 'reject' | 'submit_committee' | 'committee' | 'final_finance' | 'high_value'>(null);
  const [highValueDecisionVal, setHighValueDecisionVal] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [comments, setComments] = useState('');
  const [committeeDecisionVal, setCommitteeDecisionVal] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [selectedQuotId, setSelectedQuotId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [quotForm, setQuotForm] = useState({ vendor_name: '', vendor_email: '', vendor_phone: '', quotation_number: '', total_amount: '', currency: 'USD', validity_date: '', delivery_timeline: '', notes: '' });
  const [selectedVendor, setSelectedVendor] = useState<ProcVendor | null>(null);
  /** The supplier's priced breakdown being entered on the upload dialog. */
  const [quotLines, setQuotLines] = useState<QuotLine[]>([]);

  // Quotation edit state
  const [editQuotDialog, setEditQuotDialog] = useState(false);
  const [editingQuot, setEditingQuot] = useState<ProcQuotation | null>(null);
  const [editQuotForm, setEditQuotForm] = useState({ vendor_name: '', vendor_email: '', vendor_phone: '', quotation_number: '', total_amount: '', currency: 'USD', validity_date: '', delivery_timeline: '', notes: '' });
  const [editQuotFile, setEditQuotFile] = useState<File | null>(null);
  const [editQuotLines, setEditQuotLines] = useState<QuotLine[]>([]);

  // Resubmit to committee state
  const [resubmitDialog, setResubmitDialog] = useState(false);
  const [resubmitComments, setResubmitComments] = useState('');
  const [resubmitQuotId, setResubmitQuotId] = useState<number | null>(null);

  // POP upload state (for final finance approval)
  const [popFile, setPopFile] = useState<File[]>([]);
  const [popUploading, setPopUploading] = useState(false);

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

  // Proof of payment documents — several per request, since payments are often
  // made in batches over time.
  const { data: pops = [], refetch: loadPops } = useQuery({
    queryKey: ['proc-pops', id],
    queryFn: () => getProofOfPayments(id!),
    enabled: Boolean(id)
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['proc-request', id] });
    qc.invalidateQueries({ queryKey: ['proc-committee-votes', id] });
    qc.invalidateQueries({ queryKey: ['proc-attachments', id] });
    qc.invalidateQueries({ queryKey: ['proc-pops', id] });
  };

  // A Head of Department's request is approved by the General Secretary at the
  // point where everyone else's gets a departmental approval.
  const isGsTrack = Number(request?.is_gs_track) === 1 || request?.status === 'PENDING_GS_APPROVAL';
  const workflowSteps = PROC_WORKFLOW_STEPS.map(s =>
    isGsTrack && s.status === 'PENDING_DEPT_APPROVAL' ? { ...s, label: 'General Secretary Approval' } : s
  );
  const stepStatus = request?.status === 'PENDING_GS_APPROVAL' ? 'PENDING_DEPT_APPROVAL' : request?.status;
  const currentStepIndex = PROC_WORKFLOW_STEPS.findIndex(s => s.status === stepStatus);

  // Role checks
  const canApproveDept =
    (hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'ADMIN') && request?.status === 'PENDING_DEPT_APPROVAL') ||
    (hasRole('ADMIN') && request?.status === 'PENDING_GS_APPROVAL');
  // HOP/Lead can reverse dept approval within 12 hours (before quotations are added)
  const canReverseDept = (
    (isGsTrack ? hasRole('ADMIN') : hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'ADMIN')) &&
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
    (hasRole('ADMIN') && ['PENDING_DEPT_APPROVAL', 'PENDING_GS_APPROVAL', 'PENDING_PROCUREMENT', 'PENDING_COMMITTEE', 'PENDING_FINAL_FINANCE'].includes(request?.status || ''))
  );
  const canUploadQuotation = hasPermission('manage_quotations') && ['PENDING_PROCUREMENT', 'PENDING_COMMITTEE'].includes(request?.status || '');
  const canSubmitCommittee = hasPermission('manage_quotations') && request?.status === 'PENDING_PROCUREMENT';
  const canResubmitToCommittee = hasPermission('manage_quotations') && request?.status === 'PENDING_COMMITTEE';
  const canCommitteeDecide = hasPermission('committee_review') && request?.status === 'PENDING_COMMITTEE';
  const canFinalApprove = hasPermission('proc_finance_approve') && request?.status === 'PENDING_FINAL_FINANCE';
  // High-value stage: the Super Admin seat (ADMIN) and the Finance seat (the
  // Lead / Head of Department of Finance, whichever department raised the
  // request). The server verifies both and records which seat a decision fills.
  const isFinanceLead = hasRole('PROGRAM_LEAD', 'HEAD_OF_PROGRAMS') &&
    user?.department_code === 'FOS';
  const canHighValueDecide = request?.status === 'PENDING_HIGH_VALUE_APPROVAL' &&
    (hasRole('ADMIN') || isFinanceLead);
  // Finance can keep attaching payment batches after completion — that is the
  // whole point of supporting more than one POP per request.
  const canManagePOP = (hasPermission('proc_finance_approve') || hasRole('ADMIN')) &&
    ['PENDING_FINAL_FINANCE', 'COMPLETED'].includes(request?.status || '');
  const canEdit = ['DRAFT', 'REJECTED', 'PENDING_DEPT_APPROVAL', 'PENDING_GS_APPROVAL', 'PENDING_PROCUREMENT', 'PENDING_COMMITTEE'].includes(request?.status || '') && (Number(request?.requester_id) === Number(user?.id) || hasRole('ADMIN'));
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
          if (!selectedQuotId) {
            toast.error('Choose the quotation you are recommending to the Committee');
            setActionLoading(false);
            return;
          }
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
        case 'high_value': {
          if (highValueDecisionVal === 'REJECTED' && !comments.trim()) {
            toast.error('A reason is required when rejecting');
            setActionLoading(false);
            return;
          }
          const hv = await highValueDecision(id!, highValueDecisionVal, comments);
          toast.success(hv.message);
          break;
        }
        case 'final_finance': {
          if (!popFile.length) { toast.error('At least one Proof of Payment (POP) document is required'); setActionLoading(false); return; }
          const fd = new FormData();
          popFile.forEach(f => fd.append('files', f));
          if (comments) fd.append('comments', comments);
          await finalFinanceApproval(id!, fd);
          toast.success('Final approval granted — Procurement completed!');
          const capturedFileName = popFile.map(f => f.name).join(', ');
          const capturedComments = comments;
          setPopFile([]);
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

  /** Open the upload dialog with a row waiting for every requested item. */
  const openUploadQuot = () => {
    setQuotLines(buildQuotLines(request?.items || []));
    setUploadDialog(true);
  };

  const handleUploadQuotation = async () => {
    if (!quotForm.vendor_name) {
      toast.error('Vendor name is required');
      return;
    }
    const lineError = quotLinesError(quotLines);
    if (lineError) { toast.error(lineError); return; }
    if (!quotLines.length && !quotForm.total_amount) {
      toast.error('Enter the supplier’s prices, or a total amount');
      return;
    }
    setActionLoading(true);
    try {
      const fd = new FormData();
      Object.entries(quotForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
      // The lines are the quotation's substance; the server recomputes the
      // total from them and ignores any header figure sent alongside.
      if (quotLines.length) fd.set('items', JSON.stringify(quotLinesPayload(quotLines)));
      if (uploadFile) fd.append('file', uploadFile);
      await uploadQuotation(id!, fd);
      toast.success('Quotation uploaded');
      setUploadDialog(false);
      setQuotForm({ vendor_name: '', vendor_email: '', vendor_phone: '', quotation_number: '', total_amount: '', currency: 'USD', validity_date: '', delivery_timeline: '', notes: '' });
      setQuotLines([]);
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
    // Seeded from what was saved last time, so after a committee rejection only
    // the queried lines need correcting.
    setEditQuotLines(buildQuotLines(request?.items || [], quot.items || []));
    setEditQuotFile(null);
    setEditQuotDialog(true);
  };

  const handleUpdateQuotation = async () => {
    if (!editingQuot) return;
    if (!editQuotForm.vendor_name) {
      toast.error('Vendor name is required');
      return;
    }
    const lineError = quotLinesError(editQuotLines);
    if (lineError) { toast.error(lineError); return; }
    if (!editQuotLines.length && !editQuotForm.total_amount) {
      toast.error('Enter the supplier’s prices, or a total amount');
      return;
    }
    setActionLoading(true);
    try {
      const fd = new FormData();
      Object.entries(editQuotForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (editQuotLines.length) fd.set('items', JSON.stringify(quotLinesPayload(editQuotLines)));
      if (editQuotFile) fd.append('file', editQuotFile);
      await updateQuotation(id!, editingQuot.id, fd);
      toast.success('Quotation updated');
      setEditQuotDialog(false);
      setEditingQuot(null);
      setEditQuotLines([]);
      setEditQuotFile(null);
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResubmitToCommittee = async () => {
    setActionLoading(true);
    try {
      await resubmitToCommittee(id!, resubmitQuotId, resubmitComments);
      toast.success('Revised quotations resubmitted to the Procurement Committee');
      setResubmitDialog(false);
      setResubmitComments('');
      setResubmitQuotId(null);
      invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Resubmission failed');
    } finally {
      setActionLoading(false);
    }
  };

  const viewDocument = async (open: () => Promise<void>) => {
    try {
      await open();
    } catch (e: any) {
      toast.error(e?.message || 'Could not open the document. Try downloading it instead.');
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
      const itemHeaders = ['#', 'Description', 'Specifications', 'Qty', 'UOM',
        'Est. Unit Price (USD)', 'Est. Total (USD)',
        'Actual Unit Price (USD)', 'Actual Total (USD)', 'Supplied', 'Budget Line'];
      const itemRows = request.items.map((item, i) => [
        i + 1,
        item.item_description,
        item.specifications || '',
        item.quantity,
        item.unit_of_measure,
        Number(item.estimated_unit_price || 0).toFixed(2),
        Number((item.quantity || 1) * (item.estimated_unit_price || 0)).toFixed(2),
        item.actual_unit_price == null ? '' : Number(item.actual_unit_price).toFixed(2),
        item.actual_total == null ? '' : Number(item.actual_total).toFixed(2),
        item.actual_quotation_id == null ? '' : (Number(item.is_available) ? 'YES' : 'NO'),
        (item as any).budget_code || ''
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]), 'Items');
    }

    // Sheet: Bid Comparison — one row per requested item, one column per
    // supplier. This is the sheet Finance and the Committee actually work from.
    if (request.quotations?.some(q => (q.items || []).length > 0)) {
      const quotes = request.quotations;
      const header = ['Requested Item', 'Qty', 'UOM', 'Estimated Unit Price',
        ...quotes.map(q => `${q.vendor_name}${q.is_selected ? ' (SELECTED)' : ''}`)];
      const rows = (request.items || []).map(item => [
        item.item_description,
        item.quantity,
        item.unit_of_measure,
        Number(item.estimated_unit_price || 0).toFixed(2),
        ...quotes.map(q => {
          const line = (q.items || []).find(l => Number(l.request_item_id) === Number(item.id));
          if (!line) return 'Not priced';
          if (!Number(line.is_available)) return 'Unavailable';
          return Number(line.unit_price || 0).toFixed(2);
        })
      ]);
      const extrasRow = ['Added by Procurement', '', '', '',
        ...quotes.map(q => (q.items || [])
          .filter(l => !l.request_item_id)
          .map(l => `${l.description} — ${Number(l.is_available) ? Number(l.unit_price || 0).toFixed(2) : 'Unavailable'}`)
          .join('; '))];
      const totalRow = ['QUOTATION TOTAL', '', '', Number(request.total_estimated_amount || 0).toFixed(2),
        ...quotes.map(q => Number(q.total_amount || 0).toFixed(2))];
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([header, ...rows, extrasRow, totalRow]),
        'Bid Comparison'
      );
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
        formatRoleLabel(log.actor_role, log.actor_job_title),
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
  .action-RESUBMITTED_TO_COMMITTEE { color: #1565c0; font-weight: bold; }
  .committee-declaration { margin-top: 24px; padding: 14px 16px; background: #e8f5e9; border-left: 4px solid #2e7d32; border-radius: 0 4px 4px 0; font-size: 11px; color: #1b5e20; font-style: italic; }
  .committee-declaration strong { font-style: normal; }
  .page-footer { margin-top: 28px; padding-top: 10px; border-top: 2px solid #e0e0e0; }
  .footer-left { font-size: 10px; color: #999; }
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
    <div class="date">Created: ${formatDate(request.created_at)}</div>
    ${request.submitted_at ? `<div class="date">Submitted: ${formatDate(request.submitted_at)}</div>` : ''}
  </div>
</div>

<h3>Requisition Details</h3>
<div class="meta-grid">
  <div class="meta-item"><span class="meta-label">Reference Number</span><span class="meta-value">${request.request_code}</span></div>
  <div class="meta-item"><span class="meta-label">Date Created</span><span class="meta-value">${formatDate(request.created_at)}</span></div>
  <div class="meta-item"><span class="meta-label">Department</span><span class="meta-value">${request.department_name}${request.department_code ? ` (${request.department_code})` : ''}</span></div>
  <div class="meta-item"><span class="meta-label">Partner</span><span class="meta-value">${(request as any).donor_name || '—'}</span></div>
  <div class="meta-item"><span class="meta-label">Project</span><span class="meta-value">${(request as any).project_name || '—'}</span></div>
  <div class="meta-item"><span class="meta-label">Priority Level</span><span class="meta-value ${`pri-${request.priority}`}">${request.priority}</span></div>
  <div class="meta-item"><span class="meta-label">Expected Delivery</span><span class="meta-value">${formatDate(request.expected_delivery_date)}</span></div>
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
    ${quotations.map(q => `<tr><td>${q.vendor_name}${q.is_selected ? '<span class="selected-badge">✓ SELECTED</span>' : ''}</td><td>${q.quotation_number || '—'}</td><td align="right">${Number(q.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td>${q.currency}</td><td>${formatDate(q.validity_date)}</td><td>${q.delivery_timeline || '—'}</td><td>${q.notes || '—'}</td></tr>`).join('')}
  </tbody>
</table>` : ''}

${trail.length > 0 ? `
<h3>Approval Trail (Bid Analysis) (${trail.length} actions)</h3>
<table>
  <thead><tr><th>Date &amp; Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Comments</th></tr></thead>
  <tbody>
    ${trail.map(log => `<tr><td>${formatDateTime(log.created_at)}</td><td>${log.actor_first_name} ${log.actor_last_name}</td><td>${formatRoleLabel(log.actor_role, log.actor_job_title)}</td><td class="action-${log.action}">${log.action.replace(/_/g, ' ')}</td><td>${log.comments || '—'}</td></tr>`).join('')}
  </tbody>
</table>` : ''}

${allCommitteeApproved ? `
<div class="committee-declaration">
  <strong>Procurement Committee Declaration:</strong><br/>
  "The Committee hereby declares that it has no actual, potential, or perceived conflict of interest in relation to this procurement process or any of the bidders being evaluated."
</div>` : ''}

<div class="page-footer">
  <div class="footer-left">
    <div>Generated: ${formatDateTime(new Date())}</div>
    <div>ERP Connect - Zimbabwe Council of Churches &nbsp;|&nbsp; CONFIDENTIAL</div>
  </div>
</div>
</body></html>`;
    downloadHTMLAsPDF(html, `${request.request_code}-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const downloadPurchaseOrder = () => {
    if (!request) return;
    const html = buildPurchaseOrderHTML(request);
    downloadHTMLAsPDF(html, `PO-${request.request_code}-${format(new Date(), 'yyyy-MM-dd')}`);
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
      toast.success(isGsTrack
        ? 'Approval reversed. Request returned to Pending General Secretary Approval.'
        : 'Department approval reversed. Request returned to Pending Department Approval.');
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

  const money = (n: number | string | null | undefined, currency = '$') =>
    `${currency}${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── What the selected supplier will actually charge ──────────────────────
  // Filled in when the request went to the Committee, so before that stage the
  // page shows estimates only and these columns stay out of the way.
  const selectedQuotation = (request.quotations || []).find(q => q.is_selected) || null;
  const hasActuals = (request.items || []).some(i => i.actual_quotation_id != null);
  const totalActual = (request.items || []).reduce(
    (sum, i) => sum + Number(i.actual_total || 0), 0
  );

  const infoFields: { label: string; value: React.ReactNode }[] = [
    { label: 'Request Number', value: request.request_code },
    { label: 'Department', value: `${request.department_name} (${request.department_code})` },
    { label: 'Requested By', value: `${request.first_name} ${request.last_name}` },
    { label: 'Priority', value: request.priority },
    { label: 'Partner / Donor', value: request.donor_name ? `${request.donor_name}${(request as any).donor_code ? ` (${(request as any).donor_code})` : ''}` : '—' },
    { label: 'Project', value: (request as any).project_name ? `${(request as any).project_name}${(request as any).project_code ? ` (${(request as any).project_code})` : ''}` : '—' },
    { label: 'Expected Delivery', value: request.expected_delivery_date ? format(new Date(request.expected_delivery_date), 'dd MMM yyyy') : '—' },
    { label: 'Created', value: format(new Date(request.created_at), 'dd MMM yyyy HH:mm') },
    { label: 'Submitted', value: request.submitted_at ? format(new Date(request.submitted_at), 'dd MMM yyyy HH:mm') : '—' },
    { label: 'Total Estimated Amount', value: money(request.total_estimated_amount) },
  ];

  const hasAnyAction = canEdit || canSubmit || canApproveDept || canReverseDept || canReject ||
    canSubmitCommittee || canResubmitToCommittee || canCommitteeDecide || canHighValueDecide || canFinalApprove ||
    (['PENDING_FINAL_FINANCE', 'COMPLETED'] as string[]).includes(request.status);

  const showCommittee = ['PENDING_COMMITTEE', 'PENDING_FINAL_FINANCE', 'COMPLETED'].includes(request.status);

  return (
    <Box>
      {/* Header — same shape as the Float Requisition page */}
      <Box display="flex" alignItems="center" gap={2} mb={3} flexWrap="wrap">
        <IconButton onClick={goBack}>
          <BackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5">Purchase Request — {request.request_code}</Typography>
          {request.title && (
            <Typography variant="body2" color="text.secondary" noWrap>{request.title}</Typography>
          )}
        </Box>
        <Chip
          label={PROC_STATUS_LABELS[request.status] || request.status}
          color={PROC_STATUS_COLORS[request.status] as any || 'default'}
          size="medium"
        />
        <Tooltip title="Download PDF">
          <IconButton color="primary" onClick={downloadAsPDF}><PdfIcon /></IconButton>
        </Tooltip>
        <Tooltip title="Export to Excel">
          <IconButton color="success" onClick={exportToExcel}><ExportIcon /></IconButton>
        </Tooltip>
      </Box>

      {request.status === 'REJECTED' && request.rejection_reason && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={700}>Rejection Reason</Typography>
          <Typography variant="body2">{request.rejection_reason}</Typography>
        </Alert>
      )}

      {request.status === 'PENDING_GS_APPROVAL' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          This request was raised by a Head of Department, so it is approved by the General Secretary
          in place of a departmental approval. It then continues to Procurement as normal.
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ── Main column ─────────────────────────────────────────────── */}
        <Grid item xs={12} md={8}>
          {/* Request Information */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Request Information</Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              {infoFields.map(f => (
                <Grid item xs={12} sm={6} key={f.label}>
                  <Typography variant="body2" color="text.secondary">{f.label}</Typography>
                  <Typography variant="body1" fontWeight="medium">{f.value}</Typography>
                </Grid>
              ))}
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">Justification</Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{request.justification || '—'}</Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Items */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Request Items</Typography>
            <Divider sx={{ mb: 2 }} />
            {hasActuals && (
              <Alert severity="success" icon={<CompareIcon />} sx={{ mb: 2 }}>
                The <strong>Actual</strong> columns are the prices from the selected quotation
                {selectedQuotation ? <> — <strong>{selectedQuotation.vendor_name}</strong></> : null}.
                They replace the estimates the requester entered.
              </Alert>
            )}
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Budget Line</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell align="right">Est. Unit Price</TableCell>
                    <TableCell align="right">Est. Subtotal</TableCell>
                    {hasActuals && <TableCell align="right">Actual Unit Price</TableCell>}
                    {hasActuals && <TableCell align="right">Actual Subtotal</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(request.items || []).map((item, idx) => {
                    const unavailable = hasActuals && Number(item.is_available) === 0;
                    return (
                    <TableRow key={item.id} sx={unavailable ? { opacity: 0.65 } : undefined}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>
                        {item.budget_code
                          ? <Tooltip title={(item as any).budget_name || ''}><span>{item.budget_code}</span></Tooltip>
                          : <Typography variant="caption" color="text.disabled">Not assigned</Typography>}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.item_description}</Typography>
                        {item.specifications && (
                          <Typography variant="caption" color="text.secondary" display="block">{item.specifications}</Typography>
                        )}
                        {unavailable && (
                          <Chip label="Not available from supplier" size="small" color="warning" variant="outlined" sx={{ mt: 0.5, height: 20, fontSize: '0.65rem' }} />
                        )}
                      </TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell>{item.unit_of_measure}</TableCell>
                      <TableCell align="right">{money(item.estimated_unit_price)}</TableCell>
                      <TableCell align="right">{money(item.estimated_total || (item.quantity * item.estimated_unit_price))}</TableCell>
                      {hasActuals && (
                        <TableCell align="right">
                          {item.actual_unit_price == null
                            ? <Typography variant="caption" color="text.disabled">—</Typography>
                            : <Typography variant="body2" fontWeight={600}>{money(item.actual_unit_price)}</Typography>}
                        </TableCell>
                      )}
                      {hasActuals && (
                        <TableCell align="right">
                          {item.actual_total == null
                            ? <Typography variant="caption" color="text.disabled">—</Typography>
                            : <Typography variant="body2" fontWeight={600}>{money(item.actual_total)}</Typography>}
                        </TableCell>
                      )}
                    </TableRow>
                    );
                  })}
                  {hasActuals && (
                    <TableRow>
                      <TableCell colSpan={7} align="right"><Typography fontWeight="bold">Total Actual:</Typography></TableCell>
                      <TableCell />
                      <TableCell align="right"><Typography fontWeight="bold">{money(totalActual)}</Typography></TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={6} align="right"><Typography fontWeight="bold">Total Estimated:</Typography></TableCell>
                    <TableCell align="right"><Typography fontWeight="bold">{money(request.total_estimated_amount)}</Typography></TableCell>
                    {hasActuals && <TableCell colSpan={2} />}
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Bid Analysis */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" gap={1}>
              <Typography variant="h6">Bid Analysis {request.quotations?.length ? `(${request.quotations.length})` : ''}</Typography>
              {canUploadQuotation && (
                <Button startIcon={<UploadIcon />} variant="contained" size="small" onClick={openUploadQuot}>
                  Upload Quotation
                </Button>
              )}
            </Box>
            <Divider sx={{ my: 2 }} />
            {(!request.quotations || request.quotations.length === 0) ? (
              <Typography color="text.secondary" textAlign="center" py={2}>No quotations uploaded yet</Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Vendor</TableCell>
                      <TableCell>Ref</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell>Valid Until</TableCell>
                      <TableCell>Delivery</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {request.quotations.map(quot => (
                      <TableRow
                        key={quot.id}
                        sx={quot.is_selected ? { bgcolor: alpha(theme.palette.success.main, 0.06) } : undefined}
                      >
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap">
                            <VendorIcon fontSize="small" color="action" />
                            <Typography variant="body2" fontWeight={600}>{quot.vendor_name}</Typography>
                            {quot.is_selected && <Chip label="Selected" color="success" size="small" />}
                            {quot.is_prequalified && <Chip label="Prequalified" color="info" size="small" variant="outlined" />}
                          </Box>
                          {quot.notes && (
                            <Typography variant="caption" color="text.secondary" display="block">Note: {quot.notes}</Typography>
                          )}
                        </TableCell>
                        <TableCell>{quot.quotation_number || '—'}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600}>
                            {quot.currency} {Number(quot.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </Typography>
                        </TableCell>
                        <TableCell>{quot.validity_date ? format(new Date(quot.validity_date), 'dd MMM yyyy') : '—'}</TableCell>
                        <TableCell>{quot.delivery_timeline || '—'}</TableCell>
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          {quot.file_name && (
                            <>
                              <Tooltip title={isViewableInBrowser(quot.file_name) ? 'View in browser' : 'This file type cannot be previewed — use Download'}>
                                <span>
                                  <IconButton size="small" color="primary" disabled={!isViewableInBrowser(quot.file_name)}
                                    onClick={() => viewDocument(() => viewQuotationFile(id!, quot.id, quot.file_name ?? undefined))}>
                                    <ViewIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Download">
                                <IconButton size="small" color="primary" onClick={() => handleDownloadQuotation(quot.id, quot.file_name ?? undefined)}>
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                          {canUploadQuotation && (
                            <>
                              <Tooltip title="Edit quotation">
                                <IconButton size="small" onClick={() => openEditQuot(quot)}><EditIcon fontSize="small" /></IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton size="small" color="error" onClick={() => handleDeleteQuotation(quot.id)}><DeleteIcon fontSize="small" /></IconButton>
                              </Tooltip>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>

          {/* Attachments */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Attachments & Documents</Typography>
            <Divider sx={{ mb: 2 }} />
            {(attachments as any[]).length === 0 ? (
              <Typography color="text.secondary" textAlign="center" py={2}>No attachments uploaded for this request</Typography>
            ) : (
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '40%' }}>File</TableCell>
                    <TableCell sx={{ width: '16%' }}>Type</TableCell>
                    <TableCell sx={{ width: '18%' }}>Uploaded By</TableCell>
                    <TableCell sx={{ width: '14%' }}>Date</TableCell>
                    <TableCell align="center" sx={{ width: '12%' }}>View / Download</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(attachments as any[]).map((att: any) => (
                    <TableRow key={att.id}>
                      <TableCell sx={{ maxWidth: 0 }}>
                        <Box display="flex" alignItems="center" gap={0.75} sx={{ overflow: 'hidden' }}>
                          <FileIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
                          <Tooltip title={att.original_name} placement="top-start">
                            <Typography variant="body2" noWrap>{att.original_name}</Typography>
                          </Tooltip>
                        </Box>
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {att.file_size ? `${(att.file_size / 1024).toFixed(1)} KB` : ''}
                          {att.description ? ` · ${att.description}` : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={String(att.attachment_type || 'OTHER').replace(/_/g, ' ')} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell><Typography variant="body2" noWrap>{att.first_name} {att.last_name}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{att.created_at ? formatDate(att.created_at) : '—'}</Typography></TableCell>
                      <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title={isViewableInBrowser(att.file_type || att.original_name) ? 'View in browser' : 'This file type cannot be previewed — use Download'}>
                          <span>
                            <IconButton size="small" color="primary" disabled={!isViewableInBrowser(att.file_type || att.original_name)}
                              onClick={() => viewDocument(() => viewRequestAttachment(att.id, att.original_name))}>
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Download">
                          <IconButton size="small" color="primary" onClick={() => handleDownloadAttachment(att.id, att.original_name)}>
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

          {/* Proof of Payment — a request may carry several, because payments
              are often settled in batches rather than at once. */}
          {(pops.length > 0 || canManagePOP) && (
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="h6">Proof of Payment {pops.length > 0 ? `(${pops.length})` : ''}</Typography>
                {canManagePOP && (
                  <Button
                    component="label" size="small" variant="outlined"
                    startIcon={popUploading ? <CircularProgress size={14} /> : <UploadIcon />}
                    disabled={popUploading}
                  >
                    Attach payment batch
                    <input
                      type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={async e => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = '';
                        if (!files.length) return;
                        setPopUploading(true);
                        try {
                          await addProofOfPayments(id!, files);
                          toast.success(`${files.length} document(s) attached`);
                          await loadPops();
                        } catch (err: any) {
                          toast.error(err?.response?.data?.error || 'Failed to attach proof of payment');
                        } finally {
                          setPopUploading(false);
                        }
                      }}
                    />
                  </Button>
                )}
              </Box>
              <Divider sx={{ my: 2 }} />
              {pops.length === 0 ? (
                <Typography color="text.secondary" textAlign="center" py={2}>No proof of payment attached yet</Typography>
              ) : (
                <Table size="small" sx={{ tableLayout: 'fixed' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '46%' }}>File</TableCell>
                      <TableCell sx={{ width: '22%' }}>Uploaded By</TableCell>
                      <TableCell sx={{ width: '16%' }}>Date</TableCell>
                      <TableCell align="center" sx={{ width: '16%' }}>View / Download</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pops.map(pop => (
                      <TableRow key={pop.id}>
                        <TableCell sx={{ maxWidth: 0 }}>
                          <Tooltip title={pop.file_name} placement="top-start">
                            <Typography variant="body2" noWrap>{pop.file_name}</Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell><Typography variant="body2" noWrap>{pop.first_name ? `${pop.first_name} ${pop.last_name || ''}` : '—'}</Typography></TableCell>
                        <TableCell><Typography variant="body2">{formatDate(pop.created_at)}</Typography></TableCell>
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          <Tooltip title={isViewableInBrowser(pop.file_name) ? 'View in browser' : 'This file type cannot be previewed — use Download'}>
                            <span>
                              <IconButton size="small" color="primary" disabled={!isViewableInBrowser(pop.file_name)}
                                onClick={() => viewDocument(() => viewProofOfPayment(id!, pop.id, pop.file_name))}>
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Download">
                            <IconButton
                              size="small" color="primary"
                              onClick={async () => {
                                try {
                                  await downloadProofOfPayment(id!, pop.id, pop.file_name);
                                } catch (err: any) {
                                  toast.error(err?.message || 'Failed to download proof of payment');
                                }
                              }}
                            >
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {canManagePOP && (
                            <Tooltip title="Remove">
                              <IconButton
                                size="small" color="error"
                                onClick={async () => {
                                  try {
                                    await deleteProofOfPayment(id!, pop.id);
                                    toast.success('Proof of payment removed');
                                    await loadPops();
                                  } catch (err: any) {
                                    toast.error(err?.response?.data?.error || 'Failed to remove proof of payment');
                                  }
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Paper>
          )}
        </Grid>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <Grid item xs={12} md={4}>
          {/* Actions */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Actions</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box display="flex" flexDirection="column" gap={1.5}>
              {canEdit && (
                <Button fullWidth variant="outlined" startIcon={<EditIcon />} onClick={() => navigate(`/procurement/requests/${id}/edit`)}>
                  {request.status === 'REJECTED' ? 'Edit & Resubmit' : 'Edit Request'}
                </Button>
              )}
              {canSubmit && (
                <Button fullWidth variant="contained" startIcon={<SendIcon />} onClick={handleSubmitRequest} disabled={actionLoading}>
                  {request.status === 'REJECTED' ? 'Resubmit for Approval' : 'Submit for Approval'}
                </Button>
              )}
              {canApproveDept && (
                <Button fullWidth variant="contained" color="success" startIcon={<ApproveIcon />} onClick={() => setActionDialog('approve_dept')}>
                  {request.status === 'PENDING_GS_APPROVAL' ? 'Approve (General Secretary)' : 'Approve (Dept Level)'}
                </Button>
              )}
              {canReverseDept && (
                <Button fullWidth variant="outlined" color="warning" startIcon={<UndoIcon />} onClick={handleReverseDept} disabled={reversingDept}>
                  Reverse / Undo Approval
                </Button>
              )}
              {canSubmitCommittee && (
                <Button fullWidth variant="contained" startIcon={<CommitteeIcon />}
                  onClick={() => { setSelectedQuotId(lowestQuotation?.id || null); setActionDialog('submit_committee'); }}>
                  Submit to Committee
                </Button>
              )}
              {canResubmitToCommittee && (
                <Button fullWidth variant="outlined" color="warning" startIcon={<SendIcon />}
                  onClick={() => { setResubmitQuotId(request.quotations?.find(q => q.is_selected)?.id || lowestQuotation?.id || null); setResubmitDialog(true); }}>
                  Resubmit Amended Quotations
                </Button>
              )}
              {canCommitteeDecide && (
                <Button fullWidth variant="contained" startIcon={<CommitteeIcon />}
                  onClick={() => { setSelectedQuotId(request.quotations?.find(q => q.is_selected)?.id || lowestQuotation?.id || null); setActionDialog('committee'); }}>
                  Record Committee Decision
                </Button>
              )}
              {canHighValueDecide && (
                <>
                  <Button fullWidth variant="contained" color="success" startIcon={<ApproveIcon />}
                    onClick={() => { setHighValueDecisionVal('APPROVED'); setActionDialog('high_value'); }}>
                    Approve (High-Value)
                  </Button>
                  <Button fullWidth variant="outlined" color="error" startIcon={<RejectIcon />}
                    onClick={() => { setHighValueDecisionVal('REJECTED'); setActionDialog('high_value'); }}>
                    Reject (High-Value)
                  </Button>
                </>
              )}
              {canFinalApprove && (
                <Button fullWidth variant="contained" color="success" startIcon={<ApproveIcon />} onClick={() => setActionDialog('final_finance')}>
                  Final Finance Approval
                </Button>
              )}
              {canReject && (
                <Button fullWidth variant="outlined" color="error" startIcon={<RejectIcon />} onClick={() => setActionDialog('reject')}>
                  Reject
                </Button>
              )}
              {(['PENDING_FINAL_FINANCE', 'COMPLETED'] as string[]).includes(request.status) && (
                <Button fullWidth variant="outlined" color="success" startIcon={<DownloadIcon />} onClick={downloadPurchaseOrder}>
                  Download Purchase Order
                </Button>
              )}
              {!hasAnyAction && (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  No actions available for you at this stage
                </Typography>
              )}
            </Box>
          </Paper>

          {/* Approval Progress */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Approval Progress</Typography>
            <Divider sx={{ mb: 2 }} />
            {request.status === 'REJECTED' && (
              <Alert severity="error" sx={{ mb: 2 }}>Rejected — the requester can amend and resubmit.</Alert>
            )}
            <Stepper activeStep={currentStepIndex} orientation="vertical">
              {workflowSteps.map((step, idx) => (
                <Step key={step.status} completed={currentStepIndex > idx || request.status === 'COMPLETED'}>
                  <StepLabel>
                    <Typography variant="body2" fontWeight={idx === currentStepIndex ? 700 : 400}>{step.label}</Typography>
                    {idx === currentStepIndex && request.status !== 'COMPLETED' && (
                      <Typography variant="caption" color="text.secondary">Current stage</Typography>
                    )}
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
          </Paper>

          {/* High-value approval — the committee recommends, then the Super
              Admin and Finance's Lead/HOD must both approve. */}
          {Number((request as any).is_high_value) === 1 && (
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>High-Value Approval</Typography>
              <Typography variant="caption" color="text.secondary">
                Selected quotation {money((request as any).selected_quotation_amount)} — threshold {money((request as any).high_value_threshold || 5000)}
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Stack spacing={1}>
                {(['SUPER_ADMIN', 'FINANCE'] as const).map(seat => {
                  const rec = ((request as any).high_value_approvals || []).find((a: any) => a.seat === seat);
                  const seatName = seat === 'SUPER_ADMIN' ? 'Super Admin' : 'Finance Lead / Head of Department';
                  return (
                    <Box key={seat} display="flex" alignItems="center" gap={1}>
                      <Chip
                        size="small"
                        label={rec ? (rec.decision === 'APPROVED' ? 'Approved' : 'Rejected') : 'Awaiting'}
                        color={rec ? (rec.decision === 'APPROVED' ? 'success' : 'error') : 'default'}
                        sx={{ minWidth: 88 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2">{seatName}</Typography>
                        {rec && (
                          <Typography variant="caption" color="text.secondary">
                            {rec.first_name} {rec.last_name} · {formatDate(rec.created_at)}
                            {rec.comments ? ` · ${rec.comments}` : ''}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Paper>
          )}

          {/* Committee Review */}
          {showCommittee && (
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
              <Box display="flex" alignItems="center" gap={1}>
                <VoteIcon fontSize="small" color="secondary" />
                <Typography variant="h6" sx={{ flex: 1 }}>Committee Review</Typography>
                <Chip
                  size="small"
                  label={request.status === 'PENDING_COMMITTEE' ? 'Under Review' : 'Decision Recorded'}
                  color={request.status === 'PENDING_COMMITTEE' ? 'secondary' : 'success'}
                />
              </Box>
              <Divider sx={{ my: 2 }} />
              {(() => {
                const votes = committeeVotes as any[];
                const remainingCount = 3 - votes.length;
                return (
                  <Stack spacing={1}>
                    {votes.map((v: any) => (
                      <Box key={v.id ?? v.committee_seat} display="flex" alignItems="center" gap={1}>
                        {v.vote === 'APPROVED'
                          ? <ApproveIcon fontSize="small" color="success" />
                          : <RejectIcon fontSize="small" color="warning" />}
                        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{v.first_name} {v.last_name}</Typography>
                        <Chip
                          label={v.vote === 'APPROVED' ? 'Approved' : 'Not Approved'}
                          color={v.vote === 'APPROVED' ? 'success' : 'warning'}
                          size="small" sx={{ height: 18, fontSize: '0.65rem' }}
                        />
                      </Box>
                    ))}
                    {remainingCount > 0 && request.status === 'PENDING_COMMITTEE' && (
                      <Box display="flex" alignItems="center" gap={1}>
                        <PendingIcon fontSize="small" color="disabled" />
                        <Typography variant="body2" color="text.secondary" fontStyle="italic">
                          {remainingCount} vote{remainingCount > 1 ? 's' : ''} remaining
                        </Typography>
                      </Box>
                    )}
                    {votes.length >= 3 && votes.every((v: any) => v.vote === 'APPROVED') && (
                      <Box sx={{ mt: 1, p: 1.5, bgcolor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 1 }}>
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

        </Grid>

        {/* ── Bid Comparison ───────────────────────────────────────────────
            One row per requested item, one column per supplier. This is what
            the Committee, Finance and the Super Admin decide on: without it
            each approver had only three lump sums to choose between. Full
            width because it grows a column per quotation. */}
        {(request.quotations || []).some(q => (q.items || []).length > 0) && (
          <Grid item xs={12}>
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <CompareIcon color="primary" />
                <Typography variant="h6">Bid Comparison</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" mb={2}>
                What each supplier quoted, line by line, against what was requested.
                A greyed line is one that supplier cannot supply.
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Requested Item</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Qty</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Estimated</TableCell>
                      {(request.quotations || []).map(q => (
                        <TableCell key={q.id} align="right" sx={{ fontWeight: 700, minWidth: 140 }}>
                          {q.vendor_name}
                          {q.is_selected && (
                            <Chip label="Selected" color="success" size="small" sx={{ ml: 0.5, height: 18, fontSize: '0.6rem' }} />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(request.items || []).map(item => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{item.item_description}</Typography>
                          {item.specifications && (
                            <Typography variant="caption" color="text.secondary" display="block">{item.specifications}</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{item.quantity} {item.unit_of_measure}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">{money(item.estimated_unit_price)}</Typography>
                        </TableCell>
                        {(request.quotations || []).map(q => {
                          const line = (q.items || []).find(i => Number(i.request_item_id) === Number(item.id));
                          if (!line) {
                            return (
                              <TableCell key={q.id} align="right">
                                <Typography variant="caption" color="text.disabled">Not priced</Typography>
                              </TableCell>
                            );
                          }
                          if (!Number(line.is_available)) {
                            return (
                              <TableCell key={q.id} align="right" sx={{ opacity: 0.6 }}>
                                <Tooltip title={line.notes || 'The supplier cannot supply this item'}>
                                  <Chip label="Unavailable" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                                </Tooltip>
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell key={q.id} align="right">
                              <Typography variant="body2" fontWeight={600}>{money(line.unit_price)}</Typography>
                              <Typography variant="caption" color="text.secondary" display="block">
                                {money(line.total_price ?? Number(line.quantity) * Number(line.unit_price || 0))}
                              </Typography>
                              {line.notes && (
                                <Tooltip title={line.notes}>
                                  <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ maxWidth: 140 }}>
                                    {line.notes}
                                  </Typography>
                                </Tooltip>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}

                    {/* Lines the Procurement team added themselves — substitutes
                        and extras that answer to no requested item. */}
                    {(request.quotations || []).some(q => (q.items || []).some(i => !i.request_item_id)) && (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ verticalAlign: 'top' }}>
                          <Typography variant="body2" fontWeight={600}>Added by Procurement</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Substitutes and extras offered by the supplier
                          </Typography>
                        </TableCell>
                        {(request.quotations || []).map(q => {
                          const extras = (q.items || []).filter(i => !i.request_item_id);
                          return (
                            <TableCell key={q.id} align="right" sx={{ verticalAlign: 'top' }}>
                              {extras.length === 0
                                ? <Typography variant="caption" color="text.disabled">—</Typography>
                                : extras.map((e, i) => (
                                    <Box key={e.id ?? i} mb={0.5}>
                                      <Typography variant="caption" display="block">{e.description}</Typography>
                                      <Typography variant="body2" fontWeight={600}>
                                        {Number(e.is_available)
                                          ? `${e.quantity} × ${money(e.unit_price)}`
                                          : 'Unavailable'}
                                      </Typography>
                                    </Box>
                                  ))}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    )}

                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell colSpan={2}><Typography fontWeight={700}>Quotation Total</Typography></TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={700} color="text.secondary">{money(request.total_estimated_amount)}</Typography>
                      </TableCell>
                      {(request.quotations || []).map(q => (
                        <TableCell key={q.id} align="right">
                          <Typography fontWeight={700} color={q.is_selected ? 'success.dark' : undefined}>
                            {q.currency} {Number(q.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </Typography>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        )}

        {/* ── Approval Trail ───────────────────────────────────────────────
            Full width, below both columns. Procurement comments are often
            several sentences long; in the narrow main column each one turned
            into a tall block and the trail became a scroll. Across the page it
            reads as a two-column timeline instead. */}
        <Grid item xs={12}>
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>Approval Trail</Typography>
              <Divider sx={{ mb: 1 }} />
              {(!request.approvalTrail || request.approvalTrail.length === 0) ? (
                <Box textAlign="center" py={3}>
                  <TimelineIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">No activity recorded yet</Typography>
                </Box>
              ) : (
                <List
                  disablePadding
                  sx={{
                    // Two columns from md up, so a long comment fills the width
                    // it is given instead of stacking the whole trail downward.
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    columnGap: 3,
                  }}
                >
                  {request.approvalTrail.map((log, idx) => {
                    const tone = log.action.includes('APPROVED')
                      ? theme.palette.success.main
                      : log.action.includes('REJECT') ? theme.palette.error.main : theme.palette.primary.main;
                    return (
                      <React.Fragment key={log.id}>
                        <ListItem
                          alignItems="flex-start"
                          disableGutters
                          sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 1.25 }}
                        >
                          <ListItemAvatar sx={{ minWidth: 44 }}>
                            <Avatar sx={{ bgcolor: alpha(tone, 0.15), color: tone, width: 32, height: 32, fontSize: '0.7rem' }}>
                              {(log.actor_first_name?.[0] || '') + (log.actor_last_name?.[0] || '')}
                            </Avatar>
                          </ListItemAvatar>
                          <ListItemText
                            primary={
                              <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                                <Typography variant="body2" fontWeight={600}>{log.actor_first_name} {log.actor_last_name}</Typography>
                                <Chip
                                  label={log.action.replace(/_/g, ' ')} size="small"
                                  color={log.action.includes('APPROVED') ? 'success' : log.action.includes('REJECT') ? 'error' : 'info'}
                                  sx={{ height: 20, fontSize: '0.65rem' }}
                                />
                              </Box>
                            }
                            secondary={
                              <Box component="span" display="block">
                                <Typography component="span" variant="caption" color="text.secondary" display="block">
                                  {log.actor_role === 'PROCUREMENT_COMMITTEE' ? 'Committee Member' : formatRoleLabel(log.actor_role, log.actor_job_title)}
                                </Typography>
                                {log.comments && (
                                  <Typography component="span" variant="body2" color="text.secondary" display="block" sx={{ fontStyle: 'italic' }}>
                                    "{log.comments}"
                                  </Typography>
                                )}
                                <Typography component="span" variant="caption" color="text.disabled" display="block">
                                  {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                                </Typography>
                              </Box>
                            }
                          />
                        </ListItem>
                      </React.Fragment>
                    );
                  })}
                </List>
              )}
            </Paper>
        </Grid>
      </Grid>

      {/* Action Dialog */}
      <Dialog open={Boolean(actionDialog)} onClose={() => !actionLoading && setActionDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionDialog === 'approve_dept' && (request.status === 'PENDING_GS_APPROVAL' ? 'Approve (General Secretary)' : 'Approve (Department Level)')}
          {actionDialog === 'reject' && 'Reject Request'}
          {actionDialog === 'submit_committee' && 'Submit to Procurement Committee'}
          {actionDialog === 'committee' && 'Record Committee Decision'}
          {actionDialog === 'high_value' && 'High-Value Approval'}
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
          {actionDialog === 'submit_committee' && (
            <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
              The Committee decides on one fully priced bid. The quotation you choose must
              answer <strong>every</strong> requested item — with a price, or marked as not
              available — and its prices become the request's actual costs from here on.
            </Alert>
          )}
          {(actionDialog === 'submit_committee' || actionDialog === 'committee') && request.quotations && request.quotations.length > 0 && (
            <TextField
              select fullWidth required={actionDialog === 'submit_committee'}
              label={actionDialog === 'submit_committee' ? 'Recommended Quotation *' : 'Selected Quotation'}
              value={selectedQuotId || ''}
              onChange={e => setSelectedQuotId(e.target.value ? Number(e.target.value) : null)}
              sx={{ mb: 2 }}
              helperText={actionDialog === 'submit_committee' && !selectedQuotId
                ? 'Choose the quotation you are putting to the Committee'
                : undefined}
            >
              {actionDialog !== 'submit_committee' && <MenuItem value="">None selected</MenuItem>}
              {request.quotations.map(q => {
                const priced = (q.items || []).filter(i => i.request_item_id).length;
                const needed = (request.items || []).length;
                return (
                  <MenuItem key={q.id} value={q.id}>
                    {q.vendor_name} — {q.currency} {Number(q.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    {needed > 0 && ` · ${priced}/${needed} items priced`}
                  </MenuItem>
                );
              })}
            </TextField>
          )}
          {actionDialog === 'high_value' && (
            <>
              <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
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
          {actionDialog === 'final_finance' && (
            <Alert severity="warning" sx={{ mb: 2, mt: 1 }}>
              At least one Proof of Payment (POP) document is <strong>required</strong> to complete this approval.
              Attach several at once if the payment was made in batches — more can be added afterwards.
            </Alert>
          )}
          {actionDialog === 'final_finance' && (
            <Box sx={{ mb: 2 }}>
              <Button
                variant={popFile.length ? 'outlined' : 'contained'}
                component="label"
                startIcon={<UploadIcon />}
                fullWidth
                color={popFile.length ? 'success' : 'primary'}
              >
                {popFile.length
                  ? `✓ ${popFile.length} document${popFile.length === 1 ? '' : 's'} selected — add more`
                  : 'Upload Proof of Payment (POP) *'}
                <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={e => {
                    const picked = Array.from(e.target.files || []);
                    setPopFile(prev => [
                      ...prev,
                      ...picked.filter(f => !prev.some(p => p.name === f.name && p.size === f.size))
                    ].slice(0, 10));
                    e.target.value = '';
                  }} />
              </Button>
              {popFile.length > 0 && (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  {popFile.map((f, i) => (
                    <Chip
                      key={`${f.name}-${i}`}
                      label={`${f.name} (${(f.size / 1024).toFixed(0)} KB)`}
                      size="small"
                      onDelete={() => setPopFile(prev => prev.filter((_, idx) => idx !== i))}
                    />
                  ))}
                </Stack>
              )}
            </Box>
          )}
          <TextField
            fullWidth multiline rows={3}
            label={
              actionDialog === 'reject' ||
              (actionDialog === 'high_value' && highValueDecisionVal === 'REJECTED')
                ? 'Rejection Reason *'
                : 'Comments (optional)'
            }
            value={comments} onChange={e => setComments(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setActionDialog(null); setPopFile([]); }} disabled={actionLoading}>Cancel</Button>
          <Button
            variant="contained"
            color={actionDialog === 'reject' ? 'error' : 'primary'}
            onClick={doAction}
            disabled={actionLoading || (actionDialog === 'final_finance' && popFile.length === 0)}
            startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
          >
            {actionDialog === 'final_finance' && popFile.length === 0 ? 'Upload POP to Continue' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Quotation Dialog */}
      <Dialog open={uploadDialog} onClose={() => !actionLoading && setUploadDialog(false)} maxWidth="lg" fullWidth>
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
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Quotation Reference #" value={quotForm.quotation_number} onChange={e => setQuotForm(f => ({ ...f, quotation_number: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Currency" value={quotForm.currency} onChange={e => setQuotForm(f => ({ ...f, currency: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Vendor Email" value={quotForm.vendor_email} onChange={e => setQuotForm(f => ({ ...f, vendor_email: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Vendor Phone" value={quotForm.vendor_phone} onChange={e => setQuotForm(f => ({ ...f, vendor_phone: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth type="date" label="Valid Until" InputLabelProps={{ shrink: true }} value={quotForm.validity_date} onChange={e => setQuotForm(f => ({ ...f, validity_date: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Delivery Timeline" placeholder="e.g. 2 weeks" value={quotForm.delivery_timeline} onChange={e => setQuotForm(f => ({ ...f, delivery_timeline: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Notes" value={quotForm.notes} onChange={e => setQuotForm(f => ({ ...f, notes: e.target.value }))} />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <QuotationLinesEditor lines={quotLines} currency={quotForm.currency || 'USD'} onChange={setQuotLines} />
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
      <Dialog open={editQuotDialog} onClose={() => !actionLoading && setEditQuotDialog(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Edit Quotation</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField fullWidth required label="Vendor / Supplier Name *" value={editQuotForm.vendor_name}
                onChange={e => setEditQuotForm(f => ({ ...f, vendor_name: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Quotation Reference #" value={editQuotForm.quotation_number}
                onChange={e => setEditQuotForm(f => ({ ...f, quotation_number: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Currency" value={editQuotForm.currency}
                onChange={e => setEditQuotForm(f => ({ ...f, currency: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Vendor Email" value={editQuotForm.vendor_email}
                onChange={e => setEditQuotForm(f => ({ ...f, vendor_email: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Vendor Phone" value={editQuotForm.vendor_phone}
                onChange={e => setEditQuotForm(f => ({ ...f, vendor_phone: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth type="date" label="Valid Until" InputLabelProps={{ shrink: true }}
                value={editQuotForm.validity_date}
                onChange={e => setEditQuotForm(f => ({ ...f, validity_date: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Delivery Timeline" placeholder="e.g. 2 weeks" value={editQuotForm.delivery_timeline}
                onChange={e => setEditQuotForm(f => ({ ...f, delivery_timeline: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Notes" value={editQuotForm.notes}
                onChange={e => setEditQuotForm(f => ({ ...f, notes: e.target.value }))} />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <QuotationLinesEditor lines={editQuotLines} currency={editQuotForm.currency || 'USD'} onChange={setEditQuotLines} />
            </Grid>

            <Grid item xs={12}>
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                  Replace Quotation Document (optional)
                </Typography>
                <Button component="label" variant="outlined" size="small" startIcon={<UploadIcon />} sx={{ mr: 1 }}>
                  {editQuotFile ? editQuotFile.name : (editingQuot?.file_name ? 'Replace existing file' : 'Attach file')}
                  <input type="file" hidden onChange={e => setEditQuotFile(e.target.files?.[0] || null)} />
                </Button>
                {editQuotFile && (
                  <Button size="small" color="error" onClick={() => setEditQuotFile(null)}>Remove</Button>
                )}
                {!editQuotFile && editingQuot?.file_name && (
                  <Typography variant="caption" color="text.secondary">Current: {editingQuot.file_name}</Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEditQuotDialog(false); setEditQuotFile(null); }} disabled={actionLoading}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateQuotation} disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} /> : <EditIcon />}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resubmit to Committee Dialog */}
      <Dialog open={resubmitDialog} onClose={() => !actionLoading && setResubmitDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SendIcon color="warning" />
          Resubmit Amended Quotations to Committee
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will reset all existing committee votes so members can review the updated quotations afresh.
          </Alert>
          {request?.quotations && request.quotations.length > 0 && (
            <TextField
              select fullWidth label="Recommended Quotation (optional)" size="small" sx={{ mb: 2 }}
              value={resubmitQuotId || ''}
              onChange={e => setResubmitQuotId(e.target.value ? Number(e.target.value) : null)}
            >
              <MenuItem value="">— No selection —</MenuItem>
              {request.quotations.map(q => (
                <MenuItem key={q.id} value={q.id}>
                  {q.vendor_name} — {q.currency} {Number(q.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            fullWidth multiline rows={3} label="Amendment Notes / Comments"
            placeholder="Briefly describe what was changed and why..."
            value={resubmitComments}
            onChange={e => setResubmitComments(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResubmitDialog(false)} disabled={actionLoading}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleResubmitToCommittee} disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} /> : <SendIcon />}>
            Resubmit to Committee
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
