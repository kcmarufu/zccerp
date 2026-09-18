/**
 * The monthly timesheet grid.
 *
 * Reached two ways:
 *   /timesheets/period/:year/:month — the signed-in user's own sheet, created
 *                                     on first visit
 *   /timesheets/:id                 — any sheet the caller may see, which is
 *                                     how an approver reviews one
 *
 * Rows are projects (seeded from the HR-controlled allocation), columns are the
 * days of the month. Weekends, public holidays and approved leave are shaded,
 * because no hours are expected on them — that is exactly what makes the
 * expected-hours figure smaller than "days x 8".
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Stack, TextField, MenuItem, CircularProgress, Grid,
  Tooltip, Alert, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Divider, InputAdornment, Card, CardContent,
} from '@mui/material';
import {
  Save as SaveIcon, Send as SubmitIcon, Add as AddIcon, Delete as DeleteIcon,
  Check as ApproveIcon, Close as RejectIcon, Undo as ReturnIcon,
  PictureAsPdf as PdfIcon, TableChart as ExcelIcon, ArrowBack as BackIcon,
  LockOpen as ReopenIcon, History as HistoryIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import {
  TimesheetGrid, TimesheetProject, TimesheetLine,
} from '../../types';
import {
  openMyTimesheet, getTimesheet, saveTimesheet, submitTimesheet, actOnTimesheet,
  reopenTimesheet, getTimesheetProjects, downloadTimesheetPDF, downloadTimesheetExcel,
} from '../../services/timesheetService';
import TimesheetStatusChip, { isEditableStatus, MONTHS } from '../../components/timesheets/TimesheetStatusChip';
import { formatDateTime } from '../../utils/datetime';

/** A row being edited on screen, before it is sent back to the server. */
interface EditableLine {
  key: string;
  project_id: number | null;
  activity_description: string;
  loe_percent: number;
  /** Hours keyed by ISO date, held as text so a half-typed "1." is not lost. */
  hours: Record<string, string>;
}

const toEditable = (l: TimesheetLine, index: number): EditableLine => ({
  key: `line-${l.id}-${index}`,
  project_id: l.project_id,
  activity_description: l.activity_description || '',
  loe_percent: l.loe_percent,
  hours: Object.fromEntries(
    Object.entries(l.hours_by_date).map(([d, h]) => [d, String(h)])
  ),
});

const numeric = (v: string): number => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

const Stat: React.FC<{ label: string; value: string; hint?: string; color?: string }> =
  ({ label, value, hint, color }) => (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={600} color={color}>{value}</Typography>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </CardContent>
    </Card>
  );

const TimesheetGridPage: React.FC = () => {
  const { id, year, month } = useParams();
  const navigate = useNavigate();

  const [sheet, setSheet] = useState<TimesheetGrid | null>(null);
  const [projects, setProjects] = useState<TimesheetProject[]>([]);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [actionDialog, setActionDialog] = useState<null | 'REJECT' | 'RETURN' | 'REOPEN'>(null);
  const [actionComment, setActionComment] = useState('');
  const [trailOpen, setTrailOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = id
        ? await getTimesheet(Number(id))
        : await openMyTimesheet(Number(year), Number(month));
      setSheet(data);
      setLines(data.lines.map(toEditable));
      setNotes(data.notes || '');
      setDirty(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load the timesheet');
    } finally {
      setLoading(false);
    }
  }, [id, year, month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getTimesheetProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const canEdit = Boolean(sheet?.can_edit && isEditableStatus(sheet.status));
  const days = sheet?.metrics.days || [];

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  /** Live totals, so the footer foots while the user types. */
  const totals = useMemo(() => {
    const perDay: Record<string, number> = {};
    const perLine: number[] = [];
    let grand = 0;
    lines.forEach((l, i) => {
      let lineTotal = 0;
      Object.entries(l.hours).forEach(([d, v]) => {
        const h = numeric(v);
        if (!h) return;
        perDay[d] = (perDay[d] || 0) + h;
        lineTotal += h;
      });
      perLine[i] = Math.round(lineTotal * 100) / 100;
      grand += lineTotal;
    });
    return { perDay, perLine, grand: Math.round(grand * 100) / 100 };
  }, [lines]);

  const expected = sheet?.metrics.expected_hours || 0;

  const setHours = (lineIndex: number, date: string, value: string) => {
    setLines((prev) => prev.map((l, i) =>
      (i === lineIndex ? { ...l, hours: { ...l.hours, [date]: value } } : l)));
    setDirty(true);
  };

  const setField = (lineIndex: number, field: 'project_id' | 'activity_description', value: any) => {
    setLines((prev) => prev.map((l, i) => (i === lineIndex ? { ...l, [field]: value } : l)));
    setDirty(true);
  };

  const addLine = () => {
    setLines((prev) => [...prev, {
      key: `new-${Date.now()}`,
      project_id: null,
      activity_description: '',
      loe_percent: 0,
      hours: {},
    }]);
    setDirty(true);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  /**
   * Spread the standard day across the rows in LOE proportion, on every day
   * that expects hours. It is a starting point, not the answer — the employee
   * still records what they actually worked.
   */
  const prefillFromLoe = () => {
    const dailyHours = sheet?.metrics.daily_hours || 8;
    const expectedDays = days.filter((d) => d.is_expected);
    setLines((prev) => prev.map((l) => {
      const hours: Record<string, string> = { ...l.hours };
      for (const d of expectedDays) {
        hours[d.date] = (Math.round(dailyHours * (l.loe_percent / 100) * 100) / 100).toString();
      }
      return { ...l, hours };
    }));
    setDirty(true);
    toast.info('Filled from your allocation — adjust to the hours you actually worked');
  };

  const buildPayload = () => ({
    lines: lines
      .filter((l) => l.project_id)
      .map((l) => ({
        project_id: Number(l.project_id),
        activity_description: l.activity_description,
        hours_by_date: Object.fromEntries(
          Object.entries(l.hours)
            .map(([d, v]) => [d, numeric(v)])
            .filter(([, h]) => (h as number) > 0)
        ) as Record<string, number>,
      })),
    notes,
  });

  const handleSave = async (quiet = false) => {
    if (!sheet) return null;
    try {
      setSaving(true);
      const data = await saveTimesheet(sheet.id, buildPayload());
      setSheet(data);
      setLines(data.lines.map(toEditable));
      setDirty(false);
      if (!quiet) toast.success('Timesheet saved');
      return data;
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save the timesheet');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!sheet) return;
    // Submitting an unsaved grid would send the previous version for approval.
    if (dirty && !(await handleSave(true))) return;
    try {
      setSaving(true);
      await submitTimesheet(sheet.id);
      toast.success('Timesheet submitted for approval');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to submit the timesheet');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!sheet) return;
    try {
      setSaving(true);
      await actOnTimesheet(sheet.id, 'APPROVE');
      toast.success('Timesheet approved and locked');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to approve the timesheet');
    } finally {
      setSaving(false);
    }
  };

  const handleActionSubmit = async () => {
    if (!sheet || !actionDialog) return;
    if (!actionComment.trim()) { toast.error('A reason is required'); return; }
    try {
      setSaving(true);
      if (actionDialog === 'REOPEN') await reopenTimesheet(sheet.id, actionComment.trim());
      else await actOnTimesheet(sheet.id, actionDialog, actionComment.trim());
      toast.success(
        actionDialog === 'REJECT' ? 'Timesheet rejected'
          : actionDialog === 'RETURN' ? 'Timesheet returned for amendment'
            : 'Timesheet reopened'
      );
      setActionDialog(null);
      setActionComment('');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const download = async (kind: 'pdf' | 'excel') => {
    if (!sheet) return;
    const label = `${sheet.employee_name}-${MONTHS[sheet.period_month - 1]}-${sheet.period_year}`
      .replace(/\s+/g, '-');
    try {
      if (kind === 'pdf') await downloadTimesheetPDF(sheet.id, label);
      else await downloadTimesheetExcel(sheet.id, label);
    } catch (err: any) {
      toast.error(err?.message || 'Export failed');
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>;
  }
  if (!sheet) {
    return <Alert severity="error">This timesheet could not be loaded.</Alert>;
  }

  const period = `${MONTHS[sheet.period_month - 1]} ${sheet.period_year}`;
  const completion = expected > 0 ? (totals.grand / expected) * 100 : 0;

  /** A day that expects no hours: weekend, public holiday, or approved leave. */
  const dayTint = (d: typeof days[number]) => {
    if (d.holiday_name) return 'warning.light';
    if (d.leave_type) return 'info.light';
    if (!d.is_work_day) return 'grey.200';
    return undefined;
  };

  const dayTitle = (d: typeof days[number]) => {
    if (d.holiday_name) return `Public holiday — ${d.holiday_name}`;
    if (d.leave_type) return `Approved leave — ${d.leave_type}`;
    if (!d.is_work_day) return 'Non-working day';
    return '';
  };

  return (
    <Box>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between"
        alignItems={{ md: 'center' }} spacing={2} mb={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={() => navigate(-1)} size="small"><BackIcon /></IconButton>
          <Box>
            <Typography variant="h5" fontWeight={600}>Timesheet — {period}</Typography>
            <Typography variant="body2" color="text.secondary">
              {sheet.employee_name}
              {sheet.employee_number ? ` · ${sheet.employee_number}` : ''}
              {sheet.department_name ? ` · ${sheet.department_name}` : ''}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TimesheetStatusChip status={sheet.status} size="medium" />
          <Button size="small" startIcon={<HistoryIcon />} onClick={() => setTrailOpen(true)}>
            Trail
          </Button>
          <Button size="small" startIcon={<PdfIcon />} onClick={() => download('pdf')}>PDF</Button>
          <Button size="small" startIcon={<ExcelIcon />} onClick={() => download('excel')}>Excel</Button>
        </Stack>
      </Stack>

      {/* ── Why the expected figure is what it is ────────────────────────── */}
      <Grid container spacing={1.5} mb={2}>
        <Grid item xs={6} sm={4} md={2}>
          <Stat label="Working days" value={String(sheet.metrics.working_days)}
            hint={`${sheet.metrics.daily_hours}h standard day`} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Stat label="Holidays" value={String(sheet.metrics.holiday_days)} hint="deducted" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Stat label="Approved leave" value={String(sheet.metrics.leave_days)} hint="deducted" />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Stat label="Expected hours" value={expected.toFixed(1)}
            hint={`${sheet.metrics.available_days} days available`} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Stat label="Actual hours" value={totals.grand.toFixed(1)} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Stat label="Completion" value={`${completion.toFixed(0)}%`}
            color={completion >= 99 ? 'success.main' : completion > 0 ? 'warning.main' : undefined} />
        </Grid>
      </Grid>

      {(sheet.rejection_reason || sheet.returned_reason) && (
        <Alert severity={sheet.rejection_reason ? 'error' : 'warning'} sx={{ mb: 2 }}>
          <strong>{sheet.rejection_reason ? 'Rejected: ' : 'Returned: '}</strong>
          {sheet.rejection_reason || sheet.returned_reason}
        </Alert>
      )}

      {sheet.is_locked && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Approved{sheet.locked_by_name ? ` by ${sheet.locked_by_name}` : ''} and locked.
          {sheet.can_reopen && ' The HR Office can reopen it if an amendment is needed.'}
        </Alert>
      )}

      {canEdit && lines.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          You have no project allocation for {period}. The HR Office sets level of effort — ask them
          to allocate you, or add a project row below if you have been asked to.
        </Alert>
      )}

      {/* ── The grid ─────────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ mb: 2 }}>
        <TableContainer sx={{ maxHeight: '60vh' }}>
          <Table size="small" stickyHeader sx={{ '& td, & th': { px: 0.5, py: 0.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{
                  minWidth: 190, position: 'sticky', left: 0, zIndex: 4,
                  bgcolor: 'grey.100', fontWeight: 700,
                }}>
                  Project / Partner
                </TableCell>
                <TableCell sx={{ minWidth: 180, bgcolor: 'grey.100', fontWeight: 700 }}>
                  Activity description
                </TableCell>
                {days.map((d) => (
                  <Tooltip key={d.date} title={dayTitle(d)} arrow>
                    <TableCell align="center" sx={{
                      minWidth: 38, bgcolor: dayTint(d) || 'grey.100', fontWeight: 700,
                    }}>
                      <Typography variant="caption" display="block" fontWeight={700}>{d.day}</Typography>
                      <Typography variant="caption" color="text.secondary" fontSize={10}>
                        {['M', 'T', 'W', 'T', 'F', 'S', 'S'][d.weekday - 1]}
                      </Typography>
                    </TableCell>
                  </Tooltip>
                ))}
                <TableCell align="right" sx={{ minWidth: 62, bgcolor: 'grey.100', fontWeight: 700 }}>
                  Total
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 62, bgcolor: 'grey.100', fontWeight: 700 }}>
                  LOE %
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 62, bgcolor: 'grey.100', fontWeight: 700 }}>
                  Actual %
                </TableCell>
                {canEdit && (
                  <TableCell align="center" sx={{ bgcolor: 'grey.100', fontWeight: 700 }} />
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {lines.map((line, i) => {
                const project = line.project_id ? projectById.get(line.project_id) : undefined;
                const serverLine = sheet.lines[i];
                const actualPct = totals.grand > 0 ? (totals.perLine[i] / totals.grand) * 100 : 0;
                const drift = actualPct - line.loe_percent;

                return (
                  <TableRow key={line.key} hover>
                    <TableCell sx={{
                      position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper',
                    }}>
                      {canEdit ? (
                        <TextField
                          select size="small" fullWidth value={line.project_id ?? ''}
                          onChange={(e) => setField(i, 'project_id', Number(e.target.value))}
                          SelectProps={{ displayEmpty: true }}
                          sx={{ '& .MuiInputBase-input': { fontSize: 12, py: 0.75 } }}
                        >
                          <MenuItem value="" disabled>Select a project</MenuItem>
                          {projects.map((p) => (
                            <MenuItem key={p.id} value={p.id} sx={{ fontSize: 12 }}>
                              {p.project_code} — {p.project_name}
                            </MenuItem>
                          ))}
                        </TextField>
                      ) : (
                        <Typography variant="caption" fontWeight={600} display="block">
                          {serverLine?.project_code} — {serverLine?.project_name}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" display="block" noWrap>
                        {project?.partner_name || serverLine?.partner_name || 'No partner'}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      {canEdit ? (
                        <TextField
                          size="small" fullWidth multiline maxRows={3}
                          placeholder="What did you work on?"
                          value={line.activity_description}
                          onChange={(e) => setField(i, 'activity_description', e.target.value)}
                          sx={{ '& .MuiInputBase-input': { fontSize: 12 } }}
                        />
                      ) : (
                        <Typography variant="caption">{line.activity_description || '—'}</Typography>
                      )}
                    </TableCell>

                    {days.map((d) => (
                      <TableCell key={d.date} align="center" sx={{ bgcolor: dayTint(d) }}>
                        {canEdit ? (
                          <TextField
                            size="small" variant="standard"
                            value={line.hours[d.date] ?? ''}
                            onChange={(e) => setHours(i, d.date, e.target.value)}
                            inputProps={{
                              inputMode: 'decimal',
                              style: { textAlign: 'center', fontSize: 11, padding: 2 },
                            }}
                            sx={{ width: 34 }}
                          />
                        ) : (
                          <Typography variant="caption">
                            {numeric(line.hours[d.date] || '') || ''}
                          </Typography>
                        )}
                      </TableCell>
                    ))}

                    <TableCell align="right">
                      <Typography variant="caption" fontWeight={700}>
                        {totals.perLine[i]?.toFixed(1) ?? '0.0'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption">{line.loe_percent.toFixed(1)}%</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={`Expected ${(expected * line.loe_percent / 100).toFixed(1)}h at ${line.loe_percent}% LOE`}>
                        <Typography variant="caption" fontWeight={600}
                          color={Math.abs(drift) > 10 ? 'warning.dark' : 'text.primary'}>
                          {actualPct.toFixed(1)}%
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    {canEdit && (
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => removeLine(i)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}

              {/* Daily totals */}
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{
                  position: 'sticky', left: 0, zIndex: 2, bgcolor: 'grey.100', fontWeight: 700,
                }}>
                  Daily total
                </TableCell>
                <TableCell />
                {days.map((d) => {
                  const t = totals.perDay[d.date] || 0;
                  const over = t > (sheet.metrics.daily_hours || 8);
                  return (
                    <TableCell key={d.date} align="center" sx={{ bgcolor: dayTint(d) }}>
                      <Typography variant="caption" fontWeight={700}
                        color={over ? 'warning.dark' : 'text.primary'}>
                        {t ? t.toFixed(1) : ''}
                      </Typography>
                    </TableCell>
                  );
                })}
                <TableCell align="right">
                  <Typography variant="caption" fontWeight={700}>{totals.grand.toFixed(1)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" fontWeight={700}>
                    {lines.reduce((s, l) => s + l.loe_percent, 0).toFixed(0)}%
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" fontWeight={700}>
                    {totals.grand > 0 ? '100%' : '0%'}
                  </Typography>
                </TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Stack direction="row" spacing={2} alignItems="center" mb={2} flexWrap="wrap" useFlexGap>
        <Chip size="small" label="Weekend" sx={{ bgcolor: 'grey.200' }} />
        <Chip size="small" label="Public holiday" sx={{ bgcolor: 'warning.light' }} />
        <Chip size="small" label="Approved leave" sx={{ bgcolor: 'info.light' }} />
        <Typography variant="caption" color="text.secondary">
          Shaded days expect no hours, so they are excluded from the expected total.
        </Typography>
      </Stack>

      {/* ── Notes and actions ────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <TextField
          label="Notes" fullWidth multiline rows={2} size="small" value={notes}
          onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
          disabled={!canEdit} sx={{ mb: 2 }}
          placeholder="Anything your approver should know about this month"
        />

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {canEdit && (
            <>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={addLine}>Add project</Button>
              {lines.some((l) => l.loe_percent > 0) && (
                <Button variant="outlined" onClick={prefillFromLoe}>Fill from allocation</Button>
              )}
              <Box flexGrow={1} />
              <Button variant="outlined" startIcon={<SaveIcon />} disabled={saving}
                onClick={() => handleSave()}>
                Save draft
              </Button>
              <Button variant="contained" startIcon={<SubmitIcon />} disabled={saving}
                onClick={handleSubmit}>
                Submit for approval
              </Button>
            </>
          )}

          {sheet.can_approve && (
            <>
              <Box flexGrow={1} />
              <Button variant="outlined" color="warning" startIcon={<ReturnIcon />}
                onClick={() => setActionDialog('RETURN')} disabled={saving}>
                Return
              </Button>
              <Button variant="outlined" color="error" startIcon={<RejectIcon />}
                onClick={() => setActionDialog('REJECT')} disabled={saving}>
                Reject
              </Button>
              <Button variant="contained" color="success" startIcon={<ApproveIcon />}
                onClick={handleApprove} disabled={saving}>
                Approve
              </Button>
            </>
          )}

          {sheet.can_reopen && (
            <>
              <Box flexGrow={1} />
              <Button variant="outlined" startIcon={<ReopenIcon />}
                onClick={() => setActionDialog('REOPEN')} disabled={saving}>
                Reopen for amendment
              </Button>
            </>
          )}
        </Stack>

        {dirty && canEdit && (
          <Typography variant="caption" color="warning.dark" sx={{ display: 'block', mt: 1 }}>
            You have unsaved changes.
          </Typography>
        )}
      </Paper>

      {/* ── Reason dialog ────────────────────────────────────────────────── */}
      <Dialog open={actionDialog !== null} onClose={() => setActionDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionDialog === 'REJECT' ? 'Reject this timesheet'
            : actionDialog === 'RETURN' ? 'Return for amendment'
              : 'Reopen this timesheet'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {actionDialog === 'REOPEN'
              ? 'The timesheet has already been approved and relied on. Say why it is being reopened.'
              : 'The employee will see this reason and can edit and resubmit.'}
          </Typography>
          <TextField
            autoFocus fullWidth multiline rows={3} label="Reason" value={actionComment}
            onChange={(e) => setActionComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleActionSubmit} disabled={saving}
            color={actionDialog === 'REJECT' ? 'error' : 'primary'}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Approval trail ───────────────────────────────────────────────── */}
      <Dialog open={trailOpen} onClose={() => setTrailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Approval trail</DialogTitle>
        <DialogContent>
          {(sheet.audit_trail || []).length === 0 && (
            <Typography variant="body2" color="text.secondary">Nothing recorded yet.</Typography>
          )}
          {(sheet.audit_trail || []).map((t) => (
            <Box key={t.id} sx={{ mb: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={t.action.replace(/_/g, ' ')} />
                <Typography variant="body2" fontWeight={600}>{t.actor_name || 'System'}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(t.created_at)}
                </Typography>
              </Stack>
              {t.comments && (
                <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                  {t.comments}
                </Typography>
              )}
              <Divider sx={{ mt: 1 }} />
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTrailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TimesheetGridPage;
