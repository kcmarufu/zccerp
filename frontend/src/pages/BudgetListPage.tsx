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
  Grid
} from '@mui/material';
import {
  Search as SearchIcon,
  AccountBalance as BudgetIcon,
  TrendingUp as SpentIcon,
  TrendingDown as BalanceIcon
} from '@mui/icons-material';

import { useAuthStore } from '../store/authStore';
import { budgetService } from '../services/budgetService';
import { BudgetLine } from '../types';

const BudgetListPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

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
        setBudgets(response.data);

        // Calculate summary
        const allocated = response.data.reduce((sum, b) => sum + b.allocated_amount, 0);
        const spent = response.data.reduce((sum, b) => sum + b.spent_amount, 0);
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

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        <Grid item xs={12} sm={4}>
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
                    Total Balance
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
                <TableCell align="right">Allocated</TableCell>
                <TableCell align="right">Spent</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Utilization</TableCell>
                <TableCell>Status</TableCell>
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
                          label={budget.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          color={budget.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
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
    </Box>
  );
};

export default BudgetListPage;
