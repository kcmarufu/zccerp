/**
 * Budget Detail Dialog Component
 * Shows detailed budget line information, donor info, transactions, and related requests
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Divider,
  IconButton,
  Tooltip,
  Alert
} from '@mui/material';
import {
  Close as CloseIcon,
  TrendingUp as TopUpIcon,
  Receipt as RequestIcon,
  AccountBalance as DonorIcon,
  History as HistoryIcon,
  OpenInNew as OpenIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import { budgetService } from '../../services/budgetService';
import { BudgetLine, BudgetTransaction, Request } from '../../types';

interface BudgetDetailDialogProps {
  open: boolean;
  budgetLineId: number | null;
  onClose: () => void;
  onTopUp?: (budget: BudgetLine) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

interface BudgetDetails extends BudgetLine {
  donor_id: number;
  donor_name: string;
  donor_code: string;
  donor_type: string;
  contact_person?: string;
  donor_email?: string;
  currency_code: string;
  donor_fiscal_year: number;
  donor_total_committed: number;
  donor_total_allocated: number;
  donor_total_spent: number;
  created_by_first?: string;
  created_by_last?: string;
  transactions: BudgetTransaction[];
  requestSummary: Array<{
    status: string;
    count: number;
    total_amount: number;
  }>;
}

interface BudgetRequest extends Request {
  amount_from_budget: number;
}

const BudgetDetailDialog: React.FC<BudgetDetailDialogProps> = ({
  open,
  budgetLineId,
  onClose,
  onTopUp
}) => {
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [budgetDetails, setBudgetDetails] = useState<BudgetDetails | null>(null);
  const [requests, setRequests] = useState<BudgetRequest[]>([]);
  const [requestSummary, setRequestSummary] = useState<{
    total_requests: number;
    total_approved_amount: number;
    total_pending_amount: number;
  } | null>(null);

  useEffect(() => {
    if (open && budgetLineId) {
      fetchBudgetDetails();
      fetchRequests();
    }
  }, [open, budgetLineId]);

  const fetchBudgetDetails = async () => {
    if (!budgetLineId) return;
    
    try {
      setIsLoading(true);
      const response = await budgetService.getDetails(budgetLineId);
      if (response.success && response.data) {
        setBudgetDetails(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch budget details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRequests = async () => {
    if (!budgetLineId) return;
    
    try {
      const response = await budgetService.getRequests(budgetLineId);
      if (response.success && response.data) {
        setRequests(response.data.requests || []);
        setRequestSummary(response.data.summary);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    }
  };

  const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'info' => {
    switch (status) {
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'error';
      case 'DRAFT': return 'default';
      case 'PENDING_LEAD_APPROVAL':
      case 'PENDING_HOP_APPROVAL':
      case 'PENDING_FINANCE_APPROVAL':
        return 'warning';
      default: return 'default';
    }
  };

  const formatCurrency = (amount: number | string | null | undefined) => {
    const num = Number(amount) || 0;
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getUtilizationColor = (percentage: number): 'success' | 'warning' | 'error' => {
    if (percentage >= 90) return 'error';
    if (percentage >= 70) return 'warning';
    return 'success';
  };

  const handleViewRequest = (requestId: number) => {
    navigate(`/finance/requests/${requestId}`);
    onClose();
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { minHeight: '70vh' } }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6">
              Budget Line Details
            </Typography>
            {budgetDetails && (
              <Typography variant="body2" color="text.secondary">
                {budgetDetails.budget_code} - {budgetDetails.budget_name}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {isLoading ? (
          <Box display="flex" justifyContent="center" alignItems="center" py={8}>
            <CircularProgress />
          </Box>
        ) : budgetDetails ? (
          <Box>
            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" variant="body2" gutterBottom>
                      Allocated
                    </Typography>
                    <Typography variant="h5" color="primary">
                      {formatCurrency(budgetDetails.allocated_amount)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" variant="body2" gutterBottom>
                      Spent
                    </Typography>
                    <Typography variant="h5" color="error">
                      {formatCurrency(budgetDetails.spent_amount)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" variant="body2" gutterBottom>
                      Balance
                    </Typography>
                    <Typography variant="h5" color="success.main">
                      {formatCurrency(Number(budgetDetails.allocated_amount) - Number(budgetDetails.spent_amount))}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" variant="body2" gutterBottom>
                      Utilization
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography 
                        variant="h5" 
                        color={`${getUtilizationColor(Number(budgetDetails.utilization_percentage) || 0)}.main`}
                      >
                        {(Number(budgetDetails.utilization_percentage) || 0).toFixed(1)}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(Number(budgetDetails.utilization_percentage) || 0, 100)}
                      color={getUtilizationColor(Number(budgetDetails.utilization_percentage) || 0)}
                      sx={{ mt: 1, height: 6, borderRadius: 3 }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                <Tab icon={<DonorIcon />} label="Details" iconPosition="start" />
                <Tab icon={<RequestIcon />} label={`Requests (${requests.length})`} iconPosition="start" />
                <Tab icon={<HistoryIcon />} label="Transactions" iconPosition="start" />
              </Tabs>
            </Box>

            {/* Details Tab */}
            <TabPanel value={tabValue} index={0}>
              <Grid container spacing={3}>
                {/* Budget Info */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Budget Information
                  </Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">Budget Code</Typography>
                          <Typography fontWeight="medium">{budgetDetails.budget_code}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">Fiscal Year</Typography>
                          <Typography>{budgetDetails.fiscal_year}</Typography>
                        </Grid>
                        <Grid item xs={12}>
                          <Typography variant="body2" color="text.secondary">Budget Name</Typography>
                          <Typography>{budgetDetails.budget_name}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">Department</Typography>
                          <Chip label={budgetDetails.department_code} size="small" />
                          <Typography variant="body2">{budgetDetails.department_name}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">Status</Typography>
                          <Chip 
                            label={budgetDetails.is_active ? 'Active' : 'Inactive'} 
                            size="small"
                            color={budgetDetails.is_active ? 'success' : 'default'}
                          />
                        </Grid>
                        {budgetDetails.description && (
                          <Grid item xs={12}>
                            <Typography variant="body2" color="text.secondary">Description</Typography>
                            <Typography>{budgetDetails.description}</Typography>
                          </Grid>
                        )}
                        <Grid item xs={12}>
                          <Typography variant="body2" color="text.secondary">Created</Typography>
                          <Typography>
                            {format(new Date(budgetDetails.created_at), 'MMM d, yyyy')}
                            {budgetDetails.created_by_first && ` by ${budgetDetails.created_by_first} ${budgetDetails.created_by_last}`}
                          </Typography>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Donor Info */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Donor Information
                  </Typography>
                  <Card variant="outlined">
                    <CardContent>
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">Donor Code</Typography>
                          <Typography fontWeight="medium">{budgetDetails.donor_code}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">Type</Typography>
                          <Chip label={budgetDetails.donor_type} size="small" variant="outlined" />
                        </Grid>
                        <Grid item xs={12}>
                          <Typography variant="body2" color="text.secondary">Donor Name</Typography>
                          <Typography>{budgetDetails.donor_name}</Typography>
                        </Grid>
                        {budgetDetails.contact_person && (
                          <Grid item xs={6}>
                            <Typography variant="body2" color="text.secondary">Contact Person</Typography>
                            <Typography>{budgetDetails.contact_person}</Typography>
                          </Grid>
                        )}
                        {budgetDetails.donor_email && (
                          <Grid item xs={6}>
                            <Typography variant="body2" color="text.secondary">Email</Typography>
                            <Typography>{budgetDetails.donor_email}</Typography>
                          </Grid>
                        )}
                        <Grid item xs={12}>
                          <Divider sx={{ my: 1 }} />
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Donor Total Budget ({budgetDetails.currency_code})
                          </Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="body2" color="text.secondary">Committed</Typography>
                          <Typography fontWeight="medium">
                            {formatCurrency(budgetDetails.donor_total_committed)}
                          </Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="body2" color="text.secondary">Allocated</Typography>
                          <Typography>{formatCurrency(budgetDetails.donor_total_allocated)}</Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="body2" color="text.secondary">Spent</Typography>
                          <Typography color="error">{formatCurrency(budgetDetails.donor_total_spent)}</Typography>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Request Summary */}
                {budgetDetails.requestSummary && budgetDetails.requestSummary.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      Request Status Summary
                    </Typography>
                    <Card variant="outlined">
                      <CardContent>
                        <Grid container spacing={2}>
                          {budgetDetails.requestSummary.map((item) => (
                            <Grid item xs={6} sm={3} key={item.status}>
                              <Box textAlign="center" p={1}>
                                <Chip 
                                  label={item.status.replace(/_/g, ' ')} 
                                  size="small" 
                                  color={getStatusColor(item.status)}
                                  sx={{ mb: 1 }}
                                />
                                <Typography variant="h6">{item.count}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {formatCurrency(item.total_amount)}
                                </Typography>
                              </Box>
                            </Grid>
                          ))}
                        </Grid>
                      </CardContent>
                    </Card>
                  </Grid>
                )}
              </Grid>
            </TabPanel>

            {/* Requests Tab */}
            <TabPanel value={tabValue} index={1}>
              {requestSummary && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <strong>{requestSummary.total_requests}</strong> total requests | 
                  <strong> {formatCurrency(requestSummary.total_approved_amount)}</strong> approved | 
                  <strong> {formatCurrency(requestSummary.total_pending_amount)}</strong> pending
                </Alert>
              )}
              
              {requests.length === 0 ? (
                <Box textAlign="center" py={4}>
                  <Typography color="text.secondary">No requests found for this budget line</Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Request Code</TableCell>
                        <TableCell>Requester</TableCell>
                        <TableCell>Department</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell align="center">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {requests.map((request) => (
                        <TableRow key={request.id} hover>
                          <TableCell>
                            <Typography fontWeight="medium">{request.request_code}</Typography>
                          </TableCell>
                          <TableCell>
                            {request.requester_first_name} {request.requester_last_name}
                          </TableCell>
                          <TableCell>
                            <Chip label={request.department_code} size="small" variant="outlined" />
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={request.status.replace(/_/g, ' ')} 
                              size="small" 
                              color={getStatusColor(request.status)}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {formatCurrency(request.amount_from_budget)}
                          </TableCell>
                          <TableCell>
                            {format(new Date(request.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="View Request">
                              <IconButton size="small" onClick={() => handleViewRequest(request.id)}>
                                <OpenIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </TabPanel>

            {/* Transactions Tab */}
            <TabPanel value={tabValue} index={2}>
              {budgetDetails.transactions.length === 0 ? (
                <Box textAlign="center" py={4}>
                  <Typography color="text.secondary">No transactions found</Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell align="right">Balance Before</TableCell>
                        <TableCell align="right">Balance After</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>By</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {budgetDetails.transactions.map((tx) => (
                        <TableRow key={tx.id} hover>
                          <TableCell>
                            {format(new Date(tx.created_at), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={tx.transaction_type} 
                              size="small"
                              color={tx.transaction_type === 'DEDUCTION' ? 'error' : 'success'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography 
                              color={tx.transaction_type === 'DEDUCTION' ? 'error' : 'success.main'}
                              fontWeight="medium"
                            >
                              {tx.transaction_type === 'DEDUCTION' ? '-' : '+'}
                              {formatCurrency(tx.amount)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{formatCurrency(tx.balance_before)}</TableCell>
                          <TableCell align="right">{formatCurrency(tx.balance_after)}</TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                              {tx.description}
                            </Typography>
                          </TableCell>
                          <TableCell>{tx.first_name} {tx.last_name}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </TabPanel>
          </Box>
        ) : (
          <Box textAlign="center" py={4}>
            <Typography color="error">Failed to load budget details</Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {budgetDetails && onTopUp && (
          <Button
            startIcon={<TopUpIcon />}
            color="primary"
            onClick={() => {
              onTopUp(budgetDetails);
              onClose();
            }}
          >
            Top Up Budget
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BudgetDetailDialog;
