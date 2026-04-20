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
  ListItemSecondaryAction,
  Autocomplete
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

import { BudgetLine, Priority, RequestFormData, RequestFormItem, Currency, RequestCategory } from '../../types';
import { requestService } from '../../services/requestService';
import { budgetService } from '../../services/budgetService';
import donorService, { Donor } from '../../services/donorService';
import attachmentService from '../../services/attachmentService';
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

const CATEGORY_OPTIONS: { value: RequestCategory; label: string; description: string; defaultUnit: string }[] = [
  { value: 'PROCUREMENT', label: 'Procurement / Items', description: 'Purchase of goods, supplies or equipment', defaultUnit: 'EACH' },
  { value: 'TRANSPORT', label: 'Transport', description: 'Travel costs, fuel, vehicle hire', defaultUnit: 'TRIP' },
  { value: 'ACCOMMODATION', label: 'Accommodation', description: 'Hotel, lodging, housing costs', defaultUnit: 'NIGHT' },
  { value: 'REIMBURSEMENT', label: 'Reimbursement', description: 'Reimbursement for stakeholders or staff', defaultUnit: 'LUMPSUM' },
  { value: 'PER_DIEM', label: 'Per Diem / Allowances', description: 'Daily allowances, per diem for field staff', defaultUnit: 'DAY' },
  { value: 'TRAINING', label: 'Training / Workshop', description: 'Training costs, workshop facilitation', defaultUnit: 'SESSION' },
  { value: 'MAINTENANCE', label: 'Maintenance / Repairs', description: 'Equipment repairs, service costs', defaultUnit: 'SERVICE' },
  { value: 'OTHER', label: 'Other', description: 'Any other expenditure type', defaultUnit: 'EACH' }
];

const UNIT_OF_MEASURE_OPTIONS = [
  'EACH', 'TRIP', 'NIGHT', 'DAY', 'LUMPSUM', 'SESSION', 'SERVICE', 'KG', 'LITRE', 'BOX', 'ROLL', 'SET', 'PACK', 'PERSON', 'MONTH', 'HOUR'
];

const defaultItem: RequestFormItem = {
  id: '',
  category: 'PROCUREMENT',
  itemDescription: '',
  quantity: 1,
  unitOfMeasure: 'EACH',
  unitPrice: 0,
  totalCost: 0,
  budgetLineId: '',
  notes: ''
};

const RequestForm: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [selectedDonors, setSelectedDonors] = useState<number[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  // Multi-donor support: budget lines keyed by donor ID
  const [donorBudgetLines, setDonorBudgetLines] = useState<Record<number, BudgetLine[]>>({});
  const [allBudgetLines, setAllBudgetLines] = useState<BudgetLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
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

  // Fetch active donors on mount
  useEffect(() => {
    const fetchDonors = async () => {
      try {
        const activeDonors = await donorService.getActiveDonors();
        setDonors(activeDonors);
        // Pre-load budget lines for all active donors (multi-donor support)
        const donorBLMap: Record<number, BudgetLine[]> = {};
        let allBLs: BudgetLine[] = [];
        for (const donor of activeDonors) {
          try {
            const response = await donorService.getBudgetLinesByDonor(donor.id, { is_active: true });
            if (response.success && response.data) {
              donorBLMap[donor.id] = response.data;
              allBLs = [...allBLs, ...response.data];
            }
          } catch (err) {
            console.error(`Failed to fetch budget lines for donor ${donor.id}`, err);
          }
        }
        // Also load all budget lines (including those without donors)
        try {
          const { budgetService } = await import('../../services/budgetService');
          const blResponse = await budgetService.getAll({ isActive: true });
          if (blResponse.success && blResponse.data) {
            // Merge: add any budget lines not already in allBLs
            const existingIds = new Set(allBLs.map(bl => bl.id));
            const additional = blResponse.data.filter((bl: BudgetLine) => !existingIds.has(bl.id));
            allBLs = [...allBLs, ...additional];
          }
        } catch (err) {
          console.error('Failed to fetch all budget lines:', err);
        }
        setDonorBudgetLines(donorBLMap);
        setAllBudgetLines(allBLs);
      } catch (error) {
        console.error('Failed to fetch donors:', error);
        toast.error('Failed to load donors');
      }
    };
    fetchDonors();
  }, []);

  // Fetch budget lines when donors are selected (multi-donor filtering)
  useEffect(() => {
    if (selectedDonors.length === 0) {
      setBudgetLines(allBudgetLines);
      return;
    }
    // Combine budget lines from all selected donors
    const combined: BudgetLine[] = [];
    const seenIds = new Set<number>();
    for (const donorId of selectedDonors) {
      const lines = donorBudgetLines[donorId] || [];
      for (const bl of lines) {
        if (!seenIds.has(bl.id)) {
          seenIds.add(bl.id);
          combined.push(bl);
        }
      }
    }
    setBudgetLines(combined);
  }, [selectedDonors, donorBudgetLines, allBudgetLines]);

  const calculateGrandTotal = useCallback(() => {
    return watchedItems.reduce((sum, item) => sum + ((item?.quantity || 1) * (item?.unitPrice || 0)), 0);
  }, [watchedItems]);

  const exceedsBudget = (item: RequestFormItem) => {
    if (!item.budgetLineId) return false;
    const budgetLine = allBudgetLines.find(bl => bl.id === item.budgetLineId);
    if (!budgetLine) return false;
    const itemTotal = (item.quantity || 1) * (item.unitPrice || 0);
    return itemTotal > budgetLine.balance;
  };

  const getBudgetBalance = (budgetLineId: number | '') => {
    if (!budgetLineId) return null;
    const budgetLine = allBudgetLines.find(bl => bl.id === budgetLineId);
    return budgetLine?.balance || 0;
  };

  // Helper: determine donor from the first item's budget line
  const getDonorFromItems = (items: RequestFormItem[]): number | null => {
    if (!items || items.length === 0) return null;
    const firstBLId = items[0]?.budgetLineId;
    if (!firstBLId) return null;
    const bl = allBudgetLines.find(b => b.id === firstBLId);
    return bl?.donor_id || null;
  };

  const getCurrencySymbol = () => {
    return CURRENCY_OPTIONS.find(c => c.value === watchedCurrency)?.symbol || '$';
  };

  const handleAddItem = () => {
    append({ 
      ...defaultItem, 
      id: uuidv4() || generateId(),
      category: 'PROCUREMENT',
      unitOfMeasure: 'EACH'
    });
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
    // Determine donor from first item's budget line if not explicitly selected
    const effectiveDonorId = (selectedDonors.length === 1 ? selectedDonors[0] : null) || getDonorFromItems(data.items);
    try {
      setIsSaving(true);
      const payload = {
        justification: data.justification,
        priority: data.priority,
        donor_id: effectiveDonorId,
        items: data.items.map(item => ({
          itemDescription: item.itemDescription,
          category: item.category || 'PROCUREMENT',
          quantity: item.quantity || 1,
          unitOfMeasure: item.unitOfMeasure || 'EACH',
          unitPrice: item.unitPrice || 0,
          budgetLineId: item.budgetLineId as number,
          notes: item.notes || undefined
        }))
      };
      const response = await requestService.create(payload);
      if (response.success && response.data) {
        // Upload attachments if any
        if (uploadedFiles.length > 0) {
          try {
            await attachmentService.uploadMultipleAttachments(
              uploadedFiles,
              'QUOTATION',
              'REQUEST',
              response.data.requestId,
              'Supporting documents for request'
            );
          } catch (uploadError) {
            console.error('Failed to upload attachments:', uploadError);
            toast.warning('Draft saved but some attachments failed to upload');
          }
        }
        toast.success(`Draft saved: ${response.data?.requestCode}`);
        navigate('/finance/requests');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndSubmit = async (data: RequestFormData) => {
    const effectiveDonorId = (selectedDonors.length === 1 ? selectedDonors[0] : null) || getDonorFromItems(data.items);
    const hasOverage = data.items.some(item => exceedsBudget(item));
    if (hasOverage) {
      toast.error('Cannot submit: One or more items exceed budget balance');
      return;
    }

    // Validate all items have descriptions & prices
    const hasInvalid = data.items.some(item => !item.itemDescription || !item.unitPrice);
    if (hasInvalid) {
      toast.error('All items must have a description and unit price');
      return;
    }
    try {
      setIsSubmitting(true);
      const payload = {
        justification: data.justification,
        priority: data.priority,
        donor_id: effectiveDonorId,
        items: data.items.map(item => ({
          itemDescription: item.itemDescription,
          category: item.category || 'PROCUREMENT',
          quantity: item.quantity || 1,
          unitOfMeasure: item.unitOfMeasure || 'EACH',
          unitPrice: item.unitPrice || 0,
          budgetLineId: item.budgetLineId as number,
          notes: item.notes || undefined
        }))
      };
      const createResponse = await requestService.create(payload);
      if (createResponse.success && createResponse.data) {
        // Upload attachments if any
        if (uploadedFiles.length > 0) {
          try {
            await attachmentService.uploadMultipleAttachments(
              uploadedFiles,
              'QUOTATION',
              'REQUEST',
              createResponse.data.requestId,
              'Supporting documents for request'
            );
          } catch (uploadError) {
            console.error('Failed to upload attachments:', uploadError);
            toast.warning('Request created but some attachments failed to upload');
          }
        }
        
        const submitResponse = await requestService.submit(createResponse.data.requestId);
        if (submitResponse.success) {
          const approvalRoute = data.isAdminRequest 
            ? 'Admin -> Finance' 
            : 'Program Lead or Head of Programs -> Finance';
          toast.success(`Request ${createResponse.data.requestCode} submitted (${approvalRoute})`);
          navigate('/finance/requests');
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
          <Grid container spacing={3}>            {/* Donor Selection - Multi-select to filter budget lines */}
            <Grid item xs={12}>
              <Autocomplete
                multiple
                options={donors}
                getOptionLabel={(donor) => `${donor.donor_name} (${donor.donor_code})`}
                value={donors.filter(d => selectedDonors.includes(d.id))}
                onChange={(_, newValue) => setSelectedDonors(newValue.map(d => d.id))}
                disableCloseOnSelect
                renderOption={(props, donor, { selected }) => (
                  <li {...props}>
                    <Checkbox checked={selected} sx={{ mr: 1 }} />
                    <Box>
                      <Typography variant="body1">{donor.donor_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {donor.donor_code} | {donor.currency_code} | FY{donor.fiscal_year}
                        {donorBudgetLines[donor.id] ? ` | ${donorBudgetLines[donor.id].length} budget line(s)` : ''}
                      </Typography>
                    </Box>
                  </li>
                )}
                renderTags={(value, getTagProps) =>
                  value.map((donor, index) => (
                    <Chip
                      {...getTagProps({ index })}
                      key={donor.id}
                      label={`${donor.donor_name} (${donor.donor_code})`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Filter by Donor(s) (Optional)"
                    placeholder={selectedDonors.length === 0 ? "Select one or more donors to filter budget lines..." : ""}
                  />
                )}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Select one or more donors to filter budget lines. Leave empty to see all budget lines.
              </Typography>
            </Grid>
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
          {selectedDonors.length > 0 && (
            <Alert severity="success" sx={{ mt: 2 }}>
              <strong>Filtering by {selectedDonors.length} Donor(s):</strong>{' '}
              {selectedDonors.map(id => donors.find(d => d.id === id)?.donor_name).filter(Boolean).join(', ')} — {budgetLines.length} budget line(s) shown.
            </Alert>
          )}
          {selectedDonors.length === 0 && allBudgetLines.length > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <strong>Multi-Donor Mode:</strong> Showing all {allBudgetLines.length} budget lines across {donors.length} donors.
              Each line item can be assigned to a different donor's budget line.
            </Alert>
          )}
        </Paper>

        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Box>
              <Typography variant="h6">
                Request Items ({watchedCurrency})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Each item can have a different category (Procurement, Transport, Accommodation, Per Diem, etc.)
              </Typography>
            </Box>
            <Button 
              variant="outlined" 
              startIcon={<AddIcon />} 
              onClick={handleAddItem}
              disabled={allBudgetLines.length === 0}
            >
              Add Item
            </Button>
          </Box>
          {allBudgetLines.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No budget lines available. Please contact Finance to set up budget lines.
            </Alert>
          )}
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="medium" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold', width: 50, px: 1 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', minWidth: 150, px: 1.5 }}>Category *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', minWidth: 220, px: 1.5 }}>Description *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', minWidth: 90, px: 1.5 }}>Qty *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', minWidth: 100, px: 1.5 }}>Unit</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', minWidth: 140, px: 1.5 }}>Unit Price ({getCurrencySymbol()}) *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', minWidth: 130, px: 1.5 }}>Total ({getCurrencySymbol()})</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', minWidth: 180, px: 1.5 }}>Budget Line *</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 50, px: 1 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map((field, index) => {
                  const item = watchedItems[index];
                  const balance = getBudgetBalance(item?.budgetLineId || '');
                  const itemTotal = (item?.quantity || 1) * (item?.unitPrice || 0);
                  const isOverBudget = item ? exceedsBudget(item) : false;
                  return (
                    <TableRow 
                      key={field.id}
                      sx={{ 
                        backgroundColor: isOverBudget ? 'error.light' : 'inherit',
                        '&:hover': { backgroundColor: isOverBudget ? 'error.light' : 'grey.50' },
                        '& td': { px: 1.5, py: 1.5 }
                      }}
                    >
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.category`}
                          control={control}
                          rules={{ required: 'Required' }}
                          render={({ field: catField }) => (
                            <TextField
                              {...catField}
                              select
                              size="small"
                              fullWidth
                              onChange={(e) => {
                                catField.onChange(e.target.value);
                                const catOption = CATEGORY_OPTIONS.find(c => c.value === e.target.value);
                                if (catOption) {
                                  setValue(`items.${index}.unitOfMeasure`, catOption.defaultUnit);
                                }
                              }}
                            >
                              {CATEGORY_OPTIONS.map(cat => (
                                <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>
                              ))}
                            </TextField>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.itemDescription`}
                          control={control}
                          rules={{ required: 'Required' }}
                          render={({ field }) => (
                            <TextField {...field} size="small" fullWidth 
                              placeholder={item?.category === 'TRANSPORT' ? 'e.g. Fuel for field visit to Gweru' : 
                                          item?.category === 'ACCOMMODATION' ? 'e.g. Hotel accommodation - Bulawayo' : 
                                          item?.category === 'REIMBURSEMENT' ? 'e.g. Reimbursement for workshop refreshments' :
                                          item?.category === 'PER_DIEM' ? 'e.g. Per diem for 3-day field trip' :
                                          'Item description'}
                              error={!!errors.items?.[index]?.itemDescription} />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.quantity`}
                          control={control}
                          rules={{ required: 'Required', min: { value: 0.01, message: 'Min 0.01' } }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              type="number"
                              size="small"
                              fullWidth
                              inputProps={{ min: 0.01, step: 0.01 }}
                              sx={{ 
                                '& input': { textAlign: 'center', minWidth: '40px', px: 1 },
                                '& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button': {
                                  opacity: 1
                                }
                              }}
                              error={!!errors.items?.[index]?.quantity}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 1)}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.unitOfMeasure`}
                          control={control}
                          render={({ field }) => (
                            <TextField {...field} select size="small" fullWidth>
                              {UNIT_OF_MEASURE_OPTIONS.map(unit => (
                                <MenuItem key={unit} value={unit}>{unit}</MenuItem>
                              ))}
                            </TextField>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.unitPrice`}
                          control={control}
                          rules={{ required: 'Required', min: { value: 0.01, message: 'Min 0.01' } }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              type="number"
                              size="small"
                              fullWidth
                              inputProps={{ min: 0, step: 0.01 }}
                              error={!!errors.items?.[index]?.unitPrice || isOverBudget}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              InputProps={{
                                startAdornment: <Typography variant="body2" sx={{ mr: 0.5 }}>{getCurrencySymbol()}</Typography>
                              }}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} sx={{ py: 1 }}>
                          {getCurrencySymbol()}{itemTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Typography>
                        {isOverBudget && (
                          <Typography variant="caption" color="error">
                            Exceeds budget (Bal: {getCurrencySymbol()}{balance?.toLocaleString()})
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.budgetLineId`}
                          control={control}
                          rules={{ required: 'Required' }}
                          render={({ field }) => {
                            const availableLines = selectedDonors.length > 0 ? budgetLines : allBudgetLines;
                            const selectedBL = availableLines.find(bl => bl.id === field.value) || null;
                            return (
                              <Autocomplete
                                size="small"
                                options={availableLines}
                                value={selectedBL}
                                onChange={(_, newValue) => field.onChange(newValue ? newValue.id : '')}
                                getOptionLabel={(bl) =>
                                  `${bl.donor_code ? `[${bl.donor_code}] ` : ''}${bl.budget_code} - ${bl.budget_name}`
                                }
                                getOptionDisabled={(bl) => bl.balance <= 0}
                                filterOptions={(options, { inputValue }) => {
                                  const search = inputValue.toLowerCase();
                                  return options.filter(bl =>
                                    (bl.budget_code?.toLowerCase().includes(search)) ||
                                    (bl.budget_name?.toLowerCase().includes(search)) ||
                                    (bl.donor_code?.toLowerCase().includes(search))
                                  );
                                }}
                                renderOption={(props, bl) => (
                                  <li {...props} key={bl.id}>
                                    <Box>
                                      <Typography variant="body2">
                                        {bl.donor_code ? `[${bl.donor_code}] ` : ''}{bl.budget_code}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {bl.budget_name} | Bal: {getCurrencySymbol()}{bl.balance?.toLocaleString()}
                                      </Typography>
                                    </Box>
                                  </li>
                                )}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Search budget line..."
                                    error={!!errors.items?.[index]?.budgetLineId}
                                  />
                                )}
                                isOptionEqualToValue={(option, value) => option.id === value.id}
                                noOptionsText="No matching budget lines"
                                sx={{ minWidth: 250 }}
                              />
                            );
                          }}
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
                  <TableCell colSpan={6} align="right">
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
          <Typography variant="h6" gutterBottom>Quotations & Supporting Documents</Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Upload quotations and supporting documents (PDF, Word, Excel, Images). Max 10MB per file.
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
              No documents uploaded yet. Quotations are strongly recommended for procurement requests.
            </Alert>
          )}
        </Paper>

        <Paper elevation={2} sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Button variant="outlined" onClick={() => navigate('/finance/requests')}>Cancel</Button>
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
