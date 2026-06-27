/**
 * Purchase Request Form
 * Create / Edit a purchase request with items, donor, budget line & file attachments
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Paper, Typography, TextField, MenuItem, Button, Grid, Divider,
  IconButton, Table, TableHead, TableRow, TableCell, TableBody, Alert,
  CircularProgress, InputAdornment, Autocomplete, Chip, LinearProgress,
  List, ListItem, ListItemText, ListItemIcon, ListItemSecondaryAction,
  alpha, useTheme, Stack
} from '@mui/material';
import {
  AddCircle as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Send as SubmitIcon,
  ArrowBack as BackIcon,
  CloudUpload as UploadIcon,
  AttachFile as FileIcon,
  Image as PhotoIcon,
  Description as DocIcon,
  Receipt as QuotationIcon,
  Close as RemoveIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import {
  createPurchaseRequest,
  updatePurchaseRequest,
  submitPurchaseRequest,
  getPurchaseRequestById
} from '../../services/procurementService';
import { ProcRequestItem, BudgetLine, Project } from '../../types';
import projectService from '../../services/projectService';
import { useAuthStore } from '../../store/authStore';
import { reconciliationService } from '../../services/reconciliationService';

interface ItemRow extends Omit<ProcRequestItem, 'id' | 'request_id'> {
  _key: string;
}

interface PendingFile {
  _key: string;
  file: File;
  attachment_type: 'PHOTO' | 'QUOTATION' | 'SPECIFICATION' | 'OTHER';
  description: string;
}

const emptyItem = (): ItemRow => ({
  _key: Math.random().toString(36).slice(2),
  item_description: '',
  specifications: '',
  quantity: 1,
  unit_of_measure: 'unit',
  estimated_unit_price: 0,
  budget_line_id: null,
  notes: ''
});

const UOM = ['unit', 'piece', 'box', 'set', 'kg', 'litre', 'metre', 'roll', 'ream', 'pair', 'dozen', 'lot'];
const ATTACHMENT_TYPES = [
  { value: 'PHOTO', label: 'Photo', icon: <PhotoIcon fontSize="small" /> },
  { value: 'QUOTATION', label: 'Quotation', icon: <QuotationIcon fontSize="small" /> },
  { value: 'SPECIFICATION', label: 'Specification', icon: <DocIcon fontSize="small" /> },
  { value: 'OTHER', label: 'Other', icon: <FileIcon fontSize="small" /> }
];

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <PhotoIcon color="primary" />;
  if (type === 'application/pdf') return <DocIcon color="error" />;
  return <FileIcon color="action" />;
};

const PurchaseRequestForm: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const isEdit = Boolean(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [crossDeptWarning, setCrossDeptWarning] = useState<string | null>(null);
  const [overdueBlocked, setOverdueBlocked] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [title, setTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [donorId, setDonorId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectBudgetLines, setProjectBudgetLines] = useState<BudgetLine[] | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const { data: existingRequest, isLoading: loadingExisting } = useQuery({
    queryKey: ['proc-request', id],
    queryFn: () => getPurchaseRequestById(id!),
    enabled: isEdit
  });

  const { data: donors = [] } = useQuery({
    queryKey: ['donors-list'],
    queryFn: async () => {
      const res = await api.get('/donors');
      if (Array.isArray(res.data)) return res.data;
      return res.data?.data || [];
    }
  });

  const { data: budgetLines = [] } = useQuery<BudgetLine[]>({
    queryKey: ['budget-lines'],
    queryFn: async () => {
      const res = await api.get('/budgets');
      if (Array.isArray(res.data)) return res.data;
      return res.data?.data || [];
    }
  });

  const activeBudgetLines = projectBudgetLines ?? (donorId
    ? budgetLines.filter(bl => bl.donor_id === donorId)
    : budgetLines);

  // Check overdue reconciliation compliance (only for new requests)
  useEffect(() => {
    if (!isEdit) {
      reconciliationService.getOverdueCheck()
        .then(res => {
          setOverdueCount(res.overdueCount);
          setOverdueBlocked(res.isBlocked);
        })
        .catch(() => { /* allow creation if check fails */ });
    }
  }, [isEdit]);

  useEffect(() => {
    if (!donorId) { setProjects([]); setProjectId(null); return; }
    setLoadingProjects(true);
    projectService.getProjectsByDonor(donorId)
      .then(setProjects)
      .catch(() => toast.error('Failed to load projects'))
      .finally(() => setLoadingProjects(false));
  }, [donorId]);

  useEffect(() => {
    setProjectBudgetLines(null);
    setCrossDeptWarning(null);
    if (!projectId) return;

    // Cross-department warning
    const selected = projects.find(p => p.id === projectId);
    if (selected && selected.department_id && user?.department_id && selected.department_id !== user.department_id) {
      const ownerDept = selected.department_name || `Department ID ${selected.department_id}`;
      setCrossDeptWarning(
        `This project is not assigned to your department. Your request will be routed to the HOP/Lead of the ${ownerDept} department for approval.`
      );
    }

    projectService.getProjectBudgetLines(projectId, { is_active: true })
      .then(setProjectBudgetLines)
      .catch(() => toast.error('Failed to load project budget lines'));
  }, [projectId, projects, user?.department_id]);

  useEffect(() => {
    if (existingRequest && isEdit) {
      setTitle(existingRequest.title || '');
      setJustification(existingRequest.justification || '');
      setDonorId(existingRequest.donor_id || null);
      setProjectId(existingRequest.project_id || null);
      setDeliveryDate(existingRequest.expected_delivery_date?.split('T')[0] || '');
      if (existingRequest.items && existingRequest.items.length > 0) {
        setItems(existingRequest.items.map((i: any) => ({
          _key: Math.random().toString(36).slice(2),
          item_description: i.item_description || '',
          specifications: i.specifications || '',
          quantity: i.quantity || 1,
          unit_of_measure: i.unit_of_measure || 'unit',
          estimated_unit_price: i.estimated_unit_price || 0,
          budget_line_id: i.budget_line_id || null,
          notes: i.notes || ''
        })));
      }
    }
  }, [existingRequest, isEdit]);

  const updateItem = (key: string, field: keyof ItemRow, value: any) => {
    setItems(prev => prev.map(i => i._key === key ? { ...i, [field]: value } : i));
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (key: string) => setItems(prev => prev.filter(i => i._key !== key));

  const totalEstimated = items.reduce((sum, i) => sum + (i.quantity * i.estimated_unit_price), 0);

  const getPayload = () => ({
    title,
    justification,
    donor_id: donorId,
    project_id: projectId || undefined,
    expected_delivery_date: deliveryDate || null,
    items: items.map(i => ({
      item_description: i.item_description,
      specifications: i.specifications || undefined,
      quantity: i.quantity,
      unit_of_measure: i.unit_of_measure,
      estimated_unit_price: i.estimated_unit_price,
      budget_line_id: i.budget_line_id || undefined,
      notes: i.notes || undefined
    }))
  });

  const uploadPendingFiles = async (requestId: string) => {
    for (const pf of pendingFiles) {
      try {
        const fd = new FormData();
        fd.append('file', pf.file);
        fd.append('attachment_type', pf.attachment_type);
        fd.append('description', pf.description);
        await api.post(`/procurement/requests/${requestId}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } catch (e) {
        console.error('Failed to upload file:', pf.file.name, e);
      }
    }
  };

  const validate = () => {
    if (!title.trim()) { toast.error('Title is required'); return false; }
    if (!justification.trim()) { toast.error('Justification is required'); return false; }
    if (items.length === 0) { toast.error('Add at least one item'); return false; }
    for (const item of items) {
      if (!item.item_description.trim()) { toast.error('All items must have a description'); return false; }
      if (item.quantity <= 0) { toast.error('Item quantity must be greater than 0'); return false; }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updatePurchaseRequest(id!, getPayload());
        await uploadPendingFiles(id!);
        setPendingFiles([]);
        toast.success('Request updated successfully');
        navigate(`/procurement/requests/${id}`);
      } else {
        const result = await createPurchaseRequest(getPayload());
        await uploadPendingFiles(String(result.requestId));
        toast.success(`Request ${result.requestCode} created`);
        navigate(`/procurement/requests/${result.requestId}`);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to save request');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      let reqId = id;
      if (!isEdit) {
        const result = await createPurchaseRequest(getPayload());
        reqId = String(result.requestId);
        toast.success(`Request ${result.requestCode} created`);
      } else {
        await updatePurchaseRequest(id!, getPayload());
      }
      await uploadPendingFiles(reqId!);
      await submitPurchaseRequest(reqId!);
      toast.success('Request submitted for approval');
      navigate(`/procurement/requests/${reqId}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const newPending: PendingFile[] = arr.map(file => ({
      _key: Math.random().toString(36).slice(2),
      file,
      attachment_type: file.type.startsWith('image/') ? 'PHOTO' : 'OTHER',
      description: ''
    }));
    setPendingFiles(prev => [...prev, ...newPending]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removePendingFile = (key: string) => setPendingFiles(prev => prev.filter(f => f._key !== key));

  const updatePendingFile = (key: string, field: 'attachment_type' | 'description', value: string) => {
    setPendingFiles(prev => prev.map(f => f._key === key ? { ...f, [field]: value } : f));
  };

  if (isEdit && loadingExisting) {
    return <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>;
  }

  if (isEdit && existingRequest && !['DRAFT', 'REJECTED'].includes(existingRequest.status)) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        This request is in <strong>{existingRequest.status?.replace(/_/g, ' ')}</strong> status and cannot be edited.
        <Button sx={{ ml: 2 }} size="small" onClick={() => navigate(`/procurement/requests/${id}`)}>
          View Request
        </Button>
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" gap={1} mb={3}>
        <IconButton onClick={() => navigate('/procurement/requests')} sx={{ bgcolor: 'grey.100' }}>
          <BackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {isEdit ? (existingRequest?.status === 'REJECTED' ? 'Edit & Resubmit Request' : 'Edit Purchase Request') : 'New Purchase Request'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isEdit ? (existingRequest?.status === 'REJECTED' ? 'Update details and resubmit for approval' : 'Update the details of this draft request') : 'Fill in the details and add items to procure'}
          </Typography>
        </Box>
      </Box>

      {/* Overdue reconciliation block */}
      {overdueBlocked && !isEdit && (
        <Alert severity="error" sx={{ mb: 2 }} icon={<WarningIcon />}>
          <Typography variant="subtitle2" fontWeight={700}>
            Purchase Request Blocked — Overdue Reconciliations
          </Typography>
          <Typography variant="body2">
            You have <strong>{overdueCount}</strong> overdue reconciliation{overdueCount !== 1 ? 's' : ''} that have not been submitted for approval.
            You must submit your overdue reconciliations before creating a new purchase request.
            Go to the <strong>Reconciliation</strong> module to submit them.
          </Typography>
        </Alert>
      )}

      {/* Rejection reason banner */}
      {isEdit && existingRequest?.status === 'REJECTED' && existingRequest?.rejection_reason && (
        <Alert severity="error" sx={{ mb: 2 }} icon={false}>
          <Typography variant="subtitle2" fontWeight={700} mb={0.5}>This request was rejected — please address the comments below before resubmitting:</Typography>
          <Typography variant="body2">{existingRequest.rejection_reason}</Typography>
        </Alert>
      )}

      {/* Section 1: Request Details */}
      <Paper elevation={0} sx={{ p: 3, mb: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="subtitle1" fontWeight={700} color="primary" mb={2}>
          Request Details
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth label="Title / Subject *"
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Office Stationery for Q2 Programme Activities"
              helperText="Provide a clear, concise title describing what you need to procure"
              inputProps={{ maxLength: 300 }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              select fullWidth label="Donor (optional)"
              value={donorId || ''} onChange={e => { setDonorId(e.target.value ? Number(e.target.value) : null); setProjectId(null); }}
              helperText="Link this request to a donor / funding source"
            >
              <MenuItem value=""><em>No specific donor</em></MenuItem>
              {(donors as any[]).map((d: any) => (
                <MenuItem key={d.id} value={d.id}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{d.donor_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{d.donor_code}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          {donorId && (
            <Grid item xs={12} md={4}>
              <TextField
                select fullWidth label="Project (optional)"
                value={projectId || ''} onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}
                helperText="Select a project to filter budget lines"
                disabled={loadingProjects}
                InputProps={loadingProjects ? { endAdornment: <CircularProgress size={16} /> } : undefined}
              >
                <MenuItem value=""><em>All projects</em></MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{p.project_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.project_code}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}
          {/* Cross-department routing warning */}
          {crossDeptWarning && (
            <Grid item xs={12}>
              <Alert severity="info" onClose={() => setCrossDeptWarning(null)}>
                {crossDeptWarning}
              </Alert>
            </Grid>
          )}
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth label="Expected Delivery Date"
              type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: new Date().toISOString().split('T')[0] }}
              helperText="When do you need the items?"
            />
            {deliveryDate && (() => {
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const delivery = new Date(deliveryDate); delivery.setHours(0, 0, 0, 0);
              const diffDays = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays < 3) {
                return (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    <strong>Late Procurement Warning:</strong> Procurement requires a minimum lead time of 3 days.
                    Your requested delivery is {diffDays <= 0 ? 'today or already overdue' : `only ${diffDays} day(s) away`}.
                    This request will be treated as <strong>urgent/late</strong>.
                  </Alert>
                );
              }
              return null;
            })()}
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth multiline minRows={4}
              label="Justification / Business Case *"
              value={justification} onChange={e => setJustification(e.target.value)}
              placeholder="Explain why this procurement is needed, how it supports programme activities, and any urgency factors..."
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Section 2: Items */}
      <Paper elevation={0} sx={{ p: 3, mb: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="subtitle1" fontWeight={700} color="primary">
            Items to Procure
          </Typography>
          <Button startIcon={<AddIcon />} onClick={addItem} size="small" variant="outlined" sx={{ borderRadius: 2 }}>
            Add Item
          </Button>
        </Box>

        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ '& .MuiTableCell-head': { fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.06), whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 200 }}>Description *</TableCell>
                <TableCell sx={{ minWidth: 140 }}>Specifications</TableCell>
                <TableCell sx={{ minWidth: 80 }}>Qty *</TableCell>
                <TableCell sx={{ minWidth: 90 }}>Unit</TableCell>
                <TableCell sx={{ minWidth: 130 }}>Est. Unit Price</TableCell>
                <TableCell sx={{ minWidth: 120 }}>Subtotal</TableCell>
                <TableCell sx={{ minWidth: 240 }}>Budget Line</TableCell>
                <TableCell sx={{ width: 40 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item._key} sx={{ '&:last-child td': { borderBottom: 0 }, '&:hover': { bgcolor: 'grey.50' } }}>
                  <TableCell>
                    <TextField
                      fullWidth size="small" value={item.item_description}
                      onChange={e => updateItem(item._key, 'item_description', e.target.value)}
                      placeholder={`Item ${index + 1}`}
                      multiline minRows={1} maxRows={4}
                      inputProps={{ maxLength: 500 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      fullWidth size="small" value={item.specifications || ''}
                      onChange={e => updateItem(item._key, 'specifications', e.target.value)}
                      placeholder="Brand, model, size..."
                      multiline minRows={1} maxRows={4}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number" size="small" sx={{ width: 80 }}
                      value={item.quantity}
                      onChange={e => updateItem(item._key, 'quantity', Math.max(1, parseFloat(e.target.value) || 1))}
                      inputProps={{ min: 1, step: 1 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select size="small" sx={{ minWidth: 85 }}
                      value={item.unit_of_measure}
                      onChange={e => updateItem(item._key, 'unit_of_measure', e.target.value)}
                    >
                      {UOM.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number" size="small" sx={{ width: 130 }}
                      value={item.estimated_unit_price}
                      onChange={e => updateItem(item._key, 'estimated_unit_price', parseFloat(e.target.value) || 0)}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                      inputProps={{ min: 0, step: 0.01 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700} color="primary">
                      ${(item.quantity * item.estimated_unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Autocomplete
                      size="small"
                      sx={{ minWidth: 230 }}
                      options={activeBudgetLines}
                      getOptionLabel={(opt: any) => `${opt.budget_code} – ${opt.budget_name}`}
                      value={(activeBudgetLines as any[]).find((bl: any) => bl.id === item.budget_line_id) || null}
                      onChange={(_, val: any) => updateItem(item._key, 'budget_line_id', val?.id || null)}
                      renderInput={(params) => <TextField {...params} placeholder="Select budget line" />}
                      renderOption={(props, opt: any) => {
                        const balance = Number(opt.balance ?? (Number(opt.allocated_amount) - Number(opt.spent_amount)));
                        const allocated = Number(opt.allocated_amount) || 1;
                        const utilPct = Math.min(100, ((allocated - balance) / allocated) * 100);
                        const isLow = balance < 1000;
                        return (
                          <li {...props} key={opt.id}>
                            <Box sx={{ width: '100%', py: 0.5 }}>
                              <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" fontWeight={700}>{opt.budget_code}</Typography>
                                <Chip size="small" label={`$${balance.toLocaleString()}`}
                                  color={isLow ? 'warning' : 'success'} sx={{ height: 20, fontSize: '0.7rem' }} />
                              </Box>
                              <Typography variant="caption" color="text.secondary" display="block">{opt.budget_name}</Typography>
                              {opt.donor_name && (
                                <Typography variant="caption" color="text.disabled" display="block">
                                  {opt.donor_name}{opt.category ? ` \u00b7 ${opt.category}` : ''}
                                </Typography>
                              )}
                              <LinearProgress variant="determinate" value={utilPct}
                                color={isLow ? 'warning' : 'primary'} sx={{ mt: 0.5, height: 4, borderRadius: 2 }} />
                            </Box>
                          </li>
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" color="error" onClick={() => removeItem(item._key)} disabled={items.length === 1}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        <Divider sx={{ my: 2 }} />
        <Box display="flex" justifyContent="flex-end">
          <Box textAlign="right" sx={{ bgcolor: alpha(theme.palette.primary.main, 0.06), px: 3, py: 2, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" display="block" textTransform="uppercase" letterSpacing={1}>
              Total Estimated Amount
            </Typography>
            <Typography variant="h4" fontWeight={800} color="primary">
              ${totalEstimated.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Section 3: Supporting Documents */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="subtitle1" fontWeight={700} color="primary" mb={0.5}>
          Supporting Documents
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Attach photos of items, proforma quotations, specifications, or any other relevant documents.
        </Typography>

        <Box
          ref={dropRef}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            border: `2px dashed ${dragOver ? theme.palette.primary.main : theme.palette.divider}`,
            borderRadius: 2, p: 3, textAlign: 'center', cursor: 'pointer',
            bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.06) : 'grey.50',
            transition: 'all 0.2s', mb: 2,
            '&:hover': { borderColor: theme.palette.primary.main, bgcolor: alpha(theme.palette.primary.main, 0.04) }
          }}
        >
          <UploadIcon sx={{ fontSize: 40, color: dragOver ? 'primary.main' : 'text.disabled', mb: 1 }} />
          <Typography variant="body2" fontWeight={600} color={dragOver ? 'primary' : 'text.secondary'}>
            {dragOver ? 'Drop files here' : 'Click or drag & drop files here'}
          </Typography>
          <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
            PDF, Word, Excel, Images (JPEG, PNG) &middot; Max 10MB per file
          </Typography>
          <input ref={fileInputRef} type="file" multiple hidden
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.csv"
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
          />
        </Box>

        {pendingFiles.length > 0 ? (
          <List dense disablePadding>
            {pendingFiles.map(pf => (
              <ListItem key={pf._key} sx={{
                border: `1px solid ${theme.palette.divider}`, borderRadius: 1.5, mb: 1,
                bgcolor: 'background.paper', gap: 1, flexWrap: 'wrap',
                alignItems: 'flex-start', py: 1.5, pr: 6
              }}>
                <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>{getFileIcon(pf.file.type)}</ListItemIcon>
                <ListItemText
                  primary={<Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 280 }}>{pf.file.name}</Typography>}
                  secondary={formatFileSize(pf.file.size)}
                />
                <Box display="flex" gap={1} flexShrink={0}>
                  <TextField select size="small" label="Type" value={pf.attachment_type}
                    onChange={e => updatePendingFile(pf._key, 'attachment_type', e.target.value)}
                    sx={{ minWidth: 130 }}>
                    {ATTACHMENT_TYPES.map(t => (
                      <MenuItem key={t.value} value={t.value}>
                        <Stack direction="row" alignItems="center" gap={0.5}>{t.icon} {t.label}</Stack>
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField size="small" label="Description" value={pf.description}
                    onChange={e => updatePendingFile(pf._key, 'description', e.target.value)}
                    sx={{ minWidth: 200 }} placeholder="e.g. Photo of existing item" />
                </Box>
                <ListItemSecondaryAction>
                  <IconButton size="small" color="error" onClick={() => removePendingFile(pf._key)}>
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="caption" color="text.disabled" display="block" textAlign="center">
            No files selected yet
          </Typography>
        )}
      </Paper>

      {/* Actions */}
      <Box display="flex" gap={2} justifyContent="flex-end" flexWrap="wrap">
        <Button variant="text" color="inherit" onClick={() => navigate('/procurement/requests')}>
          Cancel
        </Button>
        <Button variant="outlined" color="primary" size="large"
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          onClick={handleSave} disabled={saving || submitting} sx={{ borderRadius: 2 }}>
          Save as Draft
        </Button>
        <Button variant="contained" color="primary" size="large"
          startIcon={submitting ? <CircularProgress size={16} /> : <SubmitIcon />}
          onClick={handleSubmit} disabled={saving || submitting || (overdueBlocked && !isEdit)}
          sx={{ borderRadius: 2, fontWeight: 700 }}>
          Save & Submit for Approval
        </Button>
      </Box>
    </Box>
  );
};

export default PurchaseRequestForm;
