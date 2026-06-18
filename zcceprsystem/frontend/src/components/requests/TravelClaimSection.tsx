/**
 * TravelClaimSection
 *
 * Dual-mode component:
 *   mode="edit"     – used inside RequestForm (owner creating/editing)
 *   mode="readonly" – used inside RequestDetailPage (approvers, finance desk)
 *
 * Employee details are auto-filled from the logged-in user account (not shown in edit form).
 * Meal amounts are entered manually (not checkboxes).
 * Projects and Budget Lines are loaded independently from the API.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Box, Paper, Typography, Grid, TextField, MenuItem,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  IconButton, Button, Divider, Chip, InputAdornment, Autocomplete,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  FlightTakeoff as TripIcon,
  FreeBreakfast as BreakfastIcon,
  Restaurant as LunchIcon,
  DinnerDining as DinnerIcon,
  Hotel as OvernightIcon,
  BedroomParent as AccommodationIcon,
  AccountTree as ProjectIcon,
} from '@mui/icons-material';

import {
  BudgetLine, Project,
  PerDiemClaimFormData, PerDiemTripItemFormData, PerDiemCostDistributionFormData,
  PerDiemClaim, PerDiemRates
} from '../../types';
import { useAuthStore } from '../../store/authStore';
import projectService from '../../services/projectService';

// ── Helpers ──────────────────────────────────────────────────────────────────
const DEFAULT_RATES: PerDiemRates = { breakfast: 10, lunch: 10, dinner: 10, overnight: 70, accommodation: 100 };

const blankTripItem = (): PerDiemTripItemFormData => ({
  id: uuidv4(),
  recipient_user_id: null,
  recipient_name: '',
  trip_date: '',
  return_date: '',
  from_location: '',
  to_location: '',
  departure_time: '',
  arrival_time: '',
  purpose: '',
  breakfast: false,
  lunch: false,
  dinner: false,
  overnight_stay: false,
  rate_breakfast: 0,
  rate_lunch: 0,
  rate_dinner: 0,
  rate_overnight: 0,
  rate_accommodation: 0,
  accommodation: false,
  line_total: 0,
});

const blankDistRow = (): PerDiemCostDistributionFormData => ({
  id: uuidv4(),
  account_name: '',
  account_code: '',
  partner_project: '',
  amount: 0,
});

const calcLineTotal = (item: PerDiemTripItemFormData): number =>
  (item.rate_breakfast     || 0) +
  (item.rate_lunch         || 0) +
  (item.rate_dinner        || 0) +
  (item.rate_overnight     || 0) +
  (item.rate_accommodation || 0);

const fmt = (n: number | undefined) =>
  `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Props ─────────────────────────────────────────────────────────────────────
interface EditProps {
  mode: 'edit';
  value: PerDiemClaimFormData;
  onChange: (v: PerDiemClaimFormData) => void;
  rates?: PerDiemRates;
  errors?: Record<string, string>;
  // projects/budgetLines are now loaded internally — kept for backward compat but ignored
  projects?: Project[];
  budgetLines?: BudgetLine[];
}

interface ReadonlyProps {
  mode: 'readonly';
  claim: PerDiemClaim;
}

type Props = EditProps | ReadonlyProps;

// ─────────────────────────────────────────────────────────────────────────────
const TravelClaimSection: React.FC<Props> = (props) => {

  // ── READ-ONLY MODE ──────────────────────────────────────────────────────────
  if (props.mode === 'readonly') {
    const { claim } = props;
    const isPayable = Number(claim.amount_payable) >= 0;
    return (
      <Paper elevation={2} sx={{ borderRadius: 2, overflow: 'hidden', mb: 2 }}>

        {/* ── Header ── */}
        <Box sx={{ bgcolor: 'info.dark', color: 'white', px: 2.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TripIcon fontSize="small" />
          <Typography variant="subtitle1" fontWeight={700}>Travel &amp; Subsistence Claim</Typography>
          <Chip label={`${claim.trip_items.length} trip item${claim.trip_items.length !== 1 ? 's' : ''}`}
            size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', ml: 'auto' }} />
        </Box>

        {/* ── A. Staff / Project info strip ── */}
        <Box sx={{
          px: 2.5, py: 1.25, bgcolor: 'grey.50',
          borderBottom: '1px solid', borderColor: 'grey.200',
          display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'flex-start'
        }}>
          {[
            { label: 'Staff',          val: claim.full_name },
            { label: 'Designation',    val: claim.designation || '—' },
            { label: 'Project',        val: claim.project_name ? `${claim.project_code} — ${claim.project_name}` : '—' },
            { label: 'Budget Line',    val: claim.budget_name ? `${claim.budget_code} — ${claim.budget_name}` : '—' },
            ...(claim.strategic_focus ? [{ label: 'Purpose of the visit', val: claim.strategic_focus }] : []),
          ].map(({ label, val }) => (
            <Box key={label} sx={{ minWidth: 120 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>{label}</Typography>
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>{val}</Typography>
            </Box>
          ))}
        </Box>

        {/* ── B. Trip Items table ── */}
        <Box sx={{ px: 2.5, pt: 1.5, pb: 1 }}>
          <TableContainer sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'grey.200', borderRadius: 1 }}>
            <Table size="small" sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'info.dark' }}>
                  {[
                    { h: 'Recipient',   align: 'left'  as const },
                    { h: 'Depart',      align: 'left'  as const },
                    { h: 'Return',      align: 'left'  as const },
                    { h: 'From → To',   align: 'left'  as const },
                    { h: 'Dep / Arr',   align: 'left'  as const },
                    { h: 'Purpose',     align: 'left'  as const },
                    { h: "B'fast",      align: 'right' as const },
                    { h: 'Lunch',       align: 'right' as const },
                    { h: 'Dinner',      align: 'right' as const },
                    { h: 'Out of Pkt',  align: 'right' as const },
                    { h: 'Accom.',      align: 'right' as const },
                    { h: 'Line Total',  align: 'right' as const },
                  ].map(({ h, align }) => (
                    <TableCell key={h} align={align}
                      sx={{ color: 'white', fontWeight: 700, py: 0.75, px: 1, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {claim.trip_items.map((t, i) => (
                  <TableRow key={t.id || i}
                    sx={{ '&:nth-of-type(even)': { bgcolor: 'grey.50' }, '& td': { py: 0.5, px: 1, fontSize: 12 } }}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {(t as any).recipient_display_name || t.recipient_name || claim.full_name}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {t.trip_date ? new Date(t.trip_date).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {t.return_date ? new Date(t.return_date).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {t.from_location} <span style={{ color: '#90a4ae' }}>→</span> {t.to_location}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: 11 }}>
                      {t.departure_time || '—'} / {t.arrival_time || '—'}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.purpose}
                    </TableCell>
                    <TableCell align="right">{(t.rate_breakfast     || 0) > 0 ? fmt(t.rate_breakfast)     : <span style={{ color: '#bdbdbd' }}>—</span>}</TableCell>
                    <TableCell align="right">{(t.rate_lunch         || 0) > 0 ? fmt(t.rate_lunch)         : <span style={{ color: '#bdbdbd' }}>—</span>}</TableCell>
                    <TableCell align="right">{(t.rate_dinner        || 0) > 0 ? fmt(t.rate_dinner)        : <span style={{ color: '#bdbdbd' }}>—</span>}</TableCell>
                    <TableCell align="right">{(t.rate_overnight     || 0) > 0 ? fmt(t.rate_overnight)     : <span style={{ color: '#bdbdbd' }}>—</span>}</TableCell>
                    <TableCell align="right">{(t.rate_accommodation || 0) > 0 ? fmt(t.rate_accommodation) : <span style={{ color: '#bdbdbd' }}>—</span>}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'info.dark' }}>{fmt(t.line_total)}</TableCell>
                  </TableRow>
                ))}
                {claim.trip_items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} align="center" sx={{ py: 2.5, color: 'text.secondary', fontStyle: 'italic' }}>
                      No trip items recorded
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* ── C. Financial Summary strip ── */}
        <Box sx={{
          display: 'flex', flexWrap: 'wrap',
          borderTop: '1px solid', borderColor: 'grey.200', bgcolor: 'grey.50'
        }}>
          <Box sx={{ flex: 1, minWidth: 150, px: 2.5, py: 1.25, borderRight: '1px solid', borderColor: 'grey.200' }}>
            <Typography variant="caption" color="text.secondary">Total Claimed</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>{fmt(claim.total_claimed)}</Typography>
          </Box>
          <Box sx={{ flex: 1, minWidth: 150, px: 2.5, py: 1.25, borderRight: '1px solid', borderColor: 'grey.200' }}>
            <Typography variant="caption" color="text.secondary">Less Outstanding Advance</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>{fmt(claim.less_outstanding_advance)}</Typography>
          </Box>
          <Box sx={{
            flex: 1, minWidth: 150, px: 2.5, py: 1.25,
            bgcolor: isPayable ? 'success.light' : 'warning.light',
            ...(claim.advance_reconciliation_due ? { borderRight: '1px solid', borderColor: 'grey.200' } : {})
          }}>
            <Typography variant="caption" color={isPayable ? 'success.dark' : 'warning.dark'}>
              {isPayable ? 'Amount Payable to Employee' : 'Surplus to Refund'}
            </Typography>
            <Typography variant="h6" fontWeight={700} color={isPayable ? 'success.dark' : 'warning.dark'} sx={{ lineHeight: 1.3 }}>
              {fmt(Math.abs(Number(claim.amount_payable)))}
            </Typography>
          </Box>
          {claim.advance_reconciliation_due && (
            <Box sx={{ flex: 1, minWidth: 150, px: 2.5, py: 1.25, bgcolor: 'info.light' }}>
              <Typography variant="caption" color="info.dark">Reconciliation Due</Typography>
              <Typography variant="body1" fontWeight={600} color="info.dark" sx={{ lineHeight: 1.3 }}>
                {new Date(claim.advance_reconciliation_due).toLocaleDateString()}
              </Typography>
            </Box>
          )}
        </Box>

        {/* ── D. Cost Distribution (only if present) ── */}
        {claim.cost_distribution.length > 0 && (
          <Box sx={{ px: 2.5, pt: 1.25, pb: 1.5, borderTop: '1px solid', borderColor: 'grey.200' }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
              Cost Distribution
            </Typography>
            <TableContainer sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    {['Account Name', 'Code', 'Partner / Project', 'Amount'].map(h => (
                      <TableCell key={h} sx={{ fontWeight: 700, py: 0.5, fontSize: 11 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {claim.cost_distribution.map((d, i) => (
                    <TableRow key={d.id || i}
                      sx={{ '& td': { py: 0.5, fontSize: 12 }, '&:nth-of-type(even)': { bgcolor: 'grey.50' } }}>
                      <TableCell>{d.account_name}</TableCell>
                      <TableCell>{d.account_code}</TableCell>
                      <TableCell>{d.partner_project || '—'}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{fmt(d.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

      </Paper>
    );
  }

  // ── EDIT MODE ───────────────────────────────────────────────────────────────
  const { value, onChange } = props;
  const { user } = useAuthStore();

  // Auto-fill employee details from logged-in user (always run on mount / user change)
  useEffect(() => {
    if (props.mode !== 'edit') return;
    const autoName = user
      ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
      : '';
    const autoDesig = user?.department_name || user?.role_name || 'Staff';
    if (autoName) {
      onChange({ ...value, full_name: autoName, designation: value.designation || autoDesig });
    }
  }, [user]); // eslint-disable-line

  // Load all active projects independently
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [claimBudgetLines, setClaimBudgetLines] = useState<BudgetLine[]>([]);
  const [loadingBudgetLines, setLoadingBudgetLines] = useState(false);
  const [systemUsers, setSystemUsers] = useState<{ id: number; first_name: string; last_name: string; email: string }[]>([]);

  useEffect(() => {
    if (props.mode !== 'edit') return;
    setLoadingProjects(true);
    projectService.getAllProjects({ is_active: true })
      .then(setAllProjects)
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
    // Load active users for recipient picker
    import('../../services/api').then(({ default: api }) => {
      api.get('/users/list')
        .then(res => setSystemUsers(res.data?.data || []))
        .catch(() => {});
    });
  }, []); // eslint-disable-line

  useEffect(() => {
    if (props.mode !== 'edit') return;
    if (!value.project_id) { setClaimBudgetLines([]); return; }
    setLoadingBudgetLines(true);
    projectService.getProjectBudgetLines(value.project_id, { is_active: true })
      .then(setClaimBudgetLines)
      .catch(() => {})
      .finally(() => setLoadingBudgetLines(false));
  }, [value.project_id]); // eslint-disable-line

  const setField = <K extends keyof PerDiemClaimFormData>(k: K, v: PerDiemClaimFormData[K]) =>
    onChange({ ...value, [k]: v });

  // Trip items helpers — amounts drive booleans
  const updateTripItem = useCallback((index: number, patch: Partial<PerDiemTripItemFormData>) => {
    const next = value.trip_items.map((t, i) => {
      if (i !== index) return t;
      const updated = { ...t, ...patch };
      // Derive boolean flags from amounts
      updated.breakfast      = (updated.rate_breakfast     || 0) > 0;
      updated.lunch          = (updated.rate_lunch         || 0) > 0;
      updated.dinner         = (updated.rate_dinner        || 0) > 0;
      updated.overnight_stay = (updated.rate_overnight     || 0) > 0;
      updated.accommodation  = (updated.rate_accommodation || 0) > 0;
      updated.line_total     = calcLineTotal(updated);
      return updated;
    });
    setField('trip_items', next);
  }, [value, onChange]); // eslint-disable-line

  const addTripItem = () => setField('trip_items', [...value.trip_items, blankTripItem()]);
  const removeTripItem = (i: number) => setField('trip_items', value.trip_items.filter((_, idx) => idx !== i));

  // Cost distribution helpers
  const updateDistRow = (index: number, patch: Partial<PerDiemCostDistributionFormData>) =>
    setField('cost_distribution', value.cost_distribution.map((r, i) => i === index ? { ...r, ...patch } : r));
  const addDistRow  = () => setField('cost_distribution', [...value.cost_distribution, blankDistRow()]);
  const removeDistRow = (i: number) => setField('cost_distribution', value.cost_distribution.filter((_, idx) => idx !== i));

  // Recalculate totals on every change
  const totalClaimed  = value.trip_items.reduce((s, t) => s + calcLineTotal(t), 0);
  const amountPayable = totalClaimed - (value.less_outstanding_advance || 0);

  return (
    <Paper elevation={3} sx={{ p: 0, mb: 3, borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ bgcolor: 'info.dark', color: 'white', px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <TripIcon />
        <Typography variant="h6" fontWeight={700}>Travel &amp; Subsistence Claim</Typography>
        <Chip label="Attached to this request" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
      </Box>

      <Box sx={{ p: 3 }}>
      {/* ── A. Trip / Project Info ─────────────────────────────────────── */}
      <SectionLabel icon={<ProjectIcon fontSize="small" />}>A. Trip Assignment</SectionLabel>
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={4}>
          <Autocomplete
            options={allProjects}
            loading={loadingProjects}
            getOptionLabel={p => `${p.project_code} — ${p.project_name}`}
            value={allProjects.find(p => p.id === value.project_id) || null}
            onChange={(_, v) => setField('project_id', v ? v.id : null)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={params => (
              <TextField {...params} label="Project" placeholder="Search project..."
                InputProps={{ ...params.InputProps, endAdornment: <>{loadingProjects && <CircularProgress size={16} />}{params.InputProps.endAdornment}</> }} />
            )}
            noOptionsText="No active projects found"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            fullWidth label="Purpose of the visit"
            value={value.strategic_focus ?? ''}
            onChange={e => setField('strategic_focus', e.target.value)}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <Autocomplete
            options={claimBudgetLines}
            loading={loadingBudgetLines}
            disabled={!value.project_id}
            getOptionLabel={bl => `${bl.budget_code} — ${bl.budget_name}`}
            value={claimBudgetLines.find(bl => bl.id === value.budget_line_id) || null}
            onChange={(_, v) => setField('budget_line_id', v ? v.id : null)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={params => (
              <TextField {...params} label="Budget Line"
                placeholder={value.project_id ? 'Search budget line...' : 'Select a project first'}
                InputProps={{ ...params.InputProps, endAdornment: <>{loadingBudgetLines && <CircularProgress size={16} />}{params.InputProps.endAdornment}</> }} />
            )}
            noOptionsText="No active budget lines for this project"
          />
        </Grid>
      </Grid>
      <Divider sx={{ mb: 3 }} />

      {/* ── B. Trip Items ───────────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <SectionLabel>B. Trip Items</SectionLabel>
        <Button size="small" variant="contained" color="info" startIcon={<AddIcon />} onClick={addTripItem}>
          Add Row
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary" display="block" mb={2}>
        One row per traveller. Each row may target a different employee — pick the recipient, set the depart and expected return dates, then enter the amounts (leave $0 if not applicable).
      </Typography>

      <TableContainer sx={{ mb: 2, overflowX: 'auto', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
        <Table size="small" sx={{ minWidth: 1300 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: 'info.dark' }}>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 200 }}>Recipient *</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 130 }}>Depart Date *</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 130 }}>Expected Return *</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 120 }}>From *</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 120 }}>To *</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 90 }}>Depart</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 90 }}>Arrive</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 180 }}>Purpose *</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 95, textAlign: 'center' }}>
                <Box display="flex" flexDirection="column" alignItems="center"><BreakfastIcon fontSize="small" /><span>B'fast ($)</span></Box>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 85, textAlign: 'center' }}>
                <Box display="flex" flexDirection="column" alignItems="center"><LunchIcon fontSize="small" /><span>Lunch ($)</span></Box>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 85, textAlign: 'center' }}>
                <Box display="flex" flexDirection="column" alignItems="center"><DinnerIcon fontSize="small" /><span>Dinner ($)</span></Box>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 110, textAlign: 'center' }}>
                <Box display="flex" flexDirection="column" alignItems="center"><OvernightIcon fontSize="small" /><span>Out of Pocket ($)</span></Box>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 120, textAlign: 'center' }}>
                <Box display="flex" flexDirection="column" alignItems="center"><AccommodationIcon fontSize="small" /><span>Accommodation ($)</span></Box>
              </TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'white', minWidth: 90, textAlign: 'right' }}>Line Total</TableCell>
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {value.trip_items.map((item, idx) => {
              const lineTotal = calcLineTotal(item);
              const selectedUser = systemUsers.find(u => u.id === item.recipient_user_id) || null;
              return (
                <TableRow key={item.id || idx}
                  sx={{ '& td': { py: 0.75, px: 1 }, '&:nth-of-type(even)': { bgcolor: 'grey.50' } }}>
                  <TableCell>
                    <Autocomplete
                      freeSolo
                      size="small"
                      options={systemUsers}
                      getOptionLabel={u => typeof u === 'string' ? u : `${u.first_name} ${u.last_name}`.trim() || u.email}
                      value={selectedUser || item.recipient_name || ''}
                      onChange={(_, v) => updateTripItem(idx, {
                        recipient_user_id: v && typeof v === 'object' ? v.id : null,
                        recipient_name: v
                          ? (typeof v === 'object' ? `${v.first_name} ${v.last_name}`.trim() : v)
                          : ''
                      })}
                      onInputChange={(_, inputVal, reason) => {
                        if (reason === 'input') {
                          updateTripItem(idx, {
                            recipient_user_id: null,
                            recipient_name: inputVal
                          });
                        }
                      }}
                      isOptionEqualToValue={(a, b) =>
                        typeof a !== 'string' && typeof b !== 'string' ? a.id === b.id : a === b
                      }
                      renderInput={params => (
                        <TextField {...params} placeholder="Type name or pick employee"
                          inputProps={{ ...params.inputProps, style: { fontSize: 12 } }} />
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField type="date" size="small" fullWidth value={item.trip_date}
                      onChange={e => updateTripItem(idx, { trip_date: e.target.value })}
                      inputProps={{ style: { fontSize: 12 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField type="date" size="small" fullWidth value={item.return_date || ''}
                      onChange={e => updateTripItem(idx, { return_date: e.target.value })}
                      inputProps={{ style: { fontSize: 12 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" fullWidth placeholder="From" value={item.from_location}
                      onChange={e => updateTripItem(idx, { from_location: e.target.value })}
                      inputProps={{ style: { fontSize: 12 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" fullWidth placeholder="To" value={item.to_location}
                      onChange={e => updateTripItem(idx, { to_location: e.target.value })}
                      inputProps={{ style: { fontSize: 12 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField type="time" size="small" value={item.departure_time}
                      onChange={e => updateTripItem(idx, { departure_time: e.target.value })}
                      inputProps={{ style: { fontSize: 12 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField type="time" size="small" value={item.arrival_time}
                      onChange={e => updateTripItem(idx, { arrival_time: e.target.value })}
                      inputProps={{ style: { fontSize: 12 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" fullWidth placeholder="Purpose"
                      value={item.purpose}
                      onChange={e => updateTripItem(idx, { purpose: e.target.value })}
                      inputProps={{ style: { fontSize: 12 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={item.rate_breakfast ?? 0}
                      onChange={e => updateTripItem(idx, { rate_breakfast: parseFloat(e.target.value) || 0 })}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                      inputProps={{ min: 0, step: 0.5, style: { textAlign: 'right', width: 60 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={item.rate_lunch ?? 0}
                      onChange={e => updateTripItem(idx, { rate_lunch: parseFloat(e.target.value) || 0 })}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                      inputProps={{ min: 0, step: 0.5, style: { textAlign: 'right', width: 60 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={item.rate_dinner ?? 0}
                      onChange={e => updateTripItem(idx, { rate_dinner: parseFloat(e.target.value) || 0 })}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                      inputProps={{ min: 0, step: 0.5, style: { textAlign: 'right', width: 60 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={item.rate_overnight ?? 0}
                      onChange={e => updateTripItem(idx, { rate_overnight: parseFloat(e.target.value) || 0 })}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                      inputProps={{ min: 0, step: 0.5, style: { textAlign: 'right', width: 60 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={item.rate_accommodation ?? 0}
                      onChange={e => updateTripItem(idx, { rate_accommodation: parseFloat(e.target.value) || 0 })}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                      inputProps={{ min: 0, step: 0.5, style: { textAlign: 'right', width: 70 } }} />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={700} color="info.dark" sx={{ whiteSpace: 'nowrap' }}>
                      ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => removeTripItem(idx)} color="error">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {value.trip_items.length === 0 && (
              <TableRow>
                    <TableCell colSpan={15} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No trip rows yet — click <strong>Add Row</strong> above.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Divider sx={{ mb: 3 }} />

      {/* ── C. Totals ────────────────────────────────────────────────────── */}
      <SectionLabel>C. Financial Totals</SectionLabel>
      <Grid container spacing={2} mb={3} alignItems="stretch">

        {/* Card 1 — Total Claimed */}
        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Box sx={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            p: 2.5, borderRadius: 2,
            bgcolor: 'grey.50',
            border: '1px solid', borderColor: 'grey.300',
          }}>
            <Box display="flex" alignItems="center" gap={1} mb={1.5}>
              <Box sx={{ width: 6, height: 32, borderRadius: 1, bgcolor: 'info.main' }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.8}>
                Total Claimed
              </Typography>
            </Box>
            <Typography variant="caption" color="text.disabled" display="block" mb={0.5}>
              Auto-calculated from trip rows
            </Typography>
            <Typography variant="h4" fontWeight={800} color="info.dark" lineHeight={1}>
              {fmt(totalClaimed)}
            </Typography>
          </Box>
        </Grid>

        {/* Card 2 — Advance Input */}
        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Box sx={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            p: 2.5, borderRadius: 2,
            bgcolor: 'grey.50',
            border: '1px solid', borderColor: 'grey.300',
          }}>
            <Box display="flex" alignItems="center" gap={1} mb={1.5}>
              <Box sx={{ width: 6, height: 32, borderRadius: 1, bgcolor: 'warning.main' }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.8}>
                Less Outstanding Advance
              </Typography>
            </Box>
            <TextField
              fullWidth
              type="number"
              size="small"
              placeholder="0.00"
              inputProps={{ min: 0, step: 0.01 }}
              value={value.less_outstanding_advance || ''}
              onChange={e => setField('less_outstanding_advance', parseFloat(e.target.value) || 0)}
              helperText="Any advance already received for this trip"
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              sx={{ '& .MuiInputBase-input': { fontWeight: 700, fontSize: '1.1rem' } }}
            />
          </Box>
        </Grid>

        {/* Card 3 — Payable / Refund */}
        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Box sx={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            p: 2.5, borderRadius: 2,
            bgcolor: amountPayable < 0 ? 'warning.50' : '#f0fdf4',
            border: '2px solid',
            borderColor: amountPayable < 0 ? 'warning.main' : 'success.main',
          }}>
            <Box display="flex" alignItems="center" gap={1} mb={1.5}>
              <Box sx={{ width: 6, height: 32, borderRadius: 1, bgcolor: amountPayable < 0 ? 'warning.main' : 'success.main' }} />
              <Typography variant="caption" fontWeight={600} textTransform="uppercase" letterSpacing={0.8}
                color={amountPayable < 0 ? 'warning.dark' : 'success.dark'}>
                {amountPayable >= 0 ? 'Amount Payable to Employee' : 'Surplus — Employee to Refund'}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.disabled" display="block" mb={0.5}>
              Total Claimed − Outstanding Advance
            </Typography>
            <Typography variant="h4" fontWeight={800} lineHeight={1}
              color={amountPayable < 0 ? 'warning.dark' : 'success.dark'}>
              {fmt(Math.abs(amountPayable))}
            </Typography>
          </Box>
        </Grid>

      </Grid>
      <Divider sx={{ mb: 3 }} />

      {/* ── D. Cost Distribution ─────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <SectionLabel>D. Cost Distribution (optional)</SectionLabel>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addDistRow}>Add Row</Button>
      </Box>

      {value.cost_distribution.length > 0 ? (
        <TableContainer sx={{ mb: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell sx={{ fontWeight: 700 }}>Account Name *</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Account Code *</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Amount *</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Partner / Project</TableCell>
                <TableCell sx={{ width: 40 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {value.cost_distribution.map((row, idx) => (
                <TableRow key={row.id || idx} sx={{ '&:nth-of-type(even)': { bgcolor: 'grey.50' } }}>
                  <TableCell>
                    <TextField size="small" fullWidth value={row.account_name}
                      onChange={e => updateDistRow(idx, { account_name: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" fullWidth value={row.account_code}
                      onChange={e => updateDistRow(idx, { account_code: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={row.amount}
                      onChange={e => updateDistRow(idx, { amount: parseFloat(e.target.value) || 0 })}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                      inputProps={{ min: 0, step: 0.01, style: { width: 90 } }} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" fullWidth value={row.partner_project ?? ''}
                      onChange={e => updateDistRow(idx, { partner_project: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => removeDistRow(idx)} color="error">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
          No cost distribution rows. Click "Add Row" if costs need to be split across accounts.
        </Typography>
      )}
      </Box>
    </Paper>
  );
};

// ── Small helpers ─────────────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode; icon?: React.ReactNode }> = ({ children, icon }) => (
  <Box display="flex" alignItems="center" gap={0.75} mb={1.5}>
    {icon}
    <Typography variant="subtitle2" sx={{ color: 'info.dark', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
      {children}
    </Typography>
  </Box>
);

const ReadField: React.FC<{ label: string; value: string; highlight?: 'success' | 'warning' | 'info' }> = ({ label, value, highlight }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="body2" fontWeight={highlight ? 700 : 500}
      color={highlight ? `${highlight}.dark` : 'text.primary'}>
      {value}
    </Typography>
  </Box>
);

export default TravelClaimSection;
