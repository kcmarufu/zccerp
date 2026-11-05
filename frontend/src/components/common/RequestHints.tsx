/**
 * "Avoid a rejection" panel on the float and purchase request forms.
 *
 * Sends the draft as it stands to the API, which checks it against the
 * mistakes reviewers most often reject requests for — learned from this
 * system's own rejection history and refreshed as new decisions are made — and
 * shows what to fix before submitting. Advisory only: nothing here blocks a
 * submission.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, AlertTitle, Box, Collapse, IconButton, Paper, Typography } from '@mui/material';
import {
  Lightbulb as TipIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
} from '@mui/icons-material';
import insightsService, { FloatDraft, InsightsModule, ProcurementDraft, RequestHints as Hints } from '../../services/insightsService';

interface Props {
  module: InsightsModule;
  draft: FloatDraft | ProcurementDraft;
}

const DEBOUNCE_MS = 800;

const RequestHints: React.FC<Props> = ({ module, draft }) => {
  const [data, setData] = useState<Hints | null>(null);
  const [open, setOpen] = useState(true);
  // Re-check only when the draft's content changes, not on every render.
  const draftKey = useMemo(() => JSON.stringify(draft), [draft]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      insightsService.getRequestHints(module, JSON.parse(draftKey))
        .then(res => { if (!cancelled) setData(res); })
        .catch(() => { /* hints are advisory; a failure just shows none */ });
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [module, draftKey]);

  if (!data || data.hints.length === 0) return null;

  const warnings = data.hints.filter(h => h.severity === 'warning');
  const tips = data.hints.filter(h => h.severity === 'info');

  return (
    <Paper elevation={2} sx={{ p: 2.5, mb: 3, borderLeft: 4, borderColor: warnings.length ? 'warning.main' : 'info.main' }}>
      <Box display="flex" alignItems="center" gap={1}>
        <TipIcon color={warnings.length ? 'warning' : 'info'} />
        <Box flex={1}>
          <Typography variant="h6" sx={{ fontSize: '1.05rem' }}>
            Avoid a rejection{warnings.length > 0 ? ` — ${warnings.length} thing${warnings.length !== 1 ? 's' : ''} to check` : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Learned from {data.learnedFrom.rejections.toLocaleString()} past rejections
            across {data.learnedFrom.requests.toLocaleString()} {module === 'procurement' ? 'purchase' : 'float'} requests
            ({data.learnedFrom.rejectionRate}% were sent back at least once). Updated as reviewers make new decisions.
          </Typography>
        </Box>
        <IconButton size="small" onClick={() => setOpen(o => !o)} aria-label={open ? 'Hide tips' : 'Show tips'}>
          {open ? <CollapseIcon /> : <ExpandIcon />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box mt={1.5} display="flex" flexDirection="column" gap={1}>
          {warnings.map(h => (
            <Alert key={h.id} severity="warning">
              <AlertTitle sx={{ mb: 0.25 }}>{h.title}</AlertTitle>
              <Typography variant="body2">{h.message}</Typography>
              {h.evidence && (
                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>{h.evidence}</Typography>
              )}
            </Alert>
          ))}
          {tips.length > 0 && (
            <Typography variant="subtitle2" color="text.secondary" mt={warnings.length ? 1 : 0}>
              Common reasons requests like this are sent back
            </Typography>
          )}
          {tips.map(h => (
            <Alert key={h.id} severity="info" variant="outlined">
              <AlertTitle sx={{ mb: 0.25 }}>{h.title}</AlertTitle>
              <Typography variant="body2">{h.message}</Typography>
              {h.evidence && (
                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>{h.evidence}</Typography>
              )}
            </Alert>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default RequestHints;
