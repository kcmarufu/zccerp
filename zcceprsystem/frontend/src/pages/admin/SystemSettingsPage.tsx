/**
 * System Settings Page (Admin)
 * Manage organization profile, system preferences, and security settings
 */

import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Grid, TextField, Button, Switch, FormControlLabel,
  CircularProgress, Alert, Divider, Tabs, Tab, Select, MenuItem, FormControl,
  InputLabel, InputAdornment, Chip, Card, CardContent, useTheme, alpha
} from '@mui/material';
import {
  Business as OrgIcon,
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Info as InfoIcon,
  Save as SaveIcon,
  Restore as RestoreIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';

interface SystemSettings {
  org_name: string;
  org_short_name: string;
  org_address: string;
  org_email: string;
  org_phone: string;
  currency: string;
  currency_symbol: string;
  fiscal_year_start: string;
  timezone: string;
  date_format: string;
  low_budget_threshold: number;
  require_dept_approval: boolean;
  allow_override: boolean;
  session_timeout_hours: number;
  max_login_attempts: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
  org_name: 'ERP Connect',
  org_short_name: 'ZCC',
  org_address: '',
  org_email: '',
  org_phone: '',
  currency: 'USD',
  currency_symbol: '$',
  fiscal_year_start: '01-01',
  timezone: 'Africa/Harare',
  date_format: 'DD/MM/YYYY',
  low_budget_threshold: 20,
  require_dept_approval: true,
  allow_override: false,
  session_timeout_hours: 8,
  max_login_attempts: 5
};

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'ZWL', symbol: 'ZWL', name: 'Zimbabwe Dollar' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
];

const TIMEZONES = [
  'Africa/Harare', 'Africa/Johannesburg', 'Africa/Nairobi', 'Africa/Cairo',
  'UTC', 'Europe/London', 'America/New_York'
];

const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

interface TabPanelProps { children?: React.ReactNode; index: number; value: number; }
const TabPanel = ({ children, value, index }: TabPanelProps) =>
  value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;

const SystemSettingsPage: React.FC = () => {
  const theme = useTheme();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/settings');
      if (res.data.success) {
        setSettings({ ...DEFAULT_SETTINGS, ...res.data.data });
      }
    } catch (err) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/admin/settings', settings);
      if (res.data.success) {
        toast.success('Settings saved successfully');
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        toast.error(res.data.error || 'Failed to save settings');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof SystemSettings) => (e: React.ChangeEvent<HTMLInputElement | { value: unknown }>) => {
    const value = (e.target as HTMLInputElement).value;
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleToggle = (field: keyof SystemSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(prev => ({ ...prev, [field]: e.target.checked }));
  };

  const handleCurrencyChange = (code: string) => {
    const cur = CURRENCIES.find(c => c.code === code);
    if (cur) setSettings(prev => ({ ...prev, currency: cur.code, currency_symbol: cur.symbol }));
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 960, mx: 'auto' }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5" fontWeight={700} gutterBottom>System Settings</Typography>
          <Typography variant="body2" color="text.secondary">
            Configure organization profile, system behaviour, and security policies
          </Typography>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          {lastSaved && (
            <Chip icon={<CheckIcon />} label={`Saved at ${lastSaved}`} color="success" size="small" variant="outlined" />
          )}
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            Save Changes
          </Button>
        </Box>
      </Box>

      <Paper sx={{ borderRadius: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ borderBottom: `1px solid ${theme.palette.divider}`, px: 2 }}
        >
          <Tab icon={<OrgIcon />} iconPosition="start" label="Organization" />
          <Tab icon={<SettingsIcon />} iconPosition="start" label="Preferences" />
          <Tab icon={<SecurityIcon />} iconPosition="start" label="Security" />
          <Tab icon={<InfoIcon />} iconPosition="start" label="System Info" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* ─── Tab 0: Organization ─── */}
          <TabPanel value={activeTab} index={0}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>Organization Profile</Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={8}>
                <TextField
                  fullWidth label="Organization Name" value={settings.org_name}
                  onChange={handleChange('org_name')}
                  helperText="Full official name of the organization"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth label="Short Name / Abbreviation" value={settings.org_short_name}
                  onChange={handleChange('org_short_name')}
                  helperText="Shown in headers and reports"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth multiline rows={2} label="Address" value={settings.org_address}
                  onChange={handleChange('org_address')}
                  placeholder="P.O. Box 123, Harare, Zimbabwe"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth label="Official Email" value={settings.org_email}
                  onChange={handleChange('org_email')}
                  type="email" placeholder="info@zcc.org.zw"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth label="Phone Number" value={settings.org_phone}
                  onChange={handleChange('org_phone')}
                  placeholder="+263 242 123456"
                />
              </Grid>
            </Grid>
          </TabPanel>

          {/* ─── Tab 1: Preferences ─── */}
          <TabPanel value={activeTab} index={1}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>Financial Preferences</Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Default Currency</InputLabel>
                  <Select
                    value={settings.currency}
                    label="Default Currency"
                    onChange={(e) => handleCurrencyChange(e.target.value as string)}
                  >
                    {CURRENCIES.map(c => (
                      <MenuItem key={c.code} value={c.code}>
                        {c.symbol} — {c.name} ({c.code})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth label="Fiscal Year Start (MM-DD)" value={settings.fiscal_year_start}
                  onChange={handleChange('fiscal_year_start')}
                  placeholder="01-01"
                  helperText="Format: MM-DD (e.g. 01-01 for January 1st)"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth label="Low Budget Alert Threshold (%)" type="number"
                  value={settings.low_budget_threshold}
                  onChange={(e) => setSettings(prev => ({ ...prev, low_budget_threshold: parseInt(e.target.value) || 0 }))}
                  InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                  helperText="Warn when budget line falls below this percentage"
                  inputProps={{ min: 1, max: 50 }}
                />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ mt: 1 }}>Display Preferences</Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Timezone</InputLabel>
                  <Select value={settings.timezone} label="Timezone" onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value as string }))}>
                    {TIMEZONES.map(tz => <MenuItem key={tz} value={tz}>{tz}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Date Format</InputLabel>
                  <Select value={settings.date_format} label="Date Format" onChange={(e) => setSettings(prev => ({ ...prev, date_format: e.target.value as string }))}>
                    {DATE_FORMATS.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ mt: 1 }}>Workflow Settings</Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={<Switch checked={settings.require_dept_approval} onChange={handleToggle('require_dept_approval')} color="primary" />}
                  label={<Box><Typography variant="body2" fontWeight={500}>Require Department Head Approval</Typography><Typography variant="caption" color="text.secondary">All requests go through HOP/Lead approval before Finance</Typography></Box>}
                  sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.3 } }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={<Switch checked={settings.allow_override} onChange={handleToggle('allow_override')} color="warning" />}
                  label={<Box><Typography variant="body2" fontWeight={500}>Allow Admin Override</Typography><Typography variant="caption" color="text.secondary">Admin can approve/reject at any stage</Typography></Box>}
                  sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { mt: 0.3 } }}
                />
              </Grid>
            </Grid>
          </TabPanel>

          {/* ─── Tab 2: Security ─── */}
          <TabPanel value={activeTab} index={2}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>Session & Authentication</Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth label="Session Timeout" type="number"
                  value={settings.session_timeout_hours}
                  onChange={(e) => setSettings(prev => ({ ...prev, session_timeout_hours: parseInt(e.target.value) || 1 }))}
                  InputProps={{ endAdornment: <InputAdornment position="end">hours</InputAdornment> }}
                  helperText="Users are automatically logged out after this period of inactivity"
                  inputProps={{ min: 1, max: 24 }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth label="Max Login Attempts" type="number"
                  value={settings.max_login_attempts}
                  onChange={(e) => setSettings(prev => ({ ...prev, max_login_attempts: parseInt(e.target.value) || 3 }))}
                  helperText="Account is locked after this many consecutive failed attempts"
                  inputProps={{ min: 3, max: 10 }}
                />
              </Grid>
              <Grid item xs={12}>
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  <Typography variant="body2">
                    <strong>Password Policy:</strong> Minimum 8 characters required for all user accounts.
                    Admins can reset user passwords from the User Management page.
                  </Typography>
                </Alert>
              </Grid>
            </Grid>
          </TabPanel>

          {/* ─── Tab 3: System Info ─── */}
          <TabPanel value={activeTab} index={3}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>Application Information</Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              {[
                { label: 'Application Name', value: 'ZCC ERP System' },
                { label: 'Version', value: 'v1.0.0' },
                { label: 'Environment', value: process.env.NODE_ENV === 'production' ? 'Production' : 'Development' },
                { label: 'Database', value: 'MySQL 9.6 (finance_erp)' },
                { label: 'Backend Framework', value: 'Node.js / Express.js' },
                { label: 'Frontend Framework', value: 'React 18 + TypeScript + Material UI v5' },
                { label: 'Logged In As', value: user ? `${user.first_name} ${user.last_name} (${user.role})` : '-' },
              ].map(item => (
                <Grid item xs={12} sm={6} key={item.label}>
                  <Card variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="caption" color="text.secondary" display="block">{item.label}</Typography>
                      <Typography variant="body2" fontWeight={600}>{item.value}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
              <Grid item xs={12}>
                <Alert severity="success" sx={{ borderRadius: 2, mt: 1 }}>
                  System is running normally. All modules operational.
                </Alert>
              </Grid>
            </Grid>
          </TabPanel>
        </Box>
      </Paper>
    </Box>
  );
};

export default SystemSettingsPage;
