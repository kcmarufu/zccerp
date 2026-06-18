/**
 * Vendor Database Page
 * Manage suppliers and vendor prequalification
 */

import React, { useState } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Grid, Chip, IconButton, Table,
  TableHead, TableRow, TableCell, TableBody, TableContainer, TablePagination, Dialog,
  DialogTitle, DialogContent, DialogActions, Stack, Avatar, Switch,
  FormControlLabel, InputAdornment, Alert, CircularProgress, Rating,
  Tooltip, MenuItem, alpha, useTheme
} from '@mui/material';
import {
  Search as SearchIcon,
  AddCircle as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Store as VendorIcon,
  Verified as VerifiedIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../store/authStore';
import { getVendors, createVendor, updateVendor, deleteVendor } from '../../services/procurementService';
import { ProcVendor } from '../../types';

const CATEGORIES = ['IT Equipment', 'Office Supplies', 'Construction', 'Vehicles', 'Consultancy', 'Food & Beverage', 'Medical', 'Training', 'Transport', 'Other'];

const emptyVendor = (): Partial<ProcVendor> => ({
  company_name: '', contact_person: '', email: '', phone: '', address: '',
  tin_number: '', registration_number: '', category: '', notes: '',
  is_prequalified: false, is_active: true
});

const VendorDatabase: React.FC = () => {
  const theme = useTheme();
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [prequalFilter, setPrequalFilter] = useState('');
  const [dialog, setDialog] = useState<null | 'create' | 'edit'>(null);
  const [selected, setSelected] = useState<Partial<ProcVendor> | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<ProcVendor>>(emptyVendor());
  const [deleteTarget, setDeleteTarget] = useState<ProcVendor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  const canManage = hasPermission('manage_vendors');

  const { data: vendors = [], isLoading, error, refetch } = useQuery({
    queryKey: ['proc-vendors', search, categoryFilter, prequalFilter],
    queryFn: () => getVendors({
      search: search || undefined,
      category: categoryFilter || undefined,
      is_prequalified: prequalFilter || undefined
    }),
    refetchInterval: 60000
  });

  const openCreate = () => {
    setFormData(emptyVendor());
    setDialog('create');
  };

  const openEdit = (vendor: ProcVendor) => {
    setSelected(vendor);
    setFormData({ ...vendor });
    setDialog('edit');
  };

  const handleSave = async () => {
    if (!formData.company_name?.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      if (dialog === 'create') {
        await createVendor(formData);
        toast.success('Vendor created successfully');
      } else if (dialog === 'edit' && selected?.id) {
        await updateVendor(selected.id, formData);
        toast.success('Vendor updated successfully');
      }
      setDialog(null);
      qc.invalidateQueries({ queryKey: ['proc-vendors'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await deleteVendor(deleteTarget.id);
      toast.success('Vendor deactivated successfully');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['proc-vendors'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const field = (k: keyof ProcVendor) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(f => ({ ...f, [k]: e.target.value }));
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <VendorIcon color="primary" />
          <Typography variant="h5" fontWeight={600}>Vendor Database</Typography>
          <Chip label={vendors.length} size="small" color="primary" sx={{ ml: 1 }} />
        </Box>
        <Stack direction="row" spacing={1}>
          <IconButton onClick={() => refetch()} size="small"><RefreshIcon /></IconButton>
          {canManage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add Vendor</Button>
          )}
        </Stack>
      </Box>

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
          <FilterIcon fontSize="small" color="action" />
          <TextField
            size="small" placeholder="Search vendors..." sx={{ minWidth: 250 }}
            value={search} onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <TextField select size="small" label="Category" sx={{ minWidth: 160 }}
            value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <MenuItem value="">All Categories</MenuItem>
            {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Prequalification" sx={{ minWidth: 160 }}
            value={prequalFilter} onChange={e => setPrequalFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Prequalified</MenuItem>
            <MenuItem value="false">Not Prequalified</MenuItem>
          </TextField>
          {(search || categoryFilter || prequalFilter) && (
            <Button size="small" onClick={() => { setSearch(''); setCategoryFilter(''); setPrequalFilter(''); }}>Clear</Button>
          )}
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load vendors.</Alert>}

      <TableContainer component={Paper} elevation={1} sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell><strong>Code</strong></TableCell>
              <TableCell><strong>Company</strong></TableCell>
              <TableCell><strong>Contact</strong></TableCell>
              <TableCell><strong>Category</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Rating</strong></TableCell>
              <TableCell><strong>Quotations</strong></TableCell>
              <TableCell align="center"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><CircularProgress size={32} /></TableCell></TableRow>
            ) : vendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <VendorIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1, display: 'block', mx: 'auto' }} />
                  <Typography color="text.secondary">No vendors found</Typography>
                </TableCell>
              </TableRow>
            ) : vendors.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((vendor) => (
              <TableRow key={vendor.id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                <TableCell>
                  <Typography variant="body2" fontWeight={700} color="primary">{vendor.vendor_code}</Typography>
                </TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: alpha('#1976d2', 0.1), color: '#1976d2', fontSize: '0.75rem' }}>
                      {vendor.company_name[0]}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{vendor.company_name}</Typography>
                      {vendor.tin_number && <Typography variant="caption" color="text.secondary">TIN: {vendor.tin_number}</Typography>}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{vendor.contact_person || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">{vendor.email}</Typography>
                </TableCell>
                <TableCell>
                  {vendor.category ? <Chip label={vendor.category} size="small" variant="outlined" /> : '—'}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    {vendor.is_prequalified && (
                      <Chip icon={<VerifiedIcon />} label="Prequalified" color="success" size="small" />
                    )}
                    <Chip label={vendor.is_active ? 'Active' : 'Inactive'} color={vendor.is_active ? 'default' : 'error'} size="small" variant="outlined" />
                  </Stack>
                </TableCell>
                <TableCell>
                  <Rating value={vendor.rating || 0} readOnly size="small" precision={0.5} />
                </TableCell>
                <TableCell>
                  <Chip label={vendor.quotation_count ?? 0} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="center">
                  {canManage && (
                    <Tooltip title="Edit">
                      <IconButton size="small" color="primary" onClick={() => openEdit(vendor)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canManage && (
                    <Tooltip title="Deactivate / Delete">
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(vendor)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={vendors.length}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 15, 25, 50]}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Deactivate Vendor</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to deactivate <strong>{deleteTarget?.company_name}</strong>? This will mark the vendor as inactive and they will no longer appear in active vendor lists.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}>
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={Boolean(dialog)} onClose={() => !saving && setDialog(null)} maxWidth="md" fullWidth>
        <DialogTitle>{dialog === 'create' ? 'Add New Vendor' : 'Edit Vendor'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth required label="Company Name" value={formData.company_name || ''} onChange={field('company_name')} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Contact Person" value={formData.contact_person || ''} onChange={field('contact_person')} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth type="email" label="Email" value={formData.email || ''} onChange={field('email')} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Phone" value={formData.phone || ''} onChange={field('phone')} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Address" multiline rows={2} value={formData.address || ''} onChange={field('address')} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="TIN Number" value={formData.tin_number || ''} onChange={field('tin_number')} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Registration Number" value={formData.registration_number || ''} onChange={field('registration_number')} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select fullWidth label="Category" value={formData.category || ''} onChange={field('category')}>
                <MenuItem value="">Select category</MenuItem>
                {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={<Switch checked={Boolean(formData.is_prequalified)} onChange={e => setFormData(f => ({ ...f, is_prequalified: e.target.checked }))} />}
                label="Prequalified Vendor"
              />
            </Grid>
            {dialog === 'edit' && (
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={<Switch checked={Boolean(formData.is_active)} onChange={e => setFormData(f => ({ ...f, is_active: e.target.checked }))} />}
                  label="Active"
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField fullWidth multiline rows={2} label="Notes" value={formData.notes || ''} onChange={field('notes')} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}>
            {dialog === 'create' ? 'Add Vendor' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VendorDatabase;
