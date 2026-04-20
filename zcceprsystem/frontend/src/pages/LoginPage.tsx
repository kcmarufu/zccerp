/**
 * Login Page Component
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  InputAdornment,
  IconButton
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  AccountBalance as LogoIcon
} from '@mui/icons-material';
import { useAuthStore } from '../store/authStore';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'grey.100',
        py: 4
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: 4,
          width: '100%',
          maxWidth: 400
        }}
      >
        {/* Logo */}
        <Box display="flex" flexDirection="column" alignItems="center" mb={4}>
          <LogoIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h5" fontWeight="bold" color="primary">
            Float Request Management System
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Procurement Module
          </Typography>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          <TextField
            label="Email Address"
            type="email"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            margin="normal"
            required
            autoComplete="email"
            autoFocus
          />
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            margin="normal"
            required
            autoComplete="current-password"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={isLoading}
            sx={{ mt: 3, mb: 2 }}
          >
            {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
          </Button>
        </form>

        {/* Dev Credentials - Remove in Production */}
        <Box sx={{ mt: 3, p: 2, backgroundColor: 'warning.light', borderRadius: 1, border: '1px dashed', borderColor: 'warning.main' }}>
          <Typography variant="subtitle2" color="warning.dark" fontWeight="bold" gutterBottom>
            🔐 Development Login Credentials
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.3, fontWeight: 'bold' }}>
              CPJS Department:
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
              &nbsp;&nbsp;User: cpjs.user@zccinzim.org / Cpjs@2026!
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
              &nbsp;&nbsp;Lead: cpjs.lead@zccinzim.org / CpjsLead@2026!
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.3, fontWeight: 'bold', mt: 1 }}>
              HSD Department:
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
              &nbsp;&nbsp;User: hsd.user@zccinzim.org / Hsd@2026!
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
              &nbsp;&nbsp;Lead: hsd.lead@zccinzim.org / HsdLead@2026!
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.3, fontWeight: 'bold', mt: 1 }}>
              Admin & Finance:
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
              &nbsp;&nbsp;User: admin.user@zccinzim.org / Admin@2026!
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
              &nbsp;&nbsp;Finance: finance@zccinzim.org / Finance@2026!
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.3, fontWeight: 'bold', mt: 1 }}>
              Cross-Department:
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
              &nbsp;&nbsp;Head of Programs: hop@zccinzim.org / Hop@2026!
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
              &nbsp;&nbsp;Admin: sysadmin@zccinzim.org / SysAdmin@2026!
            </Typography>
          </Box>
          <Typography variant="caption" color="error.main" display="block" sx={{ mt: 1, fontStyle: 'italic' }}>
            ⚠️ Remove this section before production deployment
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default LoginPage;
