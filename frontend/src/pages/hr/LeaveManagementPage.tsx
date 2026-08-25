/**
 * Leave Management Page
 *
 * Single-stage, role-routed approval:
 *   GENERAL_USER / PROGRAM_LEAD / FINANCE_CLERK / PROCUREMENT_*
 *                     → HEAD_OF_PROGRAMS of their department
 *   HEAD_OF_PROGRAMS  → Super Admin (ADMIN)
 *   ADMIN             → another Super Admin
 *
 * Deductible leave types (e.g. Vacation) reserve days on submit and are
 * deducted on approval. Non-deductible types (e.g. Sick Leave) never touch the
 * balance. The approver always sees the balance before and after the decision.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, IconButton, MenuItem, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, TextField,
  CircularProgress, Alert, Tabs, Tab, Tooltip, Badge, Divider, Card,
  CardContent, LinearProgress, Select, FormControl, InputLabel, Menu,
  InputAdornment, ToggleButton, ToggleButtonGroup,
  alpha, useTheme
} from '@mui/material';
import {
  Add as AddIcon,
  Check as ApproveIcon,
  Close as RejectIcon,
  EventNote as LeaveIcon,
  Person as PersonIcon,
  Business as DeptIcon,
  AdminPanelSettings as HRIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Download as DownloadIcon,
  PictureAsPdf as PdfIcon,
  TableView as ExcelIcon,
  TrendingDown as DeductIcon,
  ArrowForward as ArrowIcon,
  History as HistoryIcon,
  AttachFile as AttachIcon,
  FileDownload as FileDownloadIcon,
  DeleteOutline as DeleteIcon,
  UploadFile as UploadFileIcon,
  Edit as EditIcon,
  Replay as ResubmitIcon,
  Search as SearchIcon,
  ClearAll as ClearIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import {
  getLeaveRequests, createLeaveRequest, approveLeaveRequest, getLeaveTypes,
  getLeaveBalances, getLeaveAuditTrail, downloadLeaveRequestPDF,
  downloadLeaveRegisterPDF, downloadLeaveExcel,
  getLeaveAttachments, uploadLeaveAttachment, deleteLeaveAttachment,
  viewLeaveAttachment, downloadLeaveAttachment, updateLeaveRequest,
} from '../../services/hrService';
import {
  HRLeaveRequest, HRLeaveType, HRLeaveBalance, HRLeaveAuditEntry,
  HRLeaveAttachment, LeaveStatus,
} from '../../types';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import { ROLE_TITLES, formatRoleLabel } from '../../utils/roleUtils';
import { formatDate, formatDateTime } from '../../utils/datetime';
import {
  hasFullHrAccess, hasDepartmentHrAccess, hasHrOversight,
} from '../../utils/hrAccess';
import AccrualStatement from '../../components/hr/AccrualStatement';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt   = (d?: string | null) => (d ? formatDate(d) : '—');
const fmtDt = (d?: string | null) => (d ? formatDateTime(d) : '—');

/** Render a day count, tolerating the API's string decimals and nulls. */
const days = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toFixed(1);

const truthy = (v: boolean | number | undefined | null) => v === true || v === 1;

type StatusMeta = { label: string; color: 'warning' | 'info' | 'success' | 'error' | 'default' };

const STATUS_META: Partial<Record<LeaveStatus, StatusMeta>> = {
  PENDING:   { label: 'Awaiting Approval', color: 'warning' },
  APPROVED:  { label: 'Approved',          color: 'success' },
  REJECTED:  { label: 'Rejected',          color: 'error'   },
  CANCELLED: { label: 'Cancelled',         color: 'default' },
};

const statusMeta = (s: LeaveStatus): StatusMeta =>
  STATUS_META[s] || { label: String(s).replace(/_/g, ' '), color: 'default' };

/** Who has to approve a request raised by someone in this role. */
const approverFor = (role?: string) => {
  if (role === 'HEAD_OF_PROGRAMS') return 'Super Admin';
  if (role === 'ADMIN')            return 'another Super Admin';
  return 'the Head of Department';
};

// ─── Leave Balance Card ──────────────────────────────────────────────────────

const BalanceCard: React.FC<{ balance: HRLeaveBalance }> = ({ balance }) => {
  const total = Number(balance.total_days) || 0;
  const used  = Number(balance.used_days) || 0;
  const left  = Number(balance.remaining_days) || 0;
  const pct   = total > 0 ? Math.round((left / total) * 100) : 0;
  const color = pct > 50 ? 'success.main' : pct > 20 ? 'warning.main' : 'error.main';

  return (
    <Card elevation={0} sx={{ minWidth: 200, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {balance.leave_type_name}
        </Typography>
        <Box display="flex" alignItems="baseline" gap={0.5} mt={0.5}>
          <Typography variant="h4" fontWeight={700} color={color}>{days(left)}</Typography>
          <Typography variant="body2" color="text.secondary">/ {days(total)} days</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(Math.max(pct, 0), 100)}
          sx={{ mt: 1, height: 6, borderRadius: 3 }}
        />
        <Box display="flex" justifyContent="space-between" mt={0.5}>
          <Typography variant="caption" color="text.secondary">Used: {days(used)}</Typography>
          <Typography variant="caption" color="text.secondary">Pending: {days(balance.pending_days)}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

// ─── Balance Impact panel ────────────────────────────────────────────────────
// The core of the approver's decision: what they have now, what it costs, and
// what is left afterwards.

const BalanceImpact: React.FC<{ request: HRLeaveRequest; dense?: boolean }> = ({ request, dense }) => {
  const theme = useTheme();

  const total    = Number(request.total_days ?? request.days_requested ?? 0);
  const charged  = Number(request.deductible_days ?? 0);
  const freeUsed = Number(request.free_days_used ?? 0);
  const limit    = request.free_days_limit;

  // Nothing is charged: either a never-deducted type, or entirely inside the
  // type's free allowance.
  if (charged === 0) {
    return (
      <Alert severity="success" icon={<InfoIcon />} sx={{ py: dense ? 0.25 : 1 }}>
        {limit
          ? <>All <strong>{days(total)}</strong> day(s) fall inside the{' '}
              <strong>{days(limit)}-day</strong> {request.leave_type_name} allowance —
              nothing is taken from the leave balance.</>
          : <><strong>{request.leave_type_name}</strong> is never deducted — the
              leave balance is unaffected.</>}
      </Alert>
    );
  }

  const before = request.balance_before;
  const after  = request.balance_after;
  const short  = after !== null && after !== undefined && Number(after) < 0;

  const Cell: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color }) => (
    <Box flex={1} textAlign="center">
      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
        {label}
      </Typography>
      <Typography variant={dense ? 'body1' : 'h5'} fontWeight={700} color={color}>
        {value}
      </Typography>
    </Box>
  );

  return (
    <Box>
      {/* Part-free requests need the split spelled out before the arithmetic. */}
      {freeUsed > 0 && (
        <Alert severity="info" sx={{ mb: 1, py: 0.25 }}>
          {days(total)} day(s) requested — <strong>{days(freeUsed)}</strong> covered by the
          {limit ? ` ${days(limit)}-day` : ''} allowance,{' '}
          <strong>{days(charged)}</strong> charged to the balance.
        </Alert>
      )}

      <Paper
        elevation={0}
        sx={{
          p: dense ? 1 : 1.75,
          border: '1px solid',
          borderColor: short ? 'error.main' : 'divider',
          bgcolor: alpha(theme.palette.primary.main, 0.03),
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Cell label="BALANCE BEFORE" value={days(before)} />
          <ArrowIcon fontSize="small" color="disabled" />
          <Cell label="DAYS CHARGED" value={`− ${days(charged)}`} color="error.main" />
          <ArrowIcon fontSize="small" color="disabled" />
          <Cell label="BALANCE AFTER" value={days(after)} color={short ? 'error.main' : 'success.main'} />
        </Box>
        {short && (
          <Typography variant="caption" color="error.main" display="block" textAlign="center" mt={0.5}>
            This takes the employee below zero — allowed, but worth a second look.
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

// ─── Audit Trail ─────────────────────────────────────────────────────────────

const ACTION_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  SUBMITTED: 'warning',
  APPROVED:  'success',
  REJECTED:  'error',
  CANCELLED: 'default',
};

const AuditTrail: React.FC<{ leaveId: number }> = ({ leaveId }) => {
  const [trail, setTrail]     = useState<HRLeaveAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLeaveAuditTrail(leaveId)
      .then((t) => { if (!cancelled) setTrail(t); })
      .catch(() => { if (!cancelled) setTrail([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leaveId]);

  if (loading) {
    return <Box display="flex" justifyContent="center" py={2}><CircularProgress size={22} /></Box>;
  }
  if (trail.length === 0) {
    return <Typography variant="body2" color="text.disabled">No trail entries recorded.</Typography>;
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: 'grey.50' }}>
            <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>By</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">Before</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">After</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Comments</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {trail.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                <Typography variant="caption">{fmtDt(e.created_at)}</Typography>
              </TableCell>
              <TableCell>
                <Chip
                  label={String(e.action).replace(/_/g, ' ')}
                  size="small"
                  color={ACTION_COLOR[e.action] || 'default'}
                />
              </TableCell>
              <TableCell>
                <Typography variant="body2">{e.actor_name || 'System'}</Typography>
                {e.actor_role && (
                  <Typography variant="caption" color="text.secondary">
                    {e.actor_role.replace(/_/g, ' ')}
                  </Typography>
                )}
              </TableCell>
              <TableCell align="right">{days(e.balance_before)}</TableCell>
              <TableCell align="right">{days(e.balance_after)}</TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">{e.comments || '—'}</Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

// ─── Attachments ─────────────────────────────────────────────────────────────

const fileSize = (bytes: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Supporting documents on a leave request, with view and download actions.
 * `canEdit` adds upload/remove — the owner while pending, or HR/Admin any time.
 */
const AttachmentList: React.FC<{
  leaveId: number;
  canEdit?: boolean;
  refreshKey?: number;
}> = ({ leaveId, canEdit, refreshKey }) => {
  const [items, setItems]     = useState<HRLeaveAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getLeaveAttachments(leaveId)); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, [leaveId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadLeaveAttachment(leaveId, file);
      toast.success('Document attached');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to attach document');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const act = async (att: HRLeaveAttachment, fn: (a: HRLeaveAttachment) => Promise<void>) => {
    setBusy(att.id);
    try { await fn(att); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Could not open the document'); }
    finally { setBusy(null); }
  };

  const remove = async (att: HRLeaveAttachment) => {
    setBusy(att.id);
    try {
      await deleteLeaveAttachment(att.id);
      toast.success('Document removed');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove document');
    } finally { setBusy(null); }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" py={1.5}><CircularProgress size={20} /></Box>;
  }

  return (
    <Box>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.disabled">No supporting documents attached.</Typography>
      ) : (
        <Stack spacing={0.75}>
          {items.map((att) => (
            <Paper
              key={att.id}
              elevation={0}
              sx={{
                p: 1, display: 'flex', alignItems: 'center', gap: 1,
                border: '1px solid', borderColor: 'divider',
              }}
            >
              <AttachIcon fontSize="small" color="action" />
              <Box flex={1} minWidth={0}>
                <Typography variant="body2" fontWeight={600} noWrap>{att.file_name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {fileSize(att.file_size)}
                  {att.uploaded_by_name ? ` • ${att.uploaded_by_name}` : ''}
                  {` • ${fmtDt(att.created_at)}`}
                </Typography>
              </Box>
              {busy === att.id ? (
                <CircularProgress size={18} />
              ) : (
                <>
                  <Tooltip title="View">
                    <IconButton size="small" onClick={() => act(att, viewLeaveAttachment)}>
                      <ViewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Download">
                    <IconButton size="small" onClick={() => act(att, downloadLeaveAttachment)}>
                      <FileDownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {canEdit && (
                    <Tooltip title="Remove">
                      <IconButton size="small" color="error" onClick={() => remove(att)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </>
              )}
            </Paper>
          ))}
        </Stack>
      )}

      {canEdit && (
        <Button
          component="label"
          size="small"
          startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />}
          disabled={uploading}
          sx={{ mt: 1 }}
        >
          Attach document
          <input type="file" hidden onChange={handleUpload} />
        </Button>
      )}
    </Box>
  );
};

// ─── Detail Dialog ────────────────────────────────────────────────────────────

const DetailDialog: React.FC<{
  request: HRLeaveRequest | null;
  onClose: () => void;
  /** Owner while pending, or HR/Admin at any time. */
  canEditDocs?: boolean;
  /** Approvers also see the requester's accrual statement. */
  showAccruals?: boolean;
}> = ({ request, onClose, canEditDocs, showAccruals }) => {
  const [exporting, setExporting] = useState(false);
  if (!request) return null;

  const meta = statusMeta(request.status);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadLeaveRequestPDF(request.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to download PDF');
    } finally {
      setExporting(false);
    }
  };

  const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <Grid item xs={6}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600}>{value}</Typography>
    </Grid>
  );

  return (
    <Dialog open={!!request} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Leave Request Details</Typography>
          <Typography variant="caption" color="text.secondary">
            LV-{String(request.id).padStart(5, '0')}
          </Typography>
        </Box>
        <Chip label={meta.label} color={meta.color} size="small" />
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        <Grid container spacing={1.5}>
          <Field label="Employee"   value={request.employee_name} />
          <Field label="Department" value={request.department_name || '—'} />
          <Field label="Leave Type" value={
            <Stack direction="row" spacing={0.75} alignItems="center">
              <span>{request.leave_type_name}</span>
              <Chip
                size="small"
                variant="outlined"
                color={truthy(request.is_deductible) ? 'warning' : 'success'}
                label={truthy(request.is_deductible) ? 'Deductible' : 'Non-deductible'}
              />
            </Stack>
          } />
          <Field label="Days Requested" value={`${days(request.total_days ?? request.days_requested)} day(s)`} />
          <Field label="First Day" value={fmt(request.start_date)} />
          <Field label="Last Day"  value={fmt(request.end_date)} />
          {request.reason && (
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">Reason</Typography>
              <Typography variant="body2">{request.reason}</Typography>
            </Grid>
          )}
        </Grid>

        <Typography variant="subtitle2" fontWeight={700} mt={2.5} mb={1}>Leave Balance Impact</Typography>
        <BalanceImpact request={request} />

        {(request.approved_by || request.rejection_reason) && (
          <Paper elevation={0} sx={{ mt: 2, p: 1.5, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>DECISION</Typography>
            {request.approved_by_name && (
              <Typography variant="body2" mt={0.5}><strong>By:</strong> {request.approved_by_name}</Typography>
            )}
            {request.approved_at && (
              <Typography variant="body2"><strong>At:</strong> {fmtDt(request.approved_at)}</Typography>
            )}
            {request.rejection_reason && (
              <Typography variant="body2" color="error.main">
                <strong>Reason:</strong> {request.rejection_reason}
              </Typography>
            )}
          </Paper>
        )}

        {/* How this person's balance was built, so the approver decides against
            the full picture rather than a single number. */}
        {showAccruals && request.employee_id && (
          <>
            <Typography variant="subtitle2" fontWeight={700} mt={2.5} mb={1}
              display="flex" alignItems="center" gap={0.75}>
              <HistoryIcon fontSize="small" /> How Their Leave Built Up
            </Typography>
            <AccrualStatement employeeId={Number(request.employee_id)} dense />
          </>
        )}

        <Typography variant="subtitle2" fontWeight={700} mt={2.5} mb={1}
          display="flex" alignItems="center" gap={0.75}>
          <AttachIcon fontSize="small" /> Supporting Documents
        </Typography>
        <AttachmentList leaveId={request.id} canEdit={canEditDocs} />

        <Typography variant="subtitle2" fontWeight={700} mt={2.5} mb={1}
          display="flex" alignItems="center" gap={0.75}>
          <HistoryIcon fontSize="small" /> Audit Trail
        </Typography>
        <AuditTrail leaveId={request.id} />
      </DialogContent>
      <DialogActions>
        <Button
          startIcon={exporting ? <CircularProgress size={16} /> : <PdfIcon />}
          onClick={handleExport}
          disabled={exporting}
        >
          Export PDF
        </Button>
        <Box flex={1} />
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const LeaveManagementPage: React.FC = () => {
  const theme = useTheme();
  const { user } = useAuthStore();

  /** HR Office: Super Admin, or the HOP/Lead of Admin & HR. */
  const isHrOffice  = hasFullHrAccess(user);
  /** HOP/Lead of CPJS, FOS or HSD — their own department only. */
  const isDeptHead  = hasDepartmentHrAccess(user);
  /** Anyone who sees beyond their own records. */
  const isOversight = hasHrOversight(user);
  const isApprover  = isOversight;

  const TAB_MY       = 0;
  const TAB_APPROVAL = 1;
  const TAB_ALL      = 2;

  const [tab, setTab]                   = useState(TAB_MY);
  const [requests, setRequests]         = useState<HRLeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes]     = useState<HRLeaveType[]>([]);
  const [balances, setBalances]         = useState<HRLeaveBalance[]>([]);
  const [loading, setLoading]           = useState(true);
  const [page, setPage]                 = useState(0);
  const [rowsPerPage, setRowsPerPage]   = useState(25);
  const [total, setTotal]               = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter]     = useState(new Date().getFullYear());
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [detailReq, setDetailReq]       = useState<HRLeaveRequest | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  /** Files staged on the apply form, uploaded with the request itself. */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // Additional filters
  const [typeFilter, setTypeFilter]   = useState<number | ''>('');
  const [searchTerm, setSearchTerm]   = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');
  const [deptFilter, setDeptFilter]   = useState('');
  const [roleFilter, setRoleFilter]   = useState('');
  const [departments, setDepartments] = useState<{ id: number; department_name: string }[]>([]);

  /** Approval queue breadth: own department, or the whole organisation. */
  const [queueScope, setQueueScope] = useState<'department' | 'all'>('department');

  /** The request being edited or resubmitted. */
  const [editReq, setEditReq]       = useState<HRLeaveRequest | null>(null);
  const [editFiles, setEditFiles]   = useState<File[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm]     = useState({
    leave_type_id: '' as number | '',
    start_date: '', end_date: '', reason: '', change_note: '',
  });

  const [approvalDialog, setApprovalDialog] = useState<{
    open: boolean; request: HRLeaveRequest | null; approve: boolean;
  }>({ open: false, request: null, approve: true });
  const [approvalComments, setApprovalComments] = useState('');
  const [approvalLoading, setApprovalLoading]   = useState(false);

  const { control, handleSubmit, reset, setValue, formState: { errors }, watch } = useForm();
  const watchStart = watch('start_date');
  const watchEnd   = watch('end_date');
  const watchType  = watch('leave_type_id');

  const calcDays = () => {
    if (!watchStart || !watchEnd) return null;
    const diff = Math.ceil((new Date(watchEnd).getTime() - new Date(watchStart).getTime()) / 86400000) + 1;
    return diff > 0 ? diff : null;
  };

  /** The type the user is currently choosing in the apply form. */
  const selectedType = leaveTypes.find((t) => Number(t.id) === Number(watchType));
  /** Study Leave and similar cannot be submitted without evidence. */
  const requiresDoc = truthy(selectedType?.requires_document);

  // ── data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const filters: any = {
        page: page + 1,
        limit: rowsPerPage,
        status: statusFilter || undefined,
        year: yearFilter,
        leaveTypeId: typeFilter || undefined,
        search: searchTerm || undefined,
        startFrom: fromDate || undefined,
        startTo: toDate || undefined,
      };

      // Department and role narrow a view of other people's leave, so they are
      // only sent from the tabs that show it — left on, they would silently
      // empty the caller's own list. A department head is already pinned to
      // their own department server-side.
      if (tab !== TAB_MY) {
        if (deptFilter) filters.departmentId = Number(deptFilter);
        if (roleFilter) filters.role = roleFilter;
      }

      // TAB_MY       → the caller's own requests
      // TAB_APPROVAL → only requests this user is the designated approver for
      // TAB_ALL      → default scope (Admin: everything, HOP: their department)
      if (tab === TAB_MY) {
        filters.scope = 'mine';
      } else if (tab === TAB_APPROVAL) {
        // The HR Office can widen the queue past their own department, which is
        // how they approve on another department's behalf.
        filters.scope = (isHrOffice && queueScope === 'all') ? 'pending-all' : 'pending-mine';
        // The queue is pending-only by definition; a status filter would fight it.
        delete filters.status;
      }

      const [reqResult, types] = await Promise.all([
        getLeaveRequests(filters),
        getLeaveTypes(),
      ]);

      setRequests(reqResult.data);
      setTotal(reqResult.pagination.total);
      setLeaveTypes(types);

      // Badge count for the approval queue.
      if (isApprover) {
        const pRes = await getLeaveRequests({ scope: 'pending-mine', page: 1, limit: 1 });
        setPendingCount(pRes.pagination.total);
      }

      // Own balances, for the cards on the My Leave tab.
      if (tab === TAB_MY) {
        const mine = reqResult.data[0];
        if (mine?.employee_id) {
          try {
            setBalances(await getLeaveBalances(mine.employee_id, yearFilter));
          } catch { /* balances are supplementary */ }
        }
      }
    } catch (err) {
      toast.error('Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter, yearFilter, tab, isApprover,
      typeFilter, searchTerm, fromDate, toDate, queueScope, isHrOffice,
      deptFilter, roleFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  // Departments for the picker. A department head sees only their own, so the
  // picker is left out for them entirely.
  useEffect(() => {
    if (!isHrOffice) return;
    api.get('/departments')
      .then((res) => { if (res.data?.success) setDepartments(res.data.data); })
      .catch(() => setDepartments([]));
  }, [isHrOffice]);

  // ── submit leave ────────────────────────────────────────────────────────────

  const onSubmitLeave = async (data: any) => {
    // Mirror of the server-side rule, so the user is told before submitting.
    if (requiresDoc && pendingFiles.length === 0) {
      toast.error(`${selectedType?.leave_name} requires a supporting document.`);
      return;
    }
    try {
      const result = await createLeaveRequest({ ...data, attachments: pendingFiles });
      const routedTo = approverFor(user?.role);
      toast.success(
        result?.is_deductible === false
          ? `Leave request submitted to ${routedTo} — no days deducted (non-deductible type).`
          : `Leave request submitted to ${routedTo} for approval.`
      );
      setDialogOpen(false);
      setPendingFiles([]);
      reset();
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit leave request');
    }
  };

  // ── approval action ─────────────────────────────────────────────────────────

  const handleApproval = async () => {
    const req = approvalDialog.request;
    if (!req) return;

    if (!approvalDialog.approve && !approvalComments.trim()) {
      toast.error('Please give a reason for the rejection');
      return;
    }

    setApprovalLoading(true);
    try {
      const result = await approveLeaveRequest(req.id, {
        approved: approvalDialog.approve,
        comments: approvalComments || undefined,
      });

      if (approvalDialog.approve) {
        const deducted = Number(result?.days_deducted) || 0;
        const free = Number(result?.free_days_used) || 0;
        toast.success(
          deducted > 0
            ? `Approved — ${days(deducted)} day(s) charged`
              + (free > 0 ? ` (${days(free)} within allowance)` : '')
              + `, ${days(result?.balance_after)} remaining.`
            : 'Approved — no days charged to the leave balance.'
        );
      } else {
        toast.success('Leave request rejected — reserved days released.');
      }

      setApprovalDialog({ open: false, request: null, approve: true });
      setApprovalComments('');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to process leave request');
    } finally {
      setApprovalLoading(false);
    }
  };

  // ── edit / resubmit ─────────────────────────────────────────────────────────

  /**
   * A request may be corrected while pending, or fixed and resubmitted once
   * rejected — but only by the person who raised it.
   *
   * Approvers (the HR Office included) deliberately have no edit: an approver
   * who can rewrite a request before approving it is approving their own
   * wording, not the employee's, and the audit trail then shows a decision on
   * something the employee never submitted. What an approver disagrees with,
   * they reject with a reason, and the employee amends and resubmits.
   */
  const canEdit = (req: HRLeaveRequest) =>
    ['PENDING', 'REJECTED'].includes(req.status)
    && Number(req.employee_user_id) === Number(user?.id);

  const openEditor = (req: HRLeaveRequest) => {
    setEditForm({
      leave_type_id: Number(req.leave_type_id),
      start_date: String(req.start_date).slice(0, 10),
      end_date:   String(req.end_date).slice(0, 10),
      reason:     req.reason || '',
      change_note: '',
    });
    setEditFiles([]);
    setEditReq(req);
  };

  const editType = leaveTypes.find((t) => Number(t.id) === Number(editForm.leave_type_id));
  const editNeedsDoc = truthy(editType?.requires_document);

  const submitEdit = async () => {
    if (!editReq) return;
    if (new Date(editForm.end_date) < new Date(editForm.start_date)) {
      toast.error('End date must be on or after the start date');
      return;
    }
    setEditSaving(true);
    try {
      const result = await updateLeaveRequest(editReq.id, {
        leave_type_id: Number(editForm.leave_type_id),
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        reason: editForm.reason,
        change_note: editForm.change_note || undefined,
        attachments: editFiles,
      });
      toast.success(
        result?.resubmitted
          ? `Resubmitted for approval by ${approverFor(user?.role)}.`
          : 'Request updated and sent for approval.'
      );
      setEditReq(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update the request');
    } finally {
      setEditSaving(false);
    }
  };

  const clearFilters = () => {
    setStatusFilter(''); setTypeFilter(''); setSearchTerm(''); setSearchInput('');
    setFromDate(''); setToDate(''); setDeptFilter(''); setRoleFilter(''); setPage(0);
  };

  const activeFilterCount =
    [statusFilter, typeFilter, searchTerm, fromDate, toDate, deptFilter, roleFilter]
      .filter(Boolean).length;

  // ── exports ─────────────────────────────────────────────────────────────────

  const runExport = async (kind: 'pdf' | 'excel') => {
    setExportAnchor(null);
    const params = { year: yearFilter, status: statusFilter || undefined };
    try {
      toast.info('Preparing export…');
      if (kind === 'pdf') await downloadLeaveRegisterPDF(params);
      else                await downloadLeaveExcel(params);
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    }
  };

  // ── derived ─────────────────────────────────────────────────────────────────

  /** Approve/reject buttons only appear in the queue the API vouches for. */
  const canActOn = (req: HRLeaveRequest) =>
    isApprover && tab === TAB_APPROVAL && req.status === 'PENDING';

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  const statusOptions = [
    { value: '',          label: 'All Statuses' },
    { value: 'PENDING',   label: 'Awaiting Approval' },
    { value: 'APPROVED',  label: 'Approved' },
    { value: 'REJECTED',  label: 'Rejected' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  const tabs = [
    { label: 'My Leave', icon: <PersonIcon fontSize="small" /> },
    ...(isApprover ? [{
      label: 'Approvals',
      icon: <DeptIcon fontSize="small" />,
      badge: pendingCount,
    }] : []),
    ...(isOversight ? [{
      label: isHrOffice ? 'All Leave Requests' : 'Department Leave',
      icon: <HRIcon fontSize="small" />,
    }] : []),
  ];

  const showDept    = tab !== TAB_MY;
  const showActions = isApprover && tab === TAB_APPROVAL;

  return (
    <Box p={3}>
      {/* ── Header ── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700} display="flex" alignItems="center" gap={1}>
            <LeaveIcon color="primary" />
            Leave Management
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {isHrOffice
              ? 'Super Admin — full visibility across every department, and approver for Heads of Department'
              : isDeptHead
              ? 'Head of Department — approve your department’s leave; your own requests go to a Super Admin'
              : `Apply for leave — your requests are approved by ${approverFor(user?.role)}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {isOversight && (
            <>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={(e) => setExportAnchor(e.currentTarget)}
              >
                Export
              </Button>
              <Menu
                anchorEl={exportAnchor}
                open={!!exportAnchor}
                onClose={() => setExportAnchor(null)}
              >
                <MenuItem onClick={() => runExport('pdf')}>
                  <PdfIcon fontSize="small" style={{ marginRight: 8 }} /> Leave Register (PDF)
                </MenuItem>
                <MenuItem onClick={() => runExport('excel')}>
                  <ExcelIcon fontSize="small" style={{ marginRight: 8 }} /> Full Report (Excel)
                </MenuItem>
              </Menu>
            </>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { reset(); setPendingFiles([]); setDialogOpen(true); }}>
            Apply for Leave
          </Button>
        </Stack>
      </Box>

      {/* A rejected request is not the end of the road — say so. */}
      {tab === TAB_MY && requests.some((r) => r.status === 'REJECTED') && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          One or more of your requests was rejected. Use the resubmit action to
          amend and send it back for approval.
        </Alert>
      )}

      {/* ── Balance cards (own leave) ── */}
      {tab === TAB_MY && balances.length > 0 && (
        <Box mb={3}>
          <Typography variant="subtitle2" color="text.secondary" fontWeight={600} mb={1.5}>
            MY LEAVE BALANCES — {yearFilter}
          </Typography>
          <Box display="flex" gap={2} flexWrap="wrap">
            {balances.map((b) => <BalanceCard key={b.id} balance={b} />)}
          </Box>
        </Box>
      )}

      {/* ── Tabs ── */}
      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setPage(0); setStatusFilter(''); }}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((t, i) => (
          <Tab
            key={i}
            icon={t.icon}
            iconPosition="start"
            label={
              (t as any).badge > 0
                ? <Badge badgeContent={(t as any).badge} color="error" sx={{ pl: 1 }}>{t.label}</Badge>
                : t.label
            }
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48 }}
          />
        ))}
      </Tabs>

      {/* ── Contextual banners ── */}
      {tab === TAB_APPROVAL && isHrOffice && (
        <Box mb={2} display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            Show requests from:
          </Typography>
          <ToggleButtonGroup
            exclusive size="small" value={queueScope}
            onChange={(_, v) => { if (v) { setQueueScope(v); setPage(0); } }}
          >
            <ToggleButton value="department">My Department</ToggleButton>
            <ToggleButton value="all">All Departments</ToggleButton>
          </ToggleButtonGroup>
          {queueScope === 'all' && (
            <Typography variant="caption" color="text.secondary">
              Approving on another department's behalf — recorded against your name.
            </Typography>
          )}
        </Box>
      )}

      {tab === TAB_APPROVAL && (
        <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
          <strong>Your approval queue</strong> — only requests you are the designated
          approver for appear here.{' '}
          {isHrOffice
            ? 'As Super Admin you approve Heads of Department, other Super Admins, and any department without a Head.'
            : 'You approve staff in your own department; your own leave goes to a Super Admin.'}
        </Alert>
      )}
      {tab === TAB_ALL && (
        <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
          {isHrOffice
            ? <><strong>Organisation-wide view</strong> — every leave request across all departments.</>
            : <><strong>Department view</strong> — all leave requests raised within your department.</>}
        </Alert>
      )}

      {/* ── Filters ── */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <FilterIcon fontSize="small" color="action" />

          <TextField
            size="small"
            placeholder={tab === TAB_MY ? 'Search reason…' : 'Search name, number or reason…'}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setSearchTerm(searchInput); setPage(0); }
            }}
            onBlur={() => { if (searchInput !== searchTerm) { setSearchTerm(searchInput); setPage(0); } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              ),
            }}
            sx={{ minWidth: 240 }}
          />

          <FormControl size="small" sx={{ minWidth: 190 }} disabled={tab === TAB_APPROVAL}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            >
              {statusOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Leave Type</InputLabel>
            <Select
              value={typeFilter}
              label="Leave Type"
              onChange={(e) => { setTypeFilter(e.target.value === '' ? '' : Number(e.target.value)); setPage(0); }}
            >
              <MenuItem value="">All Types</MenuItem>
              {leaveTypes.map((t) => (
                <MenuItem key={t.id} value={t.id}>{t.leave_name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Department and role only mean anything once the view reaches past
              the caller's own requests. */}
          {tab !== TAB_MY && isHrOffice && departments.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 190 }}>
              <InputLabel>Department</InputLabel>
              <Select
                value={deptFilter}
                label="Department"
                onChange={(e) => { setDeptFilter(String(e.target.value)); setPage(0); }}
              >
                <MenuItem value="">All Departments</MenuItem>
                {departments.map((d) => (
                  <MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {tab !== TAB_MY && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Role</InputLabel>
              <Select
                value={roleFilter}
                label="Role"
                onChange={(e) => { setRoleFilter(String(e.target.value)); setPage(0); }}
              >
                <MenuItem value="">All Roles</MenuItem>
                {Object.keys(ROLE_TITLES).map((r) => (
                  <MenuItem key={r} value={r}>{formatRoleLabel(r)}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel>Year</InputLabel>
            <Select
              value={yearFilter}
              label="Year"
              onChange={(e) => { setYearFilter(Number(e.target.value)); setPage(0); }}
            >
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField
            size="small" type="date" label="From" InputLabelProps={{ shrink: true }}
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(0); }}
            sx={{ minWidth: 150 }}
          />
          <TextField
            size="small" type="date" label="To" InputLabelProps={{ shrink: true }}
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(0); }}
            sx={{ minWidth: 150 }}
          />

          {activeFilterCount > 0 && (
            <Button size="small" startIcon={<ClearIcon />} onClick={clearFilters}>
              Clear ({activeFilterCount})
            </Button>
          )}

          <Box flex={1} />
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" onClick={loadData} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Paper>

      {/* ── Table ── */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>
        ) : requests.length === 0 ? (
          <Box py={8} textAlign="center">
            <LeaveIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" color="text.secondary" fontWeight={500}>
              No leave requests found
            </Typography>
            <Typography variant="body2" color="text.disabled">
              {tab === TAB_MY
                ? 'You have not submitted any leave requests yet.'
                : tab === TAB_APPROVAL
                ? 'Nothing is waiting for your approval.'
                : 'No requests match your current filters.'}
            </Typography>
            {tab === TAB_MY && (
              <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }}
                onClick={() => { reset(); setPendingFiles([]); setDialogOpen(true); }}>
                Apply for Leave
              </Button>
            )}
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 700, py: 1.5 }}>Employee</TableCell>
                    {showDept && <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>}
                    <TableCell sx={{ fontWeight: 700 }}>Leave Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Days</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Balance Before → After</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.map((req) => {
                    const meta = statusMeta(req.status);
                    const charged  = Number(req.deductible_days ?? 0);
                    const freeUsed = Number(req.free_days_used ?? 0);
                    return (
                      <TableRow key={req.id} hover
                        sx={{ '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.02) } }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{req.employee_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            LV-{String(req.id).padStart(5, '0')}
                          </Typography>
                        </TableCell>
                        {showDept && (
                          <TableCell><Typography variant="body2">{req.department_name || '—'}</Typography></TableCell>
                        )}
                        <TableCell>
                          <Stack spacing={0.5} alignItems="flex-start">
                            <Chip label={req.leave_type_name} size="small" variant="outlined" />
                            <Chip
                              size="small"
                              label={
                                charged > 0
                                  ? (freeUsed > 0
                                      ? `${days(freeUsed)} free + ${days(charged)} charged`
                                      : `${days(charged)} charged`)
                                  : 'No deduction'
                              }
                              color={charged > 0 ? 'warning' : 'success'}
                              variant="outlined"
                              sx={{ height: 18, fontSize: 10 }}
                              icon={charged > 0 ? <DeductIcon sx={{ fontSize: 12 }} /> : undefined}
                            />
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{fmt(req.start_date)}</Typography>
                          <Typography variant="caption" color="text.secondary">to {fmt(req.end_date)}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={600}>
                            {days(req.total_days ?? req.days_requested)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          {charged > 0 ? (
                            <Stack direction="row" spacing={0.75} justifyContent="center" alignItems="center">
                              <Typography variant="body2" fontWeight={600}>{days(req.balance_before)}</Typography>
                              <ArrowIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                              <Typography
                                variant="body2"
                                fontWeight={700}
                                color={Number(req.balance_after) < 0 ? 'error.main' : 'success.main'}
                              >
                                {days(req.balance_after)}
                              </Typography>
                            </Stack>
                          ) : (
                            <Typography variant="caption" color="text.disabled">No deduction</Typography>
                          )}
                        </TableCell>
                        <TableCell><Chip label={meta.label} size="small" color={meta.color} /></TableCell>
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Tooltip title="View details & audit trail">
                              <IconButton size="small" onClick={() => setDetailReq(req)}>
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {canEdit(req) && (
                              <Tooltip
                                title={req.status === 'REJECTED'
                                  ? 'Amend and resubmit for approval'
                                  : 'Edit while awaiting approval'}
                              >
                                <IconButton
                                  size="small"
                                  color={req.status === 'REJECTED' ? 'warning' : 'primary'}
                                  onClick={() => openEditor(req)}
                                >
                                  {req.status === 'REJECTED'
                                    ? <ResubmitIcon fontSize="small" />
                                    : <EditIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            )}
                            {canActOn(req) && (
                              <>
                                <Tooltip title="Approve — deducts days if the type is deductible">
                                  <IconButton size="small" color="success"
                                    onClick={() => { setApprovalComments(''); setApprovalDialog({ open: true, request: req, approve: true }); }}>
                                    <ApproveIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Reject">
                                  <IconButton size="small" color="error"
                                    onClick={() => { setApprovalComments(''); setApprovalDialog({ open: true, request: req, approve: false }); }}>
                                    <RejectIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50]}
              component="div"
              count={total}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            />
          </>
        )}
      </Paper>

      {/* ─────────────────────── Apply Leave Dialog ─────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>Apply for Leave</Typography>
          <Typography variant="caption" color="text.secondary">
            Your request will be sent to {approverFor(user?.role)} for approval.
          </Typography>
        </DialogTitle>
        <Divider />
        <form onSubmit={handleSubmit(onSubmitLeave)}>
          <DialogContent sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Controller
                  name="leave_type_id"
                  control={control}
                  rules={{ required: 'Leave type is required' }}
                  defaultValue=""
                  render={({ field }) => (
                    <TextField
                      {...field}
                      select fullWidth size="small" label="Leave Type"
                      error={!!errors.leave_type_id}
                      helperText={errors.leave_type_id?.message as string}
                    >
                      {leaveTypes.map((t) => (
                        <MenuItem key={t.id} value={t.id}>
                          {t.leave_name}
                          {truthy((t as any).is_deductible) ? '' : ' (no days deducted)'}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Grid>

              {selectedType && (
                <Grid item xs={12}>
                  <Alert
                    severity={
                      !truthy(selectedType.is_deductible) ? 'success'
                      : selectedType.free_days_limit ? 'info' : 'warning'
                    }
                    sx={{ py: 0.5 }}
                  >
                    {!truthy(selectedType.is_deductible)
                      ? `${selectedType.leave_name} is never deducted — your balance is unaffected.`
                      : selectedType.free_days_limit
                        ? `The first ${Number(selectedType.free_days_limit).toFixed(0)} day(s) of ${selectedType.leave_name}`
                          + `${selectedType.free_days_window_months ? ` in any ${selectedType.free_days_window_months} months` : ''}`
                          + ' are free. Anything beyond that comes off your leave balance.'
                        : `${selectedType.leave_name} is deductible — approved days come off your balance.`}
                  </Alert>
                </Grid>
              )}

              <Grid item xs={6}>
                <Controller
                  name="start_date"
                  control={control}
                  rules={{ required: 'Start date is required' }}
                  defaultValue=""
                  render={({ field }) => (
                    <TextField
                      {...field}
                      type="date" fullWidth size="small" label="First Day of Leave"
                      InputLabelProps={{ shrink: true }}
                      onChange={(e) => {
                        field.onChange(e);
                        // Moving the start past the end would leave an invalid
                        // range on screen; drop the end date instead.
                        if (watchEnd && e.target.value && new Date(watchEnd) < new Date(e.target.value)) {
                          setValue('end_date', '');
                        }
                      }}
                      error={!!errors.start_date}
                      helperText={errors.start_date?.message as string}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={6}>
                <Controller
                  name="end_date"
                  control={control}
                  rules={{
                    required: 'End date is required',
                    validate: (v) =>
                      !watchStart || !v || new Date(v) >= new Date(watchStart)
                        || 'End date must be on or after the start date',
                  }}
                  defaultValue=""
                  render={({ field }) => (
                    <TextField
                      {...field}
                      type="date" fullWidth size="small" label="Last Day of Leave"
                      InputLabelProps={{ shrink: true }}
                      // Earlier dates are greyed out in the picker, so an
                      // invalid range cannot be chosen in the first place.
                      inputProps={{ min: watchStart || undefined }}
                      error={!!errors.end_date}
                      helperText={(errors.end_date?.message as string)
                        || (watchStart ? 'Must be on or after the first day' : '')}
                    />
                  )}
                />
              </Grid>

              {calcDays() && (
                <Grid item xs={12}>
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    <strong>{calcDays()} day(s)</strong> requested
                    {selectedType && !truthy(selectedType.is_deductible)
                      ? ' — none of which come off your balance.'
                      : selectedType && selectedType.free_days_limit
                        ? ' — the free allowance is applied first; only the excess is charged.'
                        : '.'}
                  </Alert>
                </Grid>
              )}

              <Grid item xs={12}>
                <Controller
                  name="reason"
                  control={control}
                  defaultValue=""
                  render={({ field }) => (
                    <TextField {...field} fullWidth size="small" multiline rows={3}
                      label="Reason / Handover Notes" />
                  )}
                />
              </Grid>

              {/* ── Supporting documents ── */}
              <Grid item xs={12}>
                <Box
                  sx={{
                    p: 1.5, border: '1px dashed', borderRadius: 1,
                    borderColor: requiresDoc && pendingFiles.length === 0
                      ? 'error.main' : 'divider',
                  }}
                >
                  <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        Supporting Documents
                        {requiresDoc && <span style={{ color: '#d32f2f' }}> *</span>}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {requiresDoc
                          ? `${selectedType?.leave_name} cannot be submitted without proof.`
                          : 'Optional — attach anything that supports this request.'}
                      </Typography>
                    </Box>
                    <Button component="label" size="small" startIcon={<UploadFileIcon />}>
                      Choose files
                      <input
                        type="file"
                        hidden
                        multiple
                        onChange={(e) => {
                          const picked = Array.from(e.target.files || []);
                          if (picked.length) setPendingFiles((prev) => [...prev, ...picked]);
                          e.target.value = '';
                        }}
                      />
                    </Button>
                  </Box>

                  {pendingFiles.length > 0 && (
                    <Stack spacing={0.5} mt={1}>
                      {pendingFiles.map((f, i) => (
                        <Box key={`${f.name}-${i}`} display="flex" alignItems="center" gap={1}>
                          <AttachIcon fontSize="small" color="action" />
                          <Typography variant="body2" flex={1} noWrap>{f.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {fileSize(f.size)}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                    </Stack>
                  )}

                  {requiresDoc && pendingFiles.length === 0 && (
                    <Typography variant="caption" color="error.main" display="block" mt={1}>
                      At least one document is required for this leave type.
                    </Typography>
                  )}
                </Box>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={requiresDoc && pendingFiles.length === 0}
            >
              Submit Request
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ─────────────────────── Approval Dialog ────────────────────────────── */}
      <Dialog
        open={approvalDialog.open}
        onClose={() => setApprovalDialog({ open: false, request: null, approve: true })}
        maxWidth="sm" fullWidth
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>
            {approvalDialog.approve ? 'Approve Leave Request' : 'Reject Leave Request'}
          </Typography>
          {approvalDialog.request && (
            <Typography variant="caption" color="text.secondary">
              {approvalDialog.request.employee_name} — {approvalDialog.request.leave_type_name},{' '}
              {fmt(approvalDialog.request.start_date)} to {fmt(approvalDialog.request.end_date)}
            </Typography>
          )}
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {approvalDialog.request && (
            <>
              <Typography variant="subtitle2" fontWeight={700} mb={1}>
                {approvalDialog.approve ? 'Effect of approving' : 'Current balance position'}
              </Typography>
              <BalanceImpact request={approvalDialog.request} />

              {!approvalDialog.approve && (
                <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }}>
                  Rejecting changes nothing — days are only ever deducted when a
                  request is approved.
                </Alert>
              )}

              {approvalDialog.request.employee_id && (
                <Box mt={2}>
                  <Typography variant="subtitle2" fontWeight={700} mb={1}
                    display="flex" alignItems="center" gap={0.75}>
                    <HistoryIcon fontSize="small" /> How their leave built up
                  </Typography>
                  <AccrualStatement employeeId={Number(approvalDialog.request.employee_id)} dense />
                </Box>
              )}

              <TextField
                fullWidth multiline rows={3} size="small" sx={{ mt: 2 }}
                label={approvalDialog.approve ? 'Comments (optional)' : 'Reason for rejection (required)'}
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                required={!approvalDialog.approve}
              />
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                This decision is written to the audit trail with the balance either side.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovalDialog({ open: false, request: null, approve: true })}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={approvalDialog.approve ? 'success' : 'error'}
            onClick={handleApproval}
            disabled={approvalLoading}
            startIcon={approvalLoading ? <CircularProgress size={16} /> : undefined}
          >
            {approvalDialog.approve ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═════════════════ Edit / Resubmit dialog ═════════════════ */}
      <Dialog open={!!editReq} onClose={() => setEditReq(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>
            {editReq?.status === 'REJECTED' ? 'Resubmit Leave Request' : 'Edit Leave Request'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {editReq && `LV-${String(editReq.id).padStart(5, '0')} — `}
            {editReq?.status === 'REJECTED'
              ? 'Correct the request and send it back for approval.'
              : 'Changes return the request to the approver for a fresh decision.'}
          </Typography>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {editReq?.status === 'REJECTED' && editReq?.rejection_reason && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <strong>Rejected:</strong> {editReq.rejection_reason}
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                select fullWidth size="small" label="Leave Type"
                value={editForm.leave_type_id}
                onChange={(e) => setEditForm((f) => ({ ...f, leave_type_id: Number(e.target.value) }))}
              >
                {leaveTypes.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.leave_name}
                    {truthy((t as any).is_deductible) ? '' : ' (no days deducted)'}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={6}>
              <TextField
                type="date" fullWidth size="small" label="First Day of Leave"
                InputLabelProps={{ shrink: true }}
                value={editForm.start_date}
                onChange={(e) => setEditForm((f) => ({
                  ...f,
                  start_date: e.target.value,
                  end_date: f.end_date && e.target.value
                            && new Date(f.end_date) < new Date(e.target.value)
                              ? '' : f.end_date,
                }))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                type="date" fullWidth size="small" label="Last Day of Leave"
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: editForm.start_date || undefined }}
                value={editForm.end_date}
                onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))}
                error={!!editForm.end_date && !!editForm.start_date
                       && new Date(editForm.end_date) < new Date(editForm.start_date)}
                helperText="Must be on or after the first day"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth size="small" multiline rows={2} label="Reason / Handover Notes"
                value={editForm.reason}
                onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth size="small" label="Note for the approver (optional)"
                placeholder="e.g. Shortened by two days as requested"
                value={editForm.change_note}
                onChange={(e) => setEditForm((f) => ({ ...f, change_note: e.target.value }))}
              />
            </Grid>

            {/* Existing documents stay attached; anything added here is appended. */}
            {editReq && (
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  DOCUMENTS ALREADY ATTACHED
                </Typography>
                <Box mt={0.5}>
                  <AttachmentList leaveId={editReq.id} canEdit refreshKey={editFiles.length} />
                </Box>
              </Grid>
            )}

            <Grid item xs={12}>
              <Box sx={{ p: 1.5, border: '1px dashed', borderRadius: 1, borderColor: 'divider' }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                  <Typography variant="body2" fontWeight={600}>
                    Add more documents
                    {editNeedsDoc && <span style={{ color: '#d32f2f' }}> *</span>}
                  </Typography>
                  <Button component="label" size="small" startIcon={<UploadFileIcon />}>
                    Choose files
                    <input
                      type="file" hidden multiple
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        if (picked.length) setEditFiles((prev) => [...prev, ...picked]);
                        e.target.value = '';
                      }}
                    />
                  </Button>
                </Box>
                {editFiles.length > 0 && (
                  <Stack spacing={0.5} mt={1}>
                    {editFiles.map((f, i) => (
                      <Box key={`${f.name}-${i}`} display="flex" alignItems="center" gap={1}>
                        <AttachIcon fontSize="small" color="action" />
                        <Typography variant="body2" flex={1} noWrap>{f.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{fileSize(f.size)}</Typography>
                        <IconButton size="small"
                          onClick={() => setEditFiles((prev) => prev.filter((_, j) => j !== i))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                )}
                {editNeedsDoc && (
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    {editType?.leave_name} requires a supporting document — one already
                    attached is enough.
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditReq(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitEdit}
            disabled={
              editSaving
              || !editForm.start_date || !editForm.end_date
              || new Date(editForm.end_date) < new Date(editForm.start_date)
            }
            startIcon={editSaving ? <CircularProgress size={16} /> : undefined}
          >
            {editReq?.status === 'REJECTED' ? 'Resubmit' : 'Save & Send for Approval'}
          </Button>
        </DialogActions>
      </Dialog>

      <DetailDialog
        request={detailReq}
        onClose={() => setDetailReq(null)}
        canEditDocs={
          // Filing evidence is not editing the request: the HR Office keeps the
          // personnel file (a certificate often arrives after the leave), while
          // the employee attaches to their own request until it is decided.
          !!detailReq && (
            isHrOffice
            || (['PENDING', 'REJECTED'].includes(detailReq.status)
                && Number(detailReq.employee_user_id) === Number(user?.id))
          )
        }
        showAccruals={isOversight}
      />
    </Box>
  );
};

export default LeaveManagementPage;
