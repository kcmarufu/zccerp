/**
 * Login Page Component — Modern Design
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
  IconButton,
  Divider,
  Chip,
  Collapse
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  AccountBalance as LogoIcon,
  Lock as LockIcon,
  Email as EmailIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Code as DevIcon
} from '@mui/icons-material';
import { useAuthStore } from '../store/authStore';

const DEV_CREDENTIALS = [
  {
    section: 'CPJS Dept',
    items: [
      { role: 'User', email: 'cpjs.user@zccinzim.org', password: 'Cpjs@2026!' },
      { role: 'Lead', email: 'cpjs.lead@zccinzim.org', password: 'CpjsLead@2026!' },
    ]
  },
  {
    section: 'HSD Dept',
    items: [
      { role: 'User', email: 'hsd.user@zccinzim.org', password: 'Hsd@2026!' },
      { role: 'Lead', email: 'hsd.lead@zccinzim.org', password: 'HsdLead@2026!' },
    ]
  },
  {
    section: 'Admin & Finance',
    items: [
      { role: 'Sys Admin', email: 'sysadmin@zccinzim.org', password: 'SysAdmin@2026!' },
      { role: 'Finance', email: 'finance@zccinzim.org', password: 'Finance@2026!' },
      { role: 'HOP', email: 'hop@zccinzim.org', password: 'Hop@2026!' },
    ]
  },
];

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [devOpen, setDevOpen] = useState(false);

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.');
    }
  };

  const fillCredential = (cred: { email: string; password: string }) => {
    setEmail(cred.email);
    setPassword(cred.password);
    setDevOpen(false);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #004D40 0%, #006064 45%, #00695C 100%)',
        py: 4,
        px: 2,
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-30%',
          right: '-15%',
          width: '650px',
          height: '650px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          bottom: '-25%',
          left: '-10%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.08)',
          pointerEvents: 'none',
        }
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        {/* Brand header */}
        <Box textAlign="center" mb={3.5}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(12px)',
              border: '2px solid rgba(255,255,255,0.25)',
              mb: 2,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <LogoIcon sx={{ fontSize: 42, color: 'white' }} />
          </Box>
          <Typography
            variant="h4"
            fontWeight={800}
            color="white"
            letterSpacing={1}
            sx={{ textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}
          >
            ERP Connect
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5, letterSpacing: 0.5 }}>
            Together, Let&apos;s Make the World a Better Place
          </Typography>
        </Box>

        {/* Main Card */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 30px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
          {/* Card top accent bar */}
          <Box
            sx={{
              background: 'linear-gradient(90deg, #006064 0%, #00796B 100%)',
              px: 3.5,
              py: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <LockIcon sx={{ color: 'rgba(255,255,255,0.85)', fontSize: 18 }} />
            <Box>
              <Typography variant="subtitle2" fontWeight={700} color="white" lineHeight={1.2}>
                Sign In to Your Account
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)' }}>
                Finance & Resource Management System
              </Typography>
            </Box>
          </Box>

          {/* Form area */}
          <Box sx={{ px: 3.5, pt: 3, pb: 3.5 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2, fontSize: '0.82rem' }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <TextField
                label="Email Address"
                type="email"
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                size="medium"
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
                    </InputAdornment>
                  )
                }}
              />
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                sx={{ mb: 3 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
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
                sx={{
                  py: 1.5,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #006064 0%, #00796B 100%)',
                  boxShadow: '0 4px 15px rgba(0,96,100,0.45)',
                  letterSpacing: 0.5,
                  '&:hover': {
                    background: 'linear-gradient(135deg, #004D40 0%, #006064 100%)',
                    boxShadow: '0 6px 20px rgba(0,96,100,0.55)',
                    transform: 'translateY(-1px)',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                {isLoading ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
              </Button>
            </form>

            <Divider sx={{ my: 2.5 }}>
              <Typography variant="caption" color="text.disabled" sx={{ px: 1 }}>
                Powered by KC Marufu
              </Typography>
            </Divider>

            {/* Dev Credentials */}
            <Box>
              <Button
                fullWidth
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<DevIcon sx={{ fontSize: 16 }} />}
                endIcon={devOpen ? <CollapseIcon sx={{ fontSize: 16 }} /> : <ExpandIcon sx={{ fontSize: 16 }} />}
                onClick={() => setDevOpen(!devOpen)}
                sx={{
                  borderStyle: 'dashed',
                  borderRadius: 2,
                  fontSize: '0.73rem',
                  textTransform: 'none',
                  py: 0.7,
                  color: 'warning.dark',
                  borderColor: 'warning.main',
                  '&:hover': { borderStyle: 'solid', bgcolor: 'rgba(237,108,2,0.05)' }
                }}
              >
                Development Login Credentials
              </Button>

              <Collapse in={devOpen}>
                <Box
                  sx={{
                    mt: 1.5,
                    p: 2,
                    bgcolor: '#fffde7',
                    border: '1px dashed',
                    borderColor: 'warning.main',
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="caption" color="warning.dark" fontWeight={700} display="block" mb={1.5}>
                    🔐 Click any role chip to auto-fill credentials
                  </Typography>
                  {DEV_CREDENTIALS.map(group => (
                    <Box key={group.section} mb={1.5}>
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        color="text.secondary"
                        display="block"
                        mb={0.6}
                        sx={{ textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: 0.8 }}
                      >
                        {group.section}
                      </Typography>
                      <Box display="flex" flexWrap="wrap" gap={0.6}>
                        {group.items.map(cred => (
                          <Chip
                            key={cred.email}
                            label={cred.role}
                            size="small"
                            clickable
                            onClick={() => fillCredential(cred)}
                            color="primary"
                            variant="outlined"
                            sx={{
                              fontSize: '0.68rem',
                              height: 24,
                              fontWeight: 600,
                              cursor: 'pointer',
                              '&:hover': { bgcolor: 'primary.main', color: 'white' }
                            }}
                          />
                        ))}
                      </Box>
                    </Box>
                  ))}
                  <Typography
                    variant="caption"
                    color="error.main"
                    display="block"
                    mt={1}
                    sx={{ fontStyle: 'italic', fontSize: '0.67rem' }}
                  >
                    ⚠️ Remove before production deployment
                  </Typography>
                </Box>
              </Collapse>
            </Box>
          </Box>
        </Paper>

        <Typography
          variant="caption"
          color="rgba(255,255,255,0.45)"
          display="block"
          textAlign="center"
          mt={3}
          sx={{ letterSpacing: 0.5 }}
        >
          ERP Connect v1.0 &nbsp;·&nbsp; {new Date().getFullYear()}
        </Typography>
      </Box>
    </Box>
  );
};

export default LoginPage;
