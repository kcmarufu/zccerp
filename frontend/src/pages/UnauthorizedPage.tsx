/**
 * Unauthorized Page Component
 * Shown when user lacks permission to access a route
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button
} from '@mui/material';
import {
  Lock as LockIcon,
  Home as HomeIcon,
  ArrowBack as BackIcon
} from '@mui/icons-material';

const UnauthorizedPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="60vh"
    >
      <Paper
        elevation={3}
        sx={{
          p: 6,
          textAlign: 'center',
          maxWidth: 500
        }}
      >
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            backgroundColor: 'error.light',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 3
          }}
        >
          <LockIcon sx={{ fontSize: 40, color: 'error.main' }} />
        </Box>

        <Typography variant="h4" gutterBottom fontWeight="bold">
          Access Denied
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          You don't have permission to access this page. If you believe this is an error,
          please contact your system administrator.
        </Typography>

        <Box display="flex" gap={2} justifyContent="center">
          <Button
            variant="outlined"
            startIcon={<BackIcon />}
            onClick={() => navigate(-1)}
          >
            Go Back
          </Button>
          <Button
            variant="contained"
            startIcon={<HomeIcon />}
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default UnauthorizedPage;
