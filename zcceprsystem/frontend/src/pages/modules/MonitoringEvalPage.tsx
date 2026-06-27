/**
 * Monitoring & Evaluation (M&E) Module - Placeholder
 */
import React from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardActionArea,
  Chip, Avatar, alpha, useTheme, Divider
} from '@mui/material';
import {
  Assessment as MEIcon,
  Speed as KPIIcon,
  CompareArrows as BaselineIcon,
  CloudSync as FieldDataIcon,
  TrackChanges as IndicatorIcon,
  Construction as ComingSoonIcon
} from '@mui/icons-material';

const features = [
  {
    title: 'Indicators & KPIs',
    description: 'Define and track program indicators, key performance metrics, and outcome measures',
    icon: <KPIIcon />,
    color: '#1976d2'
  },
  {
    title: 'Baseline vs Impact Tracking',
    description: 'Compare baseline data against current performance to measure program impact and change',
    icon: <BaselineIcon />,
    color: '#2e7d32'
  },
  {
    title: 'Field Data Integration',
    description: 'Integrate data from field operations, surveys, and mobile data collection tools',
    icon: <FieldDataIcon />,
    color: '#ed6c02'
  },
  {
    title: 'Results Framework',
    description: 'Build logical frameworks linking inputs, activities, outputs, outcomes, and impact',
    icon: <IndicatorIcon />,
    color: '#9c27b0'
  }
];

const plannedCapabilities = [
  'Theory of Change builder',
  'Log frame management',
  'Custom indicator definitions',
  'Data collection form builder',
  'Beneficiary tracking',
  'Geographic data mapping',
  'Progress vs target dashboards',
  'Survey integration (ODK/KoboToolbox)',
  'Disaggregated data (gender, age, etc.)',
  'Automated M&E reporting',
  'Cross-project indicator comparison',
  'Impact evaluation support'
];

const MonitoringEvalPage: React.FC = () => {
  const theme = useTheme();

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          p: 3, mb: 3,
          background: `linear-gradient(135deg, #00695c 0%, #004d40 100%)`,
          color: 'white', borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <MEIcon sx={{ fontSize: 36 }} />
          <Box>
            <Typography variant="h5" fontWeight={600}>Monitoring & Evaluation</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              Indicators, KPIs, baseline tracking, impact measurement, and field data integration
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
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main', flexShrink: 0 }} />
                <Typography variant="body2">{cap}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Box>
  );
};

export default MonitoringEvalPage;
