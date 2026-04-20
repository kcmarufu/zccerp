/**
 * Compliance, Audit & Document Management Module - Placeholder
 */
import React from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardActionArea,
  Chip, Avatar, alpha, useTheme, Divider
} from '@mui/material';
import {
  Security as ComplianceIcon,
  Policy as AuditIcon,
  AdminPanelSettings as ControlsIcon,
  Lock as AccessIcon,
  FolderSpecial as DocumentIcon,
  Construction as ComingSoonIcon
} from '@mui/icons-material';

const features = [
  {
    title: 'Internal Controls',
    description: 'Define and monitor internal control frameworks, segregation of duties, and policy compliance',
    icon: <ControlsIcon />,
    color: '#d32f2f'
  },
  {
    title: 'Audit Trail & Logs',
    description: 'Comprehensive audit logging for all system actions with tamper-proof records',
    icon: <AuditIcon />,
    color: '#1976d2'
  },
  {
    title: 'Role-Based Access',
    description: 'Granular permission system with role hierarchies, data-level security, and access reviews',
    icon: <AccessIcon />,
    color: '#9c27b0'
  },
  {
    title: 'Document Storage',
    description: 'Secure storage for contracts, MOUs, donor agreements, and organizational policies',
    icon: <DocumentIcon />,
    color: '#2e7d32'
  }
];

const plannedCapabilities = [
  'Policy document management',
  'Automated compliance checklists',
  'Audit schedule management',
  'Finding & recommendation tracking',
  'Internal audit workpapers',
  'Segregation of duties matrix',
  'Access review & certification',
  'Document version control',
  'MOU & contract repository',
  'Donor agreement management',
  'Encrypted document storage',
  'Compliance reporting dashboards'
];

const CompliancePage: React.FC = () => {
  const theme = useTheme();

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          p: 3, mb: 3,
          background: `linear-gradient(135deg, #c62828 0%, #b71c1c 100%)`,
          color: 'white', borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <ComplianceIcon sx={{ fontSize: 36 }} />
          <Box>
            <Typography variant="h5" fontWeight={600}>Compliance, Audit & Documents</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              Internal controls, audit trails, role-based access, and secure document management
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
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }} />
                <Typography variant="body2">{cap}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Box>
  );
};

export default CompliancePage;
