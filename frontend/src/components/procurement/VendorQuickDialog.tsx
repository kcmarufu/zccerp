/**
 * Add a supplier, or complete one that is missing its category or
 * anti-terrorism check, without leaving the quotation being entered.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, FormLabel, Grid, MenuItem, Radio, RadioGroup, TextField
} from '@mui/material';
import { toast } from 'react-toastify';
import { createVendor, updateVendor } from '../../services/procurementService';
import { ProcVendor } from '../../types';
import { ANTI_TERROR_CHECK_LABEL, VENDOR_CATEGORIES } from '../../utils/vendorRegister';

interface Props {
  open: boolean;
  /** The supplier being completed; omitted when adding a new one. */
  vendor?: ProcVendor | null;
  onClose: () => void;
  onSaved: (vendor: ProcVendor) => void;
}

const VendorQuickDialog: React.FC<Props> = ({ open, vendor, onClose, onSaved }) => {
  const [form, setForm] = useState<Partial<ProcVendor>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(vendor ? { ...vendor } : { company_name: '', category: '', is_prequalified: false, is_active: true });
  }, [open, vendor]);

  const field = (key: keyof ProcVendor) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [key]: e.target.value }));
  };

  const handleSave = async () => {
    if (!form.company_name?.trim()) { toast.error('Company name is required'); return; }
    if (!form.category) { toast.error('Choose a category'); return; }
    if (form.antiterror_verified === null || form.antiterror_verified === undefined) {
      toast.error('Record whether the anti-terrorism check has been done');
      return;
    }
    setSaving(true);
    try {
      if (vendor) {
        await updateVendor(vendor.id, form);
        onSaved({ ...vendor, ...form } as ProcVendor);
      } else {
        const { vendorId, vendorCode } = await createVendor(form);
        onSaved({ ...form, id: vendorId, vendor_code: vendorCode } as ProcVendor);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const verification = form.antiterror_verified === null || form.antiterror_verified === undefined
    ? ''
    : String(Number(form.antiterror_verified));

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>{vendor ? `Complete ${vendor.company_name}` : 'Add New Supplier'}</DialogTitle>
      <DialogContent>
        {vendor && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This supplier needs a category and an anti-terrorism check on record before it can be used on a quotation.
          </Alert>
        )}
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {!vendor && (
            <Grid item xs={12}>
              <TextField fullWidth required label="Company Name" value={form.company_name || ''} onChange={field('company_name')} />
            </Grid>
          )}
          <Grid item xs={12}>
            <TextField select fullWidth required label="Category" value={form.category || ''} onChange={field('category')}>
              {VENDOR_CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <FormControl required>
              <FormLabel>{ANTI_TERROR_CHECK_LABEL}</FormLabel>
              <RadioGroup row value={verification}
                onChange={e => setForm(f => ({ ...f, antiterror_verified: Number(e.target.value) }))}>
                <FormControlLabel value="1" control={<Radio />} label="Verified" />
                <FormControlLabel value="0" control={<Radio />} label="Not verified" />
              </RadioGroup>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField fullWidth label="Email" value={form.email || ''} onChange={field('email')} />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField fullWidth label="Phone" value={form.phone || ''} onChange={field('phone')} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}>
          Save Supplier
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VendorQuickDialog;
