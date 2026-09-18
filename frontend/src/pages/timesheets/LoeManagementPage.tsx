/**
 * Level of Effort management.
 *
 * LOE is HR-controlled: how much of each person's time each project pays for.
 * The HR Office and the Super Admin edit it organisation-wide; a department
 * HOP/Lead sees their own department's allocations read-only, which is what
 * the brief asks for — visibility without the ability to move donor money
 * between projects.
 *
 * Percentages must total 100 for every month they cover. The month window lets
 * a mid-year change be recorded without destroying what came before.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Stack, TextField, MenuItem, CircularProgress, Grid,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Alert,
  Tooltip, Divider,
} from '@mui/material';
import {
  Edit as EditIcon, Add as AddIcon, Delete as DeleteIcon,
  ContentCopy as CopyIcon, Visibility as ViewIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { useAuthStore } from '../../store/authStore';
import {
  LoeRegisterEntry, LoeAllocation, TimesheetProject, Department,
} from '../../types';
import {
  getLoeRegister, getEmployeeLoe, saveEmployeeLoe, copyLoeYear, getTimesheetProjects,
} from '../../services/timesheetService';
import api from '../../services/api';
import { canManageLoe, hasOrgTimesheetAccess } from '../../utils/timesheetAccess';
import { MONTHS, yearOptions } from '../../components/timesheets/TimesheetStatusChip';

/** A row in the editor, before it is sent back as a complete set. */
interface EditRow {
  key: string;
  project_id: number | '';
  loe_percent: string;
  effective_from_month: number;
  effective_to_month: number;
  notes: string;
}

const toEditRow = (a: LoeAllocation, i: number): EditRow => ({
  key: `loe-${a.id || 'new'}-${i}`,
  project_id: a.project_id,
  loe_percent: String(a.loe_percent),
  effective_from_month: a.effective_from_month || 1,
  effective_to_month: a.effective_to_month || 12,
  notes: a.notes || '',
});

const LoeManagementPage: React.FC = () => {
  const { user } = useAuthStore();
  const canEdit = canManageLoe(user);
  const isOrgLevel = hasOrgTimesheetAccess(user);

  const [year, setYear] = useState(new Date().getFullYear());
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);

  const [register, setRegister] = useState<LoeRegisterEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<TimesheetProject[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<LoeRegisterEntry | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState(new Date().getFullYear());
  const [copyTo, setCopyTo] = useState(new Date().getFullYear() + 1);

  useEffect(() => {
    getTimesheetProjects().then(setProjects).catch(() => setProjects([]));
    if (isOrgLevel) {
      api.get('/departments').then((r) => setDepartments(r.data.data)).catch(() => setDepartments([]));
    }
  }, [isOrgLevel]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getLoeRegister({ year, departmentId: departmentId || undefined });
      setRegister(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load the allocation register');
    } finally {
      setLoading(false);
    }
  }, [year, departmentId]);

  useEffect(() => { load(); }, [load]);

  const openEditor = async (entry: LoeRegisterEntry) => {
    try {
      const res = await getEmployeeLoe(entry.employee_id, year);
      setRows(res.data.map(toEditRow));
      setEditing(entry);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load allocations');
    }
  };

  const addRow = () => setRows((prev) => [...prev, {
    key: `new-${Date.now()}`,
    project_id: '',
    loe_percent: '',
    effective_from_month: 1,
    effective_to_month: 12,
    notes: '',
  }]);

  const setRow = (index: number, field: keyof EditRow, value: any) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));

  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  /** Live per-month totals, so a mistake is obvious before saving. */
  const monthTotals = MONTHS.map((_, i) => {
    const m = i + 1;
    const applicable = rows.filter((r) =>
      m >= r.effective_from_month && m <= r.effective_to_month && r.project_id);
    if (applicable.length === 0) return null;
    return Math.round(applicable.reduce((s, r) => s + (parseFloat(r.loe_percent) || 0), 0) * 100) / 100;
  });
  const badMonths = monthTotals
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t !== null && Math.abs((t as number) - 100) > 0.01);

  const save = async () => {
    if (!editing) return;
    try {
      setSaving(true);
      await saveEmployeeLoe(
        editing.employee_id,
        year,
        rows.filter((r) => r.project_id).map((r) => ({
          project_id: Number(r.project_id),
          loe_percent: parseFloat(r.loe_percent) || 0,
          effective_from_month: r.effective_from_month,
          effective_to_month: r.effective_to_month,
          notes: r.notes || null,
        }))
      );
      toast.success(`Allocation saved for ${editing.employee_name}`);
      setEditing(null);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save the allocation');
    } finally {
      setSaving(false);
    }
  };

  const runCopy = async () => {
    try {
      setSaving(true);
      const res = await copyLoeYear(copyFrom, copyTo, departmentId || undefined);
      toast.success(`Copied ${res.copied} allocation set(s); ${res.skipped} skipped`);
      setCopyOpen(false);
      setYear(copyTo);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to copy allocations');
    } finally {
      setSaving(false);
    }
  };

  const visible = register.filter((e) => {
    if (onlyIncomplete && e.is_complete) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return e.employee_name.toLowerCase().includes(q)
      || (e.employee_number || '').toLowerCase().includes(q)
      || (e.department_name || '').toLowerCase().includes(q);
  });

  const allocated = register.filter((e) => e.is_complete).length;

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between"
        alignItems={{ md: 'center' }} spacing={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={600}>Level of Effort</Typography>
          <Typography variant="body2" color="text.secondary">
            How each person&apos;s time is allocated across projects
          </Typography>
        </Box>
        {canEdit && (
          <Button variant="outlined" startIcon={<CopyIcon />} onClick={() => setCopyOpen(true)}>
            Roll forward to next year
          </Button>
        )}
      </Stack>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Level of effort is set by the HR Office. You can see your department&apos;s allocations
          here; ask the HR Office to make a change.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6} sm={3} md={2}>
            <TextField select fullWidth size="small" label="Year" value={year}
              onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
          </Grid>
          {isOrgLevel && (
            <Grid item xs={12} sm={5} md={3}>
              <TextField select fullWidth size="small" label="Department" value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">All departments</MenuItem>
                {departments.map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.department_name}</MenuItem>
                ))}
              </TextField>
            </Grid>
          )}
          <Grid item xs={12} sm={4} md={3}>
            <TextField fullWidth size="small" label="Search staff" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={4} md={2}>
            <Button fullWidth size="small"
              variant={onlyIncomplete ? 'contained' : 'outlined'}
              color={onlyIncomplete ? 'warning' : 'inherit'}
              onClick={() => setOnlyIncomplete((v) => !v)}>
              Not at 100%
            </Button>
          </Grid>
          <Grid item xs={12} md={2}>
            <Typography variant="caption" color="text.secondary">
              {allocated} of {register.length} fully allocated
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Allocation</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">Nobody matches these filters.</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((e) => (
                  <TableRow key={e.employee_id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{e.employee_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {e.position_title || e.employee_number || ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{e.department_name || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      {e.allocations.length === 0 ? (
                        <Typography variant="caption" color="text.disabled">
                          No projects allocated
                        </Typography>
                      ) : (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {e.allocations.map((a) => (
                            <Tooltip key={a.id}
                              title={`${a.project_name} · ${a.partner_name || 'No partner'} · ${MONTHS[a.effective_from_month - 1]}–${MONTHS[a.effective_to_month - 1]}`}>
                              <Chip size="small" variant="outlined"
                                label={`${a.project_code} ${a.loe_percent}%`} />
                            </Tooltip>
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Chip size="small"
                        color={e.is_complete ? 'success' : e.total_percent === 0 ? 'default' : 'warning'}
                        label={`${e.total_percent.toFixed(0)}%`} />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={canEdit ? 'Edit allocation' : 'View allocation'}>
                        <IconButton size="small" onClick={() => openEditor(e)}>
                          {canEdit ? <EditIcon fontSize="small" /> : <ViewIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* ── Editor ───────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} maxWidth="lg" fullWidth>
        <DialogTitle>
          {canEdit ? 'Allocation for ' : 'Allocation — '}{editing?.employee_name} · {year}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The percentages that apply to any one month must total 100. Use the month range to record
            a change part-way through the year.
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, minWidth: 260 }}>Project</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Partner</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 110 }}>LOE %</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 130 }}>From</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 130 }}>To</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Note</TableCell>
                  {canEdit && <TableCell width={50} />}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r, i) => {
                  const project = projects.find((p) => p.id === Number(r.project_id));
                  return (
                    <TableRow key={r.key}>
                      <TableCell>
                        <TextField select fullWidth size="small" value={r.project_id}
                          disabled={!canEdit}
                          onChange={(e) => setRow(i, 'project_id', Number(e.target.value))}
                          SelectProps={{ displayEmpty: true }}>
                          <MenuItem value="" disabled>Select a project</MenuItem>
                          {projects.map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                              {p.project_code} — {p.project_name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {project?.partner_name || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <TextField size="small" value={r.loe_percent} disabled={!canEdit}
                          onChange={(e) => setRow(i, 'loe_percent', e.target.value)}
                          inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }} />
                      </TableCell>
                      <TableCell>
                        <TextField select size="small" fullWidth value={r.effective_from_month}
                          disabled={!canEdit}
                          onChange={(e) => setRow(i, 'effective_from_month', Number(e.target.value))}>
                          {MONTHS.map((m, mi) => (
                            <MenuItem key={m} value={mi + 1}>{m.slice(0, 3)}</MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField select size="small" fullWidth value={r.effective_to_month}
                          disabled={!canEdit}
                          onChange={(e) => setRow(i, 'effective_to_month', Number(e.target.value))}>
                          {MONTHS.map((m, mi) => (
                            <MenuItem key={m} value={mi + 1}>{m.slice(0, 3)}</MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField size="small" fullWidth value={r.notes} disabled={!canEdit}
                          onChange={(e) => setRow(i, 'notes', e.target.value)} />
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <IconButton size="small" onClick={() => removeRow(i)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 7 : 6} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary" variant="body2">
                        No allocation recorded for {year}.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {canEdit && (
            <Button startIcon={<AddIcon />} onClick={addRow} sx={{ mt: 1 }}>Add project</Button>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="caption" color="text.secondary">Monthly totals</Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            {MONTHS.map((m, i) => {
              const t = monthTotals[i];
              return (
                <Chip key={m} size="small"
                  label={`${m.slice(0, 3)} ${t === null ? '—' : `${t}%`}`}
                  color={t === null ? 'default'
                    : Math.abs(t - 100) < 0.01 ? 'success' : 'warning'}
                  variant={t === null ? 'outlined' : 'filled'} />
              );
            })}
          </Stack>

          {badMonths.length > 0 && canEdit && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {badMonths.map(({ t, i }) => `${MONTHS[i]} is at ${t}%`).join('; ')}. Each month that
              carries an allocation must total exactly 100% before it can be saved.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>{canEdit ? 'Cancel' : 'Close'}</Button>
          {canEdit && (
            <Button variant="contained" onClick={save} disabled={saving || badMonths.length > 0}>
              Save allocation
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Roll forward ─────────────────────────────────────────────────── */}
      <Dialog open={copyOpen} onClose={() => setCopyOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Roll allocations forward</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Copies each person&apos;s allocation into the target year. Anyone who already has an
            allocation there is left alone, so this can be run safely more than once.
          </Typography>
          <Stack spacing={2}>
            <TextField select fullWidth size="small" label="From year" value={copyFrom}
              onChange={(e) => setCopyFrom(Number(e.target.value))}>
              {yearOptions().map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
            <TextField select fullWidth size="small" label="To year" value={copyTo}
              onChange={(e) => setCopyTo(Number(e.target.value))}>
              {yearOptions().map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={runCopy} disabled={saving || copyFrom === copyTo}>
            Copy
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LoeManagementPage;
