/**
 * User Management Page (Admin)
 * CRUD operations for users, password reset, profile management, login history
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Chip, CircularProgress, Dialog, DialogTitle,
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
  ManageAccounts as ManageIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
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

  const getRoleColor = (role: string): 'success' | 'primary' | 'secondary' | 'warning' | 'error' | 'default' => {
    switch (role) {
      case 'ADMIN': return 'error';
      case 'FINANCE_CLERK': return 'success';
      case 'HEAD_OF_PROGRAMS': return 'secondary';
      case 'PROGRAM_LEAD': return 'primary';
      default: return 'default';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'System Admin';
      case 'FINANCE_CLERK': return 'Finance Clerk';
      case 'HEAD_OF_PROGRAMS': return 'Head of Programs';
      case 'PROGRAM_LEAD': return 'Program Lead';
      case 'GENERAL_USER': return 'General User';
      default: return role?.replace(/_/g, ' ') || 'Unknown';
    }
  };

  const filteredUsers = users.filter(u =>
    (u.first_name + ' ' + u.last_name + ' ' + u.email + ' ' + (u.department_name || ''))
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  const activeUsers = filteredUsers.filter(u => u.is_active);
  const inactiveUsers = filteredUsers.filter(u => !u.is_active);

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
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={openCreateDialog}
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>
            Add User
          </Button>
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
        <Box display="flex" gap={2} alignItems="center">
          <TextField
            size="small" placeholder="Search users by name, email, or department..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            sx={{ flex: 1 }}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={fetchUsers}><RefreshIcon /></IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {/* Tabs */}
      <Paper elevation={0} sx={{ mb: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label={`Active Users (${activeUsers.length})`} icon={<PersonIcon />} iconPosition="start" />
          <Tab label={`Inactive Users (${inactiveUsers.length})`} icon={<LockIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Users Table */}
      <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Last Login</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(activeTab === 0 ? activeUsers : inactiveUsers).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Box py={4} textAlign="center">
                      <PersonIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                      <Typography color="text.secondary">No users found</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                (activeTab === 0 ? activeUsers : inactiveUsers).map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1.5}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.8rem' }}>
                          {u.first_name[0]}{u.last_name[0]}
                        </Avatar>
                        <Typography fontWeight={500}>{u.first_name} {u.last_name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{u.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={getRoleLabel(u.role || u.role_name || '')} color={getRoleColor(u.role || u.role_name || '')} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip label={u.department_code || u.department_name || '-'} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={u.is_active ? 'Active' : 'Inactive'} size="small"
                        color={u.is_active ? 'success' : 'default'}
                        sx={{ fontWeight: 500 }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {u.last_login ? format(new Date(u.last_login), 'MMM d, yyyy HH:mm') : 'Never'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" justifyContent="center" gap={0.5}>
                        <Tooltip title="View Profile">
                          <IconButton size="small" onClick={() => openProfileDialog(u)}><ViewIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Edit User">
                          <IconButton size="small" onClick={() => openEditDialog(u)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Reset Password">
                          <IconButton size="small" onClick={() => { setResetUser(u); setNewPassword(''); setResetDialogOpen(true); }}>
                            <LockIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={u.is_active ? 'Deactivate' : 'Activate'}>
                          <IconButton size="small" color={u.is_active ? 'error' : 'success'}
                            onClick={() => handleToggleActive(u)}
                            disabled={u.id === currentUser?.id}>
                            {u.is_active ? <DeleteIcon fontSize="small" /> : <UnlockIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
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
                  <MenuItem value="ADMIN">System Admin</MenuItem>
                  <MenuItem value="GENERAL_USER">General User</MenuItem>
                  <MenuItem value="PROGRAM_LEAD">Program Lead</MenuItem>
                  <MenuItem value="HEAD_OF_PROGRAMS">Head of Programs</MenuItem>
                  <MenuItem value="FINANCE_CLERK">Finance Clerk</MenuItem>
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
    </Box>
  );
};

export default UserManagementPage;
