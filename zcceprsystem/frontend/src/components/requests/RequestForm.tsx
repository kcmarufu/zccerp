/**
 * Request Form Component
 * Float Request with currency selection, admin routing, and file uploads
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Close as CloseIcon,
  FlightTakeoff as TripIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { v4 as uuidv4 } from 'uuid';

import {
  BudgetLine, RequestFormData, RequestFormItem, Currency, RequestCategory, Project,
  PerDiemClaimFormData, PerDiemRates
} from '../../types';
import { requestService } from '../../services/requestService';
import { budgetService } from '../../services/budgetService';
import donorService, { Donor } from '../../services/donorService';
import projectService from '../../services/projectService';
import attachmentService from '../../services/attachmentService';
import perDiemService from '../../services/perDiemService';
import { reconciliationService } from '../../services/reconciliationService';
import TravelClaimSection from './TravelClaimSection';
import { useAuthStore } from '../../store/authStore';

const generateId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const CURRENCY_OPTIONS: { value: Currency; label: string; symbol: string }[] = [
  { value: 'ZIG', label: 'ZIG (Zimbabwe Gold)', symbol: 'ZiG' },
  { value: 'USD', label: 'USD (US Dollar)', symbol: '$' }
];

const CATEGORY_OPTIONS: { value: RequestCategory; label: string; description: string; defaultUnit: string }[] = [
  // Core float categories
  { value: 'PROCUREMENT',         label: 'Procurement / Items',            description: 'Purchase of goods, supplies or equipment',                     defaultUnit: 'EACH'     },
  { value: 'TRANSPORT',           label: 'Transport',                      description: 'Travel costs, fuel, vehicle hire',                              defaultUnit: 'TRIP'     },
  { value: 'ACCOMMODATION',       label: 'Accommodation',                  description: 'Hotel, lodging, housing costs',                                 defaultUnit: 'NIGHT'    },
  { value: 'REIMBURSEMENT',       label: 'Reimbursement',                  description: 'Reimbursement for stakeholders or staff',                       defaultUnit: 'LUMPSUM'  },
  { value: 'PER_DIEM',            label: 'Per Diem / Allowances',          description: 'Daily allowances, per diem for field staff',                    defaultUnit: 'DAY'      },
  { value: 'TRAINING',            label: 'Training / Workshop',            description: 'Training costs, workshop facilitation',                         defaultUnit: 'SESSION'  },
  { value: 'MAINTENANCE',         label: 'Maintenance / Repairs',          description: 'Equipment repairs, service costs',                              defaultUnit: 'SERVICE'  },
  // NGO-specific categories
  { value: 'CAPACITY_BUILDING',   label: 'Capacity Building',              description: 'Staff capacity strengthening, institutional development',       defaultUnit: 'SESSION'  },
  { value: 'COMMUNITY_OUTREACH',  label: 'Community Outreach',             description: 'Community mobilisation, awareness campaigns',                   defaultUnit: 'EVENT'    },
  { value: 'FIELD_OPERATIONS',    label: 'Field Operations & Logistics',   description: 'Field mission costs, operational logistics',                    defaultUnit: 'TRIP'     },
  { value: 'MEAL',                label: 'Monitoring, Evaluation & Learning (MEAL)', description: 'M&E activities, data collection, surveys',             defaultUnit: 'ACTIVITY' },
  { value: 'RESEARCH',            label: 'Research & Documentation',       description: 'Research, reporting, documentation costs',                      defaultUnit: 'LUMPSUM'  },
  { value: 'ADVOCACY',            label: 'Advocacy & Communications',      description: 'Advocacy campaigns, media, publications',                       defaultUnit: 'LUMPSUM'  },
  { value: 'BENEFICIARY_SUPPORT', label: 'Beneficiary Support',            description: 'Direct support to beneficiaries, cash transfers',               defaultUnit: 'PERSON'   },
  { value: 'IT_SYSTEMS',          label: 'IT & Systems',                   description: 'Technology, software, ICT equipment',                           defaultUnit: 'EACH'     },
  { value: 'OFFICE_SUPPLIES',     label: 'Office Supplies & Consumables',  description: 'Stationery, consumables, printing',                             defaultUnit: 'EACH'     },
  { value: 'UTILITIES',           label: 'Utilities & Internet',           description: 'Electricity, water, internet bills',                            defaultUnit: 'MONTH'    },
  { value: 'VEHICLE_FLEET',       label: 'Vehicle Fleet',                  description: 'Vehicle maintenance, fuel, fleet management',                   defaultUnit: 'SERVICE'  },
  { value: 'SECURITY',            label: 'Security Services',              description: 'Security guarding, surveillance, alarms',                       defaultUnit: 'MONTH'    },
  { value: 'STAFF_WELFARE',       label: 'Staff Welfare',                  description: 'Staff wellbeing, medical, team-building',                       defaultUnit: 'LUMPSUM'  },
  { value: 'AUDIT_COMPLIANCE',    label: 'Audit & Compliance',             description: 'External audits, compliance reviews',                           defaultUnit: 'SERVICE'  },
  { value: 'LEGAL_CONSULTANCY',   label: 'Legal & Consultancy',            description: 'Legal fees, professional consultancy',                          defaultUnit: 'SERVICE'  },
  { value: 'SUBSCRIPTIONS',       label: 'Subscriptions & Memberships',    description: 'Annual subscriptions, membership fees',                         defaultUnit: 'YEAR'     },
  { value: 'OTHER',               label: 'Other',                          description: 'Any other expenditure type',                                    defaultUnit: 'EACH'     }
];

const UNIT_OF_MEASURE_OPTIONS = [
  'EACH', 'TRIP', 'NIGHT', 'DAY', 'LUMPSUM', 'SESSION', 'SERVICE', 'KG', 'LITRE',
  'BOX', 'ROLL', 'SET', 'PACK', 'PERSON', 'MONTH', 'HOUR', 'EVENT', 'ACTIVITY', 'YEAR'
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
  const { requestId } = useParams<{ requestId: string }>();
  const { user } = useAuthStore();
  const isEditMode = Boolean(requestId);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [selectedDonorId, setSelectedDonorId] = useState<number | ''>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [loadingBudgetLines, setLoadingBudgetLines] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [crossDeptWarning, setCrossDeptWarning] = useState<string | null>(null);
  const [overdueBlocked, setOverdueBlocked] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingProjectId = useRef<number | null>(null);

  // ── Per Diem Claim state ──────────────────────────────────────────────────
  const [hasPerDiemClaim, setHasPerDiemClaim] = useState(false);
  const [perDiemRates, setPerDiemRates] = useState<PerDiemRates>({ breakfast: 10, lunch: 10, dinner: 10, overnight: 70, accommodation: 100 });
  const [perDiemClaimData, setPerDiemClaimData] = useState<PerDiemClaimFormData>({
    full_name: '',
    designation: '',
    project_id: null,
    strategic_focus: '',
    budget_line_id: null,
    less_outstanding_advance: 0,
    trip_items: [],
    cost_distribution: [],
  });

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors }
  } = useForm<RequestFormData>({
    defaultValues: {
      justification: '',
      currency: 'USD',
      isAdminRequest: false,
      items: [{ ...defaultItem, id: uuidv4() || generateId() }],
      supportingDocuments: []
    }
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'items'
  });

  const watchedItems = watch('items');
  const watchedCurrency = watch('currency');
  const watchedIsAdminRequest = watch('isAdminRequest');

  // Fetch active donors + per diem rates on mount
  useEffect(() => {
    donorService.getActiveDonors()
      .then(setDonors)
      .catch(() => toast.error('Failed to load partners'));
    perDiemService.getRates()
      .then(setPerDiemRates)
      .catch(() => { /* use defaults silently */ });
  }, []);

  // Check overdue reconciliation compliance (only for new requests, not edit mode)
  useEffect(() => {
    if (!isEditMode) {
      reconciliationService.getOverdueCheck()
        .then(res => {
          setOverdueCount(res.overdueCount);
          setOverdueBlocked(res.isBlocked);
        })
        .catch(() => { /* allow creation if check fails */ });
    }
  }, [isEditMode]);

  // When "Requesting from Admin" is toggled, auto-select the Admin partner
  // (donor_type === 'ADMIN') and its first project, locking those dropdowns.
  // When unticked, reset partner/project so the user can pick freely.
  useEffect(() => {
    if (watchedIsAdminRequest) {
      const adminDonor = donors.find(d => (d as any).donor_type === 'ADMIN');
      if (adminDonor) {
        setSelectedDonorId(adminDonor.id);
      } else {
        toast.warning('Admin partner not found. Please contact Finance to set it up.');
      }
    } else {
      // Only clear if the currently selected donor is Admin
      const adminDonor = donors.find(d => (d as any).donor_type === 'ADMIN');
      if (adminDonor && selectedDonorId === adminDonor.id) {
        setSelectedDonorId('');
        setSelectedProject(null);
        setProjects([]);
        setBudgetLines([]);
      }
    }
  }, [watchedIsAdminRequest, donors]);

  // When donor changes, fetch its projects and clear downstream
  useEffect(() => {
    setSelectedProject(null);
    setProjects([]);
    setBudgetLines([]);
    if (!selectedDonorId) return;
    setLoadingProjects(true);
    projectService.getProjectsByDonor(Number(selectedDonorId))
      .then((loaded) => {
        setProjects(loaded);
        // Auto-select the single project when Admin is chosen
        if (watchedIsAdminRequest && loaded.length === 1) {
          setSelectedProject(loaded[0]);
        }
      })
      .catch(() => toast.error('Failed to load projects for this partner'))
      .finally(() => setLoadingProjects(false));
  }, [selectedDonorId]);

  // When project changes, fetch its budget lines and check for cross-dept routing
  useEffect(() => {
    setBudgetLines([]);
    setCrossDeptWarning(null);
    if (!selectedProject) return;

    // Cross-department warning
    if (
      selectedProject.department_id &&
      user?.department_id &&
      selectedProject.department_id !== user.department_id
    ) {
      const ownerDept = selectedProject.department_name || `Department ID ${selectedProject.department_id}`;
      setCrossDeptWarning(
        `This project is not assigned to your department. Your request will be routed to the HOP/Lead of the ${ownerDept} department for approval.`
      );
    }

    setLoadingBudgetLines(true);
    projectService.getProjectBudgetLines(selectedProject.id, { is_active: true })
      .then(setBudgetLines)
      .catch(() => toast.error('Failed to load budget lines'))
      .finally(() => setLoadingBudgetLines(false));
  }, [selectedProject, user?.department_id]);

  // When projects load in edit mode, auto-select the pending project
  useEffect(() => {
    if (projects.length > 0 && pendingProjectId.current) {
      const found = projects.find(p => p.id === pendingProjectId.current);
      if (found) setSelectedProject(found);
      pendingProjectId.current = null;
    }
  }, [projects]);

  // Preload existing request when in edit mode.
  useEffect(() => {
    if (!isEditMode || !requestId) {
      return;
    }

    const loadRequest = async () => {
      try {
        setIsLoading(true);
        const response = await requestService.getById(Number(requestId));
        if (!response.success || !response.data) {
          toast.error('Failed to load request for editing');
          navigate('/finance/requests');
          return;
        }

        const data: any = response.data;
        const request = data.request || data;
        const items = (data.items || request.items || []).map((item: any) => ({
          id: uuidv4() || generateId(),
          category: item.category || 'PROCUREMENT',
          itemDescription: item.itemDescription || item.item_description || item.description || '',
          quantity: Number(item.quantity || 1),
          unitOfMeasure: item.unitOfMeasure || item.unit_of_measure || 'EACH',
          unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
          totalCost: Number(item.subtotal ?? item.total_price ?? 0),
          budgetLineId: Number(item.budgetLineId ?? item.budget_line_id ?? '') || '',
          notes: item.notes || ''
        }));

        if (!['DRAFT', 'REJECTED'].includes(request.status)) {
          toast.error('Only draft or rejected requests can be edited');
          navigate(`/finance/requests/${requestId}`);
          return;
        }

        if (Number(request.requester_id) !== Number(user?.id)) {
          toast.error('You can only edit your own requests');
          navigate(`/finance/requests/${requestId}`);
          return;
        }

        setExistingStatus(request.status);
        reset({
          justification: request.justification || '',
          currency: 'USD',
          isAdminRequest: false,
          items: items.length > 0 ? items : [{ ...defaultItem, id: uuidv4() || generateId() }],
          supportingDocuments: []
        });

        replace(items.length > 0 ? items : [{ ...defaultItem, id: uuidv4() || generateId() }]);

        if (request.donor_id) {
          setSelectedDonorId(Number(request.donor_id));
          if (request.project_id) pendingProjectId.current = Number(request.project_id);
        }

        // Load existing per diem claim if present
        if (request.has_per_diem_claim) {
          setHasPerDiemClaim(true);
          try {
            const claim = await perDiemService.getClaim(Number(requestId));
            if (claim) {
              setPerDiemClaimData({
                full_name: claim.full_name,
                designation: claim.designation,
                project_id: claim.project_id,
                strategic_focus: claim.strategic_focus || '',
                budget_line_id: claim.budget_line_id,
                less_outstanding_advance: claim.less_outstanding_advance,
                trip_items: claim.trip_items.map(t => ({ ...t, id: String(t.id) })),
                cost_distribution: claim.cost_distribution.map(d => ({ ...d, id: String(d.id) })),
              });
            }
          } catch (e) { /* claim may not exist yet */ }
        }
      } catch (error) {
        toast.error('Failed to load request for editing');
        navigate('/finance/requests');
      } finally {
        setIsLoading(false);
      }
    };

    loadRequest();
  }, [isEditMode, requestId, reset, replace, navigate, user?.id]);

  const calculateGrandTotal = useCallback(() => {
    return watchedItems.reduce((sum, item) => sum + ((item?.quantity || 1) * (item?.unitPrice || 0)), 0);
  }, [watchedItems]);

  const exceedsBudget = (item: RequestFormItem) => {
    if (!item.budgetLineId) return false;
    const budgetLine = budgetLines.find(bl => bl.id === item.budgetLineId);
    if (!budgetLine) return false;
    const itemTotal = (item.quantity || 1) * (item.unitPrice || 0);
    return itemTotal > budgetLine.balance;
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
        if (file.size > 8 * 1024 * 1024) {
          toast.warning(`${file.name} is too large (max 8MB)`);
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

  // ── Shared per-diem save helper ───────────────────────────────────────────
  const savePerDiemIfNeeded = async (resolvedRequestId: number) => {
    if (hasPerDiemClaim) {
      await perDiemService.upsertClaim(resolvedRequestId, perDiemClaimData);
    } else {
      // If user unchecked the toggle, remove any existing claim
      try { await perDiemService.deleteClaim(resolvedRequestId); } catch (_) { /* no claim to delete */ }
    }
  };

  const buildPayload = (data: RequestFormData) => ({
    justification: data.justification,
    donor_id: Number(selectedDonorId),
    project_id: selectedProject!.id,
    items: data.items.map(item => ({
      itemDescription: item.itemDescription,
      category: item.category || 'PROCUREMENT',
      quantity: item.quantity || 1,
      unitOfMeasure: item.unitOfMeasure || 'EACH',
      unitPrice: item.unitPrice || 0,
      budgetLineId: item.budgetLineId as number,
      notes: item.notes || undefined
    }))
  });

  const handleSaveDraft = async (data: RequestFormData) => {
    if (!selectedDonorId) { toast.error('Please select a partner'); return; }
    if (!selectedProject) { toast.error('Please select a project'); return; }
    try {
      setIsSaving(true);
      const payload = buildPayload(data);
      if (isEditMode && requestId) {
        const updateResponse = await requestService.update(Number(requestId), payload);
        if (updateResponse.success) {
          if (uploadedFiles.length > 0) {
            try {
              await attachmentService.uploadMultipleAttachments(
                uploadedFiles, 'QUOTATION', 'REQUEST', Number(requestId), 'Supporting documents for request'
              );
            } catch { toast.warning('Request updated but some attachments failed to upload'); }
          }
          await savePerDiemIfNeeded(Number(requestId));
          toast.success('Request saved successfully');
          navigate(`/finance/requests/${requestId}`);
        }
      } else {
        const createResponse = await requestService.create(payload);
        if (createResponse.success && createResponse.data) {
          if (uploadedFiles.length > 0) {
            try {
              await attachmentService.uploadMultipleAttachments(
                uploadedFiles, 'QUOTATION', 'REQUEST', createResponse.data.requestId, 'Supporting documents for request'
              );
            } catch { toast.warning('Request created but some attachments failed to upload'); }
          }
          await savePerDiemIfNeeded(createResponse.data.requestId);
          toast.success(`Request ${createResponse.data.requestCode} saved as draft`);
          navigate('/finance/requests');
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save request');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndSubmit = async (data: RequestFormData) => {
    if (!selectedDonorId) { toast.error('Please select a partner'); return; }
    if (!selectedProject) { toast.error('Please select a project'); return; }
    try {
      setIsSubmitting(true);
      const payload = buildPayload(data);
      if (isEditMode && requestId) {
        const updateResponse = await requestService.update(Number(requestId), payload);
        if (updateResponse.success) {
          if (uploadedFiles.length > 0) {
            try {
              await attachmentService.uploadMultipleAttachments(
                uploadedFiles, 'QUOTATION', 'REQUEST', Number(requestId), 'Supporting documents for request'
              );
            } catch { toast.warning('Request updated but some attachments failed to upload'); }
          }
          await savePerDiemIfNeeded(Number(requestId));
          const submitResponse = await requestService.submit(Number(requestId));
          if (submitResponse.success) {
            toast.success(existingStatus === 'REJECTED' ? 'Request edited and resubmitted successfully' : 'Request submitted successfully');
            navigate(`/finance/requests/${requestId}`);
          }
        }
      } else {
        const createResponse = await requestService.create(payload);
        if (createResponse.success && createResponse.data) {
          if (uploadedFiles.length > 0) {
            try {
              await attachmentService.uploadMultipleAttachments(
                uploadedFiles, 'QUOTATION', 'REQUEST', createResponse.data.requestId, 'Supporting documents for request'
              );
            } catch { toast.warning('Request created but some attachments failed to upload'); }
          }
          await savePerDiemIfNeeded(createResponse.data.requestId);
          const submitResponse = await requestService.submit(createResponse.data.requestId);
          if (submitResponse.success) {
            const approvalRoute = data.isAdminRequest ? 'Admin -> Finance' : 'Program Lead or Head of Programs -> Finance';
            toast.success(`Request ${createResponse.data.requestCode} submitted (${approvalRoute})`);
            navigate('/finance/requests');
          }
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
      {overdueBlocked && (
        <Alert severity="error" sx={{ mb: 2 }} icon={<WarningIcon />}>
          <Typography variant="subtitle2" fontWeight={700}>
            Float Request Blocked — Overdue Reconciliations
          </Typography>
          <Typography variant="body2">
            You have <strong>{overdueCount}</strong> overdue reconciliation{overdueCount !== 1 ? 's' : ''} that have not been submitted for approval.
            You must submit your overdue reconciliations before creating a new float request.
            Go to the <strong>Reconciliation</strong> module to submit them.
          </Typography>
        </Alert>
      )}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          {isEditMode ? (existingStatus === 'REJECTED' ? 'Edit & Resubmit Float Request' : 'Edit Float Request') : 'Create Float Request'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isEditMode
            ? 'Update the existing request details and optionally resubmit for approval.'
            : 'Submit a new float request with supporting documents. Select currency and routing options.'}
        </Typography>
      </Paper>

      <form>
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Request Details</Typography>
          <Grid container spacing={3}>            {/* Partner Selection — locked when Admin request is active */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                options={donors}
                getOptionLabel={(d) => `${d.donor_name} (${d.donor_code})`}
                value={donors.find(d => d.id === selectedDonorId) || null}
                onChange={(_, newVal) => setSelectedDonorId(newVal ? newVal.id : '')}
                disabled={watchedIsAdminRequest}
                renderOption={(props, d) => (
                  <Box component="li" {...props} key={d.id}>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{d.donor_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{d.donor_code} · {d.currency_code}</Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    required
                    label="Partner"
                    placeholder="Search or select a partner..."
                    helperText={watchedIsAdminRequest ? 'Auto-set to Admin partner' : 'Select the implementing partner for this request'}
                  />
                )}
                isOptionEqualToValue={(opt, val) => opt.id === val.id}
                noOptionsText="No active partners found"
              />
            </Grid>

            {/* Project Selection — locked when Admin request is active (auto-selected) */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                options={projects}
                loading={loadingProjects}
                disabled={!selectedDonorId || watchedIsAdminRequest}
                getOptionLabel={(p) => `${p.project_code} — ${p.project_name}`}
                value={selectedProject}
                onChange={(_, newVal) => setSelectedProject(newVal)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    required
                    label="Project"
                    placeholder={selectedDonorId ? 'Search or select a project...' : 'Select a partner first'}
                    helperText={watchedIsAdminRequest ? 'Auto-set to Admin project' : (selectedProject ? `${budgetLines.length} budget line(s) available` : 'Required — budget lines load after project is selected')}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: <>{loadingProjects && <CircularProgress size={16} />}{params.InputProps.endAdornment}</>
                    }}
                  />
                )}
                isOptionEqualToValue={(opt, val) => opt.id === val.id}
                noOptionsText={selectedDonorId ? 'No projects found for this partner' : 'Select a partner first'}
              />
            </Grid>

            {/* Cross-department routing warning */}
            {crossDeptWarning && (
              <Grid item xs={12}>
                <Alert severity="info" onClose={() => setCrossDeptWarning(null)}>
                  {crossDeptWarning}
                </Alert>
              </Grid>
            )}

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
            <Grid item xs={12} md={6}>
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
                  required: 'Purpose of Float is required',
                  minLength: { value: 20, message: 'Purpose of Float must be at least 20 characters' }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Purpose of Float"
                    multiline
                    rows={3}
                    fullWidth
                    error={!!errors.justification}
                    helperText={errors.justification?.message || 'Describe the activity and purpose for this float'}
                  />
                )}
              />
            </Grid>
          </Grid>
          {watchedIsAdminRequest && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <strong>Admin Request:</strong> Partner and project are pre-set to <strong>Administration (Internal)</strong>.
              Simply pick the budget line (Maintenance, Softwares, or Rentals) for each item.
              Approval route: <strong>Admin → HR Lead / HOP → Finance</strong>.
            </Alert>
          )}
          {selectedDonorId && selectedProject && (
            <Alert severity="success" sx={{ mt: 2 }}>
              <strong>Partner:</strong> {donors.find(d => d.id === Number(selectedDonorId))?.donor_name} &nbsp;&bull;&nbsp;
              <strong>Project:</strong> {selectedProject.project_code} — {selectedProject.project_name} &nbsp;&bull;&nbsp;
              {loadingBudgetLines ? 'Loading budget lines...' : `${budgetLines.length} budget line(s) available`}
            </Alert>
          )}
          {selectedDonorId && !selectedProject && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {loadingProjects ? 'Loading projects...' : (projects.length > 0 ? `${projects.length} project(s) found — select a project to continue.` : 'No projects found for this partner. Please contact Finance.')}
            </Alert>
          )}
          {!selectedDonorId && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Select a <strong>Partner</strong> and <strong>Project</strong> to proceed with the request.
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
              disabled={!selectedProject || budgetLines.length === 0}
            >
              Add Item
            </Button>
          </Box>
          {(!selectedDonorId || !selectedProject) && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Select a partner and project above before adding items.
            </Alert>
          )}
          {selectedProject && budgetLines.length === 0 && !loadingBudgetLines && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No active budget lines for this project. Please contact Finance.
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
                            const selectedBL = budgetLines.find(bl => bl.id === field.value) || null;
                            return (
                              <Autocomplete
                                size="small"
                                options={budgetLines}
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
            Upload quotations and supporting documents (PDF, Word, Excel, Images). Max 8MB per file.
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

        {/* ── Travel & Per Diem Claim Toggle ───────────────────────────────── */}
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Box display="flex" alignItems="center" gap={2}>
            <TripIcon color="info" />
            <Box flex={1}>
              <Typography variant="h6">Travel &amp; Subsistence Claim</Typography>
              <Typography variant="body2" color="text.secondary">
                Does this request include a travel / per diem claim?
              </Typography>
            </Box>
            <Box display="flex" gap={1}>
              <Button
                variant={hasPerDiemClaim ? 'contained' : 'outlined'}
                color="info"
                size="small"
                onClick={() => setHasPerDiemClaim(true)}
                sx={{ minWidth: 60 }}
              >
                YES
              </Button>
              <Button
                variant={!hasPerDiemClaim ? 'contained' : 'outlined'}
                color="inherit"
                size="small"
                onClick={() => setHasPerDiemClaim(false)}
                sx={{ minWidth: 60 }}
              >
                NO
              </Button>
            </Box>
          </Box>
        </Paper>

        {hasPerDiemClaim && (
          <TravelClaimSection
            mode="edit"
            value={perDiemClaimData}
            onChange={setPerDiemClaimData}
            projects={projects}
            budgetLines={budgetLines}
            rates={perDiemRates}
          />
        )}

        <Paper elevation={2} sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Button variant="outlined" onClick={() => navigate('/finance/requests')}>Cancel</Button>
              <Button
                variant="outlined"
                startIcon={isSaving ? <CircularProgress size={20} /> : <SaveIcon />}
                onClick={handleSubmit(handleSaveDraft)}
                disabled={isSaving || isSubmitting}
                sx={{ mr: 2 }}
              >
                {isEditMode ? 'Save Changes' : 'Save as Draft'}
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                onClick={handleSubmit(handleSaveAndSubmit)}
                disabled={isSaving || isSubmitting || watchedItems.some(item => exceedsBudget(item)) || (overdueBlocked && !isEditMode)}
              >
                {isEditMode ? (existingStatus === 'REJECTED' ? 'Save & Resubmit' : 'Save & Submit') : 'Save & Submit for Approval'}
              </Button>
            </Box>
        </Paper>
      </form>
    </Box>
  );
};

export default RequestForm;
