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
  Grid,
  Tooltip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Search as SearchIcon,
  AccountBalance as BudgetIcon,
  TrendingUp as SpentIcon,
  TrendingDown as BalanceIcon,
  OpenInNew as ViewIcon,
  Add as AddIcon,
  TrendingUp as TopUpIcon,
  RemoveCircleOutline as DeductIcon,
  PauseCircleOutline as SuspendIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { useAuthStore } from '../store/authStore';
import { budgetService } from '../services/budgetService';
import { BudgetLine } from '../types';
import BudgetDetailDialog from '../components/budgets/BudgetDetailDialog';

const BudgetListPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuthStore();
  const isFinanceOrApprover = hasRole('FINANCE_CLERK', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD');
  const isFinanceClerk = hasRole('FINANCE_CLERK');

  const [budgets, setBudgets] = useState<BudgetLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [fiscalYear, setFiscalYear] = useState<number | ''>('');
  const [activeFilter, setActiveFilter] = useState<boolean | ''>('');

  // Summary stats
  const [summary, setSummary] = useState({
    totalAllocated: 0,
    totalSpent: 0,
    totalBalance: 0
  });

  // Budget detail dialog
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Management dialogs (Finance Clerk only)
  const [isTopUpDialogOpen, setIsTopUpDialogOpen] = useState(false);
  const [isDeductDialogOpen, setIsDeductDialogOpen] = useState(false);
  const [selectedBudgetForAction, setSelectedBudgetForAction] = useState<BudgetLine | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  // Generate fiscal year options
  const currentYear = new Date().getFullYear();
  const fiscalYears = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  useEffect(() => {
    fetchBudgets();
  }, [fiscalYear, activeFilter]);

  const fetchBudgets = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params: any = {};
      if (fiscalYear) params.fiscalYear = fiscalYear;
      if (activeFilter !== '') params.isActive = activeFilter;

      const response = await budgetService.getAll(params);

      if (response.success && response.data) {
        // Normalize string amounts to numbers
        const normalizedBudgets = normalizeBudgetData(response.data);
        setBudgets(normalizedBudgets);

        // Calculate summary with proper numeric values
        const allocated = normalizedBudgets.reduce((sum, b) => sum + (b.allocated_amount || 0), 0);
        const spent = normalizedBudgets.reduce((sum, b) => sum + (b.spent_amount || 0), 0);
        
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

  const resetActionForm = () => {
    setSelectedBudgetForAction(null);
    setActionAmount('');
    setActionDescription('');
  };

  // Filter by search term (client-side)
  const filteredBudgets = budgets.filter(budget =>
    budget.budget_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (budget.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Paginate
  const paginatedBudgets = filteredBudgets.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">
          Budget Lines
        </Typography>
        {isFinanceClerk && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/finance/budgets/manage')}
          >
            Manage Budget Lines
          </Button>
        )}
      </Box>

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
        <Grid item xs={12} sm={isFinanceOrApprover ? 4 : 6}>
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
                    Total Remaining
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
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
          <TextField
            size="small"
            placeholder="Search by code or description..."
            value={searchTerm}
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
              <MenuItem value="">All</MenuItem>
              <MenuItem value={true as any}>Active</MenuItem>
              <MenuItem value={false as any}>Inactive</MenuItem>
            </Select>
          </FormControl>
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
                {isFinanceOrApprover && <TableCell align="right">Allocated</TableCell>}
                <TableCell align="right">Spent</TableCell>
                <TableCell align="right">Remaining</TableCell>
                <TableCell>Utilization</TableCell>
                <TableCell>Status</TableCell>
                {isFinanceClerk && <TableCell align="center">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : paginatedBudgets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No budget lines found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedBudgets.map((budget) => {
                  const utilization = getUtilization(budget);
                  return (
                    <TableRow 
                      key={budget.id} 
                      hover
                      onClick={() => {
                        if (isFinanceOrApprover) {
                          setSelectedBudgetId(budget.id);
                          setIsDetailDialogOpen(true);
                        }
                      }}
                      sx={{ cursor: isFinanceOrApprover ? 'pointer' : 'default' }}
                    >
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography fontWeight="medium">
                            {budget.budget_code}
                          </Typography>
                          {isFinanceOrApprover && (
                            <Tooltip title="Click to view details">
                              <ViewIcon fontSize="small" color="action" sx={{ opacity: 0.5 }} />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography noWrap sx={{ maxWidth: 200 }}>
                          {budget.budget_name || budget.description}
                        </Typography>
                      </TableCell>
                      <TableCell>{budget.fiscal_year}</TableCell>
                      {isFinanceOrApprover && (
                        <TableCell align="right">
                          {formatCurrency(budget.allocated_amount)}
                        </TableCell>
                      )}
                      <TableCell align="right">
                        {formatCurrency(budget.spent_amount)}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          fontWeight="medium"
                          color={budget.balance < 0 ? 'error.main' : 'inherit'}
                        >
                          {formatCurrency(budget.balance)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 100 }}>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(utilization, 100)}
                              color={getUtilizationColor(utilization)}
                              sx={{ height: 8, borderRadius: 4 }}
                            />
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {utilization.toFixed(1)}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={budget.is_active ? 'Active' : 'Suspended'}
                          size="small"
                          color={budget.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
                      {isFinanceClerk && (
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="Top Up">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => {
                                setSelectedBudgetForAction(budget);
                                setIsTopUpDialogOpen(true);
                              }}
                            >
                              <TopUpIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Deduct">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => {
                                setSelectedBudgetForAction(budget);
                                setIsDeductDialogOpen(true);
                              }}
                            >
                              <DeductIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={budget.is_active ? 'Suspend' : 'Reactivate'}>
                            <IconButton
                              size="small"
                              color={budget.is_active ? 'error' : 'success'}
                              onClick={() => handleSuspend(budget)}
                            >
                              <SuspendIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
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
      <Dialog open={isTopUpDialogOpen} onClose={() => { setIsTopUpDialogOpen(false); resetActionForm(); }} maxWidth="sm" fullWidth>
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
      <Dialog open={isDeductDialogOpen} onClose={() => { setIsDeductDialogOpen(false); resetActionForm(); }} maxWidth="sm" fullWidth>
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
    </Box>
  );
};

export default BudgetListPage;
