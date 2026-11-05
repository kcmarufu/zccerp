/**
 * Rejection Insights — what float and purchase requests are sent back for.
 *
 * Every rejection comment reviewers have written is read against the known
 * mistakes (missing concept note, bank charges, claim form errors, ...) and
 * counted. The same analysis drives the tips requesters see beside the
 * fields on the request forms, so improving reviewer comments improves the hints.
 * Figures are recomputed from live data (at most 30 minutes old; Refresh forces
 * it).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  Insights as InsightsIcon,
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
          {!theme.isMistake && (
            <Typography variant="caption" color="text.secondary">Not a requester mistake</Typography>
          )}
        </TableCell>
        <TableCell align="right">{theme.count}</TableCell>
        <TableCell sx={{ minWidth: 160 }}>
          <Box display="flex" alignItems="center" gap={1}>
            <LinearProgress variant="determinate" value={max > 0 ? (theme.count / max) * 100 : 0}
              sx={{ flex: 1, height: 8, borderRadius: 4 }} color={theme.isMistake ? 'warning' : 'inherit'} />
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
                <Typography variant="caption" color="text.secondary" fontWeight={600}>Latest comments from reviewers</Typography>
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
  const location = useLocation();
  const initial: InsightsModule = location.pathname.startsWith('/procurement') ? 'procurement' : 'float';
  const [module, setModule] = useState<InsightsModule>(initial);
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
    <Box>
      <Paper elevation={0} sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #4527a0 0%, #1a0d4a 100%)', color: 'white', borderRadius: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <InsightsIcon sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>Rejection Insights</Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                The mistakes requests are most often sent back for — learned from every rejection comment, and used to warn requesters before they submit.
              </Typography>
            </Box>
          </Box>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => load(true)} disabled={loading}
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}>
            Refresh
          </Button>
        </Box>
      </Paper>

      <Tabs value={module} onChange={(_, v) => setModule(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="float" label="Float Requests" />
        <Tab value="procurement" label="Purchase Requests" />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && !data && <Box py={8} textAlign="center"><CircularProgress /></Box>}

      {data && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { label: 'Requests submitted', value: data.submittedRequests.toLocaleString() },
              { label: 'Rejected at least once', value: `${data.rejectedRequests.toLocaleString()} (${data.rejectionRate}%)` },
              { label: 'Rejection comments analysed', value: data.rejectionEvents.toLocaleString() },
              { label: 'Last updated', value: format(new Date(data.generatedAt), 'dd MMM yyyy HH:mm') },
            ].map(c => (
              <Grid item xs={6} md={3} key={c.label}>
                <Card variant="outlined"><CardContent>
                  <Typography variant="caption" color="text.secondary">{c.label}</Typography>
                  <Typography variant="h6" fontWeight={700}>{c.value}</Typography>
                </CardContent></Card>
              </Grid>
            ))}
          </Grid>

          {unspecified && unspecified.count > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>{unspecified.count}</strong> rejection{unspecified.count !== 1 ? 's' : ''} ({unspecified.share}%) said only
              “amend” or “edit”. Those cannot teach requesters — or these hints — what to fix; asking reviewers to state the
              exact problem makes both better.
            </Alert>
          )}

          <Paper variant="outlined" sx={{ mb: 3 }}>
            <Box px={2} pt={2}>
              <Typography variant="h6">Most common mistakes</Typography>
              <Typography variant="body2" color="text.secondary">
                One rejection can cite several mistakes, so the percentages add up to more than 100%.
                {data.examplesHidden ? '' : ' Expand a row to read what reviewers wrote.'}
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell><strong>Mistake</strong></TableCell>
                    <TableCell align="right"><strong>Times cited</strong></TableCell>
                    <TableCell><strong>Share of rejections</strong></TableCell>
                    <TableCell><strong>Last 90 days vs previous</strong></TableCell>
                    <TableCell><strong>What to tell requesters</strong></TableCell>
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
              <Typography variant="h6">Checks made on every request</Typography>
              <Typography variant="body2" color="text.secondary">
                How often requests were rejected when they passed or failed each check. Attachments are judged as they were before
                the first rejection. Only differences marked “Quoted in hints” are large and well-sampled enough to show requesters.
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Check</strong></TableCell>
                    <TableCell align="right"><strong>Passed</strong></TableCell>
                    <TableCell align="right"><strong>Rejected when passed</strong></TableCell>
                    <TableCell align="right"><strong>Failed</strong></TableCell>
                    <TableCell align="right"><strong>Rejected when failed</strong></TableCell>
                    <TableCell />
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
                      <TableCell>
                        {f.conclusive
                          ? <Chip size="small" color="warning" label="Quoted in hints" />
                          : <Chip size="small" variant="outlined" label="Not conclusive" />}
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
                <Typography variant="h6">Other rejection reasons</Typography>
                <Typography variant="body2" color="text.secondary">Reasons that are not a mistake by the requester, or that matched no known pattern.</Typography>
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
