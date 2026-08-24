/**
 * Accrual statement — how someone's leave days built up over a year.
 *
 * Shown to staff for their own record, and to an approver looking at the
 * individual behind a request, so the decision is made against the full
 * picture rather than a single number.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Stack, CircularProgress, Alert, Grid,
} from '@mui/material';
import {
  TrendingUp as AccrualIcon,
  Add as TopUpIcon,
  Remove as DeductIcon,
  EventNote as TakenIcon,
} from '@mui/icons-material';

import { getMyAccrualHistory, getEmployeeAccrualHistory } from '../../services/hrService';
import { HRAccrualHistory } from '../../types';
import { formatDate } from '../../utils/datetime';

const num = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toFixed(1);

/** Signed day count, with an explicit sign so credits and debits read clearly. */
const signed = (n: number) => `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}`;

const EVENT_META: Record<string, { icon: React.ReactNode; color: 'success' | 'error' | 'info' | 'default'; }> = {
  ACCRUAL:     { icon: <AccrualIcon fontSize="small" />, color: 'success' },
  TOP_UP:      { icon: <TopUpIcon fontSize="small" />,   color: 'success' },
  DEDUCTION:   { icon: <DeductIcon fontSize="small" />,  color: 'error'   },
  LEAVE_TAKEN: { icon: <TakenIcon fontSize="small" />,   color: 'info'    },
};

interface Props {
  /** Omit to show the signed-in user's own statement. */
  employeeId?: number;
  year?: number;
  /** Compact mode drops the summary tiles — for use inside a dialog. */
  dense?: boolean;
}

const AccrualStatement: React.FC<Props> = ({ employeeId, year, dense }) => {
  const [data, setData] = useState<HRAccrualHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(employeeId
        ? await getEmployeeAccrualHistory(employeeId, year)
        : await getMyAccrualHistory(year));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not load the accrual history');
    } finally {
      setLoading(false);
    }
  }, [employeeId, year]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>;
  }
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return null;

  const { totals, events } = data;

  const Tile: React.FC<{ label: string; value: string; color?: string; hint?: string }> =
    ({ label, value, color, hint }) => (
      <Grid item xs={6} md={3}>
        <Paper elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', height: '100%' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
            {label}
          </Typography>
          <Typography variant="h5" fontWeight={700} color={color} mt={0.25}>
            {value}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.disabled">{hint}</Typography>
          )}
        </Paper>
      </Grid>
    );

  return (
    <Box>
      {!dense && (
        <Grid container spacing={2} mb={2}>
          <Tile label="ACCRUED" value={signed(totals.accrued)} color="success.main"
                hint={`${data.months_covered} month(s) credited`} />
          <Tile label="ADJUSTMENTS" value={signed(totals.adjusted)}
                color={totals.adjusted >= 0 ? 'success.main' : 'error.main'}
                hint="applied by hand" />
          <Tile label="DAYS TAKEN" value={signed(-totals.taken)} color="error.main"
                hint="charged to the balance" />
          <Tile label="NET THIS YEAR" value={signed(totals.net)}
                color={totals.net >= 0 ? 'primary.main' : 'error.main'}
                hint={`fiscal year ${data.fiscal_year}`} />
        </Grid>
      )}

      {dense && (
        <Stack direction="row" spacing={1} mb={1.5} flexWrap="wrap" useFlexGap>
          <Chip size="small" color="success" variant="outlined"
                label={`Accrued ${signed(totals.accrued)}`} />
          <Chip size="small" variant="outlined"
                color={totals.adjusted >= 0 ? 'success' : 'error'}
                label={`Adjustments ${signed(totals.adjusted)}`} />
          <Chip size="small" color="error" variant="outlined"
                label={`Taken ${signed(-totals.taken)}`} />
          <Chip size="small" color="primary"
                label={`Net ${signed(totals.net)} day(s)`} />
        </Stack>
      )}

      {events.length === 0 ? (
        <Alert severity="info" sx={{ py: 0.5 }}>
          Nothing has been credited or deducted yet this year.
        </Alert>
      ) : (
        <TableContainer sx={{ maxHeight: dense ? 260 : 460 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Movement</TableCell>
                {!dense && <TableCell sx={{ fontWeight: 700 }}>Detail</TableCell>}
                <TableCell sx={{ fontWeight: 700 }} align="right">Days</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.map((e, i) => {
                const meta = EVENT_META[e.type] || { icon: null, color: 'default' as const };
                return (
                  <TableRow key={`${e.date}-${i}`} hover>
                    <TableCell>
                      <Typography variant="caption">{formatDate(e.date)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Box color={`${meta.color}.main`} display="flex">{meta.icon}</Box>
                        <Typography variant="body2">{e.label}</Typography>
                      </Stack>
                    </TableCell>
                    {!dense && (
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{e.detail}</Typography>
                      </TableCell>
                    )}
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700}
                        color={e.days >= 0 ? 'success.main' : 'error.main'}>
                        {signed(e.days)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600}>
                        {num(e.balance_after)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default AccrualStatement;
