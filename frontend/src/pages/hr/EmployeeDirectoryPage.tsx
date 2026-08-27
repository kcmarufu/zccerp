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
  InputLabel, Select, Tab, Tabs, Switch, FormControlLabel
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon,
  Visibility as ViewIcon, FilterList as FilterIcon,
  Phone as PhoneIcon, Email as EmailIcon, Badge as BadgeIcon,
  UploadFile as UploadIcon, FileDownload as DownloadIcon,
  DeleteOutline as DeleteIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import {
  getEmployees, createEmployee, updateEmployee, getEmployee,
  getDocuments, uploadDocument, deleteDocument,
  viewEmployeeDocument, downloadEmployeeDocument,
  createContract, getContracts,
} from '../../services/hrService';
import { HREmployee, EmploymentStatus, ContractType, HRDocument } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/datetime';

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  ACTIVE: 'success', ON_LEAVE: 'warning', SUSPENDED: 'error',
  NOTICE_PERIOD: 'warning', TERMINATED: 'error', RETIRED: 'default'
};

/** Certificates, contracts and other employee files. */
const DOC_TYPES = [
  'EDUCATION_CERTIFICATE', 'PROFESSIONAL_CERTIFICATE', 'ID_DOCUMENT',
  'CONTRACT', 'CV', 'REFERENCE', 'MEDICAL', 'OTHER',
];

const docSize = (bytes: number | null) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const EmployeeDocuments: React.FC<{ employeeId: number; canEdit: boolean }> = ({ employeeId, canEdit }) => {
  const [docs, setDocs]       = useState<HRDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('EDUCATION_CERTIFICATE');

  const load = useCallback(async () => {
    setLoading(true);
    try { setDocs(await getDocuments(employeeId)); }
    catch { setDocs([]); }
    finally { setLoading(false); }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Text fields first: multer reads attachment_type when choosing the
      // destination folder, and it only sees fields parsed before the file.
      const form = new FormData();
      form.append('attachment_type', 'HR_DOCUMENT');
      form.append('employee_id', String(employeeId));
      form.append('document_type', docType);
      form.append('document_name', file.name);
      form.append('file', file);
      await uploadDocument(form);
      toast.success('Document uploaded');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const act = async (doc: HRDocument, fn: (d: HRDocument) => Promise<void>) => {
    setBusy(doc.id);
    try { await fn(doc); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Could not open the document'); }
    finally { setBusy(null); }
  };

  const remove = async (doc: HRDocument) => {
    setBusy(doc.id);
    try {
      await deleteDocument(doc.id);
      toast.success('Document removed');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove document');
    } finally { setBusy(null); }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>;
  }

  return (
    <Box>
      {canEdit && (
        <Stack direction="row" spacing={1} alignItems="center" mb={2} flexWrap="wrap">
          <TextField
            select size="small" label="Document type" value={docType}
            onChange={(e) => setDocType(e.target.value)} sx={{ minWidth: 240 }}
          >
            {DOC_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>
            ))}
          </TextField>
          <Button component="label" variant="outlined" size="small" disabled={uploading}
            startIcon={uploading ? <CircularProgress size={14} /> : <UploadIcon />}>
            Upload
            <input type="file" hidden onChange={handleUpload} />
          </Button>
          <Typography variant="caption" color="text.secondary">
            PDF, image, Word or Excel — up to 8&nbsp;MB.
          </Typography>
        </Stack>
      )}

      {docs.length === 0 ? (
        <Box py={4} textAlign="center">
          <Typography variant="body2" color="text.secondary">No documents uploaded.</Typography>
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Document</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Uploaded</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{d.document_name}</Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined"
                    label={String(d.document_type || '').replace(/_/g, ' ')} />
                </TableCell>
                <TableCell>{docSize(d.file_size)}</TableCell>
                <TableCell>
                  <Typography variant="caption">{formatDate(d.created_at)}</Typography>
                </TableCell>
                <TableCell align="center">
                  {busy === d.id ? <CircularProgress size={18} /> : (
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Tooltip title="View">
                        <IconButton size="small" onClick={() => act(d, viewEmployeeDocument)}>
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Download">
                        <IconButton size="small" onClick={() => act(d, downloadEmployeeDocument)}>
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {canEdit && (
                        <Tooltip title="Remove">
                          <IconButton size="small" color="error" onClick={() => remove(d)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
};

/**
 * One label/value cell on the employee Details tab.
 *
 * Long values — email addresses especially — must wrap inside their own column
 * rather than overflow into the next one, which is what made Email and Phone
 * run together.
 */
const DetailField: React.FC<{
  label: string;
  value?: React.ReactNode;
  xs?: number;
  md?: number;
}> = ({ label, value, xs = 6, md = 3 }) => (
  <Grid item xs={xs} md={md} sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word', pr: 2 }}>
      {value === null || value === undefined || value === '' ? '-' : value}
    </Typography>
  </Grid>
);

/**
 * Contracts for one employee, with an inline "add contract" form.
 * A signed copy can be attached at the same time; it is stored as a CONTRACT
 * document against the employee so it shows on the Documents tab too.
 */
const CONTRACT_TYPES = ['PERMANENT', 'FIXED_TERM', 'PROBATION', 'CONSULTANCY', 'INTERNSHIP', 'VOLUNTEER'];

const EmployeeContracts: React.FC<{
  employeeId: number;
  departmentId?: number | null;
  canEdit: boolean;
  initial?: any[];
}> = ({ employeeId, departmentId, canEdit, initial }) => {
  const [rows, setRows]       = useState<any[]>(initial || []);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [file, setFile]       = useState<File | null>(null);
  const [form, setForm] = useState({
    contract_type: 'FIXED_TERM',
    position_title: '',
    start_date: '',
    end_date: '',
    basic_salary: '',
    currency_code: 'USD',
    probation_months: '3',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getContracts(employeeId)); }
    catch { /* keep whatever we already have */ }
    finally { setLoading(false); }
  }, [employeeId]);

  const save = async () => {
    if (!form.start_date) { toast.error('A start date is required'); return; }
    if (form.end_date && new Date(form.end_date) < new Date(form.start_date)) {
      toast.error('End date must be on or after the start date');
      return;
    }
    setSaving(true);
    try {
      await createContract({
        employee_id: employeeId,
        department_id: departmentId ?? undefined,
        contract_type: form.contract_type,
        position_title: form.position_title || undefined,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        basic_salary: form.basic_salary ? Number(form.basic_salary) : 0,
        currency_code: form.currency_code,
        probation_months: form.probation_months ? Number(form.probation_months) : 0,
        notes: form.notes || undefined,
      } as any);

      // Attach the signed copy, if one was chosen.
      if (file) {
        const fd = new FormData();
        fd.append('attachment_type', 'HR_DOCUMENT');
        fd.append('employee_id', String(employeeId));
        fd.append('document_type', 'CONTRACT');
        fd.append('document_name', file.name);
        fd.append('file', file);
        await uploadDocument(fd);
      }

      toast.success(file ? 'Contract and document saved' : 'Contract saved');
      setAdding(false);
      setFile(null);
      setForm({
        contract_type: 'FIXED_TERM', position_title: '', start_date: '', end_date: '',
        basic_salary: '', currency_code: 'USD', probation_months: '3', notes: '',
      });
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save the contract');
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Box>
      {canEdit && (
        <Box mb={2}>
          {!adding ? (
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
              Add Contract
            </Button>
          ) : (
            <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5}>New Contract</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField select fullWidth size="small" label="Contract Type"
                    value={form.contract_type} onChange={set('contract_type')}>
                    {CONTRACT_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={8}>
                  <TextField fullWidth size="small" label="Position Title"
                    value={form.position_title} onChange={set('position_title')} />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField fullWidth size="small" type="date" label="Start Date *"
                    InputLabelProps={{ shrink: true }}
                    value={form.start_date} onChange={set('start_date')} />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField fullWidth size="small" type="date" label="End Date"
                    InputLabelProps={{ shrink: true }} helperText="Leave blank if ongoing"
                    value={form.end_date} onChange={set('end_date')} />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField fullWidth size="small" type="number" label="Probation (months)"
                    value={form.probation_months} onChange={set('probation_months')} />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField fullWidth size="small" type="number" label="Basic Salary"
                    value={form.basic_salary} onChange={set('basic_salary')} />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField select fullWidth size="small" label="Currency"
                    value={form.currency_code} onChange={set('currency_code')}>
                    {['USD', 'ZWL', 'ZAR', 'GBP', 'EUR'].map((c) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" multiline rows={2} label="Notes"
                    value={form.notes} onChange={set('notes')} />
                </Grid>
                <Grid item xs={12}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Button component="label" size="small" startIcon={<UploadIcon />}>
                      Attach signed copy
                      <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    </Button>
                    {file && (
                      <>
                        <Typography variant="body2">{file.name}</Typography>
                        <IconButton size="small" onClick={() => setFile(null)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </Stack>
                </Grid>
              </Grid>
              <Stack direction="row" spacing={1} justifyContent="flex-end" mt={2}>
                <Button size="small" onClick={() => { setAdding(false); setFile(null); }}>Cancel</Button>
                <Button size="small" variant="contained" onClick={save} disabled={saving}
                  startIcon={saving ? <CircularProgress size={14} /> : undefined}>
                  Save Contract
                </Button>
              </Stack>
            </Paper>
          )}
        </Box>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Contract</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Start</TableCell>
              <TableCell>End</TableCell>
              <TableCell>Salary</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center">No contracts recorded</TableCell></TableRow>
            ) : rows.map((c: any) => (
              <TableRow key={c.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{c.contract_number || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">{c.position_title || ''}</Typography>
                </TableCell>
                <TableCell>{String(c.contract_type || '').replace(/_/g, ' ')}</TableCell>
                <TableCell>{formatDate(c.start_date)}</TableCell>
                <TableCell>{c.end_date ? formatDate(c.end_date) : 'Ongoing'}</TableCell>
                <TableCell>
                  {c.currency_code || c.currency || ''} {Number(c.basic_salary || c.salary_amount || 0).toLocaleString()}
                </TableCell>
                <TableCell><Chip label={c.status} size="small" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
};

const EmployeeDirectoryPage: React.FC = () => {
  const { user } = useAuthStore();
  /** Who may edit records and manage employee documents. */
  const canManage = ['ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'].includes(user?.role || '');
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
                        <Box minWidth={0}>
                          <Typography variant="body2" fontWeight={600}>
                            {emp.first_name} {emp.last_name}
                          </Typography>
                          {/* The User Admin login address, so it is obvious
                              which system account this person holds. */}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', wordBreak: 'break-all' }}
                          >
                            {emp.system_email || 'No system account'}
                          </Typography>
                        </Box>
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

              {/* ── Leave accrual ──────────────────────────────────────────
                  Not everyone earns 2.5 days a month. Level-of-effort and
                  part-time staff earn less, and service or contractor accounts
                  should not accrue at all — otherwise their balances inflate
                  and skew the leave reports. */}
              <Grid item xs={12} sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" color="primary">Leave Accrual</Typography>
                <Divider />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="accrual_enabled" control={control} defaultValue={true}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={field.value === true || field.value === 1}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      }
                      label="Earns leave monthly"
                    />
                  )} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="monthly_accrual_days" control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                      type="number" label="Days per month" fullWidth size="small"
                      inputProps={{ min: 0, max: 31, step: 0.25 }}
                      helperText="Blank = standard rate (2.5)"
                    />
                  )} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="accrual_note" control={control}
                  render={({ field }) => (
                    <TextField {...field} value={field.value ?? ''}
                      label="Reason for a different rate" placeholder="e.g. Level of effort — 50%"
                      fullWidth size="small" />
                  )} />
              </Grid>

              <Grid item xs={12} sx={{ mt: 2 }}><Typography variant="subtitle2" fontWeight="bold" color="primary">Education &amp; Qualifications</Typography><Divider /></Grid>
              <Grid item xs={12} md={4}>
                <Controller name="highest_qualification" control={control}
                  render={({ field }) => <TextField {...field} label="Highest Qualification" placeholder="e.g. BSc Honours" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="field_of_study" control={control}
                  render={({ field }) => <TextField {...field} label="Field of Study" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="institution" control={control}
                  render={({ field }) => <TextField {...field} label="Institution" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller name="year_qualified" control={control}
                  render={({ field }) => <TextField {...field} type="number" label="Year Qualified" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12} md={8}>
                <Controller name="professional_body" control={control}
                  render={({ field }) => <TextField {...field} label="Professional Body / Membership" fullWidth size="small" />} />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">
                  Certificates and other files are uploaded under the Documents tab once the
                  employee record is saved.
                </Typography>
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
                <Tab label="Documents" />
              </Tabs>

              {viewTab === 0 && (
                <Grid container spacing={2}>
                  <DetailField label="Department" value={viewEmployee.department_name} />
                  <Grid item xs={6} md={3} sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" display="block">Status</Typography>
                    <Box mt={0.25}>
                      <Chip label={viewEmployee.employment_status} size="small"
                            color={STATUS_COLORS[viewEmployee.employment_status] || 'default'} />
                    </Box>
                  </Grid>
                  <DetailField label="Contract" value={viewEmployee.contract_type?.replace('_', ' ')} />
                  <DetailField label="Hire Date" value={formatDate(viewEmployee.hire_date)} />

                  {/* Email gets a full half-row: addresses are long and were
                      previously overlapping the Phone column. */}
                  <DetailField label="Email" value={viewEmployee.personal_email} xs={12} md={6} />
                  <DetailField label="Phone" value={viewEmployee.phone_number} xs={6} md={3} />
                  <DetailField label="Supervisor" value={viewEmployee.supervisor_name} />
                  <DetailField label="Funding Source" value={viewEmployee.donor_funding_source} xs={6} md={3} />

                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <DetailField label="Emergency Contact" value={viewEmployee.emergency_contact_name} xs={12} md={4} />
                  <DetailField label="Emergency Phone" value={viewEmployee.emergency_contact_phone} xs={6} md={4} />
                  <DetailField label="Relationship" value={viewEmployee.emergency_contact_relationship} xs={6} md={4} />
                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <DetailField label="Highest Qualification" value={(viewEmployee as any).highest_qualification} />
                  <DetailField label="Field of Study" value={(viewEmployee as any).field_of_study} />
                  <DetailField label="Institution" value={(viewEmployee as any).institution} />
                  <DetailField label="Year Qualified" value={(viewEmployee as any).year_qualified} />
                  <DetailField label="Professional Body" value={(viewEmployee as any).professional_body} xs={12} md={6} />

                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <Grid item xs={12} md={4} sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" display="block">Leave Accrual</Typography>
                    <Box mt={0.25}>
                      <Chip
                        size="small"
                        label={(viewEmployee as any).accrual_enabled === 0 ? 'Not accruing' : 'Accruing monthly'}
                        color={(viewEmployee as any).accrual_enabled === 0 ? 'default' : 'success'}
                      />
                    </Box>
                  </Grid>
                  <DetailField
                    label="Days per Month"
                    value={(viewEmployee as any).monthly_accrual_days != null
                      ? `${Number((viewEmployee as any).monthly_accrual_days).toFixed(2)} (custom)`
                      : '2.50 (standard)'}
                    xs={6} md={4}
                  />
                  <DetailField label="Accrual Note" value={(viewEmployee as any).accrual_note} xs={6} md={4} />

                  {/* Who last touched this record. */}
                  <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">
                      {(viewEmployee as any).updated_by_name
                        ? `Last updated by ${(viewEmployee as any).updated_by_name}`
                        : 'No edits recorded yet'}
                      {viewEmployee.updated_at ? ` on ${formatDate(viewEmployee.updated_at)}` : ''}
                    </Typography>
                  </Grid>
                </Grid>
              )}

              {viewTab === 3 && (
                <EmployeeDocuments employeeId={viewEmployee.id} canEdit={canManage} />
              )}

              {viewTab === 1 && (
                <EmployeeContracts
                  employeeId={viewEmployee.id}
                  departmentId={viewEmployee.department_id}
                  canEdit={canManage}
                  initial={viewEmployee.contracts || []}
                />
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
