/**
 * Workflow v2 pieces of the purchase request page: a purchase request runs one
 * approval chain and ends in a float requisition. Finance approves it (which
 * reserves the funds for 10 working days), then records the payments — each
 * with its amount, how it was paid (and the bank, for a bank payment) and the
 * proof of payment. Kept apart from PurchaseRequestDetail so that page only
 * wires them in.
 */

import React, { useState } from 'react';
import {
  Alert, AlertTitle, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, Grid, LinearProgress, Paper, Radio, RadioGroup,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography
} from '@mui/material';
import {
  Payments as PaymentsIcon, CloudUpload as UploadIcon, OpenInNew as OpenIcon, AddCircleOutline as AddIcon,
  AccountBalance as BankIcon, LocalAtm as CashIcon, PhoneAndroid as MobileIcon, Lock as LockIcon,
  AttachFile as AttachIcon, Schedule as ClockIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { BudgetReservation, PopObligations, ProcPaymentBatch, ProcRequest } from '../../types';
import { addProofOfPayments, recordPaymentBatch, reversePaymentBatch, ReturnTo, ProofOfPayment } from '../../services/procurementService';
import { formatDate } from '../../utils/datetime';

const money = (v: number | string | null | undefined) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const today = () => new Date().toISOString().slice(0, 10);

/** Working days (Mon–Fri) from now until `date`; negative once it has passed. */
const workingDaysLeft = (date?: string | null) => {
  if (!date) return null;
  const end = new Date(date);
  const d = new Date();
  if (end < d) return -1;
  let n = 0;
  d.setHours(0, 0, 0, 0);
  const stop = new Date(end); stop.setHours(0, 0, 0, 0);
  while (d < stop) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return n;
};

// ── Who amends a request sent back after the Committee ──────────────────────

export const ReturnToSelector: React.FC<{
  value: ReturnTo | null;
  onChange: (v: ReturnTo) => void;
}> = ({ value, onChange }) => (
  <Box sx={{ mb: 2, mt: 1 }}>
    <Typography variant="subtitle2" gutterBottom>Who should amend this request? *</Typography>
    <RadioGroup value={value || ''} onChange={e => onChange(e.target.value as ReturnTo)}>
      <FormControlLabel
        value="PROCUREMENT" control={<Radio size="small" />}
        label={<span><strong>Procurement team</strong> — the quotations, supplier or award need changing</span>}
      />
      <FormControlLabel
        value="REQUESTER" control={<Radio size="small" />}
        label={<span><strong>The requester</strong> — the request itself needs changing (justification, budget lines, documents)</span>}
      />
    </RadioGroup>
    <Typography variant="caption" color="text.secondary">
      Once amended and resubmitted, the request comes straight back to this stage.
    </Typography>
  </Box>
);

// ── What the award changed, for the department confirming it ───────────────

export const AwardComparison: React.FC<{ request: ProcRequest }> = ({ request }) => {
  const c = request.award_comparison;
  if (!c) return null;
  return (
    <Alert severity={c.has_changes ? 'warning' : 'success'} sx={{ mb: 2 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {c.has_changes ? 'The award differs from what was requested' : 'No changes from the original request'}
      </Typography>
      <Typography variant="body2">
        Requested (estimated) {money(c.estimated_total)} · Awarded {money(c.awarded_total)}
      </Typography>
      {c.has_changes && (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          {c.changes.map((line, i) => <li key={i}><Typography variant="body2">{line}</Typography></li>)}
        </Box>
      )}
      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
        {c.has_changes
          ? 'Confirm to accept these changes and send the request to Finance, or reject it and say who should amend it.'
          : 'Confirm to send the request to Finance.'}
      </Typography>
    </Alert>
  );
};

// ── One payment, as Finance enters it ──────────────────────────────────────

export type PaymentMethod = 'BANK' | 'CASH' | 'MOBILE_MONEY';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK: 'Bank transfer',
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile money'
};

const COMMON_BANKS = [
  'CBZ Bank', 'Stanbic Bank', 'FBC Bank', 'CABS', 'Steward Bank', 'NMB Bank', 'ZB Bank',
  'First Capital Bank', 'Ecobank', 'BancABC', 'Nedbank', 'POSB', 'Agribank', 'Metbank'
];

export const paymentMethodText = (b: Pick<ProcPaymentBatch, 'payment_method' | 'bank_name'>) =>
  b.payment_method
    ? `${PAYMENT_METHOD_LABELS[b.payment_method as PaymentMethod] || b.payment_method}${b.payment_method === 'BANK' && b.bank_name ? ` — ${b.bank_name}` : ''}`
    : '—';

export interface PaymentInput {
  amount: string;
  date: string;
  reference: string;
  method: PaymentMethod | '';
  bank: string;
}

export const emptyPayment = (amount?: number): PaymentInput => ({
  amount: amount ? amount.toFixed(2) : '', date: today(), reference: '', method: '', bank: ''
});

/** The problem with a payment as entered, or null when it can be submitted. */
export const paymentError = (p: PaymentInput, outstanding: number): string | null => {
  const amount = parseFloat(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter the amount paid';
  if (Math.round(amount * 100) > Math.round(outstanding * 100)) {
    return `The payment cannot be more than the ${money(outstanding)} still to be paid`;
  }
  if (!p.method) return 'Choose how the payment was made';
  if (p.method === 'BANK' && !p.bank.trim()) return 'Enter the bank the payment was made from';
  return null;
};

export const appendPayment = (fd: FormData, p: PaymentInput) => {
  fd.append('amount', p.amount);
  fd.append('payment_date', p.date);
  fd.append('payment_method', p.method);
  if (p.method === 'BANK') fd.append('bank_name', p.bank.trim());
  if (p.reference.trim()) fd.append('payment_reference', p.reference.trim());
};

export const PaymentFields: React.FC<{
  outstanding: number;
  value: PaymentInput;
  onChange: (v: PaymentInput) => void;
  knownBanks?: string[];
}> = ({ outstanding, value, onChange, knownBanks = [] }) => {
  const amount = parseFloat(value.amount);
  const amountErr = value.amount && (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) > Math.round(outstanding * 100));
  const banks = Array.from(new Set([...knownBanks, ...COMMON_BANKS]));
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth size="small" type="number" label="Amount paid *" autoFocus
          value={value.amount} onChange={e => onChange({ ...value, amount: e.target.value })}
          inputProps={{ min: 0, step: '0.01' }}
          error={Boolean(amountErr)}
          helperText={amountErr ? `Between $0.01 and ${money(outstanding)}` : `Up to ${money(outstanding)} outstanding`}
          InputProps={{
            endAdornment: (
              <Button size="small" sx={{ minWidth: 0, whiteSpace: 'nowrap' }}
                onClick={() => onChange({ ...value, amount: outstanding.toFixed(2) })}>
                Full
              </Button>
            )
          }}
        />
      </Grid>
      <Grid item xs={12} sm={6}>
        <TextField
          fullWidth size="small" type="date" label="Payment date *" InputLabelProps={{ shrink: true }}
          value={value.date} onChange={e => onChange({ ...value, date: e.target.value })}
        />
      </Grid>
      <Grid item xs={12}>
        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>How was it paid? *</Typography>
        <ToggleButtonGroup
          exclusive fullWidth size="small" color="primary" value={value.method || null}
          onChange={(_, v) => v && onChange({ ...value, method: v, bank: v === 'BANK' ? value.bank : '' })}
        >
          <ToggleButton value="BANK"><BankIcon fontSize="small" sx={{ mr: 0.75 }} />Bank transfer</ToggleButton>
          <ToggleButton value="CASH"><CashIcon fontSize="small" sx={{ mr: 0.75 }} />Cash</ToggleButton>
          <ToggleButton value="MOBILE_MONEY"><MobileIcon fontSize="small" sx={{ mr: 0.75 }} />Mobile money</ToggleButton>
        </ToggleButtonGroup>
      </Grid>
      {value.method === 'BANK' && (
        <Grid item xs={12} sm={6}>
          <Autocomplete
            freeSolo options={banks} value={value.bank}
            onChange={(_, v) => onChange({ ...value, bank: v || '' })}
            onInputChange={(_, v) => onChange({ ...value, bank: v })}
            renderInput={params => (
              <TextField {...params} size="small" label="Bank used *" error={!value.bank.trim()}
                helperText="The bank the payment was made from" />
            )}
          />
        </Grid>
      )}
      <Grid item xs={12} sm={value.method === 'BANK' ? 6 : 12}>
        <TextField
          fullWidth size="small" label="Payment reference"
          placeholder={value.method === 'MOBILE_MONEY' ? 'Transaction ID' : value.method === 'CASH' ? 'Receipt no.' : 'EFT / transfer no.'}
          value={value.reference} onChange={e => onChange({ ...value, reference: e.target.value })}
        />
      </Grid>
    </Grid>
  );
};

// ── Finance approval: what approving commits Finance to ─────────────────────

export const FinanceApprovalNotice: React.FC<{ payable: number }> = ({ payable }) => (
  <Box sx={{ mb: 2 }}>
    <Paper variant="outlined" sx={{ p: 2, mb: 2, textAlign: 'center' }}>
      <Typography variant="caption" color="text.secondary">Amount to approve for payment</Typography>
      <Typography variant="h5" fontWeight={700}>{money(payable)}</Typography>
    </Paper>
    <Stack spacing={1}>
      <Alert severity="info" icon={<LockIcon />}>
        Approving <strong>reserves {money(payable)}</strong> on the budget lines for <strong>10 working days</strong>.
        Nobody else can request or approve against it in that time. Each payment is deducted from the budget as it is recorded.
      </Alert>
      <Alert severity="warning" icon={<ClockIcon />}>
        You must attach the <strong>proof of payment within 5 working days</strong>. Until you do, you will not be able to
        approve any other purchase request once that deadline passes. If nothing is paid within 10 working days the request
        is rejected automatically and the funds released.
      </Alert>
    </Stack>
    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
      Approving also approves the float requisition generated for this purchase request. No reconciliation is needed —
      the supplier is paid the exact amount.
    </Typography>
  </Box>
);

// ── Reservation / proof-of-payment status ──────────────────────────────────

export const ReservationNotice: React.FC<{
  reservation?: BudgetReservation | null;
  /** 'dispatch' for a float, 'payment' for a purchase request. */
  until?: 'dispatch' | 'payment';
}> = ({ reservation, until = 'payment' }) => {
  if (!reservation) return null;
  const r = reservation;
  if (r.status === 'ACTIVE') {
    const left = workingDaysLeft(r.expires_at);
    return (
      <Alert severity={left !== null && left <= 2 ? 'warning' : 'info'} icon={<LockIcon />} sx={{ mb: 3 }}>
        <AlertTitle sx={{ mb: 0.25 }}>Funds reserved: {money(r.amount)}</AlertTitle>
        {r.expires_at ? (
          <>
            Held on {r.lines.map(l => l.budget_code).join(', ')} until <strong>{formatDate(r.expires_at)}</strong>
            {left !== null && left >= 0 && <> ({left} working day{left === 1 ? '' : 's'} left)</>}.
            {' '}{until === 'dispatch'
              ? 'Dispatch it before then — otherwise it is rejected automatically and the funds released.'
              : 'Record the payment before then — otherwise it is rejected automatically and the funds released.'}
          </>
        ) : (
          <>The amount still to be paid is held on {r.lines.map(l => l.budget_code).join(', ')} until it is paid.</>
        )}
      </Alert>
    );
  }
  if (r.status === 'EXPIRED') {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        The {money(r.amount)} reservation expired on {formatDate(r.closed_at || r.expires_at || '')} — the request was not
        {until === 'dispatch' ? ' dispatched' : ' paid'} within {r.window_working_days} working days, so it was rejected
        automatically and the funds released.
      </Alert>
    );
  }
  return null;
};

export const PopDeadlineNotice: React.FC<{ request: ProcRequest }> = ({ request }) => {
  if (!request.pop_pending || !request.pop_due_at) return null;
  const who = request.final_finance_approver_name || 'the approver';
  const left = workingDaysLeft(request.pop_due_at);
  return request.pop_overdue ? (
    <Alert severity="error" icon={<ClockIcon />} sx={{ mb: 3 }}>
      <AlertTitle sx={{ mb: 0.25 }}>Proof of payment overdue</AlertTitle>
      It was due on <strong>{formatDate(request.pop_due_at)}</strong>, {request.pop_deadline_working_days || 5} working days
      after {who} approved it. {who} cannot approve other purchase requests until a payment with its proof of payment is recorded.
    </Alert>
  ) : (
    <Alert severity="warning" icon={<ClockIcon />} sx={{ mb: 3 }}>
      Approved by {who}. Proof of payment due by <strong>{formatDate(request.pop_due_at)}</strong>
      {left !== null && left >= 0 && <> ({left} working day{left === 1 ? '' : 's'} left)</>}.
    </Alert>
  );
};

/** Shown to a Finance user whose overdue proof of payment blocks their approvals. */
export const PopObligationsAlert: React.FC<{ obligations?: PopObligations | null; currentId?: number }> = ({ obligations, currentId }) => {
  const navigate = useNavigate();
  if (!obligations) return null;
  const overdue = obligations.overdue.filter(o => o.id !== currentId);
  if (!obligations.blocked && !obligations.due.length) return null;
  const list = (rows: PopObligations['overdue']) => (
    <Box display="flex" gap={0.75} flexWrap="wrap" mt={0.75}>
      {rows.map(o => (
        <Chip key={o.id} size="small" clickable variant="outlined" color={obligations.blocked ? 'error' : 'warning'}
          label={`${o.request_code} · due ${formatDate(o.pop_due_at)}`}
          onClick={() => navigate(`/procurement/requests/${o.id}`)} />
      ))}
    </Box>
  );
  if (obligations.blocked) {
    return (
      <Alert severity="error" icon={<LockIcon />} sx={{ mb: 3 }}>
        <AlertTitle sx={{ mb: 0.25 }}>You cannot approve purchase requests</AlertTitle>
        The proof of payment is overdue on {obligations.overdue.length} request{obligations.overdue.length === 1 ? '' : 's'} you
        approved more than {obligations.deadline_working_days} working days ago. Record the payment
        {obligations.overdue.length === 1 ? '' : 's'} with the proof of payment to approve again.
        {list(overdue.length ? overdue : obligations.overdue)}
      </Alert>
    );
  }
  return (
    <Alert severity="info" icon={<ClockIcon />} sx={{ mb: 3 }}>
      Proof of payment due on {obligations.due.length} request{obligations.due.length === 1 ? '' : 's'} you approved —
      attach {obligations.due.length === 1 ? 'it' : 'them'} within {obligations.deadline_working_days} working days of approval to keep approving.
      {list(obligations.due)}
    </Alert>
  );
};

// ── Budget impact ───────────────────────────────────────────────────────────

/** True when any budget line cannot cover what this request still needs. */
export const fundsShort = (request?: ProcRequest | null) =>
  Boolean(request?.budget_impact?.some(l => !l.sufficient));

export const BudgetImpactPanel: React.FC<{ request: ProcRequest; compact?: boolean }> = ({ request, compact = false }) => {
  const lines = request.budget_impact || [];
  if (!lines.length) return null;
  const short = lines.filter(l => !l.sufficient);
  const anyPaid = lines.some(l => l.already_paid > 0);
  const anyHeld = lines.some(l => Number(l.reserved_by_others || 0) > 0);
  const ownHold = request.reservation?.status === 'ACTIVE';

  const header = (
    <>
      <Typography variant="h6" gutterBottom>Budget Impact</Typography>
      <Divider sx={{ mb: 2 }} />
      {short.length > 0 ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          <strong>Insufficient funds</strong> on {short.map(l => l.budget_code).join(', ')}. Nobody can approve this
          request until Finance tops up {short.length === 1 ? 'that budget line' : 'those budget lines'}.
        </Alert>
      ) : (
        <Alert severity="success" sx={{ mb: 2 }}>
          {ownHold ? 'The funds for this request are reserved on its budget lines.' : 'The budget lines have enough funds for this request.'}
        </Alert>
      )}
    </>
  );

  if (compact) {
    return (
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        {header}
        <Stack spacing={1.5} divider={<Divider flexItem />}>
          {lines.map(l => (
            <Box key={l.budget_line_id}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{l.budget_code}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" noWrap>{l.budget_name}</Typography>
                </Box>
                <Chip size="small" label={l.sufficient ? 'OK' : `Short ${money(l.still_needed - l.balance)}`}
                  color={l.sufficient ? 'success' : 'error'} variant={l.sufficient ? 'outlined' : 'filled'} />
              </Box>
              <Grid container spacing={0.5} sx={{ mt: 0.5 }}>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Available</Typography></Grid>
                <Grid item xs={6} textAlign="right"><Typography variant="caption">{money(l.balance)}</Typography></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">This request</Typography></Grid>
                <Grid item xs={6} textAlign="right"><Typography variant="caption">{money(l.request_amount)}</Typography></Grid>
                {l.already_paid > 0 && (<>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Already paid</Typography></Grid>
                  <Grid item xs={6} textAlign="right"><Typography variant="caption">{money(l.already_paid)}</Typography></Grid>
                </>)}
                {Number(l.reserved_by_others || 0) > 0 && (<>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Reserved by others</Typography></Grid>
                  <Grid item xs={6} textAlign="right"><Typography variant="caption">{money(l.reserved_by_others)}</Typography></Grid>
                </>)}
                <Grid item xs={6}><Typography variant="caption" fontWeight={700}>Balance after</Typography></Grid>
                <Grid item xs={6} textAlign="right"><Typography variant="caption" fontWeight={700}>{money(l.balance_after)}</Typography></Grid>
              </Grid>
            </Box>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
          Available leaves out money reserved for other approved requests. Uses the awarded prices once awarded, the estimates before that.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
      {header}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Budget line</TableCell>
              <TableCell align="right">Available</TableCell>
              {anyHeld && <TableCell align="right">Reserved by others</TableCell>}
              <TableCell align="right">This request</TableCell>
              {anyPaid && <TableCell align="right">Already paid</TableCell>}
              <TableCell align="right">Balance after</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map(l => (
              <TableRow key={l.budget_line_id} sx={!l.sufficient ? { bgcolor: 'rgba(211,47,47,0.06)', '& td': { color: 'error.main' } } : undefined}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{l.budget_code}</Typography>
                  <Typography variant="caption" color="text.secondary">{l.budget_name}</Typography>
                </TableCell>
                <TableCell align="right">{money(l.balance)}</TableCell>
                {anyHeld && <TableCell align="right">{money(l.reserved_by_others)}</TableCell>}
                <TableCell align="right">{money(l.request_amount)}</TableCell>
                {anyPaid && <TableCell align="right">{money(l.already_paid)}</TableCell>}
                <TableCell align="right" sx={{ fontWeight: 600 }}>{money(l.balance_after)}</TableCell>
                <TableCell>
                  <Chip size="small" label={l.sufficient ? 'Sufficient' : `Short ${money(l.still_needed - l.balance)}`}
                    color={l.sufficient ? 'success' : 'error'} variant={l.sufficient ? 'outlined' : 'filled'} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
        Available leaves out money reserved for other approved requests. Uses the awarded prices once Procurement has awarded the request, the estimates before that.
      </Typography>
    </Paper>
  );
};

// ── Payments and the linked float requisition ───────────────────────────────

export const PaymentsPanel: React.FC<{
  request: ProcRequest;
  canRecord: boolean;
  /** Finance may reverse a payment while the request is being paid or once paid. */
  canReverse?: boolean;
  onChanged: () => void;
  /** Proof-of-payment documents of the request, shown under their payment. */
  pops?: ProofOfPayment[];
  /** View / download controls for one document (the page owns the viewers). */
  renderPop?: (pop: ProofOfPayment) => React.ReactNode;
  /** Lets the page open the Add Payment dialog from its own buttons. */
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
}> = ({ request, canRecord, canReverse = false, onChanged, pops = [], renderPop, addOpen, onAddOpenChange }) => {
  const navigate = useNavigate();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = addOpen ?? ownOpen;
  const setOpen = (v: boolean) => (onAddOpenChange ? onAddOpenChange(v) : setOwnOpen(v));
  const outstanding = Number(request.outstanding_amount || 0);
  const [payment, setPayment] = useState<PaymentInput>(emptyPayment());
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [reversing, setReversing] = useState<ProcPaymentBatch | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [attachingTo, setAttachingTo] = useState<number | null>(null);

  const batches = request.payment_batches || [];
  // Before Finance approves, the amount to pay is the award.
  const payable = Number(request.payable_amount ?? request.selected_quotation_amount ?? 0);
  const paid = Number(request.paid_amount || 0);
  const float = request.float_request;
  const knownBanks = Array.from(new Set(batches.map(b => b.bank_name).filter(Boolean) as string[]));

  // Prime the dialog each time it opens: the outstanding amount, today, and
  // the method / bank of the last payment.
  const lastOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !lastOpen.current) {
      const last = [...batches].reverse().find(b => !b.reversed_at);
      setPayment({
        ...emptyPayment(outstanding),
        method: (last?.payment_method as PaymentMethod) || '',
        bank: last?.bank_name || ''
      });
      setFiles([]);
      setNotes('');
    }
    lastOpen.current = open;
  }, [open]);

  if (!float && !batches.length) return null;

  const doReverse = async () => {
    if (!reversing) return;
    if (!reverseReason.trim()) { toast.error('Give a reason for the reversal'); return; }
    setSaving(true);
    try {
      const res = await reversePaymentBatch(request.id, reversing.id, reverseReason.trim());
      toast.success(res.message || 'Payment reversed');
      setReversing(null);
      setReverseReason('');
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not reverse the payment');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const err = paymentError(payment, outstanding);
    if (err) { toast.error(err); return; }
    if (!files.length) { toast.error('Attach the proof of payment'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      appendPayment(fd, payment);
      if (notes.trim()) fd.append('notes', notes.trim());
      const res = await recordPaymentBatch(request.id, fd);
      toast.success(res.message || 'Payment recorded');
      setOpen(false);
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not record the payment');
    } finally {
      setSaving(false);
    }
  };

  const attachMore = async (batch: ProcPaymentBatch, picked: File[]) => {
    if (!picked.length) return;
    setAttachingTo(batch.id);
    try {
      await addProofOfPayments(request.id, picked, undefined, batch.id);
      toast.success(`${picked.length} document(s) added to payment #${batch.batch_no}`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not attach the document');
    } finally {
      setAttachingTo(null);
    }
  };

  const canAdd = canRecord && outstanding > 0;
  const tile = (label: string, value: React.ReactNode, color?: string) => (
    <Box sx={{ flex: 1, minWidth: 120, p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="h6" fontWeight={700} color={color}>{value}</Typography>
    </Box>
  );

  return (
    <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PaymentsIcon color="primary" /> Payments
        </Typography>
        {float && (
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">Float requisition</Typography>
            <Button size="small" endIcon={<OpenIcon fontSize="small" />} sx={{ fontWeight: 600 }}
              onClick={() => navigate(`/finance/requests/${float.id}`)}>
              {float.request_code}
            </Button>
            <Chip size="small" variant="outlined"
              color={float.status === 'RECONCILED' ? 'success' : float.status === 'APPROVED' ? 'info' : float.status === 'REJECTED' ? 'error' : 'warning'}
              label={float.status === 'RECONCILED' ? 'Paid in full' : float.status === 'APPROVED' ? 'Approved — being paid'
                : float.status === 'REJECTED' ? 'Rejected' : 'Pending Finance approval'} />
          </Box>
        )}
      </Box>
      <Divider sx={{ my: 2 }} />

      <Box display="flex" gap={1.5} flexWrap="wrap" mb={1.5}>
        {tile(request.payable_amount != null ? 'Approved for payment' : 'Awarded — awaiting Finance', money(payable))}
        {tile('Paid', money(paid), 'success.main')}
        {tile('Outstanding', money(outstanding), outstanding > 0 ? 'warning.main' : undefined)}
      </Box>
      {payable > 0 && (
        <LinearProgress variant="determinate" value={Math.min(100, (paid / payable) * 100)} sx={{ mb: 2, height: 8, borderRadius: 4 }} />
      )}

      {batches.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 1.5 }}>
          <Typography color="text.secondary" mb={canAdd ? 1.5 : 0}>
            {request.payable_amount != null ? 'No payment recorded yet.' : 'Payments are recorded once Finance approves the request.'}
          </Typography>
          {canAdd && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
              Add Payment
            </Button>
          )}
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Paid by</TableCell>
                <TableCell>Proof of payment</TableCell>
                <TableCell>Recorded by</TableCell>
                {canReverse && <TableCell align="right" />}
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.map(b => {
                const reversed = Boolean(b.reversed_at);
                const docs = pops.filter(p => Number(p.batch_id) === Number(b.id));
                return (
                  <TableRow key={b.id} sx={reversed ? { '& td': { color: 'text.disabled' } } : undefined}>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <Chip size="small" label={`#${b.batch_no}`} />
                      {reversed && <Chip size="small" color="warning" variant="outlined" label="Reversed" sx={{ ml: 0.5 }} />}
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>{formatDate(b.payment_date)}</TableCell>
                    <TableCell align="right" sx={{ verticalAlign: 'top', fontWeight: 600, ...(reversed ? { textDecoration: 'line-through' } : {}) }}>
                      {money(b.amount)}
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <Typography variant="body2">{paymentMethodText(b)}</Typography>
                      {b.payment_reference && <Typography variant="caption" color="text.secondary" display="block">Ref {b.payment_reference}</Typography>}
                      {b.notes && <Typography variant="caption" color="text.secondary" display="block">{b.notes}</Typography>}
                      {reversed && (
                        <Typography variant="caption" display="block" color="warning.main">
                          Reversed {formatDate(b.reversed_at as string)} by {`${b.reversed_by_first_name || ''} ${b.reversed_by_last_name || ''}`.trim()}: {b.reversal_reason}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top', maxWidth: 260 }}>
                      <Stack spacing={0.25}>
                        {docs.length === 0 && <Typography variant="caption" color="text.disabled">{b.pop_count ? `${b.pop_count} document(s)` : '—'}</Typography>}
                        {docs.map(d => (
                          <Box key={d.id} display="flex" alignItems="center" gap={0.25} sx={{ minWidth: 0 }}>
                            <AttachIcon fontSize="inherit" color="action" />
                            <Tooltip title={d.file_name}><Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>{d.file_name}</Typography></Tooltip>
                            {renderPop?.(d)}
                          </Box>
                        ))}
                        {canRecord && !reversed && (
                          <Box>
                            <Button component="label" size="small" sx={{ p: 0, minWidth: 0, fontSize: '0.7rem' }}
                              startIcon={attachingTo === b.id ? <CircularProgress size={12} /> : <UploadIcon sx={{ fontSize: 14 }} />}
                              disabled={attachingTo === b.id}>
                              Add document
                              <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; attachMore(b, f); }} />
                            </Button>
                          </Box>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>{`${b.first_name || ''} ${b.last_name || ''}`.trim() || '—'}</TableCell>
                    {canReverse && (
                      <TableCell align="right" sx={{ verticalAlign: 'top' }}>
                        {!reversed && (
                          <Button size="small" color="warning" onClick={() => { setReverseReason(''); setReversing(b); }}>
                            Reverse
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {canAdd && batches.length > 0 && (
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mt={2}
          sx={{ p: 1.5, borderRadius: 1.5, border: '1px dashed', borderColor: 'primary.light' }}>
          <Typography variant="body2" color="text.secondary">
            <strong>{money(outstanding)}</strong> still to be paid
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
            Add Another Payment
          </Button>
        </Box>
      )}

      <Dialog open={Boolean(reversing)} onClose={() => !saving && setReversing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Reverse Payment #{reversing?.batch_no}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2, mt: 1 }}>
            {money(reversing?.amount)} goes back to the budget lines it was deducted from and is reserved again for this
            request, which reopens for payment{request.status === 'COMPLETED' ? ' (its float requisition reopens too)' : ''}.
            The payment stays on record, marked as reversed.
          </Alert>
          <TextField fullWidth multiline rows={3} label="Reason for the reversal *" value={reverseReason}
            onChange={e => setReverseReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReversing(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={doReverse} disabled={saving || !reverseReason.trim()}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}>
            Reverse Payment
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {batches.some(b => !b.reversed_at) ? 'Add Another Payment' : 'Add Payment'}
          <Typography variant="body2" color="text.secondary">
            {request.request_code} · {money(outstanding)} outstanding of {money(payable)}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <PaymentFields outstanding={outstanding} value={payment} onChange={setPayment} knownBanks={knownBanks} />
          <Box mt={2}>
            <Button variant={files.length ? 'outlined' : 'contained'} component="label" startIcon={<UploadIcon />} fullWidth
              color={files.length ? 'success' : 'primary'}>
              {files.length ? `✓ ${files.length} document${files.length === 1 ? '' : 's'} attached — add more` : 'Attach Proof of Payment (POP) *'}
              <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => {
                  const picked = Array.from(e.target.files || []);
                  setFiles(prev => [...prev, ...picked].slice(0, 10));
                  e.target.value = '';
                }} />
            </Button>
            {files.length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {files.map((f, i) => (
                  <Chip key={`${f.name}-${i}`} size="small" label={f.name}
                    onDelete={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} />
                ))}
              </Stack>
            )}
          </Box>
          <TextField fullWidth multiline rows={2} size="small" label="Notes (optional)" value={notes}
            onChange={e => setNotes(e.target.value)} sx={{ mt: 2 }} />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
            The amount is deducted from the budget lines straight away. Paying the full balance completes the request and
            closes its float requisition.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={save}
            disabled={saving || !files.length || Boolean(paymentError(payment, outstanding))}
            startIcon={saving ? <CircularProgress size={16} /> : <PaymentsIcon />}>
            Record Payment
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};
