/**
 * Coming Soon Page
 * Placeholder for future ERP modules
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  alpha,
  useTheme
} from '@mui/material';
import {
  Construction as ConstructionIcon,
  ArrowBack as BackIcon,
  Dashboard as DashboardIcon
} from '@mui/icons-material';

interface ComingSoonPageProps {
  module: string;
}

const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ module }) => {
  const navigate = useNavigate();
  const theme = useTheme();

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="60vh"
    >
      <Paper
        elevation={0}
        sx={{
          p: 6,
          textAlign: 'center',
          maxWidth: 520,
          border: `1px solid ${theme.palette.divider}`
        }}
      >
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            bgcolor: alpha(theme.palette.warning.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 3
          }}
        >
          <ConstructionIcon sx={{ fontSize: 40, color: 'warning.main' }} />
        </Box>

        <Typography variant="h5" fontWeight={700} gutterBottom>
          {module}
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
          This module is currently under development.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Our team is working to bring you a comprehensive {module.toLowerCase()} solution. 
          Check back soon for updates.
        </Typography>

        <Box display="flex" justifyContent="center" gap={2}>
          <Button
            variant="outlined"
            startIcon={<BackIcon />}
            onClick={() => navigate(-1)}
          >
            Go Back
          </Button>
          <Button
            variant="contained"
            startIcon={<DashboardIcon />}
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default ComingSoonPage;
