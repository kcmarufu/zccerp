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
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  TrendingUp as TopUpIcon,
  History as HistoryIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

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
  });

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTopUpDialogOpen, setIsTopUpDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<BudgetLine | null>(null);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [newBudget, setNewBudget] = useState({
    budgetCode: '',
    budgetName: '',
    departmentId: '',
    fiscalYear: new Date().getFullYear(),
    allocatedAmount: '',
    description: ''
  });
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpDescription, setTopUpDescription] = useState('');

  useEffect(() => {
    fetchDepartments();
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

  const fetchBudgetLines = async () => {
    try {
      setIsLoading(true);
      const response = await budgetService.getAll({
        departmentId: filters.departmentId ? parseInt(filters.departmentId) : undefined,
        fiscalYear: filters.fiscalYear
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

      if (response.success) {
        toast.success('Budget line created successfully');
        setIsCreateDialogOpen(false);
        setNewBudget({
          budgetCode: '',
          budgetName: '',
          departmentId: '',
          fiscalYear: new Date().getFullYear(),
          allocatedAmount: '',
          description: ''
        });
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

  // Calculate totals - ensure numeric conversion for values that may come as strings from MySQL
  const totals = budgetLines.reduce(
    (acc, bl) => ({
      allocated: acc.allocated + (Number(bl.allocated_amount) || 0),
      spent: acc.spent + (Number(bl.spent_amount) || 0),
      balance: acc.balance + (Number(bl.balance) || 0)
    }),
    { allocated: 0, spent: 0, balance: 0 }
  );

  return (
    <Box>
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
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField
              select
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
          <Grid item xs={12} sm={4}>
            <TextField
              type="number"
              label="Fiscal Year"
              size="small"
              fullWidth
              value={filters.fiscalYear}
              onChange={(e) => setFilters({ ...filters, fiscalYear: parseInt(e.target.value) })}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Budget Lines Table */}
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
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
              </TableRow>
            </TableHead>
            <TableBody>
              {budgetLines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No budget lines found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                budgetLines.map((budget) => (
                  <TableRow key={budget.id} hover>
                    <TableCell>
                      <Typography fontWeight="medium">{budget.budget_code}</Typography>
                    </TableCell>
                    <TableCell>{budget.budget_name}</TableCell>
                    <TableCell>
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
                        color={Number(budget.balance || 0) < 1000 ? 'error' : 'success.main'}
                      >
                        ${Number(budget.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                    <TableCell align="center">
                      <Tooltip title="Top Up">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleOpenTopUp(budget)}
                        >
                          <TopUpIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="View History">
                        <IconButton
                          size="small"
                          onClick={() => handleViewHistory(budget)}
                        >
                          <HistoryIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Budget Line">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleOpenDelete(budget)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

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
            <Grid item xs={12} sm={6}>
              <TextField
                label="Budget Code"
                fullWidth
                value={newBudget.budgetCode}
                onChange={(e) => setNewBudget({ ...newBudget, budgetCode: e.target.value })}
                placeholder="e.g., IT-2026-HW"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Fiscal Year"
                type="number"
                fullWidth
                value={newBudget.fiscalYear}
                onChange={(e) => setNewBudget({ ...newBudget, fiscalYear: parseInt(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Budget Name"
                fullWidth
                value={newBudget.budgetName}
                onChange={(e) => setNewBudget({ ...newBudget, budgetName: e.target.value })}
                placeholder="e.g., IT Hardware Budget"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Department"
                fullWidth
                value={newBudget.departmentId}
                onChange={(e) => setNewBudget({ ...newBudget, departmentId: e.target.value })}
              >
                {departments.map(dept => (
                  <MenuItem key={dept.id} value={dept.id}>
                    {dept.department_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Allocated Amount"
                type="number"
                fullWidth
                value={newBudget.allocatedAmount}
                onChange={(e) => setNewBudget({ ...newBudget, allocatedAmount: e.target.value })}
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
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateBudget}
            disabled={isSubmitting || !newBudget.budgetCode || !newBudget.budgetName || !newBudget.departmentId || !newBudget.allocatedAmount}
          >
            {isSubmitting ? <CircularProgress size={24} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Top Up Dialog */}
      <Dialog 
        open={isTopUpDialogOpen} 
        onClose={() => setIsTopUpDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Top Up Budget: {selectedBudget?.budget_code}</DialogTitle>
        <DialogContent>
          {selectedBudget && (
            <Box sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ mb: 2 }}>
                Current Balance: <strong>${Number(selectedBudget.balance || 0).toLocaleString()}</strong>
              </Alert>
              <TextField
                label="Top Up Amount"
                type="number"
                fullWidth
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                InputProps={{ startAdornment: '$' }}
                sx={{ mb: 2 }}
              />
              <TextField
                label="Description (Optional)"
                fullWidth
                multiline
                rows={2}
                value={topUpDescription}
                onChange={(e) => setTopUpDescription(e.target.value)}
                placeholder="e.g., Q2 budget allocation"
              />
              {topUpAmount && (
                <Alert severity="success" sx={{ mt: 2 }}>
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
            color="primary"
            onClick={handleTopUp}
            disabled={isSubmitting || !topUpAmount || parseFloat(topUpAmount) <= 0}
          >
            {isSubmitting ? <CircularProgress size={24} /> : 'Top Up'}
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
                <Alert severity="error" sx={{ mt: 2 }}>
                  This budget line has been used (${Number(selectedBudget.spent_amount).toLocaleString()} spent).
                  It cannot be deleted. Consider deactivating it instead.
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
            disabled={isSubmitting || Boolean(selectedBudget && Number(selectedBudget.spent_amount) > 0)}
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
