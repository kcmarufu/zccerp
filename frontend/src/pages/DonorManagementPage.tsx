import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  MenuItem,
  CircularProgress,
  Alert,
  Tooltip,
  Card,
  CardContent,
  Divider,
  InputAdornment,
  Checkbox,
  Stack,
  FormControl,
  InputLabel,
  Select,
  alpha,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  Block as BlockIcon,
  CheckCircle as ActivateIcon,
  TrendingUp as StatsIcon,
  Delete as DeleteIcon,
  AddCircle as AddFundsIcon,
  RemoveCircle as RemoveFundsIcon,
  History as HistoryIcon,
  FolderOpen as ProjectsIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  Business as PartnerIcon
} from '@mui/icons-material';
import { useAuthStore } from '../store/authStore';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import donorService, { Donor, CreateDonorDto, DonorStats } from '../services/donorService';
import projectService, { CreateProjectPayload, UpdateProjectPayload } from '../services/projectService';
import { Project } from '../types';

const DONOR_TYPES = [
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'FOUNDATION', label: 'Foundation' },
  { value: 'ORGANIZATION', label: 'Organization' },
  { value: 'INDIVIDUAL', label: 'Individual' }
];

const CURRENCIES = [
  { value: 'USD', label: 'USD' },
  { value: 'ZIG', label: 'ZIG' },
  { value: 'GBP', label: 'GBP' },
  { value: 'EUR', label: 'EUR' }
];

const DonorManagementPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { hasRole, isFinanceManager, isAdminHrManager } = useAuthStore();
  // Finance Managers (Finance HOP/Lead or Admin) and Admin/HR Managers (AHR HOP/Lead) can create/edit/delete
  const canEdit = isFinanceManager() || isAdminHrManager();

  const [donors, setDonors] = useState<Donor[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Checkbox selection state
  const [selectedPartners, setSelectedPartners] = useState<number[]>([]);

  // Filter / search state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [openStatsDialog, setOpenStatsDialog] = useState(false);
  const [currentDonor, setCurrentDonor] = useState<Partial<CreateDonorDto> | null>(null);
  const [donorStats, setDonorStats] = useState<DonorStats | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editDonorId, setEditDonorId] = useState<number | null>(null);
  const [nextDonorCode, setNextDonorCode] = useState<string>('');
  // Fund management
  const [openFundsDialog, setOpenFundsDialog] = useState(false);
  const [fundsMode, setFundsMode] = useState<'add' | 'remove'>('add');
  const [fundsDonor, setFundsDonor] = useState<Donor | null>(null);
  const [fundsAmount, setFundsAmount] = useState('');
  const [fundsDescription, setFundsDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Delete
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [deleteDonor, setDeleteDonor] = useState<Donor | null>(null);
  // Transaction history
  const [openTransactionsDialog, setOpenTransactionsDialog] = useState(false);
  const [transactionsDonor, setTransactionsDonor] = useState<Donor | null>(null);
  const [donorTransactions, setDonorTransactions] = useState<any[]>([]);
  // Projects
  const [openProjectsDialog, setOpenProjectsDialog] = useState(false);
  const [projectsDonor, setProjectsDonor] = useState<Donor | null>(null);
  const [donorProjects, setDonorProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [openCreateProjectDialog, setOpenCreateProjectDialog] = useState(false);
  const [newProject, setNewProject] = useState<Partial<CreateProjectPayload>>({});
  const [submittingProject, setSubmittingProject] = useState(false);
  // Project fund management (add/deduct) and delete
  const [projectFundsOpen, setProjectFundsOpen] = useState(false);
  const [projectFundsMode, setProjectFundsMode] = useState<'add' | 'deduct'>('add');
  const [projectFundsTarget, setProjectFundsTarget] = useState<Project | null>(null);
  const [projectFundsAmount, setProjectFundsAmount] = useState('');
  const [projectFundsNotes, setProjectFundsNotes] = useState('');
  const [projectDeleteOpen, setProjectDeleteOpen] = useState(false);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<Project | null>(null);
  // Inline projects to create alongside a new donor
  const [inlineProjects, setInlineProjects] = useState<Partial<CreateProjectPayload>[]>([]);
  // Edit project
  const [projectEditOpen, setProjectEditOpen] = useState(false);
  const [projectEditTarget, setProjectEditTarget] = useState<Project | null>(null);
  const [projectEditForm, setProjectEditForm] = useState<UpdateProjectPayload>({});
  const [projectEditSaving, setProjectEditSaving] = useState(false);

  useEffect(() => {
    fetchDonors();
  }, []);

  const fetchDonors = async () => {
    try {
      setIsLoading(true);
      const data = await donorService.getAllDonors();
      setDonors(data);
    } catch (error) {
      toast.error('Failed to fetch partners');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = async (donor?: Donor) => {
    if (donor) {
      setIsEditMode(true);
      setEditDonorId(donor.id);
      setNextDonorCode(donor.donor_code);
      setCurrentDonor({
        donor_name: donor.donor_name,
        donor_type: donor.donor_type,
        contact_person: donor.contact_person,
        email: donor.email,
        phone: donor.phone,
        address: donor.address,
        country: donor.country,
        total_committed: donor.total_committed,
        currency_code: donor.currency_code,
        fiscal_year: donor.fiscal_year,
        agreement_reference: donor.agreement_reference,
        restrictions: donor.restrictions,
        notes: donor.notes
      });
    } else {
      setIsEditMode(false);
      setEditDonorId(null);
      setCurrentDonor({
        donor_code: '',
        donor_name: '',
        donor_type: 'GOVERNMENT',
        total_committed: 0,
        currency_code: 'USD',
        fiscal_year: new Date().getFullYear()
      } as any);
      // Fetch the next suggested partner code (just a hint — user enters their own)
      try {
        const code = await donorService.getNextDonorCode();
        setNextDonorCode(code);
      } catch {
        setNextDonorCode('e.g. DON-001');
      }
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentDonor(null);
    setIsEditMode(false);
    setEditDonorId(null);
    setInlineProjects([]);
  };

  const handleSaveDonor = async () => {
    if (!currentDonor?.donor_name || !currentDonor?.total_committed) {
      toast.error('Please fill in required fields');
      return;
    }
    if (!isEditMode && !((currentDonor as any).donor_code || '').trim()) {
      toast.error('Please enter a Partner Code');
      return;
    }

    try {
      if (isEditMode && editDonorId) {
        await donorService.updateDonor(editDonorId, currentDonor);
        toast.success('Partner updated successfully');
      } else {
        const created = await donorService.createDonor(currentDonor as CreateDonorDto);
        const newDonorId = (created as any)?.id;
        // Create inline projects if any
        if (newDonorId && inlineProjects.length > 0) {
          for (const proj of inlineProjects) {
            try {
              await projectService.createProject(newDonorId, proj as CreateProjectPayload);
            } catch (e) {
              console.error('Failed to create inline project', proj.project_name, e);
            }
          }
          toast.success(`Partner and ${inlineProjects.length} project(s) created successfully`);
        } else {
          toast.success('Partner created successfully');
        }
        setInlineProjects([]);
      }
      fetchDonors();
      handleCloseDialog();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save partner');
    }
  };

  const handleViewStats = async (donorId: number) => {
    try {
      const stats = await donorService.getDonorStats(donorId);
      setDonorStats(stats);
      setOpenStatsDialog(true);
    } catch (error) {
      toast.error('Failed to fetch partner statistics');
    }
  };

  const handleDeactivate = async (donorId: number) => {
    if (!window.confirm('Are you sure you want to deactivate this partner?')) {
      return;
    }
    try {
      await donorService.deactivateDonor(donorId);
      toast.success('Partner deactivated successfully');
      fetchDonors();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to deactivate partner');
    }
  };

  const handleActivate = async (donorId: number) => {
    if (!window.confirm('Are you sure you want to activate this partner?')) {
      return;
    }
    try {
      await donorService.activateDonor(donorId);
      toast.success('Partner activated successfully');
      fetchDonors();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to activate partner');
    }
  };

  // Fund management
  const handleOpenFunds = (donor: Donor, mode: 'add' | 'remove') => {
    setFundsDonor(donor);
    setFundsMode(mode);
    setFundsAmount('');
    setFundsDescription('');
    setOpenFundsDialog(true);
  };

  const handleSubmitFunds = async () => {
    if (!fundsDonor || !fundsAmount) return;
    try {
      setIsSubmitting(true);
      const amount = parseFloat(fundsAmount);
      if (fundsMode === 'add') {
        await donorService.addFunds(fundsDonor.id, amount, fundsDescription || undefined);
        toast.success(`Added ${amount.toLocaleString()} to ${fundsDonor.donor_name}'s committed funds`);
      } else {
        await donorService.removeFunds(fundsDonor.id, amount, fundsDescription || undefined);
        toast.success(`Removed ${amount.toLocaleString()} from ${fundsDonor.donor_name}'s committed funds`);
      }
      setOpenFundsDialog(false);
      fetchDonors();
    } catch (error: any) {
      toast.error(error.response?.data?.error || `Failed to ${fundsMode} funds`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete donor
  const handleOpenDelete = (donor: Donor) => {
    setDeleteDonor(donor);
    setOpenDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteDonor) return;
    try {
      setIsSubmitting(true);
      await donorService.deleteDonor(deleteDonor.id);
      toast.success('Partner deleted successfully');
      setOpenDeleteDialog(false);
      setDeleteDonor(null);
      fetchDonors();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete partner');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Transaction history
  const handleViewTransactions = async (donor: Donor) => {
    setTransactionsDonor(donor);
    try {
      const txns = await donorService.getDonorTransactions(donor.id);
      setDonorTransactions(txns);
      setOpenTransactionsDialog(true);
    } catch (error) {
      toast.error('Failed to load transaction history');
    }
  };

  const handleOpenProjectsDialog = async (donor: Donor) => {
    setProjectsDonor(donor);
    setOpenProjectsDialog(true);
    setLoadingProjects(true);
    try {
      const projects = await projectService.getProjectsByDonor(donor.id);
      setDonorProjects(projects);
    } catch {
      toast.error('Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleCreateProject = async () => {
    if (!projectsDonor || !newProject.project_name || !newProject.total_budget) {
      toast.error('Project name and total budget are required');
      return;
    }
    setSubmittingProject(true);
    try {
      await projectService.createProject(projectsDonor.id, newProject as CreateProjectPayload);
      toast.success('Project created successfully');
      setOpenCreateProjectDialog(false);
      setNewProject({});
      const projects = await projectService.getProjectsByDonor(projectsDonor.id);
      setDonorProjects(projects);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create project');
    } finally {
      setSubmittingProject(false);
    }
  };

  const handleOpenProjectEdit = (proj: Project) => {
    setProjectEditTarget(proj);
    setProjectEditForm({
      project_name: proj.project_name ?? '',
      project_code: proj.project_code ?? '',
      description: (proj as any).description ?? '',
      start_date: proj.start_date ? proj.start_date.split('T')[0] : '',
      end_date: proj.end_date ? proj.end_date.split('T')[0] : '',
      total_budget: proj.total_budget ?? 0,
      is_active: proj.is_active,
    });
    setProjectEditOpen(true);
  };

  const handleSaveProjectEdit = async () => {
    if (!projectEditTarget) return;
    if (!projectEditForm.project_name?.trim()) { toast.error('Project name is required'); return; }
    setProjectEditSaving(true);
    try {
      await projectService.updateProject(projectEditTarget.id, {
        project_name: projectEditForm.project_name?.trim(),
        project_code: projectEditForm.project_code?.trim() || undefined,
        description: projectEditForm.description?.trim() || undefined,
        start_date: projectEditForm.start_date || undefined,
        end_date: projectEditForm.end_date || undefined,
        total_budget: projectEditForm.total_budget ? Number(projectEditForm.total_budget) : undefined,
        is_active: projectEditForm.is_active,
      });
      toast.success('Project updated successfully');
      setProjectEditOpen(false);
      setProjectEditTarget(null);
      if (projectsDonor) {
        const projects = await projectService.getProjectsByDonor(projectsDonor.id);
        setDonorProjects(projects);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update project');
    } finally {
      setProjectEditSaving(false);
    }
  };

  const handleOpenProjectFunds = (proj: Project, mode: 'add' | 'deduct') => {
    setProjectFundsTarget(proj);
    setProjectFundsMode(mode);
    setProjectFundsAmount('');
    setProjectFundsNotes('');
    setProjectFundsOpen(true);
  };

  const handleSubmitProjectFunds = async () => {
    if (!projectFundsTarget || !projectFundsAmount) return;
    setIsSubmitting(true);
    try {
      const amount = parseFloat(projectFundsAmount);
      if (projectFundsMode === 'add') {
        await projectService.addProjectFunds(projectFundsTarget.id, amount, projectFundsNotes || undefined);
        toast.success(`Added ${amount.toLocaleString()} to project budget`);
      } else {
        await projectService.deductProjectFunds(projectFundsTarget.id, amount, projectFundsNotes || undefined);
        toast.success(`Deducted ${amount.toLocaleString()} from project budget`);
      }
      setProjectFundsOpen(false);
      if (projectsDonor) {
        const projects = await projectService.getProjectsByDonor(projectsDonor.id);
        setDonorProjects(projects);
      }
      fetchDonors();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update project funds');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenProjectDelete = (proj: Project) => {
    setProjectDeleteTarget(proj);
    setProjectDeleteOpen(true);
  };

  const handleConfirmProjectDelete = async () => {
    if (!projectDeleteTarget) return;
    setIsSubmitting(true);
    try {
      await projectService.deleteProject(projectDeleteTarget.id);
      toast.success('Project deleted successfully');
      setProjectDeleteOpen(false);
      setProjectDeleteTarget(null);
      if (projectsDonor) {
        const projects = await projectService.getProjectsByDonor(projectsDonor.id);
        setDonorProjects(projects);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency;
    return `${symbol}${amount.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // Filtered donors for display
  const filteredDonors = donors.filter(d => {
    if (searchTerm &&
      !d.donor_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !d.donor_code.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !(d.country || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (typeFilter && d.donor_type !== typeFilter) return false;
    if (statusFilter === 'ACTIVE' && !d.is_active) return false;
    if (statusFilter === 'INACTIVE' && d.is_active) return false;
    return true;
  });
  const paginatedDonors = filteredDonors.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // Selection helpers
  const toggleSelectPartner = (id: number) =>
    setSelectedPartners(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () =>
    setSelectedPartners(selectedPartners.length === paginatedDonors.length ? [] : paginatedDonors.map(d => d.id));
  const selectedSet = new Set(selectedPartners);

  return (
    <Box>
      {/* ── Gradient Header ── */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #006064 0%, #00363a 100%)', color: 'white', borderRadius: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <PartnerIcon sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>Partner Management</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                {canEdit
                  ? 'Manage funding partners, allocate funds, and track projects.'
                  : 'View partner details and funding information (read-only access).'}
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Refresh">
              <IconButton sx={{ color: 'white' }} onClick={fetchDonors}><RefreshIcon /></IconButton>
            </Tooltip>
            {canEdit && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
                sx={{ bgcolor: 'white', color: '#006064', '&:hover': { bgcolor: alpha('#ffffff', 0.9) } }}
              >
                Add New Partner
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>

      {/* Read-only notice for Finance Clerks */}
      {!canEdit && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <strong>View Only Access:</strong> You can view partner records but cannot make changes. Contact a Finance HOP or Finance Lead to add or update partners.
        </Alert>
      )}

      {/* ── Filter Bar ── */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <FilterIcon fontSize="small" color="action" />
          <Typography variant="body2" fontWeight={600} color="text.secondary">Filters</Typography>
          {(searchTerm || typeFilter || statusFilter) && (
            <Button size="small" onClick={() => { setSearchTerm(''); setTypeFilter(''); setStatusFilter(''); setPage(0); }} sx={{ ml: 'auto' }}>
              Clear All
            </Button>
          )}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            placeholder="Search by name, code, country..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 270, flex: 2 }}
          />
          <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
            <InputLabel>Partner Type</InputLabel>
            <Select value={typeFilter} label="Partner Type" onChange={e => { setTypeFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">All Types</MenuItem>
              {DONOR_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140, flex: 1 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="INACTIVE">Inactive</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        {selectedPartners.length > 0 && (
          <Box mt={1.5} p={1} bgcolor={alpha(theme.palette.primary.main, 0.08)} borderRadius={1} display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="body2" color="primary.main" fontWeight={600}>
              {selectedPartners.length} partner{selectedPartners.length !== 1 ? 's' : ''} selected
            </Typography>
            <Button size="small" onClick={() => setSelectedPartners([])}>Clear Selection</Button>
          </Box>
        )}
      </Paper>

      {/* ── Partner Table ── */}
      <Paper elevation={2} sx={{ borderRadius: 2 }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#006064' }}>
              <TableCell padding="checkbox" sx={{ bgcolor: '#006064' }}>
                <Checkbox
                  checked={paginatedDonors.length > 0 && selectedPartners.length === paginatedDonors.length}
                  indeterminate={selectedPartners.length > 0 && selectedPartners.length < paginatedDonors.length}
                  onChange={toggleSelectAll}
                  sx={{ color: 'white', '&.Mui-checked': { color: 'white' }, '&.MuiCheckbox-indeterminate': { color: 'white' } }}
                />
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Partner Code</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Partner Name</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Type</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Committed</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Allocated</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Spent</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>FY</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 700 }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedDonors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 5 }}>
                  <PartnerIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">No partners found</Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginatedDonors.map((donor) => (
                <TableRow
                  key={donor.id}
                  hover
                  selected={selectedSet.has(donor.id)}
                  sx={{ '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.06) } }}
                >
                  <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                    <Checkbox size="small" checked={selectedSet.has(donor.id)} onChange={() => toggleSelectPartner(donor.id)} />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600} variant="body2" color="primary.main">{donor.donor_code}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{donor.donor_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{donor.country || 'N/A'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={donor.donor_type} size="small" color="info" />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{formatCurrency(donor.total_committed, donor.currency_code)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{formatCurrency(donor.total_allocated, donor.currency_code)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{formatCurrency(donor.total_spent, donor.currency_code)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{donor.fiscal_year}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={donor.is_active ? 'Active' : 'Inactive'}
                      color={donor.is_active ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      {/* These actions are visible to all */}
                      <Tooltip title="Fund History">
                        <IconButton size="small" onClick={() => handleViewTransactions(donor)}>
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="View Projects">
                        <IconButton size="small" color="secondary" onClick={() => handleOpenProjectsDialog(donor)}>
                          <ProjectsIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="View Statistics">
                        <IconButton size="small" color="primary" onClick={() => handleViewStats(donor.id)}>
                          <StatsIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {/* View Details — visible to all; Finance Clerk gets read-only dialog */}
                      {!canEdit && (
                        <Tooltip title="View Details">
                          <IconButton size="small" color="info" onClick={() => handleOpenDialog(donor)}>
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {/* Edit / fund management — restricted to canEdit roles */}
                      {canEdit && (
                        <>
                          <Tooltip title="Add Funds">
                            <IconButton size="small" color="success" onClick={() => handleOpenFunds(donor, 'add')}>
                              <AddFundsIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove Funds">
                            <IconButton size="small" color="warning" onClick={() => handleOpenFunds(donor, 'remove')}>
                              <RemoveFundsIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit Partner">
                            <IconButton size="small" color="info" onClick={() => handleOpenDialog(donor)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {donor.is_active ? (
                            <Tooltip title="Deactivate Partner">
                              <IconButton size="small" color="error" onClick={() => handleDeactivate(donor.id)}>
                                <BlockIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Activate Partner">
                              <IconButton size="small" color="success" onClick={() => handleActivate(donor.id)}>
                                <ActivateIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Delete Partner">
                            <IconButton size="small" color="error" onClick={() => handleOpenDelete(donor)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </TableContainer>
        <Divider />
        <Box display="flex" alignItems="center" justifyContent="space-between" px={2} py={0.5}>
          <Typography variant="caption" color="text.secondary">
            {selectedPartners.length > 0
              ? `${selectedPartners.length} of ${filteredDonors.length} selected`
              : `${filteredDonors.length} partner${filteredDonors.length !== 1 ? 's' : ''}`}
          </Typography>
          <TablePagination
            component="div"
            count={filteredDonors.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{ border: 0 }}
          />
        </Box>
      </Paper>

      {/* Create/Edit Donor Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>{canEdit ? (isEditMode ? 'Edit Partner' : 'Create New Partner') : 'View Partner Details'}</DialogTitle>
        <DialogContent>
          <fieldset disabled={!canEdit} style={{ border: 'none', padding: 0, margin: 0 }}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Partner Code"
                value={isEditMode ? nextDonorCode : ((currentDonor as any)?.donor_code ?? '')}
                onChange={(e) => !isEditMode && setCurrentDonor({ ...currentDonor, donor_code: e.target.value.toUpperCase() } as any)}
                fullWidth
                required={!isEditMode}
                disabled={isEditMode}
                placeholder={isEditMode ? '' : (nextDonorCode || 'e.g. DON-001')}
                helperText={isEditMode ? '' : `Suggested next code: ${nextDonorCode || 'DON-001'} — you may use a different one`}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Partner Name"
                value={currentDonor?.donor_name || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, donor_name: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Partner Type"
                value={currentDonor?.donor_type || 'GOVERNMENT'}
                onChange={(e) => setCurrentDonor({ ...currentDonor, donor_type: e.target.value as any })}
                fullWidth
                required
              >
                {DONOR_TYPES.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Country"
                value={currentDonor?.country || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, country: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Total Committed"
                type="number"
                value={currentDonor?.total_committed || 0}
                onChange={(e) => setCurrentDonor({ ...currentDonor, total_committed: parseFloat(e.target.value) })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Currency"
                value={currentDonor?.currency_code || 'USD'}
                onChange={(e) => setCurrentDonor({ ...currentDonor, currency_code: e.target.value })}
                fullWidth
              >
                {CURRENCIES.map((curr) => (
                  <MenuItem key={curr.value} value={curr.value}>
                    {curr.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Fiscal Year"
                type="number"
                value={currentDonor?.fiscal_year || new Date().getFullYear()}
                onChange={(e) => setCurrentDonor({ ...currentDonor, fiscal_year: parseInt(e.target.value) })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Contact Person"
                value={currentDonor?.contact_person || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, contact_person: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Email"
                type="email"
                value={currentDonor?.email || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, email: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Phone"
                value={currentDonor?.phone || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, phone: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Agreement Reference"
                value={currentDonor?.agreement_reference || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, agreement_reference: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Address"
                value={currentDonor?.address || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, address: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Restrictions"
                value={currentDonor?.restrictions || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, restrictions: e.target.value })}
                fullWidth
                multiline
                rows={2}
                helperText="Any special conditions or restrictions on fund usage"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={currentDonor?.notes || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, notes: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
            {/* Inline Projects — only when creating a new donor */}
            {!isEditMode && (
              <Grid item xs={12}>
                <Divider sx={{ mb: 2 }} />
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle1" fontWeight={600}>Projects (Optional)</Typography>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setInlineProjects(prev => [...prev, { project_name: '', total_budget: 0 }])}
                  >
                    Add Project
                  </Button>
                </Box>
                {inlineProjects.length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    You can add projects now or later from the Partners list.
                  </Typography>
                )}
                {inlineProjects.map((proj, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 2, mb: 1, position: 'relative' }}>
                    <IconButton
                      size="small"
                      sx={{ position: 'absolute', top: 4, right: 4 }}
                      onClick={() => setInlineProjects(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                    <Grid container spacing={1}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Project Name *"
                          size="small"
                          fullWidth
                          value={proj.project_name || ''}
                          onChange={(e) => setInlineProjects(prev => prev.map((p, i) => i === idx ? { ...p, project_name: e.target.value } : p))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Project Code (optional)"
                          size="small"
                          fullWidth
                          value={proj.project_code || ''}
                          onChange={(e) => setInlineProjects(prev => prev.map((p, i) => i === idx ? { ...p, project_code: e.target.value } : p))}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Total Budget *"
                          type="number"
                          size="small"
                          fullWidth
                          value={proj.total_budget ?? ''}
                          onChange={(e) => setInlineProjects(prev => prev.map((p, i) => i === idx ? { ...p, total_budget: parseFloat(e.target.value) } : p))}
                        />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <TextField
                          label="Start Date"
                          type="date"
                          size="small"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={proj.start_date || ''}
                          onChange={(e) => setInlineProjects(prev => prev.map((p, i) => i === idx ? { ...p, start_date: e.target.value } : p))}
                        />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <TextField
                          label="End Date"
                          type="date"
                          size="small"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={proj.end_date || ''}
                          onChange={(e) => setInlineProjects(prev => prev.map((p, i) => i === idx ? { ...p, end_date: e.target.value } : p))}
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                ))}
              </Grid>
            )}
          </Grid>
          </fieldset>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{canEdit ? 'Cancel' : 'Close'}</Button>
          {canEdit && (
            <Button onClick={handleSaveDonor} variant="contained">
              {isEditMode ? 'Update' : inlineProjects.length > 0 ? `Create Partner + ${inlineProjects.length} Project(s)` : 'Create Partner'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Donor Statistics Dialog */}
      <Dialog open={openStatsDialog} onClose={() => setOpenStatsDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Partner Statistics</DialogTitle>
        <DialogContent>
          {donorStats && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Typography variant="h6">{donorStats.donor_name}</Typography>
                <Typography variant="body2" color="text.secondary">{donorStats.donor_code}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">Committed</Typography>
                <Typography variant="h6">{formatCurrency(donorStats.total_committed, donorStats.currency)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">Allocated</Typography>
                <Typography variant="h6">{formatCurrency(donorStats.total_allocated, donorStats.currency)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">Spent</Typography>
                <Typography variant="h6">{formatCurrency(donorStats.total_spent, donorStats.currency)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">Remaining</Typography>
                <Typography variant="h6" color="success.main">
                  {formatCurrency(donorStats.remaining_balance, donorStats.currency)}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">Utilization Rate</Typography>
                <Typography variant="h6">{donorStats.utilization_rate}%</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">Budget Lines</Typography>
                <Typography variant="h6">{donorStats.budget_lines_count}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" gutterBottom>Requests by Status</Typography>
                {Object.entries(donorStats.requests_by_status).map(([status, count]) => (
                  <Chip key={status} label={`${status}: ${count}`} size="small" sx={{ mr: 1, mb: 1 }} />
                ))}
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenStatsDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Add/Remove Funds Dialog */}
      <Dialog open={openFundsDialog} onClose={() => setOpenFundsDialog(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {fundsMode === 'add' ? 'Add Committed Funds' : 'Remove Committed Funds'}
        </DialogTitle>
        <DialogContent>
          {fundsDonor && (
            <Box sx={{ mt: 1 }}>
              <Alert severity={fundsMode === 'add' ? 'info' : 'warning'} sx={{ mb: 2 }}>
                <strong>{fundsDonor.donor_name}</strong> ({fundsDonor.donor_code})<br />
                Current Committed: <strong>{formatCurrency(fundsDonor.total_committed, fundsDonor.currency_code)}</strong>
                {' | '}Allocated: <strong>{formatCurrency(fundsDonor.total_allocated, fundsDonor.currency_code)}</strong>
              </Alert>
              <TextField
                label={fundsMode === 'add' ? 'Amount to Add' : 'Amount to Remove'}
                type="number"
                fullWidth
                value={fundsAmount}
                onChange={(e) => setFundsAmount(e.target.value)}
                InputProps={{ startAdornment: '$' }}
                sx={{ mb: 2 }}
              />
              <TextField
                label="Reason / Description"
                fullWidth
                multiline
                rows={2}
                value={fundsDescription}
                onChange={(e) => setFundsDescription(e.target.value)}
                placeholder={fundsMode === 'add' ? 'e.g., New tranche received' : 'e.g., Partner withdrew funds'}
              />
              {fundsAmount && parseFloat(fundsAmount) > 0 && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  New Committed: <strong>
                    {formatCurrency(
                      fundsMode === 'add'
                        ? fundsDonor.total_committed + parseFloat(fundsAmount)
                        : fundsDonor.total_committed - parseFloat(fundsAmount),
                      fundsDonor.currency_code
                    )}
                  </strong>
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenFundsDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={fundsMode === 'add' ? 'success' : 'warning'}
            onClick={handleSubmitFunds}
            disabled={isSubmitting || !fundsAmount || parseFloat(fundsAmount) <= 0}
          >
            {isSubmitting ? <CircularProgress size={24} /> : fundsMode === 'add' ? 'Add Funds' : 'Remove Funds'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Donor Dialog */}
      <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Partner</DialogTitle>
        <DialogContent>
          {deleteDonor && (
            <Box>
              <Alert severity="error" sx={{ mb: 2 }}>
                Are you sure you want to permanently delete this partner? This action cannot be undone.
              </Alert>
              <Card variant="outlined">
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Partner Code</Typography>
                      <Typography fontWeight="bold">{deleteDonor.donor_code}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Partner Name</Typography>
                      <Typography>{deleteDonor.donor_name}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Committed</Typography>
                      <Typography>{formatCurrency(deleteDonor.total_committed, deleteDonor.currency_code)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Allocated</Typography>
                      <Typography>{formatCurrency(deleteDonor.total_allocated, deleteDonor.currency_code)}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
              {Number(deleteDonor.total_allocated) > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  This partner has allocated funds. Delete associated budget lines first.
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <DeleteIcon />}
          >
            Delete Permanently
          </Button>
        </DialogActions>
      </Dialog>

      {/* Donor Transaction History Dialog */}
      <Dialog open={openTransactionsDialog} onClose={() => setOpenTransactionsDialog(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>Fund History: {transactionsDonor?.donor_name}</DialogTitle>
        <DialogContent>
          {donorTransactions.length === 0 ? (
            <Alert severity="info" sx={{ mt: 1 }}>No fund transactions recorded yet.</Alert>
          ) : (
            <TableContainer sx={{ mt: 1, overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 500 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'grey.100' }}>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell align="right"><strong>Amount</strong></TableCell>
                    <TableCell align="right"><strong>Before</strong></TableCell>
                    <TableCell align="right"><strong>After</strong></TableCell>
                    <TableCell><strong>Description</strong></TableCell>
                    <TableCell><strong>By</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {donorTransactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>{format(new Date(tx.created_at), 'MMM d, yyyy HH:mm')}</TableCell>
                      <TableCell>
                        <Chip
                          label={tx.transaction_type === 'COMMITMENT_ADD' ? 'Added' : 'Removed'}
                          size="small"
                          color={tx.transaction_type === 'COMMITMENT_ADD' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography color={tx.transaction_type === 'COMMITMENT_ADD' ? 'success.main' : 'error.main'} fontWeight="bold">
                          {tx.transaction_type === 'COMMITMENT_ADD' ? '+' : '-'}${Number(tx.amount).toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">${Number(tx.balance_before).toLocaleString()}</TableCell>
                      <TableCell align="right">${Number(tx.balance_after).toLocaleString()}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell>{tx.first_name} {tx.last_name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenTransactionsDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Projects Dialog */}
      <Dialog open={openProjectsDialog} onClose={() => setOpenProjectsDialog(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          Projects — {projectsDonor?.donor_name}
          {canEdit && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              sx={{ float: 'right' }}
              onClick={() => { setNewProject({}); setOpenCreateProjectDialog(true); }}
            >
              New Project
            </Button>
          )}
        </DialogTitle>
        <DialogContent>
          {loadingProjects ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : donorProjects.length === 0 ? (
            <Alert severity="info">No projects found for this donor.</Alert>
          ) : (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 600 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#006064' }}>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Code</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Total Budget</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Allocated</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Spent</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Timeline</TableCell>
                    <TableCell sx={{ color: 'white', fontWeight: 700 }}>Status</TableCell>
                    {canEdit && <TableCell sx={{ color: 'white', fontWeight: 700 }} align="center">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {donorProjects.map((proj) => (
                    <TableRow key={proj.id} hover>
                      <TableCell><Typography variant="body2" fontWeight={600} color="primary.main">{proj.project_code}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="body2">{proj.project_name}</Typography>
                        {(proj as any).description && <Typography variant="caption" color="text.secondary">{(proj as any).description}</Typography>}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={500}>{(proj.total_budget || 0).toLocaleString()}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{((proj as any).total_allocated || 0).toLocaleString()}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{((proj as any).total_spent || 0).toLocaleString()}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {proj.start_date ? format(new Date(proj.start_date), 'dd MMM yyyy') : '—'}
                          {' → '}
                          {proj.end_date ? format(new Date(proj.end_date), 'dd MMM yyyy') : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={proj.is_active ? 'Active' : 'Inactive'} color={proj.is_active ? 'success' : 'default'} size="small" />
                      </TableCell>
                      {canEdit && (
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Tooltip title="Edit Project">
                              <IconButton size="small" color="primary" onClick={() => handleOpenProjectEdit(proj)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Add Funds to Project">
                              <IconButton size="small" color="success" onClick={() => handleOpenProjectFunds(proj, 'add')}>
                                <AddFundsIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Deduct Funds from Project">
                              <IconButton size="small" color="warning" onClick={() => handleOpenProjectFunds(proj, 'deduct')}>
                                <RemoveFundsIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Project">
                              <IconButton size="small" color="error" onClick={() => handleOpenProjectDelete(proj)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenProjectsDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Create Project Dialog — modern redesign */}
      <Dialog
        open={openCreateProjectDialog}
        onClose={() => { setOpenCreateProjectDialog(false); setNewProject({}); }}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        {/* Gradient header */}
        <Box
          sx={{
            background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
            p: 3,
            color: 'white',
            position: 'relative'
          }}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <ProjectsIcon sx={{ fontSize: 26 }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700}>Add New Project</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                Partner: {projectsDonor?.donor_name} ({projectsDonor?.donor_code})
                {projectsDonor?.currency_code ? ` · ${projectsDonor.currency_code}` : ''}
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={() => { setOpenCreateProjectDialog(false); setNewProject({}); }}
            sx={{
              position: 'absolute',
              top: 10,
              right: 10,
              color: 'rgba(255,255,255,0.7)',
              '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.12)' }
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>

        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ p: 3 }}>
            {/* Section: Project Identity */}
            <Paper
              variant="outlined"
              sx={{ p: 2.5, mb: 2.5, borderRadius: 2, borderColor: 'primary.light', borderWidth: 1.5 }}
            >
              <Typography
                variant="subtitle2"
                color="primary.main"
                fontWeight={700}
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}
              >
                <ProjectsIcon fontSize="small" /> Project Identity
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    label="Project Name *"
                    fullWidth
                    required
                    value={newProject.project_name || ''}
                    onChange={(e) => setNewProject(p => ({ ...p, project_name: e.target.value }))}
                    placeholder="e.g. Community Health Initiative Phase 2"
                    inputProps={{ maxLength: 200 }}
                    helperText={`${(newProject.project_name || '').length}/200 — A clear, descriptive name for this project`}
                  />
                </Grid>
                <Grid item xs={12} sm={5}>
                  <TextField
                    label="Project Code"
                    fullWidth
                    value={newProject.project_code || ''}
                    onChange={(e) => setNewProject(p => ({ ...p, project_code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. CHI-P2-2025"
                    helperText="Leave blank to auto-generate from project name"
                    inputProps={{ style: { fontFamily: 'monospace', letterSpacing: '0.08em' } }}
                  />
                </Grid>
                <Grid item xs={12} sm={7}>
                  <TextField
                    label="Description"
                    fullWidth
                    multiline
                    rows={3}
                    value={newProject.description || ''}
                    onChange={(e) => setNewProject(p => ({ ...p, description: e.target.value }))}
                    placeholder="Brief description of the project scope and objectives"
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* Section: Budget & Timeline */}
            <Paper
              variant="outlined"
              sx={{ p: 2.5, borderRadius: 2, borderColor: 'success.light', borderWidth: 1.5 }}
            >
              <Typography
                variant="subtitle2"
                color="success.dark"
                fontWeight={700}
                gutterBottom
                sx={{ mb: 2 }}
              >
                Budget &amp; Timeline
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Total Budget *"
                    required
                    type="number"
                    fullWidth
                    value={newProject.total_budget ?? ''}
                    onChange={(e) => setNewProject(p => ({ ...p, total_budget: parseFloat(e.target.value) }))}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Typography variant="body2" fontWeight={700} color="text.secondary">
                            {projectsDonor?.currency_code || 'USD'}
                          </Typography>
                        </InputAdornment>
                      )
                    }}
                    inputProps={{ min: 0, step: 0.01 }}
                    helperText="Total project budget amount"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="Start Date"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={newProject.start_date || ''}
                    onChange={(e) => setNewProject(p => ({ ...p, start_date: e.target.value }))}
                    helperText="Project commencement date"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField
                    label="End Date"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={newProject.end_date || ''}
                    onChange={(e) => setNewProject(p => ({ ...p, end_date: e.target.value }))}
                    helperText="Expected completion date"
                  />
                </Grid>
              </Grid>
            </Paper>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            onClick={() => { setOpenCreateProjectDialog(false); setNewProject({}); }}
            variant="outlined"
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateProject}
            disabled={submittingProject || !newProject.project_name || !newProject.total_budget}
            startIcon={submittingProject ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
            sx={{ minWidth: 150 }}
          >
            {submittingProject ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Project Fund Add/Deduct Dialog */}
      <Dialog open={projectFundsOpen} onClose={() => setProjectFundsOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {projectFundsMode === 'add' ? 'Add Funds to Project' : 'Deduct Funds from Project'}
        </DialogTitle>
        <DialogContent>
          {projectFundsTarget && (
            <Box sx={{ mt: 1 }}>
              <Alert severity={projectFundsMode === 'add' ? 'info' : 'warning'} sx={{ mb: 2 }}>
                <strong>{projectFundsTarget.project_name}</strong> ({projectFundsTarget.project_code})<br />
                Current Budget: <strong>{(projectFundsTarget.total_budget || 0).toLocaleString()}</strong>
                {projectsDonor?.currency_code ? ` ${projectsDonor.currency_code}` : ''}
              </Alert>
              <TextField
                label={projectFundsMode === 'add' ? 'Amount to Add' : 'Amount to Deduct'}
                type="number"
                fullWidth
                value={projectFundsAmount}
                onChange={(e) => setProjectFundsAmount(e.target.value)}
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ mb: 2 }}
              />
              <TextField
                label="Notes / Reason"
                fullWidth
                multiline
                rows={2}
                value={projectFundsNotes}
                onChange={(e) => setProjectFundsNotes(e.target.value)}
                placeholder={projectFundsMode === 'add' ? 'e.g., Additional tranche approved' : 'e.g., Funds reallocated'}
              />
              {projectFundsAmount && parseFloat(projectFundsAmount) > 0 && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  New Budget: <strong>
                    {(projectFundsMode === 'add'
                      ? (projectFundsTarget.total_budget || 0) + parseFloat(projectFundsAmount)
                      : (projectFundsTarget.total_budget || 0) - parseFloat(projectFundsAmount)
                    ).toLocaleString()}
                  </strong>
                  {projectsDonor?.currency_code ? ` ${projectsDonor.currency_code}` : ''}
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectFundsOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color={projectFundsMode === 'add' ? 'success' : 'warning'}
            onClick={handleSubmitProjectFunds}
            disabled={isSubmitting || !projectFundsAmount || parseFloat(projectFundsAmount) <= 0}
          >
            {isSubmitting ? <CircularProgress size={20} color="inherit" /> : projectFundsMode === 'add' ? 'Add Funds' : 'Deduct Funds'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={projectEditOpen} onClose={() => { setProjectEditOpen(false); setProjectEditTarget(null); }} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Edit Project — {projectEditTarget?.project_name}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                label="Project Name *"
                fullWidth
                value={projectEditForm.project_name || ''}
                onChange={(e) => setProjectEditForm(f => ({ ...f, project_name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField
                label="Project Code"
                fullWidth
                value={projectEditForm.project_code || ''}
                onChange={(e) => setProjectEditForm(f => ({ ...f, project_code: e.target.value.toUpperCase() }))}
                inputProps={{ style: { fontFamily: 'monospace' } }}
              />
            </Grid>
            <Grid item xs={12} sm={7}>
              <TextField
                label="Total Budget *"
                type="number"
                fullWidth
                value={projectEditForm.total_budget ?? ''}
                onChange={(e) => setProjectEditForm(f => ({ ...f, total_budget: parseFloat(e.target.value) }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Typography variant="body2" fontWeight={700} color="text.secondary">
                        {projectsDonor?.currency_code || 'USD'}
                      </Typography>
                    </InputAdornment>
                  )
                }}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={2}
                value={projectEditForm.description || ''}
                onChange={(e) => setProjectEditForm(f => ({ ...f, description: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Start Date"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={projectEditForm.start_date || ''}
                onChange={(e) => setProjectEditForm(f => ({ ...f, start_date: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="End Date"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={projectEditForm.end_date || ''}
                onChange={(e) => setProjectEditForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={projectEditForm.is_active ? 'active' : 'inactive'}
                  label="Status"
                  onChange={(e) => setProjectEditForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setProjectEditOpen(false); setProjectEditTarget(null); }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveProjectEdit}
            disabled={projectEditSaving || !projectEditForm.project_name}
            startIcon={projectEditSaving ? <CircularProgress size={16} color="inherit" /> : <EditIcon />}
          >
            {projectEditSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Project Delete Confirmation Dialog */}
      <Dialog open={projectDeleteOpen} onClose={() => setProjectDeleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          {projectDeleteTarget && (
            <Box>
              <Alert severity="error" sx={{ mb: 2 }}>
                Are you sure you want to permanently delete this project? This cannot be undone.
              </Alert>
              <Card variant="outlined">
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Project Code</Typography>
                      <Typography fontWeight="bold">{projectDeleteTarget.project_code}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Project Name</Typography>
                      <Typography>{projectDeleteTarget.project_name}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Total Budget</Typography>
                      <Typography>{(projectDeleteTarget.total_budget || 0).toLocaleString()}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Allocated to Lines</Typography>
                      <Typography>{((projectDeleteTarget as any).total_allocated || 0).toLocaleString()}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
              {Number((projectDeleteTarget as any).total_allocated) > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  This project has budget lines. Remove all budget lines before deleting.
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectDeleteOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmProjectDelete}
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon />}
          >
            Delete Project
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DonorManagementPage;
