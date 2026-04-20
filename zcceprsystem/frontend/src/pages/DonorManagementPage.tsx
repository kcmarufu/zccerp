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
  CardContent
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  Block as BlockIcon,
  TrendingUp as StatsIcon,
  Delete as DeleteIcon,
  AddCircle as AddFundsIcon,
  RemoveCircle as RemoveFundsIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import donorService, { Donor, CreateDonorDto, DonorStats } from '../services/donorService';

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
  const [donors, setDonors] = useState<Donor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

  useEffect(() => {
    fetchDonors();
  }, []);

  const fetchDonors = async () => {
    try {
      setIsLoading(true);
      const data = await donorService.getAllDonors();
      setDonors(data);
    } catch (error) {
      toast.error('Failed to fetch donors');
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
        donor_name: '',
        donor_type: 'GOVERNMENT',
        total_committed: 0,
        currency_code: 'USD',
        fiscal_year: new Date().getFullYear()
      });
      // Fetch next auto-generated donor code
      try {
        const code = await donorService.getNextDonorCode();
        setNextDonorCode(code);
      } catch {
        setNextDonorCode('Auto-generated');
      }
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCurrentDonor(null);
    setIsEditMode(false);
    setEditDonorId(null);
  };

  const handleSaveDonor = async () => {
    if (!currentDonor?.donor_name || !currentDonor?.total_committed) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      if (isEditMode && editDonorId) {
        await donorService.updateDonor(editDonorId, currentDonor);
        toast.success('Donor updated successfully');
      } else {
        await donorService.createDonor(currentDonor as CreateDonorDto);
        toast.success('Donor created successfully');
      }
      fetchDonors();
      handleCloseDialog();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save donor');
    }
  };

  const handleViewStats = async (donorId: number) => {
    try {
      const stats = await donorService.getDonorStats(donorId);
      setDonorStats(stats);
      setOpenStatsDialog(true);
    } catch (error) {
      toast.error('Failed to fetch donor statistics');
    }
  };

  const handleDeactivate = async (donorId: number) => {
    if (!window.confirm('Are you sure you want to deactivate this donor?')) {
      return;
    }
    try {
      await donorService.deactivateDonor(donorId);
      toast.success('Donor deactivated successfully');
      fetchDonors();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to deactivate donor');
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
      toast.success('Donor deleted successfully');
      setOpenDeleteDialog(false);
      setDeleteDonor(null);
      fetchDonors();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete donor');
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

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">Donor Management</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
          Add New Donor
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        <strong>Finance Clerk Access:</strong> Manage donors and allocate funds to budget lines.
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'primary.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Donor Code</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Donor Name</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Type</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Committed</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Allocated</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Spent</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>FY</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {donors.map((donor) => (
              <TableRow key={donor.id} hover>
                <TableCell>
                  <Typography fontWeight="bold">{donor.donor_code}</Typography>
                </TableCell>
                <TableCell>
                  <Typography>{donor.donor_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {donor.country || 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={donor.donor_type} size="small" color="info" />
                </TableCell>
                <TableCell>{formatCurrency(donor.total_committed, donor.currency_code)}</TableCell>
                <TableCell>{formatCurrency(donor.total_allocated, donor.currency_code)}</TableCell>
                <TableCell>{formatCurrency(donor.total_spent, donor.currency_code)}</TableCell>
                <TableCell>{donor.fiscal_year}</TableCell>
                <TableCell>
                  <Chip 
                    label={donor.is_active ? 'Active' : 'Inactive'} 
                    color={donor.is_active ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title="Add Funds">
                    <IconButton size="small" color="success" onClick={() => handleOpenFunds(donor, 'add')}>
                      <AddFundsIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove Funds">
                    <IconButton size="small" color="warning" onClick={() => handleOpenFunds(donor, 'remove')}>
                      <RemoveFundsIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Fund History">
                    <IconButton size="small" onClick={() => handleViewTransactions(donor)}>
                      <HistoryIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="View Statistics">
                    <IconButton size="small" color="primary" onClick={() => handleViewStats(donor.id)}>
                      <StatsIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit Donor">
                    <IconButton size="small" color="info" onClick={() => handleOpenDialog(donor)}>
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  {donor.is_active && (
                    <Tooltip title="Deactivate Donor">
                      <IconButton size="small" color="error" onClick={() => handleDeactivate(donor.id)}>
                        <BlockIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Delete Donor">
                    <IconButton size="small" color="error" onClick={() => handleOpenDelete(donor)}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Donor Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{isEditMode ? 'Edit Donor' : 'Create New Donor'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Donor Code"
                value={nextDonorCode}
                fullWidth
                disabled
                helperText={isEditMode ? '' : 'Auto-generated'}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Donor Name"
                value={currentDonor?.donor_name || ''}
                onChange={(e) => setCurrentDonor({ ...currentDonor, donor_name: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Donor Type"
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
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSaveDonor} variant="contained">
            {isEditMode ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Donor Statistics Dialog */}
      <Dialog open={openStatsDialog} onClose={() => setOpenStatsDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Donor Statistics</DialogTitle>
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
      <Dialog open={openFundsDialog} onClose={() => setOpenFundsDialog(false)} maxWidth="sm" fullWidth>
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
                placeholder={fundsMode === 'add' ? 'e.g., New tranche received' : 'e.g., Donor withdrew funds'}
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
        <DialogTitle>Delete Donor</DialogTitle>
        <DialogContent>
          {deleteDonor && (
            <Box>
              <Alert severity="error" sx={{ mb: 2 }}>
                Are you sure you want to permanently delete this donor? This action cannot be undone.
              </Alert>
              <Card variant="outlined">
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Donor Code</Typography>
                      <Typography fontWeight="bold">{deleteDonor.donor_code}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Donor Name</Typography>
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
                  This donor has allocated funds. Delete associated budget lines first.
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
      <Dialog open={openTransactionsDialog} onClose={() => setOpenTransactionsDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Fund History: {transactionsDonor?.donor_name}</DialogTitle>
        <DialogContent>
          {donorTransactions.length === 0 ? (
            <Alert severity="info" sx={{ mt: 1 }}>No fund transactions recorded yet.</Alert>
          ) : (
            <TableContainer sx={{ mt: 1 }}>
              <Table size="small">
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
    </Box>
  );
};

export default DonorManagementPage;
