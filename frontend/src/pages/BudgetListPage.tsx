/**
 * Budget List Page Component
 * Displays budget lines with balances and utilization
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  TablePagination,
  Chip,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  LinearProgress,
  Alert,
  Card,
  CardContent,
<<<<<<< HEAD
  Grid,
  Tooltip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  Stack,
  Divider,
  alpha,
  useTheme,
  useMediaQuery
=======
  Grid
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
} from '@mui/material';
import {
  Search as SearchIcon,
  AccountBalance as BudgetIcon,
  TrendingUp as SpentIcon,
<<<<<<< HEAD
  TrendingDown as BalanceIcon,
  OpenInNew as ViewIcon,
  Add as AddIcon,
  Edit as EditIcon,
  TrendingUp as TopUpIcon,
  RemoveCircleOutline as DeductIcon,
  PauseCircleOutline as SuspendIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
=======
  TrendingDown as BalanceIcon
} from '@mui/icons-material';
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

import { useAuthStore } from '../store/authStore';
import { budgetService } from '../services/budgetService';
import { BudgetLine } from '../types';
<<<<<<< HEAD
import api from '../services/api';
import BudgetDetailDialog from '../components/budgets/BudgetDetailDialog';

const BudgetListPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { hasPermission, hasRole, isFinanceManager } = useAuthStore();
  // Only Finance Managers (Finance HOP/Lead or Admin) can create/edit/delete
  const canManage = isFinanceManager();
  const isFinanceOrApprover = hasRole('FINANCE_CLERK', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD', 'ADMIN');
  const isFinanceClerk = hasRole('FINANCE_CLERK');
=======

const BudgetListPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

  const [budgets, setBudgets] = useState<BudgetLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

<<<<<<< HEAD
  // Checkbox selection
  const [selectedBudgets, setSelectedBudgets] = useState<number[]>([]);

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [fiscalYear, setFiscalYear] = useState<number | ''>('');
  const [activeFilter, setActiveFilter] = useState<boolean | ''>('');
<<<<<<< HEAD
  const [deptFilter, setDeptFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Department & Project lists
  const [departments, setDepartments] = useState<{id: number; department_name: string}[]>([]);
  const [projects, setProjects] = useState<{id: number; project_name: string; project_code: string}[]>([]);
=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

  // Summary stats
  const [summary, setSummary] = useState({
    totalAllocated: 0,
    totalSpent: 0,
    totalBalance: 0
  });

<<<<<<< HEAD
  // Budget detail dialog
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Delete dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<BudgetLine | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [budgetToEdit, setBudgetToEdit] = useState<BudgetLine | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editBudgetForm, setEditBudgetForm] = useState({ budgetCode: '', budgetName: '', description: '' });

  // Management dialogs (Finance Clerk only)
  const [isTopUpDialogOpen, setIsTopUpDialogOpen] = useState(false);
  const [isDeductDialogOpen, setIsDeductDialogOpen] = useState(false);
  const [selectedBudgetForAction, setSelectedBudgetForAction] = useState<BudgetLine | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  // Generate fiscal year options
  const currentYear = new Date().getFullYear();
  const fiscalYears = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  useEffect(() => {
    fetchBudgets();
  }, [fiscalYear, activeFilter]);

<<<<<<< HEAD
  useEffect(() => {
    api.get('/departments').then(res => { if (res.data.success) setDepartments(res.data.data); }).catch(() => {});
    api.get('/projects').then(res => { if (res.data.success) setProjects(res.data.data); }).catch(() => {});
  }, []);

=======
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
  const fetchBudgets = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params: any = {};
      if (fiscalYear) params.fiscalYear = fiscalYear;
      if (activeFilter !== '') params.isActive = activeFilter;

      const response = await budgetService.getAll(params);

      if (response.success && response.data) {
<<<<<<< HEAD
        // Normalize string amounts to numbers
        const normalizedBudgets = normalizeBudgetData(response.data);
        setBudgets(normalizedBudgets);

        // Calculate summary with proper numeric values
        const allocated = normalizedBudgets.reduce((sum, b) => sum + (b.allocated_amount || 0), 0);
        const spent = normalizedBudgets.reduce((sum, b) => sum + (b.spent_amount || 0), 0);
        
=======
        setBudgets(response.data);

        // Calculate summary
        const allocated = response.data.reduce((sum, b) => sum + b.allocated_amount, 0);
        const spent = response.data.reduce((sum, b) => sum + b.spent_amount, 0);
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        setSummary({
          totalAllocated: allocated,
          totalSpent: spent,
          totalBalance: allocated - spent
        });
      } else {
        setError(response.message || 'Failed to fetch budgets');
      }
    } catch (err) {
      setError('An error occurred while fetching budgets');
    } finally {
      setIsLoading(false);
    }
  };

  const getUtilization = (budget: BudgetLine) => {
    if (budget.allocated_amount === 0) return 0;
    return (budget.spent_amount / budget.allocated_amount) * 100;
  };

  const getUtilizationColor = (utilization: number): 'success' | 'warning' | 'error' => {
    if (utilization < 70) return 'success';
    if (utilization < 90) return 'warning';
    return 'error';
  };

<<<<<<< HEAD
  const formatCurrency = (amount: number | string) => {
    // Convert string to number if needed
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    // Handle NaN
    if (isNaN(numAmount)) {
      return '$0.00';
    }
    
    return `$${numAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Helper function to convert budget amounts from strings to numbers
  const normalizeBudgetData = (budgets: BudgetLine[]): BudgetLine[] => {
    return budgets.map(budget => ({
      ...budget,
      allocated_amount: typeof budget.allocated_amount === 'string' ? parseFloat(budget.allocated_amount) : budget.allocated_amount,
      spent_amount: typeof budget.spent_amount === 'string' ? parseFloat(budget.spent_amount) : budget.spent_amount,
      balance: typeof budget.balance === 'string' ? parseFloat(budget.balance) : budget.balance,
      utilization_percentage: typeof budget.utilization_percentage === 'string' ? parseFloat(budget.utilization_percentage) : budget.utilization_percentage
    }));
  };

  // Management actions (Finance Clerk only)
  const handleTopUp = async () => {
    if (!selectedBudgetForAction || !actionAmount) return;
    try {
      setIsActionSubmitting(true);
      const response = await budgetService.topUp(
        selectedBudgetForAction.id,
        parseFloat(actionAmount),
        actionDescription || undefined
      );
      if (response.success) {
        toast.success(`Budget topped up successfully`);
        setIsTopUpDialogOpen(false);
        resetActionForm();
        fetchBudgets();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to top up budget');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleDeduct = async () => {
    if (!selectedBudgetForAction || !actionAmount) return;
    const amount = parseFloat(actionAmount);
    const balance = selectedBudgetForAction.allocated_amount - selectedBudgetForAction.spent_amount;
    if (amount > balance) {
      toast.error('Deduction amount cannot exceed available balance');
      return;
    }
    try {
      setIsActionSubmitting(true);
      const response = await budgetService.topUp(
        selectedBudgetForAction.id,
        -amount,
        actionDescription || 'Manual deduction'
      );
      if (response.success) {
        toast.success('Budget deducted successfully');
        setIsDeductDialogOpen(false);
        resetActionForm();
        fetchBudgets();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to deduct from budget');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleSuspend = async (budget: BudgetLine) => {
    if (!window.confirm(`Are you sure you want to ${budget.is_active ? 'suspend' : 'reactivate'} this budget line?`)) return;
    try {
      const response = await budgetService.update(budget.id, { isActive: !budget.is_active });
      if (response.success) {
        toast.success(`Budget line ${budget.is_active ? 'suspended' : 'reactivated'} successfully`);
        fetchBudgets();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update budget line');
    }
  };

  const handleOpenDelete = (budget: BudgetLine) => {
    setBudgetToDelete(budget);
    setIsDeleteDialogOpen(true);
  };

  const handleOpenEdit = (budget: BudgetLine) => {
    setBudgetToEdit(budget);
    setEditBudgetForm({
      budgetCode:  (budget as any).budget_code  ?? '',
      budgetName:  (budget as any).budget_name  ?? '',
      description: (budget as any).description  ?? '',
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEditBudget = async () => {
    if (!budgetToEdit) return;
    if (!editBudgetForm.budgetCode.trim()) { toast.error('Budget code is required'); return; }
    if (!editBudgetForm.budgetName.trim()) { toast.error('Budget name is required'); return; }
    setIsEditSaving(true);
    try {
      const response = await budgetService.update(budgetToEdit.id, {
        budgetCode:  editBudgetForm.budgetCode.trim(),
        budgetName:  editBudgetForm.budgetName.trim(),
        description: editBudgetForm.description.trim() || undefined,
      });
      if (response.success) {
        toast.success('Budget line updated successfully');
        setIsEditDialogOpen(false);
        setBudgetToEdit(null);
        fetchBudgets();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update budget line');
    } finally { setIsEditSaving(false); }
  };

  const handleConfirmDelete = async () => {
    if (!budgetToDelete) return;
    try {
      setIsDeleting(true);
      const response = await budgetService.delete(budgetToDelete.id);
      if (response.success) {
        toast.success('Budget line deleted successfully');
        setIsDeleteDialogOpen(false);
        setBudgetToDelete(null);
        fetchBudgets();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete budget line');
    } finally {
      setIsDeleting(false);
    }
  };

  const resetActionForm = () => {
    setSelectedBudgetForAction(null);
    setActionAmount('');
    setActionDescription('');
  };

  // Filter by search term + department + project (client-side)
  const filteredBudgets = budgets.filter(budget => {
    if (searchTerm && !budget.budget_code.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !(budget.description || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    // Budget lines with no department always appear regardless of dept filter
    const hasDept = (budget as any).department_id != null;
    if (deptFilter && hasDept && String((budget as any).department_id) !== deptFilter) return false;
    if (projectFilter && String((budget as any).project_id) !== projectFilter) return false;
    return true;
  });
=======
  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Filter by search term (client-side)
  const filteredBudgets = budgets.filter(budget =>
    budget.budget_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (budget.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

  // Paginate
  const paginatedBudgets = filteredBudgets.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
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
              <Typography variant="h5" fontWeight={700}>Budget Lines</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>Track allocations, utilization, and balances across all budget lines</Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Refresh">
              <IconButton sx={{ color: 'white' }} onClick={() => fetchBudgets()}><RefreshIcon /></IconButton>
            </Tooltip>
            {canManage && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/finance/budgets/manage')}
                sx={{ bgcolor: 'white', color: '#006064', '&:hover': { bgcolor: alpha('#ffffff', 0.9) } }}
              >
                Manage Budget Lines
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {isFinanceOrApprover && (
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      backgroundColor: 'primary.light'
                    }}
                  >
                    <BudgetIcon sx={{ color: 'primary.main' }} />
                  </Box>
                  <Box>
                    <Typography variant="h5" fontWeight="bold">
                      {formatCurrency(summary.totalAllocated)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Allocated
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}
        <Grid item xs={12} sm={isFinanceOrApprover ? 4 : 6}>
=======
      {/* Header */}
      <Typography variant="h5" sx={{ mb: 3 }}>
        Budget Lines
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: 'primary.light'
                  }}
                >
                  <BudgetIcon sx={{ color: 'primary.main' }} />
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight="bold">
                    {formatCurrency(summary.totalAllocated)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Allocated
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: 'warning.light'
                  }}
                >
                  <SpentIcon sx={{ color: 'warning.main' }} />
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight="bold">
                    {formatCurrency(summary.totalSpent)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Spent
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
<<<<<<< HEAD
        <Grid item xs={12} sm={isFinanceOrApprover ? 4 : 6}>
=======
        <Grid item xs={12} sm={4}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: 'success.light'
                  }}
                >
                  <BalanceIcon sx={{ color: 'success.main' }} />
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight="bold">
                    {formatCurrency(summary.totalBalance)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
<<<<<<< HEAD
                    Total Remaining
=======
                    Total Balance
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filters */}
<<<<<<< HEAD
      <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <FilterIcon fontSize="small" color="action" />
          <Typography variant="body2" fontWeight={600} color="text.secondary">Filters</Typography>
          {(searchTerm || deptFilter || projectFilter) && (
            <Button size="small" onClick={() => { setSearchTerm(''); setDeptFilter(''); setProjectFilter(''); setPage(0); }} sx={{ ml: 'auto' }}>
              Clear All
            </Button>
          )}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
=======
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          <TextField
            size="small"
            placeholder="Search by code or description..."
            value={searchTerm}
<<<<<<< HEAD
            onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 270, flex: 2 }}
          />
          <FormControl size="small" sx={{ minWidth: 150, flex: 1 }}>
            <InputLabel>Fiscal Year</InputLabel>
            <Select value={fiscalYear} label="Fiscal Year" onChange={(e) => { setFiscalYear(e.target.value as number | ''); setPage(0); }}>
              <MenuItem value="">All Years</MenuItem>
              {fiscalYears.map((year) => (<MenuItem key={year} value={year}>{year}</MenuItem>))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120, flex: 1 }}>
            <InputLabel>Status</InputLabel>
            <Select value={activeFilter} label="Status" onChange={(e) => { setActiveFilter(e.target.value as boolean | ''); setPage(0); }}>
=======
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
            sx={{ minWidth: 300 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Fiscal Year</InputLabel>
            <Select
              value={fiscalYear}
              label="Fiscal Year"
              onChange={(e) => {
                setFiscalYear(e.target.value as number | '');
                setPage(0);
              }}
            >
              <MenuItem value="">All Years</MenuItem>
              {fiscalYears.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={activeFilter}
              label="Status"
              onChange={(e) => {
                setActiveFilter(e.target.value as boolean | '');
                setPage(0);
              }}
            >
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              <MenuItem value="">All</MenuItem>
              <MenuItem value={true as any}>Active</MenuItem>
              <MenuItem value={false as any}>Inactive</MenuItem>
            </Select>
          </FormControl>
<<<<<<< HEAD
          <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
            <InputLabel>Department</InputLabel>
            <Select value={deptFilter} label="Department" onChange={(e) => { setDeptFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">All Departments</MenuItem>
              {departments.map(d => (<MenuItem key={d.id} value={String(d.id)}>{d.department_name}</MenuItem>))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
            <InputLabel>Project</InputLabel>
            <Select value={projectFilter} label="Project" onChange={(e) => { setProjectFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">All Projects</MenuItem>
              {projects.map(p => (<MenuItem key={p.id} value={String(p.id)}>{p.project_code} — {p.project_name}</MenuItem>))}
            </Select>
          </FormControl>
        </Stack>
        {selectedBudgets.length > 0 && (
          <Box mt={1.5} p={1} bgcolor={alpha(theme.palette.primary.main, 0.08)} borderRadius={1} display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" color="primary.main" fontWeight={600}>
              {selectedBudgets.length} budget line{selectedBudgets.length !== 1 ? 's' : ''} selected
            </Typography>
            <Button size="small" onClick={() => setSelectedBudgets([])}>Clear Selection</Button>
          </Box>
        )}
      </Paper>

      {/* Table */}
      <Paper elevation={2} sx={{ borderRadius: 2 }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 750 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#006064' }}>
                <TableCell padding="checkbox" sx={{ bgcolor: '#006064' }}>
                  <Checkbox
                    checked={paginatedBudgets.length > 0 && selectedBudgets.length === paginatedBudgets.length}
                    indeterminate={selectedBudgets.length > 0 && selectedBudgets.length < paginatedBudgets.length}
                    onChange={() => setSelectedBudgets(selectedBudgets.length === paginatedBudgets.length ? [] : paginatedBudgets.map(b => b.id))}
                    sx={{ color: 'white', '&.Mui-checked': { color: 'white' }, '&.MuiCheckbox-indeterminate': { color: 'white' } }}
                  />
                </TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1, fontSize: '0.74rem' }}>Code</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1, fontSize: '0.74rem' }}>Description</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1, fontSize: '0.74rem' }}>Year</TableCell>
                {isFinanceOrApprover && <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1, fontSize: '0.74rem' }} align="right">Allocated</TableCell>}
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1, fontSize: '0.74rem' }} align="right">Spent</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1, fontSize: '0.74rem' }} align="right">Remaining</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1, fontSize: '0.74rem' }}>Usage</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1, fontSize: '0.74rem' }}>Status</TableCell>
                {canManage && <TableCell sx={{ color: 'white', fontWeight: 700, py: 1, px: 1, fontSize: '0.74rem' }} align="center">Actions</TableCell>}
=======
        </Box>
      </Paper>

      {/* Table */}
      <Paper elevation={2}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Budget Code</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Fiscal Year</TableCell>
                <TableCell align="right">Allocated</TableCell>
                <TableCell align="right">Spent</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Utilization</TableCell>
                <TableCell>Status</TableCell>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
<<<<<<< HEAD
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
=======
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : paginatedBudgets.length === 0 ? (
                <TableRow>
<<<<<<< HEAD
                  <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                    <BudgetIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography color="text.secondary">No budget lines found</Typography>
=======
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No budget lines found
                    </Typography>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                  </TableCell>
                </TableRow>
              ) : (
                paginatedBudgets.map((budget) => {
                  const utilization = getUtilization(budget);
<<<<<<< HEAD
                  const isSelected = selectedBudgets.includes(budget.id);
                  return (
                    <TableRow
                      key={budget.id}
                      hover
                      selected={isSelected}
                      onClick={() => {
                        if (isFinanceOrApprover) {
                          setSelectedBudgetId(budget.id);
                          setIsDetailDialogOpen(true);
                        }
                      }}
                      sx={{
                        cursor: isFinanceOrApprover ? 'pointer' : 'default',
                        '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
                        borderLeft: `3px solid ${utilization >= 90 ? theme.palette.error.main : utilization >= 70 ? theme.palette.warning.main : theme.palette.success.main}`
                      }}
                    >
                      <TableCell padding="checkbox" sx={{ py: 0.25 }} onClick={e => e.stopPropagation()}>
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onChange={() => setSelectedBudgets(prev => prev.includes(budget.id) ? prev.filter(x => x !== budget.id) : [...prev, budget.id])}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.5, px: 1 }}>
                        <Box display="flex" alignItems="center" gap={0.75}>
                          <Box sx={{
                            px: 1, py: 0.25, borderRadius: 1,
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`
                          }}>
                            <Typography variant="caption" fontWeight={700} color="primary.dark" sx={{ letterSpacing: 0.3 }}>
                              {budget.budget_code}
                            </Typography>
                          </Box>
                          {isFinanceOrApprover && (
                            <ViewIcon fontSize="small" color="action" sx={{ opacity: 0.4, fontSize: 14 }} />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ py: 0.5, px: 1 }}>
                        <Typography variant="caption" noWrap sx={{ maxWidth: 190, display: 'block' }}>
                          {budget.budget_name || budget.description}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.5, px: 1 }}>
                        <Typography variant="caption" color="text.secondary">{budget.fiscal_year}</Typography>
                      </TableCell>
                      {isFinanceOrApprover && (
                        <TableCell align="right" sx={{ py: 0.5, px: 1 }}>
                          <Typography variant="caption" fontWeight={600}>{formatCurrency(budget.allocated_amount)}</Typography>
                        </TableCell>
                      )}
                      <TableCell align="right" sx={{ py: 0.5, px: 1 }}>
                        <Typography variant="caption">{formatCurrency(budget.spent_amount)}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.5, px: 1 }}>
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          color={budget.balance < 0 ? 'error.main' : 'text.primary'}
=======
                  return (
                    <TableRow key={budget.id} hover>
                      <TableCell>
                        <Typography fontWeight="medium">
                          {budget.budget_code}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography noWrap sx={{ maxWidth: 200 }}>
                          {budget.description}
                        </Typography>
                      </TableCell>
                      <TableCell>{budget.fiscal_year}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(budget.allocated_amount)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(budget.spent_amount)}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          fontWeight="medium"
                          color={budget.balance < 0 ? 'error.main' : 'inherit'}
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                        >
                          {formatCurrency(budget.balance)}
                        </Typography>
                      </TableCell>
<<<<<<< HEAD
                      <TableCell sx={{ py: 0.5, px: 1 }}>
                        <Box display="flex" alignItems="center" gap={0.75}>
                          <Box sx={{ width: 80 }}>
=======
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 100 }}>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(utilization, 100)}
                              color={getUtilizationColor(utilization)}
<<<<<<< HEAD
                              sx={{ height: 4, borderRadius: 2 }}
                            />
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, fontSize: '0.68rem' }}>
=======
                              sx={{ height: 8, borderRadius: 4 }}
                            />
                          </Box>
                          <Typography variant="body2" color="text.secondary">
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                            {utilization.toFixed(1)}%
                          </Typography>
                        </Box>
                      </TableCell>
<<<<<<< HEAD
                      <TableCell sx={{ py: 0.5, px: 1 }}>
                        <Chip
                          label={budget.is_active ? 'Active' : 'Suspended'}
                          size="small"
                          color={budget.is_active ? 'success' : 'default'}
                          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
                        />
                      </TableCell>
                      {canManage && (
                        <TableCell align="center" sx={{ py: 0.25 }} onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="Edit Budget Line">
                            <IconButton size="small" color="info" sx={{ p: 0.5 }}
                              onClick={() => handleOpenEdit(budget)}>
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Top Up">
                            <IconButton size="small" color="primary" sx={{ p: 0.5 }}
                              onClick={() => { setSelectedBudgetForAction(budget); setIsTopUpDialogOpen(true); }}>
                              <TopUpIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Deduct">
                            <IconButton size="small" color="warning" sx={{ p: 0.5 }}
                              onClick={() => { setSelectedBudgetForAction(budget); setIsDeductDialogOpen(true); }}>
                              <DeductIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={budget.is_active ? 'Suspend' : 'Reactivate'}>
                            <IconButton size="small" color={budget.is_active ? 'error' : 'success'} sx={{ p: 0.5 }}
                              onClick={() => handleSuspend(budget)}>
                              <SuspendIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Budget Line">
                            <IconButton size="small" color="error" sx={{ p: 0.5 }}
                              onClick={() => handleOpenDelete(budget)}>
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
=======
                      <TableCell>
                        <Chip
                          label={budget.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          color={budget.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
<<<<<<< HEAD
        <Divider />
        <Box display="flex" alignItems="center" justifyContent="space-between" px={2} py={0.5}>
          <Typography variant="caption" color="text.secondary">
            {selectedBudgets.length > 0
              ? `${selectedBudgets.length} of ${filteredBudgets.length} selected`
              : `${filteredBudgets.length} budget line${filteredBudgets.length !== 1 ? 's' : ''}`}
          </Typography>
          <TablePagination
            component="div"
            count={filteredBudgets.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{ border: 0 }}
          />
        </Box>
      </Paper>

      {/* Budget Detail Dialog */}
      <BudgetDetailDialog
        open={isDetailDialogOpen}
        budgetLineId={selectedBudgetId}
        onClose={() => {
          setIsDetailDialogOpen(false);
          setSelectedBudgetId(null);
        }}
      />

      {/* Top Up Dialog */}
      <Dialog open={isTopUpDialogOpen} onClose={() => { setIsTopUpDialogOpen(false); resetActionForm(); }} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Top Up Budget Line</DialogTitle>
        <DialogContent>
          {selectedBudgetForAction && (
            <Box sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ mb: 2 }}>
                <strong>{selectedBudgetForAction.budget_code}</strong> — {selectedBudgetForAction.budget_name || selectedBudgetForAction.description}
                <br />Current Balance: {formatCurrency(selectedBudgetForAction.balance)}
              </Alert>
              <TextField
                label="Top Up Amount"
                type="number"
                fullWidth
                value={actionAmount}
                onChange={(e) => setActionAmount(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                sx={{ mb: 2 }}
              />
              <TextField
                label="Description / Reason"
                fullWidth
                multiline
                rows={2}
                value={actionDescription}
                onChange={(e) => setActionDescription(e.target.value)}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setIsTopUpDialogOpen(false); resetActionForm(); }}>Cancel</Button>
          <Button variant="contained" onClick={handleTopUp} disabled={isActionSubmitting || !actionAmount}>
            {isActionSubmitting ? <CircularProgress size={20} /> : 'Top Up'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deduct Dialog */}
      <Dialog open={isDeductDialogOpen} onClose={() => { setIsDeductDialogOpen(false); resetActionForm(); }} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Deduct from Budget Line</DialogTitle>
        <DialogContent>
          {selectedBudgetForAction && (
            <Box sx={{ mt: 1 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>{selectedBudgetForAction.budget_code}</strong> — {selectedBudgetForAction.budget_name || selectedBudgetForAction.description}
                <br />Current Balance: {formatCurrency(selectedBudgetForAction.balance)}
              </Alert>
              <TextField
                label="Deduction Amount"
                type="number"
                fullWidth
                value={actionAmount}
                onChange={(e) => setActionAmount(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                sx={{ mb: 2 }}
              />
              <TextField
                label="Reason for Deduction"
                fullWidth
                multiline
                rows={2}
                value={actionDescription}
                onChange={(e) => setActionDescription(e.target.value)}
                required
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setIsDeductDialogOpen(false); resetActionForm(); }}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleDeduct} disabled={isActionSubmitting || !actionAmount || !actionDescription}>
            {isActionSubmitting ? <CircularProgress size={20} /> : 'Deduct'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Delete Confirm Dialog */}
      <Dialog open={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Budget Line</DialogTitle>
        <DialogContent>
          {budgetToDelete && (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Are you sure you want to permanently delete <strong>{budgetToDelete.budget_code} — {budgetToDelete.budget_name}</strong>? This cannot be undone.
              </Alert>
              {Number(budgetToDelete.spent_amount) > 0 && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  This line has <strong>${Number(budgetToDelete.spent_amount).toLocaleString()}</strong> spent. All linked transaction records will also be deleted.
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDelete} disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon />}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Budget Line Dialog */}
      <Dialog open={isEditDialogOpen} onClose={() => !isEditSaving && setIsEditDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Edit Budget Line — {budgetToEdit?.budget_code}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={5}>
              <TextField
                label="Budget Code" fullWidth required
                value={editBudgetForm.budgetCode}
                onChange={e => setEditBudgetForm(f => ({ ...f, budgetCode: e.target.value }))}
                disabled={isEditSaving}
              />
            </Grid>
            <Grid item xs={12} sm={7}>
              <TextField
                label="Budget Name" fullWidth required
                value={editBudgetForm.budgetName}
                onChange={e => setEditBudgetForm(f => ({ ...f, budgetName: e.target.value }))}
                disabled={isEditSaving}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description" fullWidth multiline rows={3}
                value={editBudgetForm.description}
                onChange={e => setEditBudgetForm(f => ({ ...f, description: e.target.value }))}
                disabled={isEditSaving}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsEditDialogOpen(false)} disabled={isEditSaving}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEditBudget}
            disabled={isEditSaving} startIcon={isEditSaving ? <CircularProgress size={16} color="inherit" /> : <EditIcon />}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
=======
        <TablePagination
          component="div"
          count={filteredBudgets.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </Paper>
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    </Box>
  );
};

export default BudgetListPage;
