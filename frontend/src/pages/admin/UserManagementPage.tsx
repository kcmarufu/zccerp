/**
 * User Management Page (Admin)
 * CRUD operations for users, password reset, profile management, login history
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Button, Chip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Grid, IconButton, Tooltip,
  Alert, MenuItem, Select, FormControl, InputLabel, Switch, FormControlLabel,
  Avatar, InputAdornment, Tabs, Tab, useTheme, alpha, Divider, Badge,
  Card, CardContent
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Lock as LockIcon,
  LockOpen as UnlockIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Person as PersonIcon,
  History as HistoryIcon,
  Security as SecurityIcon,
  AdminPanelSettings as AdminIcon,
  Visibility as ViewIcon,
  VisibilityOff as HideIcon,
  Email as EmailIcon,
  ManageAccounts as ManageIcon,
  GetApp as ExportIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';

interface UserRecord {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  role_name?: string;
  department_id: number;
  department_name?: string;
  department_code?: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
  updated_at?: string;
}

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

interface Role {
  id: number;
  role_name: string;
  role_description?: string;
}

const UserManagementPage: React.FC = () => {
  const theme = useTheme();
  const { user: currentUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState(0);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDept, setFilterDept] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<'' | 'active' | 'inactive'>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [formData, setFormData] = useState({
    email: '', first_name: '', last_name: '', password: '',
    role: 'GENERAL_USER', department_id: 0, is_active: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Password reset dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // View profile dialog
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<UserRecord | null>(null);
  const [loginHistory, setLoginHistory] = useState<any[]>([]);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/admin/users');
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLookups = useCallback(async () => {
    try {
      const [deptRes, roleRes] = await Promise.all([
        api.get('/departments'),
        api.get('/roles')
      ]);
      if (deptRes.data.success) setDepartments(deptRes.data.data);
      if (roleRes.data.success) setRoles(roleRes.data.data);
    } catch (error) {
      console.error('Error fetching lookups:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchLookups();
  }, [fetchUsers, fetchLookups]);

  const openCreateDialog = () => {
    setEditUser(null);
    setFormData({
      email: '', first_name: '', last_name: '', password: '',
      role: 'GENERAL_USER', department_id: departments[0]?.id || 0, is_active: true
    });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEditDialog = (user: UserRecord) => {
    setEditUser(user);
    setFormData({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      password: '',
      role: user.role || user.role_name || 'GENERAL_USER',
      department_id: user.department_id,
      is_active: user.is_active
    });
    setDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!formData.email || !formData.first_name || !formData.last_name) {
      toast.warning('Please fill in all required fields');
      return;
    }
    if (!editUser && !formData.password) {
      toast.warning('Password is required for new users');
      return;
    }

    try {
      setIsSaving(true);
      if (editUser) {
        const payload: any = {
          email: formData.email,
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role,
          department_id: formData.department_id,
          is_active: formData.is_active
        };
        await api.put(`/admin/users/${editUser.id}`, payload);
        toast.success('User updated successfully');
      } else {
        await api.post('/admin/users', formData);
        toast.success('User created successfully');
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to save user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUser || !newPassword) {
      toast.warning('Please enter a new password');
      return;
    }
    if (newPassword.length < 8) {
      toast.warning('Password must be at least 8 characters');
      return;
    }
    try {
      await api.post(`/admin/users/${resetUser.id}/reset-password`, { newPassword });
      toast.success(`Password reset for ${resetUser.first_name} ${resetUser.last_name}`);
      setResetDialogOpen(false);
      setNewPassword('');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleToggleActive = async (user: UserRecord) => {
    try {
      await api.patch(`/admin/users/${user.id}/toggle-active`);
      toast.success(`User ${user.is_active ? 'deactivated' : 'activated'} successfully`);
      fetchUsers();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to toggle user status');
    }
  };

  const openProfileDialog = async (user: UserRecord) => {
    setProfileUser(user);
    try {
      const res = await api.get(`/admin/users/${user.id}/login-history`);
      if (res.data.success) {
        setLoginHistory(res.data.data);
      }
    } catch (err) {
      setLoginHistory([]);
    }
    setProfileOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      const res = await api.delete(`/admin/users/${deleteTarget.id}`);
      if (res.data.softDelete) {
        toast.info(res.data.message);
      } else {
        toast.success('User deleted successfully');
      }
      setDeleteTarget(null);
      fetchUsers();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleColor = (role: string): 'success' | 'primary' | 'secondary' | 'warning' | 'error' | 'default' => {
    switch (role) {
      case 'ADMIN': return 'error';
      case 'FINANCE_CLERK': return 'success';
      case 'HEAD_OF_PROGRAMS': return 'secondary';
      case 'PROGRAM_LEAD': return 'primary';
      case 'PROCUREMENT_OFFICER': return 'warning';
      case 'PROCUREMENT_COMMITTEE': return 'warning';
      default: return 'default';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'Super Administrator';
      case 'FINANCE_CLERK': return 'Finance Clerk';
      case 'HEAD_OF_PROGRAMS': return 'Head of Programs';
      case 'PROGRAM_LEAD': return 'Program Lead';
      case 'GENERAL_USER': return 'General User';
      case 'PROCUREMENT_OFFICER': return 'Procurement Officer';
      case 'PROCUREMENT_COMMITTEE': return 'Procurement Committee';
      default: return role?.replace(/_/g, ' ') || 'Unknown';
    }
  };

  const filteredUsers = users.filter(u => {
    const textMatch = (u.first_name + ' ' + u.last_name + ' ' + u.email + ' ' + (u.department_name || ''))
      .toLowerCase().includes(searchQuery.toLowerCase());
    const roleMatch = !filterRole || (u.role || u.role_name) === filterRole;
    const deptMatch = !filterDept || u.department_id === filterDept;
    const statusMatch = !filterStatus || (filterStatus === 'active' ? u.is_active : !u.is_active);
    return textMatch && roleMatch && deptMatch && statusMatch;
  });

  const handleExportExcel = () => {
    const exportData = filteredUsers.map(u => ({
      'First Name': u.first_name,
      'Last Name': u.last_name,
      'Email': u.email,
      'Role': getRoleLabel(u.role || u.role_name || ''),
      'Department': u.department_name || '-',
      'Status': u.is_active ? 'Active' : 'Inactive',
      'Last Login': u.last_login ? format(new Date(u.last_login), 'dd/MM/yyyy HH:mm') : 'Never',
      'Created': format(new Date(u.created_at), 'dd/MM/yyyy')
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    ws['!cols'] = [20, 20, 30, 25, 25, 10, 20, 15].map(w => ({ wch: w }));
    XLSX.writeFile(wb, `users_export_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    toast.success('Excel file downloaded');
  };

  const handleExportPDF = () => {
    try {
      const safeText = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeDate = (d: any) => {
        if (!d) return 'Never';
        try { const dt = new Date(d); return isNaN(dt.getTime()) ? 'N/A' : format(dt, 'dd/MM/yyyy'); }
        catch { return 'N/A'; }
      };
      const rows = filteredUsers.map(u => `
        <tr>
          <td>${safeText(u.first_name + ' ' + u.last_name)}</td>
          <td>${safeText(u.email)}</td>
          <td>${safeText(getRoleLabel(u.role || u.role_name || ''))}</td>
          <td>${safeText(u.department_name || '-')}</td>
          <td>${u.is_active ? 'Active' : 'Inactive'}</td>
          <td>${safeDate(u.last_login)}</td>
        </tr>`).join('');
      const html = `<html><head><title>User Management Report</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color:#1a1a1a; }
          .org { font-size: 11px; font-weight: bold; color: #006064; letter-spacing: .4px; }
          h2 { color: #006064; margin: 4px 0 6px; border-bottom: 2px solid #006064; padding-bottom: 4px; }
          .meta { color: #666; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #006064; color: white; padding: 8px; text-align: left; }
          td { padding: 7px 8px; border-bottom: 1px solid #ddd; }
          tr:nth-child(even) td { background: #f7f7f7; }
          .footer { margin-top: 18px; padding-top: 8px; border-top: 1.5px solid #e0e0e0; font-size: 10px; color: #999; display:flex; justify-content:space-between; }
          @media print { body { margin: 0; } }
        </style></head>
        <body>
          <div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div>
          <h2>User Management Report</h2>
          <p class="meta">Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')} &nbsp;|&nbsp; Total: ${filteredUsers.length} users</p>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th><th>Last Login</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="footer"><span>ERP Connect - Zimbabwe Council of Churches | CONFIDENTIAL</span><span>Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</span></div>
        </body></html>`;
      const printWindow = window.open('', '_blank', 'width=900,height=650');
      if (!printWindow) { toast.warning('Pop-up blocked — please allow pop-ups for this site.'); return; }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to generate PDF report');
    }
  };

  const activeUsers = filteredUsers.filter(u => u.is_active);
  const inactiveUsers = filteredUsers.filter(u => !u.is_active);

  const currentList = activeTab === 0 ? activeUsers : inactiveUsers;
  const pagedUsers = rowsPerPage === -1
    ? currentList
    : currentList.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  if (isLoading) {
    return <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>;
  }

  return (
    <Box>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: 3, mb: 3,
          background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, #0d47a1 100%)`,
          color: 'white', borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={2}>
            <ManageIcon sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="h5" fontWeight={600}>User Management</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                Manage system users, roles, and access permissions
              </Typography>
            </Box>
          </Box>
          <Box display="flex" gap={1} alignItems="center">
            <Tooltip title="Export to Excel">
              <Button variant="outlined" size="small" startIcon={<ExcelIcon />}
                onClick={handleExportExcel}
                sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                Excel
              </Button>
            </Tooltip>
            <Tooltip title="Export to PDF">
              <Button variant="outlined" size="small" startIcon={<PdfIcon />}
                onClick={handleExportPDF}
                sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                PDF
              </Button>
            </Tooltip>
            <Button variant="contained" startIcon={<AddIcon />}
              onClick={openCreateDialog}
              sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>
              Add User
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Stats Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={700} color="primary.main">{users.length}</Typography>
              <Typography variant="caption" color="text.secondary">Total Users</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={700} color="success.main">{users.filter(u => u.is_active).length}</Typography>
              <Typography variant="caption" color="text.secondary">Active</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={700} color="error.main">{users.filter(u => !u.is_active).length}</Typography>
              <Typography variant="caption" color="text.secondary">Inactive</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={700} color="secondary.main">{new Set(users.map(u => u.department_name)).size}</Typography>
              <Typography variant="caption" color="text.secondary">Departments</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search & Filters */}
      <Paper elevation={0} sx={{ mb: 2, p: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <TextField
            size="small" placeholder="Search by name, email, or department..."
            value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            sx={{ flex: 1, minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Role</InputLabel>
            <Select label="Role" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
              <MenuItem value="">All Roles</MenuItem>
              <MenuItem value="ADMIN">Super Administrator</MenuItem>
              <MenuItem value="GENERAL_USER">General User</MenuItem>
              <MenuItem value="PROGRAM_LEAD">Program Lead</MenuItem>
              <MenuItem value="HEAD_OF_PROGRAMS">Head of Programs</MenuItem>
              <MenuItem value="FINANCE_CLERK">Finance Clerk</MenuItem>
              <MenuItem value="PROCUREMENT_OFFICER">Procurement Officer</MenuItem>
              <MenuItem value="PROCUREMENT_COMMITTEE">Procurement Committee</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Department</InputLabel>
            <Select label="Department" value={filterDept} onChange={(e) => setFilterDept(e.target.value as number | '')}>
              <MenuItem value="">All Departments</MenuItem>
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>{d.department_name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as '' | 'active' | 'inactive')}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchUsers}><RefreshIcon /></IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {/* Tabs */}
      <Paper elevation={0} sx={{ mb: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs value={activeTab} onChange={(_, v) => { setActiveTab(v); setPage(0); }}>
          <Tab label={`Active Users (${activeUsers.length})`} icon={<PersonIcon />} iconPosition="start" />
          <Tab label={`Inactive Users (${inactiveUsers.length})`} icon={<LockIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Users Table */}
      <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#006064' }}>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1.5, fontSize: '0.74rem' }}>#</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1.5, fontSize: '0.74rem' }}>User / Email</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1.5, fontSize: '0.74rem' }}>Role</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1.5, fontSize: '0.74rem' }}>Department</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1.5, fontSize: '0.74rem' }}>Status</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1.5, fontSize: '0.74rem' }}>Last Login</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1.5, fontSize: '0.74rem' }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Box py={4} textAlign="center">
                      <PersonIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                      <Typography color="text.secondary" fontSize="0.85rem">No users found</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                pagedUsers.map((u, idx) => (
                  <TableRow key={u.id} hover sx={{ '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) } }}>
                    <TableCell sx={{ py: 0.8, px: 1.5, fontSize: '0.78rem', color: 'text.secondary' }}>{idx + 1}</TableCell>
                    <TableCell sx={{ py: 0.8, px: 1.5 }}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: '0.68rem', flexShrink: 0 }}>
                          {u.first_name[0]}{u.last_name[0]}
                        </Avatar>
                        <Box>
                          <Typography fontWeight={600} fontSize="0.82rem" lineHeight={1.2}>{u.first_name} {u.last_name}</Typography>
                          <Typography fontSize="0.72rem" color="text.secondary" lineHeight={1.2}>{u.email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ py: 0.8, px: 1.5 }}>
                      <Chip label={getRoleLabel(u.role || u.role_name || '')} color={getRoleColor(u.role || u.role_name || '')} size="small"
                        sx={{ fontSize: '0.68rem', height: 20, '& .MuiChip-label': { px: 0.8 } }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.8, px: 1.5 }}>
                      <Chip label={u.department_code || u.department_name || '-'} size="small" variant="outlined"
                        sx={{ fontSize: '0.68rem', height: 20, '& .MuiChip-label': { px: 0.8 } }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.8, px: 1.5 }}>
                      <Chip label={u.is_active ? 'Active' : 'Inactive'} size="small"
                        color={u.is_active ? 'success' : 'default'}
                        sx={{ fontWeight: 600, fontSize: '0.68rem', height: 20, '& .MuiChip-label': { px: 0.8 } }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.8, px: 1.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                      {u.last_login ? format(new Date(u.last_login), 'MMM d, yyyy HH:mm') : 'Never'}
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.8, px: 1 }}>
                      <Box display="flex" justifyContent="center" gap={0.3}>
                        <Tooltip title="View Profile">
                          <IconButton size="small" sx={{ p: 0.4 }} onClick={() => openProfileDialog(u)}><ViewIcon sx={{ fontSize: 16 }} /></IconButton>
                        </Tooltip>
                        <Tooltip title="Edit User">
                          <IconButton size="small" sx={{ p: 0.4 }} onClick={() => openEditDialog(u)}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
                        </Tooltip>
                        <Tooltip title="Reset Password">
                          <IconButton size="small" sx={{ p: 0.4 }} onClick={() => { setResetUser(u); setNewPassword(''); setResetDialogOpen(true); }}>
                            <LockIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={u.is_active ? 'Deactivate' : 'Activate'}>
                          <IconButton size="small" sx={{ p: 0.4 }} color={u.is_active ? 'warning' : 'success'}
                            onClick={() => handleToggleActive(u)}
                            disabled={u.id === currentUser?.id}>
                            {u.is_active ? <LockIcon sx={{ fontSize: 16 }} /> : <UnlockIcon sx={{ fontSize: 16 }} />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={u.id === currentUser?.id ? 'Cannot delete own account' : 'Delete User'}>
                          <span>
                            <IconButton size="small" sx={{ p: 0.4 }} color="error"
                              onClick={() => setDeleteTarget(u)}
                              disabled={u.id === currentUser?.id}>
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={currentList.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[5, 10, 25, 50, { value: -1, label: 'All' }]}
          labelRowsPerPage="Rows per page:"
          sx={{ borderTop: `1px solid ${theme.palette.divider}` }}
        />
      </Paper>

      {/* ==================== CREATE/EDIT USER DIALOG ==================== */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            {editUser ? <EditIcon color="primary" /> : <AddIcon color="primary" />}
            <Typography variant="h6">{editUser ? 'Edit User' : 'Create New User'}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={6}>
              <TextField label="First Name" fullWidth required size="small"
                value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Last Name" fullWidth required size="small"
                value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Email" fullWidth required size="small" type="email"
                value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" /></InputAdornment> }} />
            </Grid>
            {!editUser && (
              <Grid item xs={12}>
                <TextField label="Password" fullWidth required size="small"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  helperText="Minimum 8 characters"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <HideIcon fontSize="small" /> : <ViewIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }} />
              </Grid>
            )}
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select label="Role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  <MenuItem value="ADMIN">Super Administrator</MenuItem>
                  <MenuItem value="GENERAL_USER">General User</MenuItem>
                  <MenuItem value="PROGRAM_LEAD">Program Lead</MenuItem>
                  <MenuItem value="HEAD_OF_PROGRAMS">Head of Programs</MenuItem>
                  <MenuItem value="FINANCE_CLERK">Finance Clerk</MenuItem>
                  <MenuItem value="PROCUREMENT_OFFICER">Procurement Officer</MenuItem>
                  <MenuItem value="PROCUREMENT_COMMITTEE">Procurement Committee</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Department</InputLabel>
                <Select label="Department" value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: Number(e.target.value) })}>
                  {departments.map((d) => (
                    <MenuItem key={d.id} value={d.id}>{d.department_name} ({d.department_code})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {editUser && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={<Switch checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />}
                  label="Active Account"
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveUser} disabled={isSaving}
            startIcon={isSaving ? <CircularProgress size={18} /> : (editUser ? <EditIcon /> : <AddIcon />)}>
            {editUser ? 'Update' : 'Create'} User
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== PASSWORD RESET DIALOG ==================== */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <LockIcon color="warning" />
            <Typography variant="h6">Reset Password</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {resetUser && (
            <Box sx={{ mt: 1 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Resetting password for <strong>{resetUser.first_name} {resetUser.last_name}</strong> ({resetUser.email})
              </Alert>
              <TextField label="New Password" fullWidth size="small"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                helperText="Minimum 8 characters"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowNewPassword(!showNewPassword)}>
                        {showNewPassword ? <HideIcon fontSize="small" /> : <ViewIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  )
                }} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleResetPassword}
            disabled={!newPassword || newPassword.length < 8}>
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== USER PROFILE DIALOG ==================== */}
      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <PersonIcon color="primary" />
            <Typography variant="h6">User Profile</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {profileUser && (
            <Box>
              <Box display="flex" alignItems="center" gap={2} mb={3}>
                <Avatar sx={{ width: 60, height: 60, bgcolor: 'primary.main', fontSize: '1.4rem' }}>
                  {profileUser.first_name[0]}{profileUser.last_name[0]}
                </Avatar>
                <Box>
                  <Typography variant="h6">{profileUser.first_name} {profileUser.last_name}</Typography>
                  <Typography variant="body2" color="text.secondary">{profileUser.email}</Typography>
                  <Box display="flex" gap={1} mt={0.5}>
                    <Chip label={getRoleLabel(profileUser.role || profileUser.role_name || '')}
                      color={getRoleColor(profileUser.role || profileUser.role_name || '')} size="small" />
                    <Chip label={profileUser.is_active ? 'Active' : 'Inactive'}
                      color={profileUser.is_active ? 'success' : 'default'} size="small" />
                  </Box>
                </Box>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Department</Typography>
                  <Typography fontWeight={500}>{profileUser.department_name || '-'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Account Created</Typography>
                  <Typography fontWeight={500}>
                    {profileUser.created_at ? format(new Date(profileUser.created_at), 'MMM d, yyyy') : '-'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Last Login</Typography>
                  <Typography fontWeight={500}>
                    {profileUser.last_login ? format(new Date(profileUser.last_login), 'MMM d, yyyy HH:mm') : 'Never'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Last Updated</Typography>
                  <Typography fontWeight={500}>
                    {profileUser.updated_at ? format(new Date(profileUser.updated_at), 'MMM d, yyyy') : '-'}
                  </Typography>
                </Grid>
              </Grid>

              {loginHistory.length > 0 && (
                <Box mt={3}>
                  <Divider sx={{ mb: 2 }} />
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <HistoryIcon fontSize="small" color="primary" />
                    <Typography variant="subtitle2" fontWeight={600}>Recent Login History</Typography>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date & Time</TableCell>
                          <TableCell>IP Address</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {loginHistory.slice(0, 10).map((entry: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{format(new Date(entry.login_at || entry.created_at), 'MMM d, yyyy HH:mm')}</TableCell>
                            <TableCell>{entry.ip_address || '-'}</TableCell>
                            <TableCell>
                              <Chip label={entry.success ? 'Success' : 'Failed'} size="small"
                                color={entry.success ? 'success' : 'error'} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileOpen(false)}>Close</Button>
          <Button variant="outlined" startIcon={<EditIcon />}
            onClick={() => { setProfileOpen(false); if (profileUser) openEditDialog(profileUser); }}>
            Edit User
          </Button>
        </DialogActions>
      </Dialog>
      {/* ==================== DELETE USER DIALOG ==================== */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteIcon color="error" />
            <Typography variant="h6">Delete User</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Box>
              <Alert severity="error" sx={{ mb: 2 }}>
                You are about to delete <strong>{deleteTarget.first_name} {deleteTarget.last_name}</strong> ({deleteTarget.email}).
              </Alert>
              <Typography variant="body2" color="text.secondary">
                If this user has existing requests, the account will be deactivated instead of permanently deleted.
                This action cannot be undone.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteUser} disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={18} /> : <DeleteIcon />}>
            Delete User
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagementPage;
