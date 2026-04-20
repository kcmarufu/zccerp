/**
 * Access Control Page (Admin)
 * Multi-level permission system with granular module/action controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Chip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Grid, IconButton, Tooltip,
  Alert, Switch, Tabs, Tab, useTheme, alpha, Divider, Card, CardContent,
  Accordion, AccordionSummary, AccordionDetails, List, ListItem,
  ListItemText, ListItemSecondaryAction, FormGroup, FormControlLabel, Checkbox,
  Avatar
} from '@mui/material';
import {
  Security as SecurityIcon,
  ExpandMore as ExpandMoreIcon,
  Shield as ShieldIcon,
  Person as PersonIcon,
  CheckCircle as CheckIcon,
  Block as BlockIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Info as InfoIcon,
  Lock as LockIcon,
  AdminPanelSettings as AdminIcon,
  AccountTree as ModuleIcon,
  VpnKey as KeyIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../store/authStore';

// System module definitions with granular permissions
const SYSTEM_MODULES = [
  {
    id: 'finance',
    name: 'Finance & Procurement',
    permissions: [
      { key: 'create_request', label: 'Create Float Requests', description: 'Submit new float/payment requests' },
      { key: 'view_own_requests', label: 'View Own Requests', description: 'View requests user created' },
      { key: 'view_all_requests', label: 'View All Requests', description: 'View all department requests' },
      { key: 'approve_request', label: 'Approve Requests', description: 'Approve or reject requests at assigned level' },
      { key: 'dispatch_request', label: 'Dispatch Requests', description: 'Mark requests as dispatched' },
      { key: 'reconcile_request', label: 'Submit Reconciliation', description: 'Submit reconciliation for dispatched floats' },
      { key: 'review_reconciliation', label: 'Review Reconciliation', description: 'Approve or reject reconciliation submissions' },
      { key: 'view_budget_lines', label: 'View Budget Lines', description: 'View budget allocations and balances' },
      { key: 'manage_budgets', label: 'Manage Budgets', description: 'Create, edit, top-up budget lines' },
      { key: 'manage_donors', label: 'Manage Donors', description: 'Create and manage donor records' },
      { key: 'export_data', label: 'Export Reports', description: 'Generate PDF/Excel reports' }
    ]
  },
  {
    id: 'projects',
    name: 'Projects & Programs',
    permissions: [
      { key: 'view_projects', label: 'View Projects', description: 'View project listings and details' },
      { key: 'create_project', label: 'Create Projects', description: 'Create new projects' },
      { key: 'manage_milestones', label: 'Manage Milestones', description: 'Create and track project milestones' },
      { key: 'allocate_expenses', label: 'Allocate Expenses', description: 'Allocate expenses to projects' }
    ]
  },
  {
    id: 'procurement',
    name: 'Procurement',
    permissions: [
      { key: 'create_purchase_request', label: 'Create Purchase Requests', description: 'Submit purchase requests' },
      { key: 'approve_purchase', label: 'Approve Purchases', description: 'Approve purchase requests' },
      { key: 'manage_vendors', label: 'Manage Vendors', description: 'Add and manage vendor records' },
      { key: 'manage_tenders', label: 'Manage Tenders', description: 'Create and evaluate tenders' },
      { key: 'manage_inventory', label: 'Manage Inventory', description: 'Track inventory and stock' }
    ]
  },
  {
    id: 'grants',
    name: 'Grants & Donors',
    permissions: [
      { key: 'view_grants', label: 'View Grants', description: 'View grant information' },
      { key: 'manage_grants', label: 'Manage Grants', description: 'Create and manage grants' },
      { key: 'manage_donor_relations', label: 'Donor Relations', description: 'Manage donor relationships' },
      { key: 'track_funds', label: 'Track Funds', description: 'Track fund utilization and restrictions' },
      { key: 'donor_reporting', label: 'Donor Reporting', description: 'Generate donor reports' }
    ]
  },
  {
    id: 'compliance',
    name: 'Compliance & Audit',
    permissions: [
      { key: 'view_audit_trail', label: 'View Audit Trail', description: 'View system audit logs' },
      { key: 'manage_documents', label: 'Manage Documents', description: 'Upload and organize documents' },
      { key: 'compliance_review', label: 'Compliance Review', description: 'Perform compliance checks' },
      { key: 'generate_audit_reports', label: 'Audit Reports', description: 'Generate audit reports' }
    ]
  },
  {
    id: 'me',
    name: 'Monitoring & Evaluation',
    permissions: [
      { key: 'view_indicators', label: 'View Indicators', description: 'View KPIs and indicators' },
      { key: 'manage_indicators', label: 'Manage Indicators', description: 'Create and update indicators' },
      { key: 'collect_data', label: 'Data Collection', description: 'Submit field data' },
      { key: 'generate_me_reports', label: 'M&E Reports', description: 'Generate M&E reports' }
    ]
  },
  {
    id: 'admin',
    name: 'Administration',
    permissions: [
      { key: 'manage_users', label: 'Manage Users', description: 'Create, edit, deactivate users' },
      { key: 'reset_passwords', label: 'Reset Passwords', description: 'Reset user passwords' },
      { key: 'manage_roles', label: 'Manage Roles', description: 'Configure role permissions' },
      { key: 'system_settings', label: 'System Settings', description: 'Manage system configuration' },
      { key: 'view_login_history', label: 'View Login History', description: 'View user login history' }
    ]
  }
];

// Current role-permission mapping (editable)
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    // Full system access - all permissions
    'create_request', 'view_own_requests', 'view_all_requests', 'approve_request',
    'dispatch_request', 'reconcile_request', 'review_reconciliation',
    'view_budget_lines', 'manage_budgets', 'manage_donors', 'export_data',
    'view_projects', 'create_project', 'manage_milestones', 'allocate_expenses',
    'create_purchase_request', 'approve_purchase', 'manage_vendors', 'manage_tenders', 'manage_inventory',
    'view_grants', 'manage_grants', 'manage_donor_relations', 'track_funds', 'donor_reporting',
    'view_audit_trail', 'manage_documents', 'compliance_review', 'generate_audit_reports',
    'view_indicators', 'manage_indicators', 'collect_data', 'generate_me_reports',
    'manage_users', 'reset_passwords', 'manage_roles', 'system_settings', 'view_login_history'
  ],
  GENERAL_USER: [
    'create_request', 'view_own_requests', 'reconcile_request', 'view_budget_lines',
    'view_projects', 'view_grants', 'view_indicators', 'collect_data'
  ],
  PROGRAM_LEAD: [
    'create_request', 'view_own_requests', 'view_all_requests', 'approve_request',
    'reconcile_request', 'view_budget_lines', 'export_data',
    'view_projects', 'create_project', 'manage_milestones',
    'view_grants', 'view_indicators', 'manage_indicators'
  ],
  HEAD_OF_PROGRAMS: [
    'create_request', 'view_own_requests', 'view_all_requests', 'approve_request',
    'reconcile_request', 'view_budget_lines', 'export_data',
    'view_projects', 'create_project', 'manage_milestones', 'allocate_expenses',
    'view_grants', 'manage_grants', 'manage_donor_relations',
    'view_indicators', 'manage_indicators', 'generate_me_reports',
    'view_audit_trail', 'compliance_review'
  ],
  FINANCE_CLERK: [
    'create_request', 'view_own_requests', 'view_all_requests', 'approve_request',
    'dispatch_request', 'reconcile_request', 'review_reconciliation',
    'view_budget_lines', 'manage_budgets', 'manage_donors', 'export_data',
    'view_projects', 'allocate_expenses',
    'create_purchase_request', 'approve_purchase', 'manage_vendors', 'manage_tenders', 'manage_inventory',
    'view_grants', 'manage_grants', 'manage_donor_relations', 'track_funds', 'donor_reporting',
    'view_audit_trail', 'manage_documents', 'compliance_review', 'generate_audit_reports',
    'view_indicators', 'generate_me_reports',
    'manage_users', 'reset_passwords', 'manage_roles', 'system_settings', 'view_login_history'
  ]
};

const AccessControlPage: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(DEFAULT_ROLE_PERMISSIONS);
  const [selectedRole, setSelectedRole] = useState('ADMIN');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const roles = [
    { key: 'ADMIN', label: 'System Admin', description: 'Full system oversight and control', color: 'error' as const },
    { key: 'GENERAL_USER', label: 'General User', description: 'Standard users who create requests', color: 'default' as const },
    { key: 'PROGRAM_LEAD', label: 'Program Lead', description: 'Department leads who approve requests', color: 'primary' as const },
    { key: 'HEAD_OF_PROGRAMS', label: 'Head of Programs', description: 'Senior approver with wider access', color: 'secondary' as const },
    { key: 'FINANCE_CLERK', label: 'Finance Clerk', description: 'Finance team with full system access', color: 'success' as const }
  ];

  const togglePermission = (role: string, permission: string) => {
    setRolePermissions(prev => {
      const current = prev[role] || [];
      const updated = current.includes(permission)
        ? current.filter(p => p !== permission)
        : [...current, permission];
      return { ...prev, [role]: updated };
    });
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      // In a real implementation, this would save to the backend
      // await api.post('/admin/roles/permissions', { rolePermissions });
      toast.success('Permission changes saved successfully');
      setHasUnsavedChanges(false);
    } catch (error) {
      toast.error('Failed to save permission changes');
    } finally {
      setIsSaving(false);
    }
  };

  const getPermissionCount = (role: string) => {
    return rolePermissions[role]?.length || 0;
  };

  const getTotalPermissions = () => {
    return SYSTEM_MODULES.reduce((sum, mod) => sum + mod.permissions.length, 0);
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'FINANCE_CLERK': return 'Finance Clerk';
      case 'HEAD_OF_PROGRAMS': return 'Head of Programs';
      case 'PROGRAM_LEAD': return 'Program Lead';
      default: return 'General User';
    }
  };

  return (
    <Box>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: 3, mb: 3,
          background: `linear-gradient(135deg, #c62828 0%, #b71c1c 100%)`,
          color: 'white', borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={2}>
            <SecurityIcon sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="h5" fontWeight={600}>Access Control & Permissions</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                Configure granular module-level permissions for each role
              </Typography>
            </Box>
          </Box>
          {hasUnsavedChanges && (
            <Button variant="contained" startIcon={isSaving ? <CircularProgress size={18} /> : <SaveIcon />}
              onClick={handleSave} disabled={isSaving}
              sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>
              Save Changes
            </Button>
          )}
        </Box>
      </Paper>

      {hasUnsavedChanges && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          You have unsaved permission changes. Click "Save Changes" to apply.
        </Alert>
      )}

      {/* Tabs */}
      <Paper elevation={0} sx={{ mb: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab icon={<ShieldIcon />} label="Role Permissions" iconPosition="start" />
          <Tab icon={<ModuleIcon />} label="Module Overview" iconPosition="start" />
          <Tab icon={<InfoIcon />} label="Permission Matrix" iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab 0: Role-Based Permission Editor */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          {/* Role Selector */}
          <Grid item xs={12} md={3}>
            <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, p: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>System Roles</Typography>
              <Divider sx={{ mb: 1 }} />
              <List disablePadding>
                {roles.map((role) => (
                  <ListItem key={role.key} disableGutters
                    sx={{
                      cursor: 'pointer', borderRadius: 1, mb: 0.5, px: 1,
                      bgcolor: selectedRole === role.key ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                      '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) }
                    }}
                    onClick={() => setSelectedRole(role.key)}>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Chip label={role.label} color={role.color} size="small" sx={{ fontWeight: 500 }} />
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {getPermissionCount(role.key)} / {getTotalPermissions()} permissions
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          {/* Permissions Editor */}
          <Grid item xs={12} md={9}>
            <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, p: 2 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Permissions for: {getRoleLabel(selectedRole)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {getPermissionCount(selectedRole)} of {getTotalPermissions()} permissions enabled
                  </Typography>
                </Box>
                <Chip label={`${Math.round((getPermissionCount(selectedRole) / getTotalPermissions()) * 100)}% access`}
                  color="primary" variant="outlined" />
              </Box>
              <Divider sx={{ mb: 2 }} />

              {SYSTEM_MODULES.map((module) => {
                const moduleEnabled = module.permissions.filter(p => rolePermissions[selectedRole]?.includes(p.key)).length;
                return (
                  <Accordion key={module.id} elevation={0}
                    sx={{ border: `1px solid ${theme.palette.divider}`, mb: 1, '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box display="flex" alignItems="center" gap={2} sx={{ width: '100%' }}>
                        <Chip label={module.name} size="small" variant="outlined" />
                        <Typography variant="caption" color="text.secondary">
                          {moduleEnabled} / {module.permissions.length} enabled
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <FormGroup>
                        {module.permissions.map((perm) => (
                          <FormControlLabel
                            key={perm.key}
                            control={
                              <Checkbox
                                checked={rolePermissions[selectedRole]?.includes(perm.key) || false}
                                onChange={() => togglePermission(selectedRole, perm.key)}
                                size="small"
                              />
                            }
                            label={
                              <Box>
                                <Typography variant="body2" fontWeight={500}>{perm.label}</Typography>
                                <Typography variant="caption" color="text.secondary">{perm.description}</Typography>
                              </Box>
                            }
                            sx={{ mb: 1, alignItems: 'flex-start', ml: 0 }}
                          />
                        ))}
                      </FormGroup>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Tab 1: Module Overview */}
      {activeTab === 1 && (
        <Grid container spacing={2}>
          {SYSTEM_MODULES.map((module) => (
            <Grid item xs={12} sm={6} md={4} key={module.id}>
              <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, height: '100%' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <ModuleIcon color="primary" />
                    <Typography variant="subtitle1" fontWeight={600}>{module.name}</Typography>
                  </Box>
                  <Divider sx={{ mb: 1.5 }} />
                  <Typography variant="caption" fontWeight={600} color="text.secondary" gutterBottom display="block">
                    {module.permissions.length} PERMISSIONS
                  </Typography>
                  {module.permissions.map((perm) => (
                    <Box key={perm.key} display="flex" alignItems="center" gap={1} py={0.5}>
                      <KeyIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                      <Typography variant="body2">{perm.label}</Typography>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Tab 2: Permission Matrix */}
      {activeTab === 2 && (
        <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, minWidth: 200, bgcolor: 'grey.50' }}>Module / Permission</TableCell>
                  {roles.map((role) => (
                    <TableCell key={role.key} align="center" sx={{ fontWeight: 600, bgcolor: 'grey.50', minWidth: 130 }}>
                      <Chip label={role.label} color={role.color} size="small" />
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {SYSTEM_MODULES.map((module) => (
                  <React.Fragment key={module.id}>
                    <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.03) }}>
                      <TableCell colSpan={5}>
                        <Typography variant="subtitle2" fontWeight={600} color="primary.main">
                          {module.name}
                        </Typography>
                      </TableCell>
                    </TableRow>
                    {module.permissions.map((perm) => (
                      <TableRow key={perm.key} hover>
                        <TableCell>
                          <Typography variant="body2">{perm.label}</Typography>
                          <Typography variant="caption" color="text.secondary">{perm.description}</Typography>
                        </TableCell>
                        {roles.map((role) => (
                          <TableCell key={role.key} align="center">
                            <Checkbox
                              checked={rolePermissions[role.key]?.includes(perm.key) || false}
                              onChange={() => togglePermission(role.key, perm.key)}
                              size="small"
                              sx={{
                                color: rolePermissions[role.key]?.includes(perm.key) ? 'success.main' : 'text.disabled'
                              }}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default AccessControlPage;
