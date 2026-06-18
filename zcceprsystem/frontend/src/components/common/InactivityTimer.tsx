/**
 * InactivityTimer
 * Logs out the user after 15 minutes of inactivity.
 * Shows a warning dialog 1 minute before auto-logout.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, LinearProgress
} from '@mui/material';
import { useAuthStore } from '../../store/authStore';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE_MS = 60 * 1000;           // warn 1 min before logout
const COUNTDOWN_SECS = 60;

const InactivityTimer: React.FC = () => {
  const { isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);

  const doLogout = useCallback(() => {
    setShowWarning(false);
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const resetTimers = useCallback(() => {
    if (!isAuthenticated) return;

    // Clear all existing timers
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowWarning(false);

    // Set warning timer
    warnTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(COUNTDOWN_SECS);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

    // Set logout timer
    logoutTimerRef.current = setTimeout(doLogout, INACTIVITY_TIMEOUT_MS);
  }, [isAuthenticated, doLogout]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(evt => document.addEventListener(evt, resetTimers, { passive: true }));
    resetTimers();

    return () => {
      events.forEach(evt => document.removeEventListener(evt, resetTimers));
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isAuthenticated, resetTimers]);

  if (!isAuthenticated || !showWarning) return null;

  return (
    <Dialog open={showWarning} maxWidth="xs" fullWidth disableEscapeKeyDown>
      <DialogTitle sx={{ pb: 1 }}>Session Expiring Soon</DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          You will be logged out due to inactivity in{' '}
          <strong>{countdown}</strong> second{countdown !== 1 ? 's' : ''}.
        </Typography>
        <LinearProgress
          variant="determinate"
          value={(countdown / COUNTDOWN_SECS) * 100}
          color="warning"
          sx={{ mt: 2, borderRadius: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="error" onClick={doLogout}>
          Logout Now
        </Button>
        <Button variant="contained" onClick={resetTimers} autoFocus>
          Stay Logged In
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InactivityTimer;
