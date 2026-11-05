/**
 * Field-level tips on the float and purchase request forms.
 *
 * The draft is checked against the things reviewers most often send requests
 * back for (see POST /insights/request-hints). Instead of a separate panel,
 * each tip appears as a single quiet line under the part of the form it is
 * about — the attachments, the items, the justification — and disappears as
 * soon as it is dealt with. Advisory only: nothing here blocks submitting.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Collapse, Typography } from '@mui/material';
import { InfoOutlined as TipIcon } from '@mui/icons-material';
import insightsService, { FloatDraft, InsightsModule, ProcurementDraft, RequestHint } from '../../services/insightsService';

const DEBOUNCE_MS = 700;

/** The checks the current draft does not yet meet, keyed by id. */
export function useRequestHints(module: InsightsModule, draft: FloatDraft | ProcurementDraft): Map<string, RequestHint> {
  const [hints, setHints] = useState<Map<string, RequestHint>>(new Map());
  // Re-check only when the draft's content changes, not on every render.
  const draftKey = useMemo(() => JSON.stringify(draft), [draft]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      insightsService.getRequestHints(module, JSON.parse(draftKey))
        .then(res => {
          if (cancelled) return;
          setHints(new Map(res.hints.filter(h => h.severity === 'warning').map(h => [h.id, h])));
        })
        .catch(() => { /* tips are optional; on failure none are shown */ });
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [module, draftKey]);

  return hints;
}

/** One quiet line of guidance under a form section. Renders nothing when `show` is false. */
export const InlineTip: React.FC<{ show: boolean; children: React.ReactNode; sx?: object }> = ({ show, children, sx }) => (
  <Collapse in={show} unmountOnExit>
    <Box display="flex" alignItems="flex-start" gap={0.75} sx={{ mt: 1, color: 'warning.dark', ...sx }}>
      <TipIcon sx={{ fontSize: 16, mt: '2px' }} />
      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{children}</Typography>
    </Box>
  </Collapse>
);
