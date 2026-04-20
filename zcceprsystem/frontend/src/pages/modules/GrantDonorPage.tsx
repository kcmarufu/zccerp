/**
 * Grant & Donor Management Module - Placeholder
 * Key differentiator for NGO ERP systems
 */
import React from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardActionArea,
  Chip, Avatar, alpha, useTheme, Divider, Alert
} from '@mui/material';
import {
  CardGiftcard as GrantIcon,
  People as DonorDBIcon,
  AccountBalance as FundTrackIcon,
  Lock as RestrictedIcon,
  Description as ReportIcon,
  Star as StarIcon,
  Construction as ComingSoonIcon
} from '@mui/icons-material';

const features = [
  {
    title: 'Donor Database',
    description: 'Complete donor profiles: contact info, funding history, conditions, restrictions, and communications',
    icon: <DonorDBIcon />,
    color: '#1976d2'
  },
  {
    title: 'Grant Management',
    description: 'Track each grant separately with linked expenses, reporting deadlines, and compliance requirements',
    icon: <GrantIcon />,
    color: '#2e7d32'
  },
  {
    title: 'Fund Tracking',
    description: 'Monitor funds received, funds spent, and funds remaining per grant with real-time dashboards',
    icon: <FundTrackIcon />,
    color: '#ed6c02'
  },
  {
    title: 'Restricted Funds',
    description: 'Separate restricted vs unrestricted funds to ensure donor funds are used as designated',
    icon: <RestrictedIcon />,
    color: '#d32f2f'
  },
  {
    title: 'Donor Reporting',
    description: 'Automated financial and activity reports to donors with customizable templates per funder',
    icon: <ReportIcon />,
    color: '#9c27b0'
  }
];

const plannedCapabilities = [
  'Donor relationship management (DRM)',
  'Grant proposal tracking pipeline',
  'Grant agreement repository',
  'Multi-currency fund tracking',
  'Cost allocation to multiple grants',
  'Indirect cost rate application',
  'Restricted vs unrestricted fund segregation',
  'Fund balance alerts & warnings',
  'Donor compliance tracking',
  'Grant financial report generation',
  'Activity-based donor reporting',
  'Grant closeout procedures',
  'Co-funding & match tracking',
  'Donor communication log',
  'Grant modificat & amendments',
  'Budget vs actual per grant'
];

const GrantDonorPage: React.FC = () => {
  const theme = useTheme();

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          p: 3, mb: 3,
          background: `linear-gradient(135deg, #e65100 0%, #bf360c 100%)`,
          color: 'white', borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <GrantIcon sx={{ fontSize: 36 }} />
          <Box>
            <Typography variant="h5" fontWeight={600}>Grant & Donor Management</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              Comprehensive donor tracking, grant lifecycle management, restricted funds, and donor reporting
            </Typography>
          </Box>
          <Chip label="Coming Soon" sx={{ ml: 'auto', bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }} />
        </Box>
      </Paper>

      <Alert severity="info" icon={<StarIcon />} sx={{ mb: 3 }}>
        <Typography variant="subtitle2" fontWeight={600}>Key NGO Differentiator</Typography>
        <Typography variant="body2">
          This is what differentiates an NGO ERP from a normal business ERP. Grant & donor management ensures
          compliance with donor requirements, proper fund segregation, and transparent financial reporting to funders.
        </Typography>
      </Alert>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {features.map((feature) => (
          <Grid item xs={12} sm={6} md={4} key={feature.title}>
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
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0 }} />
                <Typography variant="body2">{cap}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Box>
  );
};

export default GrantDonorPage;
