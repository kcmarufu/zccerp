/**
 * Department Management Page (Admin)
 * CRUD operations for departments, user counts, activate/deactivate
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Chip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Grid, IconButton, Tooltip,
  Alert, Switch, FormControlLabel, InputAdornment, useTheme, alpha, Card, CardContent
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Business as DeptIcon,
  People as PeopleIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import api from '../../services/api';

interface DepartmentRecord {
  id: number;
  department_name: string;
  department_code: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  active_user_count: number;
}

const DepartmentManagementPage: React.FC = () => {
  const theme = useTheme();

  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDept, setEditDept] = useState<DepartmentRecord | null>(null);
  const [formData, setFormData] = useState({
    department_name: '',
    department_code: '',
    description: '',
    is_active: true
  });
  const [isSaving, setIsSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<DepartmentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDepartments = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/admin/departments');
      if (response.data.success) {
        setDepartments(response.data.data);
      }
    } catch (error) {
      toast.error('Failed to load departments');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const openCreateDialog = () => {
    setEditDept(null);
    setFormData({ department_name: '', department_code: '', description: '', is_active: true });
    setDialogOpen(true);
  };

  const openEditDialog = (dept: DepartmentRecord) => {
    setEditDept(dept);
    setFormData({
      department_name: dept.department_name,
      department_code: dept.department_code,
      description: dept.description || '',
      is_active: dept.is_active
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.department_name.trim() || !formData.department_code.trim()) {
      toast.warning('Department name and code are required');
      return;
    }
    try {
      setIsSaving(true);
      if (editDept) {
        await api.put(`/admin/departments/${editDept.id}`, formData);
        toast.success('Department updated successfully');
      } else {
        await api.post('/admin/departments', formData);
        toast.success('Department created successfully');
      }
      setDialogOpen(false);
      fetchDepartments();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to save department');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await api.delete(`/admin/departments/${deleteTarget.id}`);
      toast.success('Department deactivated successfully');
      setDeleteTarget(null);
      fetchDepartments();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to deactivate department');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDepts = departments.filter(d =>
    (d.department_name + ' ' + d.department_code + ' ' + (d.description || ''))
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  const activeDepts = departments.filter(d => d.is_active);
  const totalUsers = departments.reduce((s, d) => s + (d.user_count || 0), 0);

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
          background: `linear-gradient(135deg, ${theme.palette.success.dark} 0%, #1b5e20 100%)`,
          color: 'white', borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={2}>
            <DeptIcon sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="h5" fontWeight={600}>Department Management</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                Create and manage organisational departments
              </Typography>
            </Box>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={openCreateDialog}
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>
            Add Department
          </Button>
        </Box>
      </Paper>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={700} color="primary.main">{departments.length}</Typography>
              <Typography variant="caption" color="text.secondary">Total Departments</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={700} color="success.main">{activeDepts.length}</Typography>
              <Typography variant="caption" color="text.secondary">Active</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={700} color="error.main">{departments.length - activeDepts.length}</Typography>
              <Typography variant="caption" color="text.secondary">Inactive</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
            <CardContent sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="h4" fontWeight={700} color="secondary.main">{totalUsers}</Typography>
              <Typography variant="caption" color="text.secondary">Total Users</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search */}
      <Paper elevation={0} sx={{ mb: 2, p: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Box display="flex" gap={2} alignItems="center">
          <TextField
            size="small" placeholder="Search departments..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            sx={{ flex: 1 }}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={fetchDepartments}><RefreshIcon /></IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {/* Table */}
      <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}` }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 600 }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Users</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredDepts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Box py={4} textAlign="center">
                      <DeptIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                      <Typography color="text.secondary">No departments found</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                filteredDepts.map((dept) => (
                  <TableRow key={dept.id} hover sx={!dept.is_active ? { opacity: 0.6 } : {}}>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <DeptIcon fontSize="small" color={dept.is_active ? 'primary' : 'disabled'} />
                        <Typography fontWeight={500}>{dept.department_name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={dept.department_code} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{dept.description || '—'}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                        <PeopleIcon fontSize="small" color="action" />
                        <Typography variant="body2">
                          {dept.active_user_count}<Typography component="span" color="text.secondary" variant="caption">/{dept.user_count}</Typography>
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={dept.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={dept.is_active ? 'success' : 'default'}
                        icon={dept.is_active ? <ActiveIcon /> : <InactiveIcon />}
                        sx={{ fontWeight: 500 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {dept.created_at ? format(new Date(dept.created_at), 'MMM d, yyyy') : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" justifyContent="center" gap={0.5}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEditDialog(dept)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title={dept.user_count > 0 ? 'Has users — deactivate only' : 'Deactivate Department'}>
                          <span>
                            <IconButton size="small" color="error"
                              onClick={() => setDeleteTarget(dept)}
                              disabled={!dept.is_active}>
                              <DeleteIcon fontSize="small" />
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
      </Paper>

      {/* ==================== CREATE/EDIT DIALOG ==================== */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            {editDept ? <EditIcon color="primary" /> : <AddIcon color="primary" />}
            <Typography variant="h6">{editDept ? 'Edit Department' : 'Create Department'}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={8}>
              <TextField label="Department Name" fullWidth required size="small"
                value={formData.department_name}
                onChange={(e) => setFormData({ ...formData, department_name: e.target.value })} />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Code" fullWidth required size="small"
                inputProps={{ style: { textTransform: 'uppercase' } }}
                value={formData.department_code}
                onChange={(e) => setFormData({ ...formData, department_code: e.target.value.toUpperCase() })}
                helperText="e.g. HR, FIN, IT" />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Description" fullWidth size="small" multiline rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </Grid>
            {editDept && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={<Switch checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} />}
                  label="Active Department"
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={isSaving}
            startIcon={isSaving ? <CircularProgress size={18} /> : (editDept ? <EditIcon /> : <AddIcon />)}>
            {editDept ? 'Update' : 'Create'} Department
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== DELETE DIALOG ==================== */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteIcon color="error" />
            <Typography variant="h6">Deactivate Department</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {deleteTarget && (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Deactivating <strong>{deleteTarget.department_name}</strong> ({deleteTarget.department_code}).
              </Alert>
              {deleteTarget.user_count > 0 ? (
                <Alert severity="error">
                  This department has <strong>{deleteTarget.user_count}</strong> user(s). Please reassign them before deactivating.
                </Alert>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  This department will be deactivated and hidden from dropdowns. No data will be lost.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}
            disabled={isDeleting || (deleteTarget?.user_count || 0) > 0}
            startIcon={isDeleting ? <CircularProgress size={18} /> : <DeleteIcon />}>
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DepartmentManagementPage;
