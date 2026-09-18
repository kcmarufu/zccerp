/**
 * Timesheet settings and the public holiday calendar.
 *
 * Both feed the expected-hours calculation directly:
 *   working days x standard daily hours, less holidays and approved leave.
 *
 * Reserved to the HR Office and the Super Admin — a holiday added here changes
 * what every member of staff is expected to have worked.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Stack, TextField, MenuItem, CircularProgress, Grid,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Alert,
  ToggleButton, ToggleButtonGroup, Tooltip, Divider,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon, Event as HolidayIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { useAuthStore } from '../../store/authStore';
import { PublicHoliday, TimesheetSettings } from '../../types';
import {
  getHolidays, createHoliday, deleteHoliday,
  getTimesheetSettings, updateTimesheetSettings,
} from '../../services/timesheetService';
import { canManageHolidays } from '../../utils/timesheetAccess';
import { yearOptions } from '../../components/timesheets/TimesheetStatusChip';
import { formatDate } from '../../utils/datetime';

const WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const TimesheetSettingsPage: React.FC = () => {
  const { user } = useAuthStore();
  const canEdit = canManageHolidays(user);

  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [settings, setSettings] = useState<TimesheetSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    holiday_date: '', holiday_name: '', is_recurring: true, notes: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [h, s] = await Promise.all([getHolidays(year), getTimesheetSettings()]);
      setHolidays(h);
      setSettings(s);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      setSettings(await updateTimesheetSettings(settings));
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addHoliday = async () => {
    if (!form.holiday_date || !form.holiday_name.trim()) {
      toast.error('A date and a name are both required');
      return;
    }
    try {
      setSaving(true);
      await createHoliday(form);
      toast.success('Public holiday added');
      setAddOpen(false);
      setForm({ holiday_date: '', holiday_name: '', is_recurring: true, notes: '' });
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to add the holiday');
    } finally {
      setSaving(false);
    }
  };

  const removeHoliday = async (h: PublicHoliday) => {
    try {
      await deleteHoliday(h.id);
      toast.success(`${h.holiday_name} removed`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to remove the holiday');
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} gutterBottom>Timesheet Settings</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        What counts as a working day, and which days the whole organisation has off
      </Typography>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          These settings are maintained by the HR Office. You can see them here.
        </Alert>
      )}

      {/* ── Working pattern ──────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Working pattern</Typography>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth size="small" label="Standard daily hours" disabled={!canEdit}
              value={settings?.standard_daily_hours ?? ''}
              onChange={(e) => setSettings((s) => (s
                ? { ...s, standard_daily_hours: Number(e.target.value) } : s))}
              inputProps={{ inputMode: 'decimal' }}
              helperText="Used to turn available days into expected hours"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
              Working days
            </Typography>
            <ToggleButtonGroup
              size="small" value={settings?.work_days || []} disabled={!canEdit}
              onChange={(_, v: number[]) => setSettings((s) => (s && v.length > 0
                ? { ...s, work_days: v.sort() } : s))}
            >
              {WEEKDAYS.map((d) => (
                <ToggleButton key={d.value} value={d.value}>{d.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth size="small" type="number" label="Due day of the next month"
              disabled={!canEdit} value={settings?.submission_due_day ?? ''}
              onChange={(e) => setSettings((s) => (s
                ? { ...s, submission_due_day: Number(e.target.value) } : s))}
              helperText="When the previous month is due in"
            />
          </Grid>
        </Grid>
        {canEdit && (
          <Button variant="contained" startIcon={<SaveIcon />} sx={{ mt: 2 }}
            onClick={saveSettings} disabled={saving}>
            Save settings
          </Button>
        )}
      </Paper>

      {/* ── Public holidays ──────────────────────────────────────────────── */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="subtitle1" fontWeight={600}>Public holidays</Typography>
        <Stack direction="row" spacing={1}>
          <TextField select size="small" label="Year" value={year} sx={{ minWidth: 120 }}
            onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions().map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </TextField>
          {canEdit && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
              Add holiday
            </Button>
          )}
        </Stack>
      </Stack>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Holiday</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Repeats</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Note</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Added by</TableCell>
                {canEdit && <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {holidays.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 6 : 5} align="center" sx={{ py: 4 }}>
                    <HolidayIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                    <Typography color="text.secondary">
                      No public holidays recorded for {year}.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {holidays.map((h) => (
                <TableRow key={h.id} hover>
                  <TableCell>{formatDate(h.holiday_date)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{h.holiday_name}</Typography>
                  </TableCell>
                  <TableCell>
                    {h.is_recurring
                      ? <Chip size="small" label="Every year" color="info" variant="outlined" />
                      : <Chip size="small" label="One-off" variant="outlined" />}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{h.notes || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{h.created_by_name || 'System'}</Typography>
                  </TableCell>
                  {canEdit && (
                    <TableCell align="center">
                      <Tooltip title="Remove">
                        <IconButton size="small" onClick={() => removeHoliday(h)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        A holiday marked &quot;Every year&quot; is applied to the same day and month in every year, so
        it only needs entering once. Movable dates — Easter, or a Monday added when a holiday falls
        on a Sunday — should be added as one-off entries.
      </Typography>

      {/* ── Add dialog ───────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add a public holiday</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth size="small" type="date" label="Date" InputLabelProps={{ shrink: true }}
              value={form.holiday_date}
              onChange={(e) => setForm((f) => ({ ...f, holiday_date: e.target.value }))}
            />
            <TextField
              fullWidth size="small" label="Name" value={form.holiday_name}
              onChange={(e) => setForm((f) => ({ ...f, holiday_name: e.target.value }))}
            />
            <TextField
              select fullWidth size="small" label="Repeats"
              value={form.is_recurring ? 'yes' : 'no'}
              onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.value === 'yes' }))}
            >
              <MenuItem value="yes">Every year, on this day and month</MenuItem>
              <MenuItem value="no">This year only</MenuItem>
            </TextField>
            <TextField
              fullWidth size="small" label="Note (optional)" value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary">
            Adding a holiday reduces the expected hours for everyone in that month.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={addHoliday} disabled={saving}>Add</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TimesheetSettingsPage;
