/**
 * Why the user may not raise a new request because of their reconciliations,
 * or a warning that they soon will not be able to.
 *
 * Two rules, both enforced by the API on submit:
 *   - 2 or more overdue reconciliations that were never submitted;
 *   - a rejected reconciliation left uncorrected for more than
 *     `staleRejectedDays` working days (Mon–Fri) after the rejection.
 *
 * Shared by the dashboard and both request forms so they all say the same thing.
 */
import React from 'react';
import { Alert, Box, Button, Chip, Typography } from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { ReconRequestBlock } from '../../services/reconciliationService';

interface Props {
  block: ReconRequestBlock | null;
  /** What is being blocked, e.g. "float requests" or "purchase requests". */
  subject: string;
  /** Hide the early warnings and show only an actual block. */
  blockOnly?: boolean;
  sx?: object;
}

const ReconBlockAlert: React.FC<Props> = ({ block, subject, blockOnly = false, sx }) => {
  const navigate = useNavigate();
  if (!block) return null;

  const overdue = Number(block.overdueCount) || 0;
  const stale = block.staleRejectedItems || [];
  const awaiting = block.rejectedAwaitingItems || [];
  const days = block.staleRejectedDays ?? 3;

  const showOverdue = block.overdueBlocked || (!blockOnly && overdue > 0);
  const showStale = stale.length > 0;
  const showAwaiting = !blockOnly && awaiting.length > 0;
  if (!showOverdue && !showStale && !showAwaiting) return null;

  const goButton = (
    <Button color="inherit" size="small" onClick={() => navigate('/finance/reconciliation')}>
      Open Reconciliation
    </Button>
  );

  return (
    <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1, ...sx }}>
      {(block.isBlocked) && (
        <Alert severity="error" icon={<WarningIcon />} action={goButton}>
          <Typography variant="subtitle2" fontWeight={700}>
            New {subject} are blocked
          </Typography>
          {block.overdueBlocked && (
            <Typography variant="body2">
              You have <strong>{overdue}</strong> overdue reconciliation{overdue !== 1 ? 's' : ''} that
              {overdue !== 1 ? ' have' : ' has'} not been submitted. Submit them to lift the block.
            </Typography>
          )}
          {showStale && (
            <>
              <Typography variant="body2" sx={{ mt: block.overdueBlocked ? 1 : 0 }}>
                <strong>{stale.length}</strong> of your reconciliations {stale.length !== 1 ? 'were' : 'was'} rejected
                and {stale.length !== 1 ? 'have' : 'has'} not been corrected for more than <strong>{days} working days</strong>.
                Amend and resubmit {stale.length !== 1 ? 'them' : 'it'} to lift the block.
              </Typography>
              <Box mt={0.5} display="flex" flexWrap="wrap" gap={0.5}>
                {stale.map(i => (
                  <Chip key={i.request_id} size="small" color="error" variant="outlined"
                    label={`${i.request_code} · rejected ${i.working_days_since_rejection} working days ago`} />
                ))}
              </Box>
            </>
          )}
        </Alert>
      )}

      {!block.overdueBlocked && showOverdue && (
        <Alert severity="warning" icon={<WarningIcon />} action={goButton}>
          <Typography variant="body2">
            You have <strong>{overdue}</strong> overdue reconciliation{overdue !== 1 ? 's' : ''}. Submit {overdue !== 1 ? 'them' : 'it'} soon —
            at {block.overdueLimit ?? 2} overdue, new {subject} are blocked.
          </Typography>
        </Alert>
      )}

      {showAwaiting && (
        <Alert severity="warning" icon={<WarningIcon />} action={block.isBlocked ? undefined : goButton}>
          <Typography variant="body2">
            {awaiting.length} rejected reconciliation{awaiting.length !== 1 ? 's are' : ' is'} waiting for you to correct.
            If a rejected reconciliation is not amended and resubmitted within <strong>{days} working days</strong>,
            new {subject} are blocked.
          </Typography>
          <Box mt={0.5} display="flex" flexWrap="wrap" gap={0.5}>
            {awaiting.map(i => {
              const left = days - Number(i.working_days_since_rejection);
              return (
                <Chip key={i.request_id} size="small" color="warning" variant="outlined"
                  label={`${i.request_code} · ${left > 0 ? `${left} working day${left !== 1 ? 's' : ''} left` : 'last day today'}`} />
              );
            })}
          </Box>
        </Alert>
      )}
    </Box>
  );
};

export default ReconBlockAlert;
