/**
 * Employee Directory Page
 * List, search, filter employees with CRUD actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TablePagination, Chip, IconButton,
  InputAdornment, MenuItem, Stack, Avatar, Dialog, DialogTitle, DialogContent,
  DialogActions, Grid, CircularProgress, Alert, Tooltip, Divider, FormControl,
  InputLabel, Select, Tab, Tabs
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon,
  Visibility as ViewIcon, FilterList as FilterIcon,
  Phone as PhoneIcon, Email as EmailIcon, Badge as BadgeIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import { getEmployees, createEmployee, updateEmployee, getEmployee } from '../../services/hrService';
import { HREmployee, EmploymentStatus, ContractType } from '../../types';

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  ACTIVE: 'success', ON_LEAVE: 'warning', SUSPENDED: 'error',
  NOTICE_PERIOD: 'warning', TERMINATED: 'error', RETIRED: 'default'
};

const EmployeeDirectoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<HREmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<HREmployee | null>(null);
  const [viewEmployee, setViewEmployee] = useState<HREmployee | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewTab, setViewTab] = useState(0);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<Partial<HREmployee> & { contract_start_date?: string; contract_end_date?: string; salary_amount?: number }>();

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getEmployees({
        page: page + 1, limit: rowsPerPage, search, status: statusFilter || undefined
      });
      setEmployees(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, statusFilter]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const handleOpenDialog = (employee?: HREmployee) => {
    if (employee) {
      setEditingEmployee(employee);
      reset(employee);
    } else {
      setEditingEmployee(null);
      reset({ employment_status: 'ACTIVE' as EmploymentStatus, contract_type: 'FULL_TIME' as ContractType });
    }
    setDialogOpen(true);
  };

  const handleViewEmployee = async (id: number) => {
    try {
      const emp = await getEmployee(id);
      setViewEmployee(emp);
      setViewTab(0);
      setViewDialogOpen(true);
    } catch (err) {
      toast.error('Failed to load employee details');
    }
  };

  const onSubmit = async (data: any) => {
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, data);
        toast.success('Employee updated successfully');
      } else {
        await createEmployee(data);
        toast.success('Employee created successfully');
      }
      setDialogOpen(false);
      loadEmployees();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save employee');
    }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">Employee Directory</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
          Add Employee
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            placeholder="Search employees..."
            size="small"
            sx={{ width: 300 }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
            }}
          />
          <TextField
            select size="small" label="Status" sx={{ width: 180 }}
            value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="ON_LEAVE">On Leave</MenuItem>
            <MenuItem value="SUSPENDED">Suspended</MenuItem>
            <MenuItem value="NOTICE_PERIOD">Notice Period</MenuItem>
            <MenuItem value="TERMINATED">Terminated</MenuItem>
          </TextField>
        </Stack>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold' }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Employee #</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Department</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Job Title</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Contract</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Contact</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" py={4}>No employees found</Typography>
                    </TableCell>
                  </TableRow>
                ) : employees.map((emp) => (
                  <TableRow key={emp.id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>
                          {emp.first_name[0]}{emp.last_name[0]}
                        </Avatar>
                        <Typography variant="body2" fontWeight={600}>
                          {emp.first_name} {emp.last_name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell><Chip label={emp.employee_number} size="small" variant="outlined" /></TableCell>
                    <TableCell>{emp.department_name || '-'}</TableCell>
                    <TableCell>{emp.job_title || '-'}</TableCell>
                    <TableCell>
                      <Chip label={emp.contract_type.replace('_', ' ')} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={emp.employment_status} size="small" color={STATUS_COLORS[emp.employment_status] || 'default'} />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        {emp.phone_number && <Tooltip title={emp.phone_number}><PhoneIcon fontSize="small" color="action" /></Tooltip>}
                        {emp.personal_email && <Tooltip title={emp.personal_email}><EmailIcon fontSize="small" color="action" /></Tooltip>}
                      </Stack>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => handleViewEmployee(emp.id)}><ViewIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => handleOpenDialog(emp)}><EditIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50]}
              component="div"
              count={total}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            />
          </>
        )}
      </TableContainer>

      {/* Create/Edit Employee Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Grid container spacing={2}>
              <Grid item xs={12}><Typography variant="subtitle2" fontWeight="bold" color="primary">Personal Information</Typography><Divider /></Grid>
              <Grid item xs={12} md={4}>
                <Controller name="first_name" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="First Name *" fullWidth size="small" error={!!errors.first_name} />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="last_name" control={control} rules={{ required: 'Required' }}
                  render={({ field }) => <TextField {...field} label="Last Name *" fullWidth size="small" error={!!errors.last_name} />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="gender" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Gender" fullWidth size="small">
                      <MenuItem value="MALE">Male</MenuItem>
                      <MenuItem value="FEMALE">Female</MenuItem>
                      <MenuItem value="OTHER">Other</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="date_of_birth" control={control}
                  render={({ field }) => <TextField {...field} label="Date of Birth" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="national_id" control={control}
                  render={({ field }) => <TextField {...field} label="National ID" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="personal_email" control={control}
                  render={({ field }) => <TextField {...field} label="Email" type="email" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="phone_number" control={control}
                  render={({ field }) => <TextField {...field} label="Phone" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={8}>
                <Controller name="address" control={control}
                  render={({ field }) => <TextField {...field} label="Address" fullWidth size="small" />} />
              </Grid>

              <Grid item xs={12} sx={{ mt: 2 }}><Typography variant="subtitle2" fontWeight="bold" color="primary">Employment Details</Typography><Divider /></Grid>
              <Grid item xs={12} md={4}>
                <Controller name="job_title" control={control}
                  render={({ field }) => <TextField {...field} label="Job Title" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="contract_type" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Contract Type" fullWidth size="small">
                      <MenuItem value="FULL_TIME">Full Time</MenuItem>
                      <MenuItem value="PART_TIME">Part Time</MenuItem>
                      <MenuItem value="CONTRACT">Contract</MenuItem>
                      <MenuItem value="CONSULTANT">Consultant</MenuItem>
                      <MenuItem value="INTERN">Intern</MenuItem>
                      <MenuItem value="VOLUNTEER">Volunteer</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="employment_status" control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Status" fullWidth size="small">
                      <MenuItem value="ACTIVE">Active</MenuItem>
                      <MenuItem value="ON_LEAVE">On Leave</MenuItem>
                      <MenuItem value="SUSPENDED">Suspended</MenuItem>
                      <MenuItem value="NOTICE_PERIOD">Notice Period</MenuItem>
                      <MenuItem value="TERMINATED">Terminated</MenuItem>
                    </TextField>
                  )} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="hire_date" control={control}
                  render={({ field }) => <TextField {...field} label="Hire Date" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }} />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="donor_funding_source" control={control}
                  render={({ field }) => <TextField {...field} label="Donor Funding Source" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="cost_center" control={control}
                  render={({ field }) => <TextField {...field} label="Cost Center" fullWidth size="small" />} />
              </Grid>

              <Grid item xs={12} sx={{ mt: 2 }}><Typography variant="subtitle2" fontWeight="bold" color="primary">Emergency Contact</Typography><Divider /></Grid>
              <Grid item xs={12} md={4}>
                <Controller name="emergency_contact_name" control={control}
                  render={({ field }) => <TextField {...field} label="Contact Name" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="emergency_contact_phone" control={control}
                  render={({ field }) => <TextField {...field} label="Contact Phone" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="emergency_contact_relationship" control={control}
                  render={({ field }) => <TextField {...field} label="Relationship" fullWidth size="small" />} />
              </Grid>

              <Grid item xs={12} sx={{ mt: 2 }}><Typography variant="subtitle2" fontWeight="bold" color="primary">Banking Information</Typography><Divider /></Grid>
              <Grid item xs={12} md={4}>
                <Controller name="bank_name" control={control}
                  render={({ field }) => <TextField {...field} label="Bank Name" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="bank_branch" control={control}
                  render={({ field }) => <TextField {...field} label="Branch" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="bank_account_number" control={control}
                  render={({ field }) => <TextField {...field} label="Account Number" fullWidth size="small" />} />
              </Grid>

              <Grid item xs={12}>
                <Controller name="notes" control={control}
                  render={({ field }) => <TextField {...field} label="Notes" fullWidth size="small" multiline rows={2} />} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">{editingEmployee ? 'Update' : 'Create'}</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* View Employee Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ width: 48, height: 48, bgcolor: 'primary.main' }}>
              {viewEmployee?.first_name?.[0]}{viewEmployee?.last_name?.[0]}
            </Avatar>
            <Box>
              <Typography variant="h6">{viewEmployee?.first_name} {viewEmployee?.last_name}</Typography>
              <Typography variant="body2" color="text.secondary">{viewEmployee?.employee_number} • {viewEmployee?.job_title}</Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {viewEmployee && (
            <>
              <Tabs value={viewTab} onChange={(_, v) => setViewTab(v)} sx={{ mb: 2 }}>
                <Tab label="Details" />
                <Tab label="Contracts" />
                <Tab label="Leave Balances" />
              </Tabs>

              {viewTab === 0 && (
                <Grid container spacing={2}>
                  <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Department</Typography><Typography>{viewEmployee.department_name || '-'}</Typography></Grid>
                  <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Status</Typography><Box><Chip label={viewEmployee.employment_status} size="small" color={STATUS_COLORS[viewEmployee.employment_status] || 'default'} /></Box></Grid>
                  <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Contract</Typography><Typography>{viewEmployee.contract_type?.replace('_', ' ')}</Typography></Grid>
                  <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Hire Date</Typography><Typography>{viewEmployee.hire_date ? new Date(viewEmployee.hire_date).toLocaleDateString() : '-'}</Typography></Grid>
                  <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Email</Typography><Typography>{viewEmployee.personal_email || '-'}</Typography></Grid>
                  <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Phone</Typography><Typography>{viewEmployee.phone_number || '-'}</Typography></Grid>
                  <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Supervisor</Typography><Typography>{viewEmployee.supervisor_name || '-'}</Typography></Grid>
                  <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Funding Source</Typography><Typography>{viewEmployee.donor_funding_source || '-'}</Typography></Grid>
                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <Grid item xs={6} md={4}><Typography variant="caption" color="text.secondary">Emergency Contact</Typography><Typography>{viewEmployee.emergency_contact_name || '-'}</Typography></Grid>
                  <Grid item xs={6} md={4}><Typography variant="caption" color="text.secondary">Emergency Phone</Typography><Typography>{viewEmployee.emergency_contact_phone || '-'}</Typography></Grid>
                  <Grid item xs={6} md={4}><Typography variant="caption" color="text.secondary">Relationship</Typography><Typography>{viewEmployee.emergency_contact_relationship || '-'}</Typography></Grid>
                </Grid>
              )}

              {viewTab === 1 && (
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>Type</TableCell><TableCell>Start</TableCell><TableCell>End</TableCell>
                    <TableCell>Salary</TableCell><TableCell>Status</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {(viewEmployee.contracts || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} align="center">No contracts found</TableCell></TableRow>
                    ) : (viewEmployee.contracts || []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.contract_type?.replace('_', ' ')}</TableCell>
                        <TableCell>{new Date(c.start_date).toLocaleDateString()}</TableCell>
                        <TableCell>{c.end_date ? new Date(c.end_date).toLocaleDateString() : 'Ongoing'}</TableCell>
                        <TableCell>{c.currency} {c.salary_amount?.toLocaleString()}</TableCell>
                        <TableCell><Chip label={c.status} size="small" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {viewTab === 2 && (
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>Leave Type</TableCell><TableCell align="center">Total</TableCell>
                    <TableCell align="center">Used</TableCell><TableCell align="center">Pending</TableCell>
                    <TableCell align="center">Remaining</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {(viewEmployee.leaveBalances || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} align="center">No leave balances found</TableCell></TableRow>
                    ) : (viewEmployee.leaveBalances || []).map((lb) => (
                      <TableRow key={lb.id}>
                        <TableCell>{lb.leave_type_name}</TableCell>
                        <TableCell align="center">{lb.total_days}</TableCell>
                        <TableCell align="center">{lb.used_days}</TableCell>
                        <TableCell align="center">{lb.pending_days}</TableCell>
                        <TableCell align="center">
                          <Chip label={lb.remaining_days} size="small" color={lb.remaining_days > 0 ? 'success' : 'error'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          <Button variant="outlined" onClick={() => { setViewDialogOpen(false); if (viewEmployee) handleOpenDialog(viewEmployee); }}>
            Edit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EmployeeDirectoryPage;
