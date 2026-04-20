/**
 * Request Form Component
 * Float Request with currency selection, admin routing, and file uploads
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  IconButton,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Chip,
  FormControlLabel,
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Send as SendIcon,
  CloudUpload as UploadIcon,
  AttachFile as FileIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { v4 as uuidv4 } from 'uuid';

import { BudgetLine, Priority, RequestFormData, RequestFormItem, Currency } from '../../types';
import { requestService } from '../../services/requestService';
import { budgetService } from '../../services/budgetService';
import { useAuthStore } from '../../store/authStore';

const generateId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const PRIORITY_OPTIONS: { value: Priority; label: string; color: 'default' | 'info' | 'warning' | 'error' }[] = [
  { value: 'LOW', label: 'Low', color: 'default' },
  { value: 'MEDIUM', label: 'Medium', color: 'info' },
  { value: 'HIGH', label: 'High', color: 'warning' },
  { value: 'URGENT', label: 'Urgent', color: 'error' }
];

const CURRENCY_OPTIONS: { value: Currency; label: string; symbol: string }[] = [
  { value: 'ZIG', label: 'ZIG (Zimbabwe Gold)', symbol: 'ZiG' },
  { value: 'USD', label: 'USD (US Dollar)', symbol: '$' }
];

const defaultItem: RequestFormItem = {
  id: '',
  itemDescription: '',
  totalCost: 0,
  budgetLineId: ''
};

const RequestForm: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<RequestFormData>({
    defaultValues: {
      justification: '',
      priority: 'MEDIUM',
      currency: 'USD',
      isAdminRequest: false,
      items: [{ ...defaultItem, id: uuidv4() || generateId() }],
      supportingDocuments: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  });

  const watchedItems = watch('items');
  const watchedCurrency = watch('currency');
  const watchedIsAdminRequest = watch('isAdminRequest');

  useEffect(() => {
    const fetchBudgetLines = async () => {
      if (!user?.department_id) return;
      try {
        setIsLoading(true);
        const response = await budgetService.getAll({ departmentId: user.department_id, isActive: true });
        if (response.success && response.data) {
          setBudgetLines(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch budget lines:', error);
        toast.error('Failed to load budget lines');
      } finally {
        setIsLoading(false);
      }
    };
    fetchBudgetLines();
  }, [user?.department_id]);

  const calculateGrandTotal = useCallback(() => {
    return watchedItems.reduce((sum, item) => sum + (item?.totalCost || 0), 0);
  }, [watchedItems]);

  const exceedsBudget = (item: RequestFormItem) => {
    if (!item.budgetLineId) return false;
    const budgetLine = budgetLines.find(bl => bl.id === item.budgetLineId);
    if (!budgetLine) return false;
    return (item.totalCost || 0) > budgetLine.balance;
  };

  const getBudgetBalance = (budgetLineId: number | '') => {
    if (!budgetLineId) return null;
    const budgetLine = budgetLines.find(bl => bl.id === budgetLineId);
    return budgetLine?.balance || 0;
  };

  const getCurrencySymbol = () => {
    return CURRENCY_OPTIONS.find(c => c.value === watchedCurrency)?.symbol || '$';
  };

  const handleAddItem = () => {
    append({ ...defaultItem, id: uuidv4() || generateId() });
  };

  const handleRemoveItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    } else {
      toast.warning('At least one item is required');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files);
      const validFiles = newFiles.filter(file => {
        const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        if (!validTypes.includes(file.type)) {
          toast.warning(`${file.name} is not a supported file type`);
          return false;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.warning(`${file.name} is too large (max 10MB)`);
          return false;
        }
        return true;
      });
      setUploadedFiles(prev => [...prev, ...validFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSaveDraft = async (data: RequestFormData) => {
    try {
      setIsSaving(true);
      const payload = {
        justification: data.justification,
        priority: data.priority,
        items: data.items.map(item => ({
          itemDescription: item.itemDescription,
          quantity: 1,
          unitOfMeasure: 'EACH',
          unitPrice: item.totalCost,
          budgetLineId: item.budgetLineId as number
        }))
      };
      const response = await requestService.create(payload);
      if (response.success) {
        toast.success(`Draft saved: ${response.data?.requestNumber}`);
        navigate('/requests');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndSubmit = async (data: RequestFormData) => {
    const hasOverage = data.items.some(item => exceedsBudget(item));
    if (hasOverage) {
      toast.error('Cannot submit: One or more items exceed budget balance');
      return;
    }
    try {
      setIsSubmitting(true);
      const payload = {
        justification: data.justification,
        priority: data.priority,
        items: data.items.map(item => ({
          itemDescription: item.itemDescription,
          quantity: 1,
          unitOfMeasure: 'EACH',
          unitPrice: item.totalCost,
          budgetLineId: item.budgetLineId as number
        }))
      };
      const createResponse = await requestService.create(payload);
      if (createResponse.success && createResponse.data) {
        const submitResponse = await requestService.submit(createResponse.data.requestId);
        if (submitResponse.success) {
          const approvalRoute = data.isAdminRequest 
            ? 'Admin -> Finance' 
            : 'Program Lead -> Head of Programs -> Finance';
          toast.success(`Request ${createResponse.data.requestNumber} submitted (${approvalRoute})`);
          navigate('/requests');
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
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
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Create Float Request
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Submit a new float request with supporting documents. Select currency and routing options.
        </Typography>
      </Paper>

      <form>
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Request Details</Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Currency *</InputLabel>
                    <Select {...field} label="Currency *">
                      {CURRENCY_OPTIONS.map(option => (
                        <MenuItem key={option.value} value={option.value}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography fontWeight="bold">{option.symbol}</Typography>
                            <Typography>{option.label}</Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Priority" fullWidth>
                    {PRIORITY_OPTIONS.map(option => (
                      <MenuItem key={option.value} value={option.value}>
                        <Chip label={option.label} color={option.color} size="small" sx={{ mr: 1 }} />
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Controller
                name="isAdminRequest"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Checkbox {...field} checked={field.value} color="primary" />}
                    label={
                      <Box>
                        <Typography variant="body1">Requesting from Admin</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Routes to Admin Approver first, then Finance
                        </Typography>
                      </Box>
                    }
                    sx={{ 
                      border: '1px solid',
                      borderColor: field.value ? 'primary.main' : 'divider',
                      borderRadius: 1, p: 1, m: 0,
                      backgroundColor: field.value ? 'primary.50' : 'transparent'
                    }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <Controller
                name="justification"
                control={control}
                rules={{ 
                  required: 'Justification is required',
                  minLength: { value: 20, message: 'Justification must be at least 20 characters' }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Justification / Purpose"
                    multiline
                    rows={3}
                    fullWidth
                    error={!!errors.justification}
                    helperText={errors.justification?.message || 'Explain the purpose and necessity'}
                  />
                )}
              />
            </Grid>
          </Grid>
          {watchedIsAdminRequest && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <strong>Admin Request:</strong> This request will route to Admin Approver first, then Finance.
            </Alert>
          )}
        </Paper>

        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Request Items ({watchedCurrency})</Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddItem}>Add Item</Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold', width: '5%' }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '45%' }}>Description *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>Total Cost ({getCurrencySymbol()}) *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>Budget Line *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '5%' }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map((field, index) => {
                  const item = watchedItems[index];
                  const balance = getBudgetBalance(item?.budgetLineId || '');
                  const isOverBudget = item ? exceedsBudget(item) : false;
                  return (
                    <TableRow 
                      key={field.id}
                      sx={{ 
                        backgroundColor: isOverBudget ? 'error.light' : 'inherit',
                        '&:hover': { backgroundColor: isOverBudget ? 'error.light' : 'grey.50' }
                      }}
                    >
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.itemDescription`}
                          control={control}
                          rules={{ required: 'Required' }}
                          render={({ field }) => (
                            <TextField {...field} size="small" fullWidth placeholder="Item description"
                              error={!!errors.items?.[index]?.itemDescription} />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.totalCost`}
                          control={control}
                          rules={{ required: 'Required', min: { value: 0.01, message: 'Min 0.01' } }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              type="number"
                              size="small"
                              fullWidth
                              inputProps={{ min: 0, step: 0.01 }}
                              error={!!errors.items?.[index]?.totalCost || isOverBudget}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              InputProps={{
                                startAdornment: <Typography variant="body2" sx={{ mr: 0.5 }}>{getCurrencySymbol()}</Typography>
                              }}
                            />
                          )}
                        />
                        {isOverBudget && (
                          <Typography variant="caption" color="error">
                            Exceeds budget (Balance: {getCurrencySymbol()}{balance?.toLocaleString()})
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.budgetLineId`}
                          control={control}
                          rules={{ required: 'Required' }}
                          render={({ field }) => (
                            <TextField {...field} select size="small" fullWidth error={!!errors.items?.[index]?.budgetLineId}>
                              <MenuItem value=""><em>Select budget line</em></MenuItem>
                              {budgetLines.map(bl => (
                                <MenuItem key={bl.id} value={bl.id} disabled={bl.balance <= 0}>
                                  <Box>
                                    <Typography variant="body2">{bl.budget_code}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Balance: {getCurrencySymbol()}{bl.balance.toLocaleString()}
                                    </Typography>
                                  </Box>
                                </MenuItem>
                              ))}
                            </TextField>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => handleRemoveItem(index)} disabled={fields.length === 1}>
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow sx={{ backgroundColor: 'primary.light' }}>
                  <TableCell colSpan={2} align="right">
                    <Typography variant="subtitle1" fontWeight="bold">Grand Total:</Typography>
                  </TableCell>
                  <TableCell colSpan={3}>
                    <Typography variant="h6" fontWeight="bold" color="primary.contrastText">
                      {getCurrencySymbol()}{calculateGrandTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          {watchedItems.some(item => exceedsBudget(item)) && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <strong>Budget Exceeded:</strong> One or more items exceed the available budget balance.
            </Alert>
          )}
        </Paper>

        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Supporting Documents</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Upload supporting documents (PDF, Word, Excel, Images). Max 10MB per file.
          </Typography>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
          />
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => fileInputRef.current?.click()} sx={{ mb: 2 }}>
            Upload Documents
          </Button>
          {uploadedFiles.length > 0 && (
            <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              {uploadedFiles.map((file, index) => (
                <ListItem key={index} divider={index < uploadedFiles.length - 1}>
                  <ListItemIcon><FileIcon color="primary" /></ListItemIcon>
                  <ListItemText primary={file.name} secondary={formatFileSize(file.size)} />
                  <ListItemSecondaryAction>
                    <IconButton edge="end" size="small" onClick={() => handleRemoveFile(index)}>
                      <CloseIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
          {uploadedFiles.length === 0 && (
            <Alert severity="info" icon={<FileIcon />}>
              No documents uploaded yet. Supporting documents are optional but recommended.
            </Alert>
          )}
        </Paper>

        <Paper elevation={2} sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Button variant="outlined" onClick={() => navigate('/requests')}>Cancel</Button>
            <Box>
              <Button
                variant="outlined"
                startIcon={isSaving ? <CircularProgress size={20} /> : <SaveIcon />}
                onClick={handleSubmit(handleSaveDraft)}
                disabled={isSaving || isSubmitting}
                sx={{ mr: 2 }}
              >
                Save as Draft
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                onClick={handleSubmit(handleSaveAndSubmit)}
                disabled={isSaving || isSubmitting || watchedItems.some(item => exceedsBudget(item))}
              >
                Save & Submit for Approval
              </Button>
            </Box>
          </Box>
        </Paper>
      </form>
    </Box>
  );
};

export default RequestForm;
