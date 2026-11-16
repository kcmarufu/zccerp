/**
 * Comments & approval trail, shown as one conversation.
 *
 * Float requests and purchase requests log every step — submissions,
 * approvals, rejections, edits and free comments — to a trail. This renders
 * that trail oldest-first like a chat, so the newest entry sits right above the
 * comment box, and lets anyone involved reply in place.
 *
 *  - <RequestDiscussion>  full panel: timeline + "All / Comments only" filter + composer
 *  - <CommentsDigest>     compact list for approve/reject dialogs, so the
 *                         approver reads what was said before deciding
 *
 * Colours come from the theme palette only.
 */
import React, { useMemo, useState } from 'react';
import {
  Avatar, Box, Button, Chip, Divider, Paper, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { alpha, useTheme, Theme } from '@mui/material/styles';
import { ChatBubbleOutline as ChatIcon } from '@mui/icons-material';
import TrailCommentBox from './TrailCommentBox';
import { formatDateTime } from '../../utils/datetime';
import { formatRoleLabel } from '../../utils/roleUtils';

// ── Normalising the two trail shapes (float approval_logs / procurement logs) ──

export interface TrailEntry {
  id: string | number;
  action: string;
  name: string;
  initials: string;
  role: string;
  text: string;
  at: string;
  from?: string | null;
  to?: string | null;
}

export const normalizeTrail = (
  logs: any[] = [],
  roleLabel: (log: any) => string = (log) =>
    formatRoleLabel(log.actor_role || log.approver_role, log.actor_job_title),
): TrailEntry[] =>
  logs.map((log, i) => {
    const first = log.actor_first_name || log.approver_first_name || '';
    const last = log.actor_last_name || log.approver_last_name || '';
    const name = (log.actor_name || `${first} ${last}`).trim() || 'Unknown user';
    const parts = name.split(/\s+/);
    return {
      id: log.id ?? i,
      action: String(log.action || ''),
      name,
      initials: ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase(),
      role: roleLabel(log),
      text: String(log.comment || log.comments || '').trim(),
      at: log.created_at,
      from: log.previous_status,
      to: log.new_status,
    };
  });

/** A float generated from a purchase request carries the PR's trail, prefixed PR_. */
const baseAction = (action: string) => action.replace(/^PR_/, '');
export const isComment = (action: string) => baseAction(action) === 'COMMENT';

const ACTION_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REVERSED: 'Approval reversed',
  DISPATCHED: 'Dispatched',
  EDITED: 'Edited',
  EDITED_AFTER_REJECTION: 'Edited after rejection',
  EDITED_AFTER_SUBMISSION: 'Edited while pending',
  REROUTED: 'Re-routed',
  GENERATED_FROM_PR: 'Payment requisition generated',
  FINAL_APPROVED: 'Approved for payment',
};

const actionLabel = (action: string) => {
  const base = baseAction(action);
  const label = ACTION_LABELS[base] ||
    base.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return action.startsWith('PR_') ? `Purchase request · ${label}` : label;
};

const statusLabel = (s?: string | null) =>
  String(s || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

type Tone = 'success' | 'error' | 'warning' | 'info' | 'primary';
const toneOf = (action: string, isAmendment?: (a: string) => boolean): Tone => {
  const a = baseAction(action);
  if (a === 'COMMENT') return 'primary';
  if (isAmendment?.(a) || a.startsWith('EDITED') || a === 'REVERSED' || a === 'REROUTED') return 'warning';
  if (a.includes('REJECT')) return 'error';
  if (a.includes('APPROVED') || a === 'DISPATCHED' || a === 'GENERATED_FROM_PR' || a === 'PAID_IN_FULL') return 'success';
  return 'info';
};

// ── One timeline row ──────────────────────────────────────────────────────────

const EntryRow: React.FC<{ e: TrailEntry; theme: Theme; last: boolean; isAmendment?: (a: string) => boolean }> = ({
  e, theme, last, isAmendment,
}) => {
  const tone = toneOf(e.action, isAmendment);
  const color = theme.palette[tone].main;
  const comment = isComment(e.action);

  return (
    <Box display="flex" gap={1.5} sx={{ position: 'relative', pb: last ? 0 : 2 }}>
      {/* Rail connecting the avatars */}
      {!last && (
        <Box sx={{ position: 'absolute', left: 15, top: 34, bottom: 0, width: 2, bgcolor: 'divider' }} />
      )}
      <Avatar
        sx={{
          width: 32, height: 32, fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
          bgcolor: alpha(color, 0.14), color, border: `2px solid ${alpha(color, 0.4)}`,
        }}
      >
        {e.initials || '?'}
      </Avatar>

      <Box flex={1} minWidth={0}>
        <Box display="flex" alignItems="baseline" flexWrap="wrap" columnGap={1}>
          <Typography variant="body2" fontWeight={700}>{e.name}</Typography>
          {e.role && <Typography variant="caption" color="text.secondary">{e.role}</Typography>}
          <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>
            {formatDateTime(e.at)}
          </Typography>
        </Box>

        {!comment && (
          <Box display="flex" alignItems="center" flexWrap="wrap" gap={1} mt={0.25}>
            <Chip
              label={actionLabel(e.action)} size="small" color={tone}
              variant={tone === 'success' || tone === 'error' ? 'filled' : 'outlined'}
              sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
            />
            {e.from && e.to && e.from !== e.to && (
              <Typography variant="caption" color="text.secondary">
                {statusLabel(e.from)} → {statusLabel(e.to)}
              </Typography>
            )}
          </Box>
        )}

        {e.text && (
          <Box
            sx={{
              mt: 0.75, px: 1.5, py: 1, borderRadius: comment ? '4px 12px 12px 12px' : 1,
              bgcolor: comment ? alpha(theme.palette.primary.main, 0.06) : 'action.hover',
              borderLeft: comment ? 'none' : `3px solid ${alpha(color, 0.6)}`,
            }}
          >
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {e.text}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// ── Full panel ────────────────────────────────────────────────────────────────

interface DiscussionProps {
  logs: any[];
  /** Saves a comment; omit to render read-only. */
  onPost?: (comment: string) => Promise<unknown>;
  /** Reload after a comment is saved. */
  onPosted?: () => void;
  title?: string;
  /** How many of the newest entries to show before "Show earlier". */
  initialVisible?: number;
  roleLabel?: (log: any) => string;
  isAmendment?: (action: string) => boolean;
  /** Render without the outer Paper (e.g. inside a dialog card). */
  bare?: boolean;
}

export const RequestDiscussion: React.FC<DiscussionProps> = ({
  logs, onPost, onPosted, title = 'Comments & Approval Trail', initialVisible = 6, roleLabel, isAmendment, bare,
}) => {
  const theme = useTheme();
  const [filter, setFilter] = useState<'all' | 'comments'>('all');
  const [showAll, setShowAll] = useState(false);

  const entries = useMemo(() => normalizeTrail(logs, roleLabel), [logs, roleLabel]);
  const commentCount = entries.filter((e) => isComment(e.action)).length;
  const shown = filter === 'comments' ? entries.filter((e) => isComment(e.action)) : entries;
  const hidden = showAll ? 0 : Math.max(0, shown.length - initialVisible);
  const visible = shown.slice(hidden);

  const body = (
    <>
      <Box display="flex" alignItems="center" flexWrap="wrap" gap={1} mb={2}>
        <Box flex={1} minWidth={180}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChatIcon fontSize="small" color="primary" /> {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {commentCount} comment{commentCount !== 1 ? 's' : ''} · {entries.length - commentCount} workflow action{entries.length - commentCount !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <ToggleButtonGroup
          size="small" exclusive value={filter}
          onChange={(_, v) => v && setFilter(v)}
          sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.25, textTransform: 'none' } }}
        >
          <ToggleButton value="all">All activity</ToggleButton>
          <ToggleButton value="comments">Comments ({commentCount})</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {hidden > 0 && (
        <Box textAlign="center" mb={2}>
          <Button size="small" onClick={() => setShowAll(true)}>
            Show {hidden} earlier entr{hidden === 1 ? 'y' : 'ies'}
          </Button>
        </Box>
      )}

      {visible.length === 0 ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 2, textAlign: 'center' }}>
          {filter === 'comments' ? 'No comments yet. Start the conversation below.' : 'No activity recorded yet.'}
        </Typography>
      ) : (
        visible.map((e, i) => (
          <EntryRow key={e.id} e={e} theme={theme} last={i === visible.length - 1} isAmendment={isAmendment} />
        ))
      )}

      {onPost && (
        <>
          <Divider sx={{ my: 2 }} />
          <TrailCommentBox onSubmit={onPost} onAdded={() => onPosted?.()} />
        </>
      )}
    </>
  );

  return bare ? body : <Paper elevation={2} sx={{ p: 3, mb: 3 }}>{body}</Paper>;
};

// ── Compact list for decision dialogs ─────────────────────────────────────────

/**
 * Everything said on the request so far — comments, rejection reasons and
 * resubmission notes — so the approver sees it right where they decide.
 */
export const CommentsDigest: React.FC<{ logs: any[]; roleLabel?: (log: any) => string }> = ({ logs, roleLabel }) => {
  const theme = useTheme();
  const said = useMemo(
    () => normalizeTrail(logs, roleLabel).filter((e) => e.text),
    [logs, roleLabel],
  );

  return (
    <Box
      sx={{
        mb: 2, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider',
        bgcolor: alpha(theme.palette.primary.main, 0.02),
      }}
    >
      <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <ChatIcon fontSize="small" color="primary" />
        Comments so far ({said.length})
      </Typography>
      {said.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No comments on this request yet.</Typography>
      ) : (
        <Box sx={{ maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
          {said.map((e, i) => (
            <EntryRow key={e.id} e={e} theme={theme} last={i === said.length - 1} />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default RequestDiscussion;
