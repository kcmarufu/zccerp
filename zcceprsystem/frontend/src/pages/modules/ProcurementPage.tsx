/**
 * Procurement Module - Placeholder
 */
import React from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardActionArea,
  Chip, Avatar, alpha, useTheme, Divider
} from '@mui/material';
import {
  ShoppingCart as ProcurementIcon,
  Approval as ApprovalIcon,
  Store as VendorIcon,
  Gavel as TenderIcon,
  Inventory as InventoryIcon,
  Construction as ComingSoonIcon
} from '@mui/icons-material';

const features = [
  {
    title: 'Purchase Requests & Approvals',
    description: 'Create purchase requests with multi-level approval workflows tied to budget controls',
    icon: <ApprovalIcon />,
    color: '#1976d2'
  },
  {
    title: 'Vendor Management',
    description: 'Maintain a comprehensive vendor database with performance ratings, contracts, and history',
    icon: <VendorIcon />,
    color: '#2e7d32'
  },
  {
    title: 'Tendering & Bidding',
    description: 'Manage competitive bidding processes with tender creation, evaluation, and award tracking',
    icon: <TenderIcon />,
    color: '#ed6c02'
  },
  {
    title: 'Inventory Tracking',
    description: 'Track procurement-linked inventory with receiving, stock levels, and distribution',
    icon: <InventoryIcon />,
    color: '#9c27b0'
  }
];

const plannedCapabilities = [
  'Purchase requisition workflow',
  'Three-quote comparison sheets',
  'Purchase order generation',
  'Goods received notes (GRN)',
  'Vendor prequalification',
  'Contract management',
  'Procurement committee approvals',
  'Tender document templates',
  'Bid evaluation scoring',
  'Procurement analytics dashboard',
  'Budget availability checks',
  'Integration with finance module'
];

const ProcurementPage: React.FC = () => {
  const theme = useTheme();

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          p: 3, mb: 3,
          background: `linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)`,
          color: 'white', borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <ProcurementIcon sx={{ fontSize: 36 }} />
          <Box>
            <Typography variant="h5" fontWeight={600}>Procurement</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              Purchase requests, vendor management, tendering and procurement lifecycle
            </Typography>
          </Box>
          <Chip label="Coming Soon" sx={{ ml: 'auto', bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }} />
        </Box>
      </Paper>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {features.map((feature) => (
          <Grid item xs={12} sm={6} md={3} key={feature.title}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, opacity: 0.85, height: '100%' }}>
              <CardActionArea sx={{ p: 2.5, height: '100%' }} disabled>
                <Box display="flex" flexDirection="column" gap={1.5}>
                  <Avatar sx={{ bgcolor: alpha(feature.color, 0.1), color: feature.color, width: 48, height: 48 }}>
                    {feature.icon}
                  </Avatar>
                  <Typography variant="subtitle2" fontWeight={600}>{feature.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{feature.description}</Typography>
                  <Chip label="In Development" size="small" sx={{ alignSelf: 'flex-start', height: 22, fontSize: '0.65rem' }} />
                </Box>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper elevation={0} sx={{ p: 3, border: `1px solid ${theme.palette.divider}` }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <ComingSoonIcon color="warning" />
          <Typography variant="subtitle1" fontWeight={600}>Planned Capabilities</Typography>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <Grid container spacing={1}>
          {plannedCapabilities.map((cap) => (
            <Grid item xs={12} sm={6} md={4} key={cap}>
              <Box display="flex" alignItems="center" gap={1} py={0.5}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                <Typography variant="body2">{cap}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Box>
  );
};

export default ProcurementPage;
