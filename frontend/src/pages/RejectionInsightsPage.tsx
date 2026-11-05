/**
 * Rejection Insights (Reports) — what float and purchase requests are sent back for.
 * Visible to the Super Admin and the HOD/Lead of Finance, HSD, CPJS and
 * Admin & HR (utils/insightsAccess.ts; the API enforces the same rule).
 *
 * Every rejection comment reviewers have written is read against the known
 * mistakes (missing concept note, bank charges, claim form errors, ...) and
 * counted. The same analysis drives the tips requesters see beside the
 * fields on the request forms, so improving reviewer comments improves the hints.
 * Figures are recomputed from live data (at most 30 minutes old; Refresh forces
 * it).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Collapse, Grid, IconButton,
  LinearProgress, Paper, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, Tooltip, Typography,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  TrendingUp as UpIcon,
  TrendingDown as DownIcon,
  TrendingFlat as FlatIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import insightsService, { InsightsModule, RejectionAnalysis, RejectionTheme } from '../services/insightsService';

const Trend: React.FC<{ recent: number; prior: number }> = ({ recent, prior }) => {
  const label = `${recent} in the last 90 days, ${prior} in the 90 days before`;
  if (recent > prior) return <Tooltip title={label}><Chip size="small" color="error" variant="outlined" icon={<UpIcon />} label={`${recent} vs ${prior}`} /></Tooltip>;
  if (recent < prior) return <Tooltip title={label}><Chip size="small" color="success" variant="outlined" icon={<DownIcon />} label={`${recent} vs ${prior}`} /></Tooltip>;
  return <Tooltip title={label}><Chip size="small" variant="outlined" icon={<FlatIcon />} label={`${recent} vs ${prior}`} /></Tooltip>;
};

const ThemeRow: React.FC<{ theme: RejectionTheme; max: number; examplesHidden: boolean }> = ({ theme, max, examplesHidden }) => {
  const [open, setOpen] = useState(false);
  const canExpand = !examplesHidden && theme.examples.length > 0;
  return (
    <>
      <TableRow hover sx={{ '& > td': { borderBottom: open ? 0 : undefined } }}>
        <TableCell sx={{ width: 40 }}>
          {canExpand && (
            <IconButton size="small" onClick={() => setOpen(o => !o)} aria-label="Show examples">
              {open ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
          )}
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={600}>{theme.title}</Typography>
        </TableCell>
        <TableCell align="right">{theme.count}</TableCell>
        <TableCell sx={{ minWidth: 160 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <LinearProgress variant="determinate" value={max > 0 ? (theme.count / max) * 100 : 0}
              sx={{ flex: 1, height: 8, borderRadius: 4 }} color={theme.isMistake ? 'primary' : 'inherit'} />
            <Typography variant="caption" sx={{ minWidth: 42, textAlign: 'right' }}>{theme.share}%</Typography>
          </Box>
        </TableCell>
        <TableCell><Trend recent={theme.recentCount} prior={theme.priorCount} /></TableCell>
        <TableCell sx={{ maxWidth: 420 }}>
          <Typography variant="body2" color="text.secondary">{theme.advice || '—'}</Typography>
        </TableCell>
      </TableRow>
      {canExpand && (
        <TableRow>
          <TableCell colSpan={6} sx={{ py: 0 }}>
            <Collapse in={open} unmountOnExit>
              <Box py={1.5} pl={6}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Recent reviewer comments</Typography>
                {theme.examples.map((ex, i) => (
                  <Typography key={i} variant="body2" sx={{ mt: 0.5 }}>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                      {ex.at ? format(new Date(ex.at), 'dd MMM yyyy') : ''}
                    </Typography>
                    “{ex.text}”
                  </Typography>
                ))}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

const RejectionInsightsPage: React.FC = () => {
  const [module, setModule] = useState<InsightsModule>('float');
  const [data, setData] = useState<RejectionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await insightsService.getRejectionAnalysis(module, refresh));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to load the rejection analysis');
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => { load(); }, [load]);

  const mistakes = (data?.themes || []).filter(t => t.isMistake);
  const others = (data?.themes || []).filter(t => !t.isMistake);
  const max = Math.max(1, ...(data?.themes || []).map(t => t.count));
  const unspecified = data?.themes.find(t => t.id === 'unspecified');

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header — same layout as Financial Reports */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ letterSpacing: -0.5 }}>Rejection Insights</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Reasons float and purchase requests are rejected, taken from reviewers' comments
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => load(true)} disabled={loading}>
          Refresh
        </Button>
      </Box>

      <Tabs value={module} onChange={(_, v) => setModule(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="float" label="Float Requests" />
        <Tab value="procurement" label="Purchase Requests" />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && !data && <Box py={8} textAlign="center"><CircularProgress /></Box>}

      {data && (
        <>
          <Grid container spacing={2} mb={3} alignItems="stretch">
            {[
              { label: 'Requests Submitted', value: data.submittedRequests.toLocaleString(), bg: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)' },
              { label: 'Rejected At Least Once', value: `${data.rejectedRequests.toLocaleString()} (${data.rejectionRate}%)`, bg: 'linear-gradient(135deg, #d32f2f 0%, #c62828 100%)' },
              { label: 'Rejections Reviewed', value: data.rejectionEvents.toLocaleString(), bg: 'linear-gradient(135deg, #388e3c 0%, #2e7d32 100%)' },
              { label: 'As At', value: format(new Date(data.generatedAt), 'dd MMM yyyy HH:mm'), bg: 'linear-gradient(135deg, #f57c00 0%, #e65100 100%)' },
            ].map(c => (
              <Grid item xs={12} sm={6} md={3} key={c.label} display="flex">
                <Card sx={{ background: c.bg, color: 'white', borderRadius: 2, width: '100%' }}>
                  <CardContent>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>{c.label}</Typography>
                    <Typography variant="h5" fontWeight={700} mt={0.5}>{c.value}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {unspecified && unspecified.count > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>{unspecified.count}</strong> rejection{unspecified.count !== 1 ? 's' : ''} ({unspecified.share}%) gave only
              “amend” or “edit” as the reason. Reviewers should state exactly what needs to be corrected.
            </Alert>
          )}

          <Paper variant="outlined" sx={{ mb: 3 }}>
            <Box px={2} pt={2}>
              <Typography variant="h6">Most Common Reasons for Rejection</Typography>
              <Typography variant="body2" color="text.secondary">
                A rejection can give more than one reason, so the shares add up to more than 100%. Expand a row to read the comments.
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell><strong>Reason</strong></TableCell>
                    <TableCell align="right"><strong>Times Raised</strong></TableCell>
                    <TableCell><strong>Share of Rejections</strong></TableCell>
                    <TableCell><strong>Last 90 Days vs Previous 90</strong></TableCell>
                    <TableCell><strong>Guidance for Requesters</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mistakes.map(t => <ThemeRow key={t.id} theme={t} max={max} examplesHidden={data.examplesHidden} />)}
                  {mistakes.length === 0 && (
                    <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary" py={2} textAlign="center">No rejections recorded yet.</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper variant="outlined" sx={{ mb: 3 }}>
            <Box px={2} pt={2}>
              <Typography variant="h6">Rejection Rate by Request Completeness</Typography>
              <Typography variant="body2" color="text.secondary">
                How often requests were rejected when each requirement was met or not met. Attachments are counted as they were at first submission.
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Requirement</strong></TableCell>
                    <TableCell align="right"><strong>Requests Meeting It</strong></TableCell>
                    <TableCell align="right"><strong>Rejected</strong></TableCell>
                    <TableCell align="right"><strong>Requests Not Meeting It</strong></TableCell>
                    <TableCell align="right"><strong>Rejected</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.factors.filter(f => f.passCount + f.failCount > 0).map(f => (
                    <TableRow key={f.id} hover>
                      <TableCell>{f.title}</TableCell>
                      <TableCell align="right">{f.passCount}</TableCell>
                      <TableCell align="right">{f.passRejectionRate}%</TableCell>
                      <TableCell align="right">{f.failCount}</TableCell>
                      <TableCell align="right" sx={{ color: f.conclusive ? 'error.main' : undefined, fontWeight: f.conclusive ? 700 : undefined }}>
                        {f.failRejectionRate}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {others.length > 0 && (
            <Paper variant="outlined">
              <Box px={2} pt={2}>
                <Typography variant="h6">Other Reasons</Typography>
                <Typography variant="body2" color="text.secondary">Cancelled, no longer needed, handled outside the system, or not otherwise classified.</Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    {others.map(t => <ThemeRow key={t.id} theme={t} max={max} examplesHidden={data.examplesHidden} />)}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
};

export default RejectionInsightsPage;
