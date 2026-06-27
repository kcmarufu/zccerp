import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, MenuItem, CircularProgress, Alert, Tooltip,
  Card, CardContent, Tabs, Tab, TablePagination, InputAdornment,
  Divider, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Visibility as ViewIcon,
  Search as SearchIcon, Refresh as RefreshIcon,
  Assignment as AssignIcon, SwapHoriz as TransferIcon,
  Build as MaintenanceIcon, Delete as DisposeIcon,
  ReportProblem as IncidentIcon, ExpandMore as ExpandMoreIcon,
  Dashboard as DashboardIcon, CheckCircle as CheckInIcon,
  Timeline as TimelineIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import assetService, {
  Asset, AssetCategory, AssetLocation, AssetSupplier, AssetDashboardStats,
  AssetAssignment, AssetTransfer, AssetMaintenance, AssetDisposal, AssetIncident,
  AssetStatusHistoryEntry, AssetStatus, ConditionRating
} from '../services/assetService';
import donorService from '../services/donorService';
import api from '../services/api';

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  IN_USE: 'success', PURCHASED: 'info', REQUESTED: 'default', APPROVED: 'info',
  TRANSFERRED: 'warning', DAMAGED: 'error', LOST: 'error', DISPOSED: 'default', WRITTEN_OFF: 'default'
};
const CONDITION_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  EXCELLENT: 'success', GOOD: 'success', FAIR: 'warning', POOR: 'error', NON_FUNCTIONAL: 'error'
};
const ALL_STATUSES: AssetStatus[] = ['REQUESTED','APPROVED','PURCHASED','IN_USE','TRANSFERRED','DAMAGED','LOST','DISPOSED','WRITTEN_OFF'];
const ALL_CONDITIONS: ConditionRating[] = ['EXCELLENT','GOOD','FAIR','POOR','NON_FUNCTIONAL'];

const EMPTY_ASSET_FORM = {
  assetName: '', description: '', categoryId: '', serialNumber: '', model: '', manufacturer: '',
  donorId: '', projectName: '', purchaseDate: '', purchaseCost: 0, currencyCode: 'USD',
  supplierId: '', purchaseOrderRef: '', invoiceRef: '', usefulLifeYears: 3, salvageValue: 0,
  depreciationMethod: 'STRAIGHT_LINE', warrantyStartDate: '', warrantyEndDate: '', warrantyProvider: '',
  warrantyTerms: '', locationId: '', custodianId: '', departmentId: '', status: 'IN_USE' as AssetStatus,
  conditionRating: 'GOOD' as ConditionRating, insurancePolicyNo: '', insuranceExpiry: '', insuredValue: 0,
  notes: '', barcode: ''
};

// ============================================================================
// Component
// ============================================================================

const AssetRegisterPage: React.FC = () => {
  // Tabs
  const [activeTab, setActiveTab] = useState(0);

  // Dashboard
  const [stats, setStats] = useState<AssetDashboardStats | null>(null);

  // Asset list
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Lookups
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [locations, setLocations] = useState<AssetLocation[]>([]);
  const [suppliers, setSuppliers] = useState<AssetSupplier[]>([]);
  const [donors, setDonors] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Asset CRUD dialog
  const [openForm, setOpenForm] = useState(false);
  const [formData, setFormData] = useState<any>({ ...EMPTY_ASSET_FORM });
  const [editId, setEditId] = useState<number | null>(null);

  // Detail dialog
  const [openDetail, setOpenDetail] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [assetHistory, setAssetHistory] = useState<AssetStatusHistoryEntry[]>([]);
  const [assetAssignments, setAssetAssignments] = useState<AssetAssignment[]>([]);

  // Checkout dialog
  const [openCheckout, setOpenCheckout] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ assetId: 0, assignedTo: '', expectedReturnDate: '', purpose: '', locationId: '', notes: '' });

  // Checkin dialog
  const [openCheckin, setOpenCheckin] = useState(false);
  const [checkinForm, setCheckinForm] = useState({ assignmentId: 0, returnCondition: 'GOOD', returnNotes: '' });

  // Transfer dialog
  const [openTransfer, setOpenTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({ assetId: 0, toLocationId: '', toDepartmentId: '', toCustodianId: '', transferReason: '' });

  // Maintenance dialog
  const [openMaintenance, setOpenMaintenance] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({ assetId: 0, maintenanceType: 'PREVENTIVE', description: '', priority: 'MEDIUM', scheduledDate: '', cost: 0, vendorName: '', notes: '' });

  // Disposal dialog
  const [openDisposal, setOpenDisposal] = useState(false);
  const [disposalForm, setDisposalForm] = useState({ assetId: 0, disposalType: 'WRITE_OFF', disposalReason: '', disposalDescription: '', disposalDate: '', saleValue: 0, buyerName: '', notes: '' });

  // Incident dialog
  const [openIncident, setOpenIncident] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ assetId: 0, incidentType: 'DAMAGED', incidentDate: '', location: '', description: '', severity: 'MEDIUM', policeReportRef: '', estimatedLoss: 0, notes: '' });

  // Secondary list tabs (transfers, maintenance, disposals, incidents)
  const [transfers, setTransfers] = useState<AssetTransfer[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<AssetMaintenance[]>([]);
  const [disposals, setDisposals] = useState<AssetDisposal[]>([]);
  const [incidents, setIncidents] = useState<AssetIncident[]>([]);

  // ========================================================================
  // Data Loading
  // ========================================================================

  const loadLookups = useCallback(async () => {
    try {
      const [cats, locs, sups, donorRes, deptRes] = await Promise.all([
        assetService.getCategories(),
        assetService.getLocations(),
        assetService.getSuppliers(),
        donorService.getAllDonors().catch((): any[] => []),
        api.get('/departments').then(r => r.data).catch(() => ({ data: [] }))
      ]);
      setCategories(cats || []);
      setLocations(locs || []);
      setSuppliers(sups || []);
      setDonors(Array.isArray(donorRes) ? donorRes : []);
      const depts = Array.isArray(deptRes?.data) ? deptRes.data : [];
      setDepartments(depts);
    } catch (e) {
      console.error('Error loading lookups:', e);
    }
  }, []);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const result = await assetService.getAssets({
        page: page + 1, limit: rowsPerPage, search, status: filterStatus, categoryId: filterCategory
      });
      setAssets(result.data || []);
      setTotal(result.pagination?.total || 0);
    } catch (e: any) {
      toast.error('Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, filterStatus, filterCategory]);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await assetService.getDashboardStats();
      setStats(data);
    } catch (e) { console.error(e); }
  }, []);

  const loadSecondaryData = useCallback(async () => {
    try {
      const [t, m, d, i] = await Promise.all([
        assetService.getTransfers(),
        assetService.getMaintenanceRecords(),
        assetService.getDisposals(),
        assetService.getIncidents()
      ]);
      setTransfers(t || []);
      setMaintenanceRecords(m || []);
      setDisposals(d || []);
      setIncidents(i || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadLookups(); }, [loadLookups]);
  useEffect(() => { if (activeTab === 0) loadDashboard(); }, [activeTab, loadDashboard]);
  useEffect(() => { if (activeTab === 1) loadAssets(); }, [activeTab, loadAssets]);
  useEffect(() => { if (activeTab >= 2) loadSecondaryData(); }, [activeTab, loadSecondaryData]);

  // Load users for assignments
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await api.get('/users/list');
        setUsers(res.data.data || []);
      } catch { setUsers([]); }
    };
    loadUsers();
  }, []);

  // ========================================================================
  // Handlers
  // ========================================================================

  const handleOpenCreate = () => { setFormData({ ...EMPTY_ASSET_FORM }); setEditId(null); setOpenForm(true); };
  const handleOpenEdit = (asset: Asset) => {
    setFormData({
      assetName: asset.asset_name, description: asset.description || '', categoryId: asset.category_id,
      serialNumber: asset.serial_number || '', model: asset.model || '', manufacturer: asset.manufacturer || '',
      donorId: asset.donor_id || '', projectName: asset.project_name || '',
      purchaseDate: asset.purchase_date?.slice(0, 10) || '', purchaseCost: asset.purchase_cost,
      currencyCode: asset.currency_code, supplierId: asset.supplier_id || '',
      purchaseOrderRef: asset.purchase_order_ref || '', invoiceRef: asset.invoice_ref || '',
      usefulLifeYears: asset.useful_life_years, salvageValue: asset.salvage_value,
      depreciationMethod: asset.depreciation_method, warrantyStartDate: asset.warranty_start_date?.slice(0, 10) || '',
      warrantyEndDate: asset.warranty_end_date?.slice(0, 10) || '', warrantyProvider: asset.warranty_provider || '',
      warrantyTerms: asset.warranty_terms || '', locationId: asset.location_id || '',
      custodianId: asset.custodian_id || '', departmentId: asset.department_id || '',
      status: asset.status, conditionRating: asset.condition_rating,
      insurancePolicyNo: asset.insurance_policy_no || '', insuranceExpiry: asset.insurance_expiry?.slice(0, 10) || '',
      insuredValue: asset.insured_value || 0, notes: asset.notes || '', barcode: asset.barcode || ''
    });
    setEditId(asset.id);
    setOpenForm(true);
  };

  const handleSaveAsset = async () => {
    if (!formData.assetName || !formData.categoryId || !formData.purchaseDate) {
      toast.error('Asset name, category and purchase date are required');
      return;
    }
    try {
      if (editId) {
        await assetService.updateAsset(editId, formData);
        toast.success('Asset updated');
      } else {
        await assetService.createAsset(formData);
        toast.success('Asset registered');
      }
      setOpenForm(false);
      loadAssets();
      loadDashboard();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save asset');
    }
  };

  const handleViewDetail = async (asset: Asset) => {
    try {
      const [full, history, assignments] = await Promise.all([
        assetService.getAssetById(asset.id),
        assetService.getStatusHistory(asset.id),
        assetService.getAssignments(asset.id)
      ]);
      setSelectedAsset(full);
      setAssetHistory(history || []);
      setAssetAssignments(assignments || []);
      setDetailTab(0);
      setOpenDetail(true);
    } catch (e) {
      toast.error('Failed to load asset details');
    }
  };

  const handleCheckout = async () => {
    if (!checkoutForm.assignedTo) { toast.error('Select a user'); return; }
    try {
      await assetService.checkoutAsset({
        assetId: checkoutForm.assetId, assignedTo: Number(checkoutForm.assignedTo),
        expectedReturnDate: checkoutForm.expectedReturnDate || undefined,
        purpose: checkoutForm.purpose || undefined, locationId: checkoutForm.locationId ? Number(checkoutForm.locationId) : undefined,
        notes: checkoutForm.notes || undefined
      });
      toast.success('Asset checked out');
      setOpenCheckout(false);
      loadAssets();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Checkout failed'); }
  };

  const handleCheckin = async () => {
    try {
      await assetService.checkinAsset(checkinForm.assignmentId, {
        returnCondition: checkinForm.returnCondition, returnNotes: checkinForm.returnNotes || undefined
      });
      toast.success('Asset checked in');
      setOpenCheckin(false);
      loadAssets();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Check-in failed'); }
  };

  const handleCreateTransfer = async () => {
    if (!transferForm.transferReason) { toast.error('Transfer reason is required'); return; }
    try {
      await assetService.createTransfer(transferForm);
      toast.success('Transfer initiated');
      setOpenTransfer(false);
      loadSecondaryData();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Transfer failed'); }
  };

  const handleCreateMaintenance = async () => {
    if (!maintenanceForm.description) { toast.error('Description is required'); return; }
    try {
      await assetService.createMaintenance(maintenanceForm);
      toast.success('Maintenance record created');
      setOpenMaintenance(false);
      loadSecondaryData();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleCreateDisposal = async () => {
    if (!disposalForm.disposalReason || !disposalForm.disposalDescription || !disposalForm.disposalDate) {
      toast.error('Reason, description and date are required');
      return;
    }
    try {
      await assetService.createDisposal(disposalForm);
      toast.success('Disposal request created');
      setOpenDisposal(false);
      loadSecondaryData();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleCreateIncident = async () => {
    if (!incidentForm.description || !incidentForm.incidentDate) {
      toast.error('Description and date are required');
      return;
    }
    try {
      await assetService.createIncident(incidentForm);
      toast.success('Incident reported');
      setOpenIncident(false);
      loadSecondaryData();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleApproveTransfer = async (id: number, approved: boolean) => {
    try {
      await assetService.approveTransfer(id, { approved });
      toast.success(approved ? 'Transfer approved' : 'Transfer rejected');
      loadSecondaryData();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleApproveDisposal = async (id: number, approved: boolean) => {
    try {
      await assetService.approveDisposal(id, { approved });
      toast.success(approved ? 'Disposal approved' : 'Disposal rejected');
      loadSecondaryData();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const fmtCurrency = (val: number) => `$${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const fmtDate = (d: string | undefined | null) => d ? new Date(d).toLocaleDateString() : '-';

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight={700} gutterBottom>Asset Management</Typography>
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab icon={<DashboardIcon />} iconPosition="start" label="Dashboard" />
          <Tab label="Asset Register" />
          <Tab label="Transfers" />
          <Tab label="Maintenance" />
          <Tab label="Disposals" />
          <Tab label="Incidents" />
        </Tabs>
      </Paper>

      {/* ================================================================ */}
      {/* TAB 0: DASHBOARD */}
      {/* ================================================================ */}
      {activeTab === 0 && (
        <Box>
          {!stats ? <CircularProgress /> : (
            <>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  { label: 'Total Assets', value: stats.totalAssets, color: '#1976d2', icon: '📦' },
                  { label: 'Total Value', value: fmtCurrency(stats.totalValue), color: '#2e7d32', icon: '💰' },
                  { label: 'Upcoming Maintenance', value: stats.upcomingMaintenance, color: '#ed6c02', icon: '🔧' },
                  { label: 'Open Incidents', value: stats.openIncidents, color: '#d32f2f', icon: '⚠️' },
                  { label: 'Pending Disposals', value: stats.pendingDisposals, color: '#9c27b0', icon: '🗑️' }
                ].map(item => (
                  <Grid item xs={6} sm={4} md={2.4} key={item.label}>
                    <Card sx={{ borderTop: `4px solid ${item.color}`, height: '100%' }}>
                      <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
                        <Typography variant="body2" color="text.secondary" noWrap>{item.label}</Typography>
                        <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5 }}>{item.value}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" gutterBottom>By Category</Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead><TableRow><TableCell>Category</TableCell><TableCell align="right">Count</TableCell><TableCell align="right">Value</TableCell></TableRow></TableHead>
                        <TableBody>
                          {stats.categoryBreakdown.map(c => (
                            <TableRow key={c.category_name}><TableCell>{c.category_name}</TableCell><TableCell align="right">{c.count}</TableCell><TableCell align="right">{fmtCurrency(c.total_value)}</TableCell></TableRow>
                          ))}
                          {stats.categoryBreakdown.length === 0 && <TableRow><TableCell colSpan={3} align="center">No data</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" gutterBottom>By Status</Typography>
                    {stats.statusBreakdown.length === 0 && <Typography color="text.secondary" variant="body2">No data</Typography>}
                    {stats.statusBreakdown.map(s => (
                      <Box key={s.status} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75 }}>
                        <Chip label={s.status.replace(/_/g, ' ')} size="small" color={STATUS_COLORS[s.status] || 'default'} />
                        <Typography fontWeight={600}>{s.count}</Typography>
                      </Box>
                    ))}
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" gutterBottom>By Condition</Typography>
                    {stats.conditionBreakdown.length === 0 && <Typography color="text.secondary" variant="body2">No data</Typography>}
                    {stats.conditionBreakdown.map(c => (
                      <Box key={c.condition_rating} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75 }}>
                        <Chip label={c.condition_rating} size="small" color={CONDITION_COLORS[c.condition_rating] || 'default'} variant="outlined" />
                        <Typography fontWeight={600}>{c.count}</Typography>
                      </Box>
                    ))}
                  </Paper>
                </Grid>
              </Grid>
            </>
          )}
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 1: ASSET REGISTER */}
      {/* ================================================================ */}
      {activeTab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField size="small" placeholder="Search assets..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} sx={{ minWidth: 250 }} />
            <TextField select size="small" label="Status" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }} sx={{ minWidth: 150 }}>
              <MenuItem value="">All</MenuItem>
              {ALL_STATUSES.map(s => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Category" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(0); }} sx={{ minWidth: 150 }}>
              <MenuItem value="">All</MenuItem>
              {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.category_name}</MenuItem>)}
            </TextField>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadAssets}>Refresh</Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>Register Asset</Button>
          </Box>

          {loading ? <CircularProgress /> : (
            <>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tag</TableCell><TableCell>Name</TableCell><TableCell>Category</TableCell>
                      <TableCell>Location</TableCell><TableCell>Custodian</TableCell><TableCell>Status</TableCell>
                      <TableCell>Condition</TableCell><TableCell align="right">Value</TableCell><TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {assets.map(a => (
                      <TableRow key={a.id} hover>
                        <TableCell><Typography variant="body2" fontWeight={600}>{a.asset_tag}</Typography></TableCell>
                        <TableCell>{a.asset_name}</TableCell>
                        <TableCell>{a.category_name || '-'}</TableCell>
                        <TableCell>{a.location_name || '-'}</TableCell>
                        <TableCell>{a.custodian_name || '-'}</TableCell>
                        <TableCell><Chip label={a.status.replace(/_/g, ' ')} size="small" color={STATUS_COLORS[a.status] || 'default'} /></TableCell>
                        <TableCell><Chip label={a.condition_rating} size="small" color={CONDITION_COLORS[a.condition_rating] || 'default'} variant="outlined" /></TableCell>
                        <TableCell align="right">{fmtCurrency(a.current_value)}</TableCell>
                        <TableCell>
                          <Tooltip title="View"><IconButton size="small" onClick={() => handleViewDetail(a)}><ViewIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => handleOpenEdit(a)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Check Out"><IconButton size="small" onClick={() => {
                            setCheckoutForm({ assetId: a.id, assignedTo: '', expectedReturnDate: '', purpose: '', locationId: '', notes: '' });
                            setOpenCheckout(true);
                          }}><AssignIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Transfer"><IconButton size="small" onClick={() => {
                            setTransferForm({ assetId: a.id, toLocationId: '', toDepartmentId: '', toCustodianId: '', transferReason: '' });
                            setOpenTransfer(true);
                          }}><TransferIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Maintenance"><IconButton size="small" onClick={() => {
                            setMaintenanceForm({ assetId: a.id, maintenanceType: 'PREVENTIVE', description: '', priority: 'MEDIUM', scheduledDate: '', cost: 0, vendorName: '', notes: '' });
                            setOpenMaintenance(true);
                          }}><MaintenanceIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Dispose"><IconButton size="small" color="error" onClick={() => {
                            setDisposalForm({ assetId: a.id, disposalType: 'WRITE_OFF', disposalReason: '', disposalDescription: '', disposalDate: '', saleValue: 0, buyerName: '', notes: '' });
                            setOpenDisposal(true);
                          }}><DisposeIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Report Incident"><IconButton size="small" color="warning" onClick={() => {
                            setIncidentForm({ assetId: a.id, incidentType: 'DAMAGED', incidentDate: '', location: '', description: '', severity: 'MEDIUM', policeReportRef: '', estimatedLoss: 0, notes: '' });
                            setOpenIncident(true);
                          }}><IncidentIcon fontSize="small" /></IconButton></Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                    {assets.length === 0 && <TableRow><TableCell colSpan={9} align="center">No assets found</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination component="div" count={total} page={page} rowsPerPage={rowsPerPage}
                onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                rowsPerPageOptions={[10, 25, 50, 100]} />
            </>
          )}
        </Box>
      )}

      {/* ================================================================ */}
      {/* TAB 2: TRANSFERS */}
      {/* ================================================================ */}
      {activeTab === 2 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Asset Transfers</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell><TableCell>Asset</TableCell><TableCell>From</TableCell>
                  <TableCell>To</TableCell><TableCell>Reason</TableCell><TableCell>Date</TableCell>
                  <TableCell>Status</TableCell><TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transfers.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>{t.transfer_code}</TableCell>
                    <TableCell>{t.asset_tag} - {t.asset_name}</TableCell>
                    <TableCell>{t.from_location || '-'}</TableCell>
                    <TableCell>{t.to_location || '-'}</TableCell>
                    <TableCell>{t.transfer_reason}</TableCell>
                    <TableCell>{fmtDate(t.transfer_date)}</TableCell>
                    <TableCell><Chip label={t.status} size="small" color={t.status === 'PENDING' ? 'warning' : t.status === 'APPROVED' ? 'success' : 'default'} /></TableCell>
                    <TableCell>
                      {t.status === 'PENDING' && (
                        <>
                          <Button size="small" color="success" onClick={() => handleApproveTransfer(t.id, true)}>Approve</Button>
                          <Button size="small" color="error" onClick={() => handleApproveTransfer(t.id, false)}>Reject</Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {transfers.length === 0 && <TableRow><TableCell colSpan={8} align="center">No transfers</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ================================================================ */}
      {/* TAB 3: MAINTENANCE */}
      {/* ================================================================ */}
      {activeTab === 3 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Maintenance Records</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell><TableCell>Asset</TableCell><TableCell>Type</TableCell>
                  <TableCell>Description</TableCell><TableCell>Priority</TableCell><TableCell>Scheduled</TableCell>
                  <TableCell>Cost</TableCell><TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {maintenanceRecords.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>{m.maintenance_code}</TableCell>
                    <TableCell>{m.asset_tag} - {m.asset_name}</TableCell>
                    <TableCell>{m.maintenance_type}</TableCell>
                    <TableCell>{m.description?.substring(0, 60)}{(m.description?.length || 0) > 60 ? '...' : ''}</TableCell>
                    <TableCell><Chip label={m.priority} size="small" color={m.priority === 'HIGH' || m.priority === 'URGENT' ? 'error' : m.priority === 'MEDIUM' ? 'warning' : 'default'} /></TableCell>
                    <TableCell>{fmtDate(m.scheduled_date)}</TableCell>
                    <TableCell>{fmtCurrency(m.cost)}</TableCell>
                    <TableCell><Chip label={m.status} size="small" color={m.status === 'COMPLETED' ? 'success' : m.status === 'SCHEDULED' ? 'info' : 'warning'} /></TableCell>
                  </TableRow>
                ))}
                {maintenanceRecords.length === 0 && <TableRow><TableCell colSpan={8} align="center">No records</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ================================================================ */}
      {/* TAB 4: DISPOSALS */}
      {/* ================================================================ */}
      {activeTab === 4 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Asset Disposals</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell><TableCell>Asset</TableCell><TableCell>Type</TableCell>
                  <TableCell>Reason</TableCell><TableCell>Book Value</TableCell><TableCell>Sale Value</TableCell>
                  <TableCell>Date</TableCell><TableCell>Status</TableCell><TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {disposals.map(d => (
                  <TableRow key={d.id}>
                    <TableCell>{d.disposal_code}</TableCell>
                    <TableCell>{d.asset_tag} - {d.asset_name}</TableCell>
                    <TableCell>{d.disposal_type?.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{d.disposal_reason}</TableCell>
                    <TableCell>{fmtCurrency(d.book_value_at_disposal)}</TableCell>
                    <TableCell>{fmtCurrency(d.sale_value)}</TableCell>
                    <TableCell>{fmtDate(d.disposal_date)}</TableCell>
                    <TableCell><Chip label={d.status} size="small" color={d.status === 'PENDING' ? 'warning' : d.status === 'APPROVED' ? 'success' : 'default'} /></TableCell>
                    <TableCell>
                      {d.status === 'PENDING' && (
                        <>
                          <Button size="small" color="success" onClick={() => handleApproveDisposal(d.id, true)}>Approve</Button>
                          <Button size="small" color="error" onClick={() => handleApproveDisposal(d.id, false)}>Reject</Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {disposals.length === 0 && <TableRow><TableCell colSpan={9} align="center">No disposals</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ================================================================ */}
      {/* TAB 5: INCIDENTS */}
      {/* ================================================================ */}
      {activeTab === 5 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Asset Incidents</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell><TableCell>Asset</TableCell><TableCell>Type</TableCell>
                  <TableCell>Date</TableCell><TableCell>Severity</TableCell><TableCell>Est. Loss</TableCell>
                  <TableCell>Reported By</TableCell><TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {incidents.map(i => (
                  <TableRow key={i.id}>
                    <TableCell>{i.incident_code}</TableCell>
                    <TableCell>{i.asset_tag} - {i.asset_name}</TableCell>
                    <TableCell>{i.incident_type}</TableCell>
                    <TableCell>{fmtDate(i.incident_date)}</TableCell>
                    <TableCell><Chip label={i.severity} size="small" color={i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'error' : i.severity === 'MEDIUM' ? 'warning' : 'default'} /></TableCell>
                    <TableCell>{fmtCurrency(i.estimated_loss || 0)}</TableCell>
                    <TableCell>{i.reported_by_name || '-'}</TableCell>
                    <TableCell><Chip label={i.status} size="small" color={i.status === 'OPEN' ? 'error' : i.status === 'RESOLVED' ? 'success' : 'warning'} /></TableCell>
                  </TableRow>
                ))}
                {incidents.length === 0 && <TableRow><TableCell colSpan={8} align="center">No incidents</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ================================================================ */}
      {/* ASSET CREATE/EDIT DIALOG */}
      {/* ================================================================ */}
      <Dialog open={openForm} onClose={() => setOpenForm(false)} maxWidth="lg" fullWidth>
        <DialogTitle>{editId ? 'Edit Asset' : 'Register New Asset'}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {/* Basic Info */}
            <Grid item xs={12}><Typography variant="subtitle2" color="primary">Basic Information</Typography><Divider /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Asset Name *" value={formData.assetName} onChange={e => setFormData({ ...formData, assetName: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Category *" value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })}>
                {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.category_name} ({c.category_code})</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}><TextField fullWidth label="Description" multiline rows={2} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth label="Serial Number" value={formData.serialNumber} onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth label="Model" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth label="Manufacturer" value={formData.manufacturer} onChange={e => setFormData({ ...formData, manufacturer: e.target.value })} /></Grid>

            {/* Financial */}
            <Grid item xs={12}><Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>Purchase & Financial</Typography><Divider /></Grid>
            <Grid item xs={12} sm={3}><TextField fullWidth type="date" label="Purchase Date *" value={formData.purchaseDate} onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} sm={3}><TextField fullWidth type="number" label="Purchase Cost" value={formData.purchaseCost} onChange={e => setFormData({ ...formData, purchaseCost: Number(e.target.value) })} /></Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth select label="Currency" value={formData.currencyCode} onChange={e => setFormData({ ...formData, currencyCode: e.target.value })}>
                {['USD', 'ZIG', 'GBP', 'EUR', 'ZAR'].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth select label="Supplier" value={formData.supplierId} onChange={e => setFormData({ ...formData, supplierId: e.target.value })}>
                <MenuItem value="">None</MenuItem>
                {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.supplier_name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}><TextField fullWidth label="PO Reference" value={formData.purchaseOrderRef} onChange={e => setFormData({ ...formData, purchaseOrderRef: e.target.value })} /></Grid>
            <Grid item xs={12} sm={3}><TextField fullWidth label="Invoice Reference" value={formData.invoiceRef} onChange={e => setFormData({ ...formData, invoiceRef: e.target.value })} /></Grid>
            <Grid item xs={12} sm={3}>
              <TextField fullWidth select label="Donor" value={formData.donorId} onChange={e => setFormData({ ...formData, donorId: e.target.value })}>
                <MenuItem value="">None</MenuItem>
                {donors.map((d: any) => <MenuItem key={d.id} value={d.id}>{d.donor_name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3}><TextField fullWidth label="Project Name" value={formData.projectName} onChange={e => setFormData({ ...formData, projectName: e.target.value })} /></Grid>

            {/* Depreciation */}
            <Grid item xs={12}><Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>Depreciation</Typography><Divider /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Useful Life (Years)" value={formData.usefulLifeYears} onChange={e => setFormData({ ...formData, usefulLifeYears: Number(e.target.value) })} /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Salvage Value" value={formData.salvageValue} onChange={e => setFormData({ ...formData, salvageValue: Number(e.target.value) })} /></Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Depreciation Method" value={formData.depreciationMethod} onChange={e => setFormData({ ...formData, depreciationMethod: e.target.value })}>
                <MenuItem value="STRAIGHT_LINE">Straight Line</MenuItem>
                <MenuItem value="DECLINING_BALANCE">Declining Balance</MenuItem>
                <MenuItem value="SUM_OF_YEARS">Sum of Years Digits</MenuItem>
              </TextField>
            </Grid>

            {/* Warranty */}
            <Grid item xs={12}><Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>Warranty</Typography><Divider /></Grid>
            <Grid item xs={12} sm={3}><TextField fullWidth type="date" label="Warranty Start" value={formData.warrantyStartDate} onChange={e => setFormData({ ...formData, warrantyStartDate: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} sm={3}><TextField fullWidth type="date" label="Warranty End" value={formData.warrantyEndDate} onChange={e => setFormData({ ...formData, warrantyEndDate: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} sm={3}><TextField fullWidth label="Warranty Provider" value={formData.warrantyProvider} onChange={e => setFormData({ ...formData, warrantyProvider: e.target.value })} /></Grid>
            <Grid item xs={12} sm={3}><TextField fullWidth label="Warranty Terms" value={formData.warrantyTerms} onChange={e => setFormData({ ...formData, warrantyTerms: e.target.value })} /></Grid>

            {/* Location & Assignment */}
            <Grid item xs={12}><Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>Location & Assignment</Typography><Divider /></Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Location" value={formData.locationId} onChange={e => setFormData({ ...formData, locationId: e.target.value })}>
                <MenuItem value="">None</MenuItem>
                {locations.map(l => <MenuItem key={l.id} value={l.id}>{l.location_name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Department" value={formData.departmentId} onChange={e => setFormData({ ...formData, departmentId: e.target.value })}>
                <MenuItem value="">None</MenuItem>
                {departments.map((d: any) => <MenuItem key={d.id} value={d.id}>{d.department_name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                {ALL_STATUSES.map(s => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth select label="Condition" value={formData.conditionRating} onChange={e => setFormData({ ...formData, conditionRating: e.target.value })}>
                {ALL_CONDITIONS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth label="Barcode" value={formData.barcode} onChange={e => setFormData({ ...formData, barcode: e.target.value })} /></Grid>

            {/* Insurance */}
            <Grid item xs={12}><Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>Insurance</Typography><Divider /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth label="Policy Number" value={formData.insurancePolicyNo} onChange={e => setFormData({ ...formData, insurancePolicyNo: e.target.value })} /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth type="date" label="Expiry Date" value={formData.insuranceExpiry} onChange={e => setFormData({ ...formData, insuranceExpiry: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Insured Value" value={formData.insuredValue} onChange={e => setFormData({ ...formData, insuredValue: Number(e.target.value) })} /></Grid>

            {/* Notes */}
            <Grid item xs={12}><TextField fullWidth label="Notes" multiline rows={2} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenForm(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveAsset}>{editId ? 'Update' : 'Register'}</Button>
        </DialogActions>
      </Dialog>

      {/* ================================================================ */}
      {/* ASSET DETAIL DIALOG */}
      {/* ================================================================ */}
      <Dialog open={openDetail} onClose={() => setOpenDetail(false)} maxWidth="md" fullWidth>
        <DialogTitle>Asset Details - {selectedAsset?.asset_tag}</DialogTitle>
        <DialogContent dividers>
          {selectedAsset && (
            <>
              <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)} sx={{ mb: 2 }}>
                <Tab label="Info" /><Tab label="History" /><Tab label="Assignments" />
              </Tabs>
              {detailTab === 0 && (
                <Grid container spacing={1}>
                  {[
                    ['Name', selectedAsset.asset_name], ['Tag', selectedAsset.asset_tag],
                    ['Category', selectedAsset.category_name], ['Serial', selectedAsset.serial_number],
                    ['Model', selectedAsset.model], ['Manufacturer', selectedAsset.manufacturer],
                    ['Status', selectedAsset.status], ['Condition', selectedAsset.condition_rating],
                    ['Purchase Date', fmtDate(selectedAsset.purchase_date)], ['Purchase Cost', fmtCurrency(selectedAsset.purchase_cost)],
                    ['Current Value', fmtCurrency(selectedAsset.current_value)], ['Depreciation', fmtCurrency(selectedAsset.accumulated_depreciation)],
                    ['Useful Life', `${selectedAsset.useful_life_years} years`], ['Salvage Value', fmtCurrency(selectedAsset.salvage_value)],
                    ['Location', selectedAsset.location_name], ['Department', selectedAsset.department_name],
                    ['Custodian', selectedAsset.custodian_name], ['Donor', selectedAsset.donor_name],
                    ['Supplier', selectedAsset.supplier_name], ['Project', selectedAsset.project_name],
                    ['Warranty End', fmtDate(selectedAsset.warranty_end_date)], ['Insurance Expiry', fmtDate(selectedAsset.insurance_expiry)]
                  ].map(([label, value]) => (
                    <Grid item xs={6} sm={4} key={label as string}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2" fontWeight={500}>{value || '-'}</Typography>
                    </Grid>
                  ))}
                  {selectedAsset.notes && (
                    <Grid item xs={12}><Typography variant="caption" color="text.secondary">Notes</Typography><Typography variant="body2">{selectedAsset.notes}</Typography></Grid>
                  )}
                </Grid>
              )}
              {detailTab === 1 && (
                <Table size="small">
                  <TableHead><TableRow><TableCell>Date</TableCell><TableCell>From</TableCell><TableCell>To</TableCell><TableCell>Reason</TableCell><TableCell>By</TableCell></TableRow></TableHead>
                  <TableBody>
                    {assetHistory.map(h => (
                      <TableRow key={h.id}>
                        <TableCell>{fmtDate(h.created_at)}</TableCell>
                        <TableCell>{h.previous_status || '-'}</TableCell>
                        <TableCell><Chip label={h.new_status} size="small" /></TableCell>
                        <TableCell>{h.change_reason || '-'}</TableCell>
                        <TableCell>{h.changed_by_name || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {assetHistory.length === 0 && <TableRow><TableCell colSpan={5} align="center">No history</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
              {detailTab === 2 && (
                <Table size="small">
                  <TableHead><TableRow><TableCell>Type</TableCell><TableCell>Assigned To</TableCell><TableCell>Date</TableCell><TableCell>Return</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                  <TableBody>
                    {assetAssignments.map(a => (
                      <TableRow key={a.id}>
                        <TableCell>{a.assignment_type}</TableCell>
                        <TableCell>{a.assigned_to_name}</TableCell>
                        <TableCell>{fmtDate(a.assignment_date)}</TableCell>
                        <TableCell>{a.actual_return_date ? fmtDate(a.actual_return_date) : (a.expected_return_date ? `Due: ${fmtDate(a.expected_return_date)}` : '-')}</TableCell>
                        <TableCell>
                          <Chip label={a.status} size="small" color={a.status === 'ACTIVE' ? 'success' : a.status === 'OVERDUE' ? 'error' : 'default'} />
                          {a.status === 'ACTIVE' && (
                            <Tooltip title="Check In">
                              <IconButton size="small" onClick={() => { setCheckinForm({ assignmentId: a.id, returnCondition: 'GOOD', returnNotes: '' }); setOpenCheckin(true); }}>
                                <CheckInIcon fontSize="small" color="primary" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {assetAssignments.length === 0 && <TableRow><TableCell colSpan={5} align="center">No assignments</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenDetail(false)}>Close</Button></DialogActions>
      </Dialog>

      {/* ================================================================ */}
      {/* CHECKOUT DIALOG */}
      {/* ================================================================ */}
      <Dialog open={openCheckout} onClose={() => setOpenCheckout(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Check Out Asset</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField fullWidth select label="Assign To *" value={checkoutForm.assignedTo} onChange={e => setCheckoutForm({ ...checkoutForm, assignedTo: e.target.value })}>
                {users.map((u: any) => <MenuItem key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Location" value={checkoutForm.locationId} onChange={e => setCheckoutForm({ ...checkoutForm, locationId: e.target.value })}>
                <MenuItem value="">Current</MenuItem>
                {locations.map(l => <MenuItem key={l.id} value={l.id}>{l.location_name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="date" label="Expected Return" value={checkoutForm.expectedReturnDate} onChange={e => setCheckoutForm({ ...checkoutForm, expectedReturnDate: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12}><TextField fullWidth label="Purpose" value={checkoutForm.purpose} onChange={e => setCheckoutForm({ ...checkoutForm, purpose: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Notes" multiline rows={2} value={checkoutForm.notes} onChange={e => setCheckoutForm({ ...checkoutForm, notes: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCheckout(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCheckout}>Check Out</Button>
        </DialogActions>
      </Dialog>

      {/* CHECKIN DIALOG */}
      <Dialog open={openCheckin} onClose={() => setOpenCheckin(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Check In Asset</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField fullWidth select label="Return Condition" value={checkinForm.returnCondition} onChange={e => setCheckinForm({ ...checkinForm, returnCondition: e.target.value })}>
                {ALL_CONDITIONS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}><TextField fullWidth label="Return Notes" multiline rows={2} value={checkinForm.returnNotes} onChange={e => setCheckinForm({ ...checkinForm, returnNotes: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCheckin(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCheckin}>Check In</Button>
        </DialogActions>
      </Dialog>

      {/* TRANSFER DIALOG */}
      <Dialog open={openTransfer} onClose={() => setOpenTransfer(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Transfer Asset</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField fullWidth select label="To Location" value={transferForm.toLocationId} onChange={e => setTransferForm({ ...transferForm, toLocationId: e.target.value })}>
                <MenuItem value="">Same</MenuItem>
                {locations.map(l => <MenuItem key={l.id} value={l.id}>{l.location_name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth select label="To Department" value={transferForm.toDepartmentId} onChange={e => setTransferForm({ ...transferForm, toDepartmentId: e.target.value })}>
                <MenuItem value="">Same</MenuItem>
                {departments.map((d: any) => <MenuItem key={d.id} value={d.id}>{d.department_name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Transfer Reason *" multiline rows={2} value={transferForm.transferReason} onChange={e => setTransferForm({ ...transferForm, transferReason: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenTransfer(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateTransfer}>Submit Transfer</Button>
        </DialogActions>
      </Dialog>

      {/* MAINTENANCE DIALOG */}
      <Dialog open={openMaintenance} onClose={() => setOpenMaintenance(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Schedule Maintenance</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Type" value={maintenanceForm.maintenanceType} onChange={e => setMaintenanceForm({ ...maintenanceForm, maintenanceType: e.target.value })}>
                {['PREVENTIVE', 'CORRECTIVE', 'EMERGENCY', 'INSPECTION'].map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Priority" value={maintenanceForm.priority} onChange={e => setMaintenanceForm({ ...maintenanceForm, priority: e.target.value })}>
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}><TextField fullWidth label="Description *" multiline rows={2} value={maintenanceForm.description} onChange={e => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth type="date" label="Scheduled Date" value={maintenanceForm.scheduledDate} onChange={e => setMaintenanceForm({ ...maintenanceForm, scheduledDate: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth type="number" label="Estimated Cost" value={maintenanceForm.cost} onChange={e => setMaintenanceForm({ ...maintenanceForm, cost: Number(e.target.value) })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Vendor" value={maintenanceForm.vendorName} onChange={e => setMaintenanceForm({ ...maintenanceForm, vendorName: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Notes" multiline rows={2} value={maintenanceForm.notes} onChange={e => setMaintenanceForm({ ...maintenanceForm, notes: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenMaintenance(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateMaintenance}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* DISPOSAL DIALOG */}
      <Dialog open={openDisposal} onClose={() => setOpenDisposal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Asset Disposal</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Disposal Type" value={disposalForm.disposalType} onChange={e => setDisposalForm({ ...disposalForm, disposalType: e.target.value })}>
                {['WRITE_OFF', 'SALE', 'DONATION', 'DESTRUCTION', 'RETURN_TO_DONOR'].map(t => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Reason *" value={disposalForm.disposalReason} onChange={e => setDisposalForm({ ...disposalForm, disposalReason: e.target.value })}>
                {['OBSOLETE', 'DAMAGED', 'STOLEN', 'END_OF_LIFE', 'SURPLUS', 'DONATED'].map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}><TextField fullWidth label="Description *" multiline rows={2} value={disposalForm.disposalDescription} onChange={e => setDisposalForm({ ...disposalForm, disposalDescription: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth type="date" label="Disposal Date *" value={disposalForm.disposalDate} onChange={e => setDisposalForm({ ...disposalForm, disposalDate: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth type="number" label="Sale Value" value={disposalForm.saleValue} onChange={e => setDisposalForm({ ...disposalForm, saleValue: Number(e.target.value) })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Buyer Name" value={disposalForm.buyerName} onChange={e => setDisposalForm({ ...disposalForm, buyerName: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Notes" multiline rows={2} value={disposalForm.notes} onChange={e => setDisposalForm({ ...disposalForm, notes: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDisposal(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleCreateDisposal}>Submit Disposal Request</Button>
        </DialogActions>
      </Dialog>

      {/* INCIDENT DIALOG */}
      <Dialog open={openIncident} onClose={() => setOpenIncident(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Report Asset Incident</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Incident Type *" value={incidentForm.incidentType} onChange={e => setIncidentForm({ ...incidentForm, incidentType: e.target.value })}>
                {['LOST', 'STOLEN', 'DAMAGED', 'ACCIDENT', 'FIRE', 'FLOOD'].map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth select label="Severity" value={incidentForm.severity} onChange={e => setIncidentForm({ ...incidentForm, severity: e.target.value })}>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth type="date" label="Incident Date *" value={incidentForm.incidentDate} onChange={e => setIncidentForm({ ...incidentForm, incidentDate: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Location" value={incidentForm.location} onChange={e => setIncidentForm({ ...incidentForm, location: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Description *" multiline rows={3} value={incidentForm.description} onChange={e => setIncidentForm({ ...incidentForm, description: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Police Report Ref" value={incidentForm.policeReportRef} onChange={e => setIncidentForm({ ...incidentForm, policeReportRef: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}><TextField fullWidth type="number" label="Estimated Loss" value={incidentForm.estimatedLoss} onChange={e => setIncidentForm({ ...incidentForm, estimatedLoss: Number(e.target.value) })} /></Grid>
            <Grid item xs={12}><TextField fullWidth label="Notes" multiline rows={2} value={incidentForm.notes} onChange={e => setIncidentForm({ ...incidentForm, notes: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenIncident(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleCreateIncident}>Report Incident</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AssetRegisterPage;
