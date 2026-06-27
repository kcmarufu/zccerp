/**
 * Projects & Programs Module - Placeholder
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Grid, Card, CardContent, CardActionArea,
  Chip, Avatar, alpha, useTheme, Button, Divider, List, ListItem,
  ListItemIcon, ListItemText
} from '@mui/material';
import {
  AccountTree as ProjectIcon,
  MonetizationOn as BudgetIcon,
  Timeline as MilestoneIcon,
  PieChart as AllocationIcon,
  Assessment as MEIcon,
  ArrowForward as ArrowIcon,
  Construction as ComingSoonIcon
} from '@mui/icons-material';

const features = [
  {
    title: 'Project Budgets',
    description: 'Allocate and track budgets at the project level with detailed cost breakdowns',
    icon: <BudgetIcon />,
    color: '#1976d2',
    path: '/projects/budgets'
  },
  {
    title: 'Milestones & Timelines',
    description: 'Set project milestones, track progress, and manage timelines visually',
    icon: <MilestoneIcon />,
    color: '#9c27b0',
    path: '/projects/milestones'
  },
  {
    title: 'Expense Allocation',
    description: 'Map expenses to specific projects, grants and budget lines with full traceability',
    icon: <AllocationIcon />,
    color: '#2e7d32',
    path: '/projects/expenses'
  },
  {
    title: 'M&E Data Linkage',
    description: 'Link monitoring & evaluation indicators directly to project activities and outcomes',
    icon: <MEIcon />,
    color: '#ed6c02',
    path: '/projects/me-linkage'
  }
];

const plannedCapabilities = [
  'Gantt chart project planning',
  'Multi-year project budgeting',
  'Resource allocation & scheduling',
  'Donor-linked project tracking',
  'Activity-based costing',
  'Automated progress reporting',
  'Risk register & mitigation tracking',
  'Sub-grant management per project'
];

const ProjectsPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          p: 3, mb: 3,
          background: `linear-gradient(135deg, #7b1fa2 0%, #4a148c 100%)`,
          color: 'white', borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <ProjectIcon sx={{ fontSize: 36 }} />
          <Box>
            <Typography variant="h5" fontWeight={600}>Projects & Programs</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              Manage project lifecycles, budgets, milestones, and M&E integration
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

export default ProjectsPage;
