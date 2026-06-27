/**
 * Budget Management Component
 * For Finance Clerks to manage and top-up budget lines
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  IconButton,
  Tooltip,
<<<<<<< HEAD
  Alert,
  Menu,
  Checkbox,
  Stack,
  Divider,
  alpha,
  useTheme,
  InputAdornment
=======
  Alert
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  TrendingUp as TopUpIcon,
  History as HistoryIcon,
<<<<<<< HEAD
  Delete as DeleteIcon,
  MoreVert as MoreIcon,
  Visibility as ViewIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  AccountBalance as BudgetIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon
=======
  Delete as DeleteIcon
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

<<<<<<< HEAD
import { BudgetLine, BudgetTransaction, Department, Project } from '../../types';
import { budgetService } from '../../services/budgetService';
import donorService, { Donor } from '../../services/donorService';
import projectService from '../../services/projectService';
import api from '../../services/api';
import BudgetDetailDialog from './BudgetDetailDialog';
import * as XLSX from 'xlsx';
import { downloadHTMLAsPDF } from '../../utils/pdfUtils';

const BudgetManagement: React.FC = () => {
  const theme = useTheme();
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    departmentId: '',
    donorId: '',
    fiscalYear: 0
=======
import { BudgetLine, BudgetTransaction, Department } from '../../types';
import { budgetService } from '../../services/budgetService';
import api from '../../services/api';

const BudgetManagement: React.FC = () => {
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    departmentId: '',
    fiscalYear: new Date().getFullYear()
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  });

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTopUpDialogOpen, setIsTopUpDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
<<<<<<< HEAD
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  const [selectedBudget, setSelectedBudget] = useState<BudgetLine | null>(null);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

<<<<<<< HEAD
  // Action menu state
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuBudget, setMenuBudget] = useState<BudgetLine | null>(null);

  // Checkbox selection
  const [selectedLines, setSelectedLines] = useState<number[]>([]);

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  // Form states
  const [newBudget, setNewBudget] = useState({
    budgetCode: '',
    budgetName: '',
    departmentId: '',
<<<<<<< HEAD
    donorId: '',
    projectId: '',
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    fiscalYear: new Date().getFullYear(),
    allocatedAmount: '',
    description: ''
  });
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpDescription, setTopUpDescription] = useState('');

  useEffect(() => {
    fetchDepartments();
<<<<<<< HEAD
    fetchDonors();
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    fetchBudgetLines();
  }, [filters]);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      if (response.data.success) {
        setDepartments(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

<<<<<<< HEAD
  const fetchDonors = async () => {
    try {
      const activeDonors = await donorService.getActiveDonors();
      setDonors(activeDonors);
    } catch (error) {
      console.error('Failed to fetch donors:', error);
    }
  };

  const fetchProjectsForDonor = async (donorId: number) => {
    setLoadingProjects(true);
    try {
      const data = await projectService.getProjectsByDonor(donorId);
      setProjects(data);
    } catch {
      toast.error('Failed to load projects for this partner');
    } finally {
      setLoadingProjects(false);
    }
  };

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  const fetchBudgetLines = async () => {
    try {
      setIsLoading(true);
      const response = await budgetService.getAll({
        departmentId: filters.departmentId ? parseInt(filters.departmentId) : undefined,
<<<<<<< HEAD
        donorId: filters.donorId ? parseInt(filters.donorId) : undefined,
        fiscalYear: filters.fiscalYear || undefined
=======
        fiscalYear: filters.fiscalYear
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      });
      if (response.success && response.data) {
        setBudgetLines(response.data);
      }
    } catch (error) {
      toast.error('Failed to load budget lines');
    } finally {
      setIsLoading(false);
    }
  };

<<<<<<< HEAD
  const handleCreateBudget = async () => {
    if (!newBudget.donorId) { toast.error('Please select a partner'); return; }
    if (!newBudget.projectId) { toast.error('Please select a project'); return; }
    if (!newBudget.budgetName) { toast.error('Budget name is required'); return; }
    if (!newBudget.allocatedAmount) { toast.error('Allocated amount is required'); return; }
    try {
      setIsSubmitting(true);
      const response = await budgetService.create({
        budgetCode: newBudget.budgetCode || undefined,
        budgetName: newBudget.budgetName,
        departmentId: newBudget.departmentId ? parseInt(newBudget.departmentId) : undefined as any,
        donorId: parseInt(newBudget.donorId),
        projectId: parseInt(newBudget.projectId),
        fiscalYear: newBudget.fiscalYear,
        allocatedAmount: parseFloat(newBudget.allocatedAmount),
        description: newBudget.description || undefined
      } as any);
=======
  // Create new budget line
  const handleCreateBudget = async () => {
    try {
      setIsSubmitting(true);
      const response = await budgetService.create({
        budgetCode: newBudget.budgetCode,
        budgetName: newBudget.budgetName,
        departmentId: parseInt(newBudget.departmentId),
        fiscalYear: newBudget.fiscalYear,
        allocatedAmount: parseFloat(newBudget.allocatedAmount),
        description: newBudget.description || undefined
      });
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

      if (response.success) {
        toast.success('Budget line created successfully');
        setIsCreateDialogOpen(false);
        setNewBudget({
          budgetCode: '',
          budgetName: '',
          departmentId: '',
<<<<<<< HEAD
          donorId: '',
          projectId: '',
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          fiscalYear: new Date().getFullYear(),
          allocatedAmount: '',
          description: ''
        });
<<<<<<< HEAD
        setProjects([]);
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        fetchBudgetLines();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create budget line');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Top up budget
  const handleTopUp = async () => {
    if (!selectedBudget) return;

    try {
      setIsSubmitting(true);
      const response = await budgetService.topUp(
        selectedBudget.id,
        parseFloat(topUpAmount),
        topUpDescription || undefined
      );

      if (response.success) {
        toast.success(`Budget topped up. New balance: $${response.data?.newBalance?.toLocaleString()}`);
        setIsTopUpDialogOpen(false);
        setTopUpAmount('');
        setTopUpDescription('');
        fetchBudgetLines();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to top up budget');
    } finally {
      setIsSubmitting(false);
    }
  };

  // View transaction history
  const handleViewHistory = async (budget: BudgetLine) => {
    setSelectedBudget(budget);
    try {
      const response = await budgetService.getById(budget.id);
      if (response.success && response.data) {
        setTransactions(response.data.transactions || []);
        setIsHistoryDialogOpen(true);
      }
    } catch (error) {
      toast.error('Failed to load transaction history');
    }
  };

  // Open top-up dialog
  const handleOpenTopUp = (budget: BudgetLine) => {
    setSelectedBudget(budget);
    setTopUpAmount('');
    setTopUpDescription('');
    setIsTopUpDialogOpen(true);
  };

  // Open delete confirmation dialog
  const handleOpenDelete = (budget: BudgetLine) => {
    setSelectedBudget(budget);
    setIsDeleteDialogOpen(true);
  };

  // Delete budget line
  const handleDelete = async () => {
    if (!selectedBudget) return;

    try {
      setIsSubmitting(true);
      const response = await budgetService.delete(selectedBudget.id);
      if (response.success) {
        toast.success('Budget line deleted successfully');
        setIsDeleteDialogOpen(false);
        setSelectedBudget(null);
        fetchBudgetLines();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete budget line');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getUtilizationColor = (percentage: number): 'success' | 'warning' | 'error' => {
    if (percentage >= 90) return 'error';
    if (percentage >= 70) return 'warning';
    return 'success';
  };

<<<<<<< HEAD
  // Calculate totals - compute balance from allocated - spent to avoid NaN issues
  const totals = budgetLines.reduce(
    (acc, bl) => {
      const allocated = Number(bl.allocated_amount) || 0;
      const spent = Number(bl.spent_amount) || 0;
      return {
        allocated: acc.allocated + allocated,
        spent: acc.spent + spent,
        balance: acc.balance + (allocated - spent)
      };
    },
=======
  // Calculate totals - ensure numeric conversion for values that may come as strings from MySQL
  const totals = budgetLines.reduce(
    (acc, bl) => ({
      allocated: acc.allocated + (Number(bl.allocated_amount) || 0),
      spent: acc.spent + (Number(bl.spent_amount) || 0),
      balance: acc.balance + (Number(bl.balance) || 0)
    }),
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    { allocated: 0, spent: 0, balance: 0 }
  );

  return (
    <Box>
<<<<<<< HEAD
      {/* ── Gradient Header ── */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #006064 0%, #00363a 100%)', color: 'white', borderRadius: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <BudgetIcon sx={{ fontSize: 36 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>Budget Management</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                Create, manage, and top-up budget lines for all departments.
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Refresh">
              <IconButton sx={{ color: 'white' }} onClick={fetchBudgetLines}><RefreshIcon /></IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setIsCreateDialogOpen(true)}
              sx={{ bgcolor: 'white', color: '#006064', '&:hover': { bgcolor: alpha('#ffffff', 0.9) } }}
            >
              Create Budget Line
            </Button>
          </Stack>
=======
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" gutterBottom>
              Budget Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create, manage, and top-up budget lines for all departments.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setIsCreateDialogOpen(true)}
          >
            Create Budget Line
          </Button>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        </Box>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Total Allocated</Typography>
              <Typography variant="h4" color="primary">
                ${totals.allocated.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Total Spent</Typography>
              <Typography variant="h4" color="error">
                ${totals.spent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Total Balance</Typography>
              <Typography variant="h4" color="success.main">
                ${totals.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
<<<<<<< HEAD
      <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <FilterIcon fontSize="small" color="action" />
          <Typography variant="body2" fontWeight={600} color="text.secondary">Filters</Typography>
        </Stack>
=======
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField
              select
<<<<<<< HEAD
              label="Partner"
              size="small"
              fullWidth
              value={filters.donorId}
              onChange={(e) => setFilters({ ...filters, donorId: e.target.value })}
            >
              <MenuItem value="">All Partners</MenuItem>
              {donors.map(donor => (
                <MenuItem key={donor.id} value={donor.id}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{donor.donor_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{donor.donor_code} · {donor.currency_code}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              select
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              label="Department"
              size="small"
              fullWidth
              value={filters.departmentId}
              onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
            >
              <MenuItem value="">All Departments</MenuItem>
              {departments.map(dept => (
                <MenuItem key={dept.id} value={dept.id}>
                  {dept.department_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
<<<<<<< HEAD
          <Grid item xs={12} sm={3}>
=======
          <Grid item xs={12} sm={4}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            <TextField
              type="number"
              label="Fiscal Year"
              size="small"
              fullWidth
<<<<<<< HEAD
              value={filters.fiscalYear || ''}
              onChange={(e) => setFilters({ ...filters, fiscalYear: e.target.value ? parseInt(e.target.value) : 0 })}
            />
          </Grid>
        </Grid>
        {selectedLines.length > 0 && (
          <Box mt={1.5} p={1} bgcolor={alpha(theme.palette.primary.main, 0.08)} borderRadius={1} display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" color="primary.main" fontWeight={600}>
              {selectedLines.length} line{selectedLines.length !== 1 ? 's' : ''} selected
            </Typography>
            <Button size="small" onClick={() => setSelectedLines([])}>Clear Selection</Button>
          </Box>
        )}
=======
              value={filters.fiscalYear}
              onChange={(e) => setFilters({ ...filters, fiscalYear: parseInt(e.target.value) })}
            />
          </Grid>
        </Grid>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      </Paper>

      {/* Budget Lines Table */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
<<<<<<< HEAD
        <Paper elevation={2} sx={{ borderRadius: 2 }}>
          <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#006064' }}>
                <TableCell padding="checkbox" sx={{ bgcolor: '#006064' }}>
                  <Checkbox
                    checked={budgetLines.length > 0 && selectedLines.length === budgetLines.length}
                    indeterminate={selectedLines.length > 0 && selectedLines.length < budgetLines.length}
                    onChange={() => setSelectedLines(selectedLines.length === budgetLines.length ? [] : budgetLines.map(b => b.id))}
                    sx={{ color: 'white', '&.Mui-checked': { color: 'white' }, '&.MuiCheckbox-indeterminate': { color: 'white' } }}
                  />
                </TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Code</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Partner</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Project</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Department</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Allocated</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Spent</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }} align="right">Balance</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }}>Utilization</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700 }} align="center">Actions</TableCell>
=======
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'grey.100' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>Code</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Allocated</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Spent</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Balance</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Utilization</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              </TableRow>
            </TableHead>
            <TableBody>
              {budgetLines.length === 0 ? (
                <TableRow>
<<<<<<< HEAD
                  <TableCell colSpan={11} align="center" sx={{ py: 5 }}>
                    <BudgetIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
=======
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                    <Typography color="text.secondary">No budget lines found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
<<<<<<< HEAD
                budgetLines.map((budget) => {
                  const isSelected = selectedLines.includes(budget.id);
                  return (
                  <TableRow
                    key={budget.id}
                    hover
                    selected={isSelected}
                    sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.06) } }}
                    onClick={() => {
                      setSelectedBudget(budget);
                      setIsDetailDialogOpen(true);
                    }}
                  >
                    <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        onChange={() => setSelectedLines(prev => prev.includes(budget.id) ? prev.filter(x => x !== budget.id) : [...prev, budget.id])}
                      />
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography fontWeight="medium">{budget.budget_code}</Typography>
                        <ViewIcon fontSize="small" color="action" sx={{ opacity: 0.5 }} />
                      </Box>
                    </TableCell>
                    <TableCell>{budget.budget_name}</TableCell>
                    <TableCell>
                      <Chip label={budget.donor_code || 'N/A'} size="small" color="primary" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={budget.project_code || budget.category || 'UNASSIGNED'} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
=======
                budgetLines.map((budget) => (
                  <TableRow key={budget.id} hover>
                    <TableCell>
                      <Typography fontWeight="medium">{budget.budget_code}</Typography>
                    </TableCell>
                    <TableCell>{budget.budget_name}</TableCell>
                    <TableCell>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                      <Chip label={budget.department_code} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      ${Number(budget.allocated_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      ${Number(budget.spent_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Typography
                        fontWeight="medium"
<<<<<<< HEAD
                        color={(Number(budget.allocated_amount) - Number(budget.spent_amount)) < 1000 ? 'error' : 'success.main'}
                      >
                        ${(Number(budget.allocated_amount || 0) - Number(budget.spent_amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
=======
                        color={Number(budget.balance || 0) < 1000 ? 'error' : 'success.main'}
                      >
                        ${Number(budget.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(Number(budget.utilization_percentage) || 0, 100)}
                          color={getUtilizationColor(Number(budget.utilization_percentage) || 0)}
                          sx={{ flex: 1, height: 8, borderRadius: 4 }}
                        />
                        <Typography variant="body2" sx={{ minWidth: 45 }}>
                          {Number(budget.utilization_percentage || 0).toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
<<<<<<< HEAD
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="View Details">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBudget(budget);
                            setIsDetailDialogOpen(true);
                          }}
                        >
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Top Up / Deduct">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTopUp(budget);
                          }}
=======
                    <TableCell align="center">
                      <Tooltip title="Top Up">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleOpenTopUp(budget)}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                        >
                          <TopUpIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="View History">
                        <IconButton
                          size="small"
<<<<<<< HEAD
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewHistory(budget);
                          }}
=======
                          onClick={() => handleViewHistory(budget)}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                        >
                          <HistoryIcon />
                        </IconButton>
                      </Tooltip>
<<<<<<< HEAD
                      <Tooltip title="More Actions">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuAnchorEl(e.currentTarget);
                            setMenuBudget(budget);
                          }}
                        >
                          <MoreIcon />
=======
                      <Tooltip title="Delete Budget Line">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleOpenDelete(budget)}
                        >
                          <DeleteIcon />
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
<<<<<<< HEAD
                  );
                })
              )}
            </TableBody>
          </Table>
          </TableContainer>
          <Divider />
          <Box display="flex" alignItems="center" px={2} py={0.5}>
            <Typography variant="caption" color="text.secondary">
              {selectedLines.length > 0
                ? `${selectedLines.length} of ${budgetLines.length} selected`
                : `${budgetLines.length} budget line${budgetLines.length !== 1 ? 's' : ''}`}
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Action Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={() => {
          setMenuAnchorEl(null);
          setMenuBudget(null);
        }}
      >
        <MenuItem onClick={() => {
          if (menuBudget) {
            setSelectedBudget(menuBudget);
            setIsDetailDialogOpen(true);
          }
          setMenuAnchorEl(null);
        }}>
          <ViewIcon sx={{ mr: 1 }} fontSize="small" /> View Details
        </MenuItem>
        <MenuItem onClick={() => {
          if (menuBudget) handleOpenTopUp(menuBudget);
          setMenuAnchorEl(null);
        }}>
          <TopUpIcon sx={{ mr: 1 }} fontSize="small" /> Top Up Budget
        </MenuItem>
        <MenuItem onClick={() => {
          if (menuBudget) handleViewHistory(menuBudget);
          setMenuAnchorEl(null);
        }}>
          <HistoryIcon sx={{ mr: 1 }} fontSize="small" /> View History
        </MenuItem>
        <MenuItem 
          onClick={() => {
            if (menuBudget) handleOpenDelete(menuBudget);
            setMenuAnchorEl(null);
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" /> Delete
        </MenuItem>
      </Menu>

      {/* Budget Detail Dialog */}
      <BudgetDetailDialog
        open={isDetailDialogOpen}
        budgetLineId={selectedBudget?.id || null}
        onClose={() => {
          setIsDetailDialogOpen(false);
        }}
        onTopUp={(budget) => {
          handleOpenTopUp(budget);
        }}
      />

=======
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      {/* Create Budget Dialog */}
      <Dialog 
        open={isCreateDialogOpen} 
        onClose={() => setIsCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Budget Line</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
<<<<<<< HEAD
            {/* Step 1: Select Donor */}
            <Grid item xs={12}>
              <TextField
                select
                label="Partner *"
                fullWidth
                value={newBudget.donorId}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewBudget({ ...newBudget, donorId: val, projectId: '' });
                  setProjects([]);
                  if (val) fetchProjectsForDonor(parseInt(val));
                }}
                helperText="Step 1: Select the funding partner"
              >
                <MenuItem value=""><em>— Select a partner —</em></MenuItem>
                {donors.map(donor => (
                  <MenuItem key={donor.id} value={donor.id}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{donor.donor_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{donor.donor_code} · {donor.currency_code}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* Step 2: Select Project */}
            <Grid item xs={12}>
              <TextField
                select
                label="Project *"
                fullWidth
                value={newBudget.projectId}
                onChange={(e) => setNewBudget({ ...newBudget, projectId: e.target.value })}
                disabled={!newBudget.donorId || loadingProjects}
                helperText={
                  !newBudget.donorId ? 'Select a partner first' :
                  loadingProjects ? 'Loading projects...' :
                  projects.length === 0 ? 'No projects found — create a project for this partner first' :
                  'Step 2: Select the project this budget line belongs to'
                }
                error={!!newBudget.donorId && !loadingProjects && projects.length === 0}
              >
                {projects.map(p => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.project_code} — {p.project_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {/* Step 3: Budget Line details */}
            <Grid item xs={12} sm={6}>
              <TextField
                label="Budget Code (optional, auto-generated)"
                fullWidth
                value={newBudget.budgetCode}
                onChange={(e) => setNewBudget({ ...newBudget, budgetCode: e.target.value })}
                disabled={!newBudget.projectId}
                placeholder="e.g., WASH-EDU-0001"
=======
            <Grid item xs={12} sm={6}>
              <TextField
                label="Budget Code"
                fullWidth
                value={newBudget.budgetCode}
                onChange={(e) => setNewBudget({ ...newBudget, budgetCode: e.target.value })}
                placeholder="e.g., IT-2026-HW"
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Fiscal Year"
                type="number"
                fullWidth
                value={newBudget.fiscalYear}
                onChange={(e) => setNewBudget({ ...newBudget, fiscalYear: parseInt(e.target.value) })}
<<<<<<< HEAD
                disabled={!newBudget.projectId}
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
<<<<<<< HEAD
                label="Budget Name *"
                fullWidth
                value={newBudget.budgetName}
                onChange={(e) => setNewBudget({ ...newBudget, budgetName: e.target.value })}
                disabled={!newBudget.projectId}
                placeholder="e.g., Water & Sanitation Activities"
=======
                label="Budget Name"
                fullWidth
                value={newBudget.budgetName}
                onChange={(e) => setNewBudget({ ...newBudget, budgetName: e.target.value })}
                placeholder="e.g., IT Hardware Budget"
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
<<<<<<< HEAD
                label="Department (Optional)"
                fullWidth
                value={newBudget.departmentId}
                onChange={(e) => setNewBudget({ ...newBudget, departmentId: e.target.value })}
                disabled={!newBudget.projectId}
              >
                <MenuItem value="">No Department</MenuItem>
=======
                label="Department"
                fullWidth
                value={newBudget.departmentId}
                onChange={(e) => setNewBudget({ ...newBudget, departmentId: e.target.value })}
              >
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                {departments.map(dept => (
                  <MenuItem key={dept.id} value={dept.id}>
                    {dept.department_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
<<<<<<< HEAD
                label="Allocated Amount *"
=======
                label="Allocated Amount"
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                type="number"
                fullWidth
                value={newBudget.allocatedAmount}
                onChange={(e) => setNewBudget({ ...newBudget, allocatedAmount: e.target.value })}
<<<<<<< HEAD
                disabled={!newBudget.projectId}
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                InputProps={{ startAdornment: '$' }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description (Optional)"
                fullWidth
                multiline
                rows={2}
                value={newBudget.description}
                onChange={(e) => setNewBudget({ ...newBudget, description: e.target.value })}
<<<<<<< HEAD
                disabled={!newBudget.projectId}
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateBudget}
<<<<<<< HEAD
            disabled={isSubmitting || !newBudget.donorId || !newBudget.projectId || !newBudget.budgetName || !newBudget.allocatedAmount}
=======
            disabled={isSubmitting || !newBudget.budgetCode || !newBudget.budgetName || !newBudget.departmentId || !newBudget.allocatedAmount}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          >
            {isSubmitting ? <CircularProgress size={24} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

<<<<<<< HEAD
      {/* Top Up / Deduct Dialog */}
=======
      {/* Top Up Dialog */}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      <Dialog 
        open={isTopUpDialogOpen} 
        onClose={() => setIsTopUpDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
<<<<<<< HEAD
        <DialogTitle>Adjust Budget: {selectedBudget?.budget_code}</DialogTitle>
=======
        <DialogTitle>Top Up Budget: {selectedBudget?.budget_code}</DialogTitle>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        <DialogContent>
          {selectedBudget && (
            <Box sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ mb: 2 }}>
<<<<<<< HEAD
                Current Allocated: <strong>${Number(selectedBudget.allocated_amount || 0).toLocaleString()}</strong>
                {' | '}Spent: <strong>${Number(selectedBudget.spent_amount || 0).toLocaleString()}</strong>
                {' | '}Balance: <strong>${Number(selectedBudget.balance || 0).toLocaleString()}</strong>
              </Alert>
              <TextField
                label="Amount (positive to add, negative to deduct)"
=======
                Current Balance: <strong>${Number(selectedBudget.balance || 0).toLocaleString()}</strong>
              </Alert>
              <TextField
                label="Top Up Amount"
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                type="number"
                fullWidth
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                InputProps={{ startAdornment: '$' }}
                sx={{ mb: 2 }}
<<<<<<< HEAD
                helperText="Enter a positive number to top up or a negative number to deduct"
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              />
              <TextField
                label="Description (Optional)"
                fullWidth
                multiline
                rows={2}
                value={topUpDescription}
                onChange={(e) => setTopUpDescription(e.target.value)}
<<<<<<< HEAD
                placeholder="e.g., Q2 budget allocation or Budget reduction"
              />
              {topUpAmount && parseFloat(topUpAmount) !== 0 && (
                <Alert severity={parseFloat(topUpAmount) > 0 ? 'success' : 'warning'} sx={{ mt: 2 }}>
                  {parseFloat(topUpAmount) > 0 ? 'Top Up' : 'Deduction'}: <strong>${Math.abs(parseFloat(topUpAmount || '0')).toLocaleString()}</strong><br />
=======
                placeholder="e.g., Q2 budget allocation"
              />
              {topUpAmount && (
                <Alert severity="success" sx={{ mt: 2 }}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                  New Balance: <strong>${(Number(selectedBudget.balance || 0) + parseFloat(topUpAmount || '0')).toLocaleString()}</strong>
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsTopUpDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
<<<<<<< HEAD
            color={topUpAmount && parseFloat(topUpAmount) < 0 ? 'warning' : 'primary'}
            onClick={handleTopUp}
            disabled={isSubmitting || !topUpAmount || parseFloat(topUpAmount) === 0}
          >
            {isSubmitting ? <CircularProgress size={24} /> : (topUpAmount && parseFloat(topUpAmount) < 0 ? 'Deduct' : 'Top Up')}
=======
            color="primary"
            onClick={handleTopUp}
            disabled={isSubmitting || !topUpAmount || parseFloat(topUpAmount) <= 0}
          >
            {isSubmitting ? <CircularProgress size={24} /> : 'Top Up'}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          </Button>
        </DialogActions>
      </Dialog>

      {/* Transaction History Dialog */}
      <Dialog 
        open={isHistoryDialogOpen} 
        onClose={() => setIsHistoryDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Transaction History: {selectedBudget?.budget_code}</DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Balance Before</TableCell>
                  <TableCell>Balance After</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Performed By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{format(new Date(tx.created_at), 'MMM d, yyyy HH:mm')}</TableCell>
                    <TableCell>
                      <Chip 
                        label={tx.transaction_type} 
                        size="small"
                        color={tx.transaction_type === 'DEDUCTION' ? 'error' : 'success'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography color={tx.transaction_type === 'DEDUCTION' ? 'error' : 'success.main'}>
                        {tx.transaction_type === 'DEDUCTION' ? '-' : '+'}${Number(tx.amount || 0).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>${Number(tx.balance_before || 0).toLocaleString()}</TableCell>
                    <TableCell>${Number(tx.balance_after || 0).toLocaleString()}</TableCell>
                    <TableCell>{tx.description}</TableCell>
                    <TableCell>{tx.first_name} {tx.last_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
<<<<<<< HEAD
          <Button
            variant="outlined"
            color="error"
            startIcon={<PdfIcon />}
            onClick={() => {
              if (!transactions.length) return;
              const budgetCode = selectedBudget?.budget_code || 'BUDGET';
              const tableRows = transactions.map((tx, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${tx.created_at ? format(new Date(tx.created_at), 'dd MMM yyyy HH:mm') : '—'}</td>
                  <td>${tx.transaction_type}</td>
                  <td align="right">$${Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td align="right">$${Number(tx.balance_before || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td align="right">$${Number(tx.balance_after || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>${tx.description || '—'}</td>
                  <td>${tx.first_name || ''} ${tx.last_name || ''}</td>
                </tr>`).join('');
              const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Budget Transactions — ${budgetCode}</title>
<style>*{box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;margin:0;padding:20px;}
.header{background:white;border-bottom:2px solid #006064;color:#006064;padding:12px 0 12px;margin-bottom:18px;}
.header .org{font-size:11px;font-weight:bold;color:#006064;letter-spacing:.4px;margin-bottom:4px;}
.header h1{font-size:18px;margin:0 0 4px;color:#006064;}.header p{font-size:11px;margin:2px 0;color:#444;}
h3{font-size:11px;color:#006064;border-bottom:1.5px solid #006064;padding-bottom:3px;margin:12px 0 7px;text-transform:uppercase;}
table{width:100%;border-collapse:collapse;font-size:10px;}
thead th{background:#006064;color:white;padding:6px 8px;text-align:left;}
tbody td{padding:5px 8px;border-bottom:1px solid #e0e0e0;}
tbody tr:nth-child(even) td{background:#f7f7f7;}
.footer{margin-top:20px;padding-top:8px;border-top:1.5px solid #e0e0e0;display:flex;justify-content:space-between;font-size:9px;color:#999;}
</style></head><body>
<div class="header"><div class="org">ERP Connect &mdash; Zimbabwe Council of Churches</div><h1>Budget Transaction History</h1><p>Budget Code: <strong>${budgetCode}</strong></p><p>Records: <strong>${transactions.length}</strong></p></div>
<h3>Transactions</h3>
<table><thead><tr><th>#</th><th>Date</th><th>Type</th><th align="right">Amount</th><th align="right">Bal Before</th><th align="right">Bal After</th><th>Description</th><th>By</th></tr></thead>
<tbody>${tableRows}</tbody></table>
<div class="footer"><span>ERP Connect - Zimbabwe Council of Churches | CONFIDENTIAL</span><span>Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}</span></div>
</body></html>`;
              downloadHTMLAsPDF(html, `budget-transactions-${budgetCode}-${format(new Date(), 'yyyy-MM-dd')}`);
            }}
          >
            Print PDF
          </Button>
          <Button
            variant="outlined"
            color="success"
            startIcon={<ExcelIcon />}
            onClick={() => {
              if (!transactions.length) return;
              const budgetCode = selectedBudget?.budget_code || 'BUDGET';
              const wb = XLSX.utils.book_new();
              const headers = ['#', 'Date', 'Type', 'Amount ($)', 'Balance Before ($)', 'Balance After ($)', 'Description', 'Performed By'];
              const rows = transactions.map((tx, i) => [
                i + 1,
                tx.created_at ? format(new Date(tx.created_at), 'dd MMM yyyy HH:mm') : '',
                tx.transaction_type,
                Number(tx.amount || 0),
                Number(tx.balance_before || 0),
                Number(tx.balance_after || 0),
                tx.description || '',
                `${tx.first_name || ''} ${tx.last_name || ''}`.trim()
              ]);
              const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
              ws['!cols'] = [4, 18, 16, 14, 18, 16, 35, 20].map(w => ({ wch: w }));
              XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
              XLSX.writeFile(wb, `budget-transactions-${budgetCode}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
              toast.success('Exported to Excel');
            }}
          >
            Export Excel
          </Button>
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          <Button onClick={() => setIsHistoryDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Budget Line</DialogTitle>
        <DialogContent>
          {selectedBudget && (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Are you sure you want to delete this budget line? This action cannot be undone.
              </Alert>
              <Card variant="outlined">
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Budget Code</Typography>
                      <Typography fontWeight="medium">{selectedBudget.budget_code}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Budget Name</Typography>
                      <Typography>{selectedBudget.budget_name}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Allocated Amount</Typography>
                      <Typography>${Number(selectedBudget.allocated_amount || 0).toLocaleString()}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Current Balance</Typography>
                      <Typography>${Number(selectedBudget.balance || 0).toLocaleString()}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
              {Number(selectedBudget.spent_amount) > 0 && (
<<<<<<< HEAD
                <Alert severity="warning" sx={{ mt: 2 }}>
                  This budget line has <strong>${Number(selectedBudget.spent_amount).toLocaleString()}</strong> spent against it. Deleting it will permanently remove all associated transaction records.
=======
                <Alert severity="error" sx={{ mt: 2 }}>
                  This budget line has been used (${Number(selectedBudget.spent_amount).toLocaleString()} spent).
                  It cannot be deleted. Consider deactivating it instead.
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
<<<<<<< HEAD
            disabled={isSubmitting}
=======
            disabled={isSubmitting || Boolean(selectedBudget && Number(selectedBudget.spent_amount) > 0)}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
            startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BudgetManagement;
