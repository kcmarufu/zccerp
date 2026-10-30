/**
 * Choose a quotation's supplier from the register. There is no free typing:
 * a supplier that is not listed is added through the Add button, which is what
 * records its category and anti-terrorism check.
 */

import React from 'react';
import { Autocomplete, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { AddCircle as AddIcon } from '@mui/icons-material';
import { ProcVendor } from '../../types';
import { antiTerrorLabel, isAntiTerrorVerified } from '../../utils/vendorRegister';

interface Props {
  vendors: ProcVendor[];
  value: ProcVendor | null;
  onChange: (vendor: ProcVendor | null) => void;
  onAddNew: () => void;
}

const VendorPicker: React.FC<Props> = ({ vendors, value, onChange, onAddNew }) => (
  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
    <Autocomplete
      fullWidth
      options={vendors}
      value={value}
      onChange={(_, vendor) => onChange(vendor)}
      getOptionLabel={(v) => v.company_name || ''}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      noOptionsText="No supplier found. Use Add New Supplier."
      renderOption={(props, v) => (
        <Box component="li" {...props} key={v.id}>
          <Box flexGrow={1}>
            <Typography variant="body2" fontWeight={600}>{v.company_name}</Typography>
            <Typography variant="caption" color="text.secondary">{v.category || 'Uncategorized'}</Typography>
          </Box>
          <Chip size="small" variant="outlined"
            color={isAntiTerrorVerified(v.antiterror_verified) ? 'success' : 'warning'}
            label={antiTerrorLabel(v.antiterror_verified)} />
        </Box>
      )}
      renderInput={(params) => (
        <TextField {...params} required label="Search supplier" placeholder="Start typing the supplier's name" />
      )}
    />
    <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddNew} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
      Add New Supplier
    </Button>
  </Stack>
);

export default VendorPicker;
