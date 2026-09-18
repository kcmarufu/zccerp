/**
 * The status vocabulary, in one place.
 *
 * Eight statuses read very differently at a glance, so the colour and the label
 * are defined once and every screen — tracker, queue, grid, report — uses them.
 */

import React from 'react';
import { Chip, ChipProps } from '@mui/material';
import { TimesheetStatus } from '../../types';

type Colour = ChipProps['color'];

const STATUS_META: Record<TimesheetStatus, { label: string; color: Colour }> = {
  NOT_STARTED:  { label: 'Not Started',  color: 'default' },
  DRAFT:        { label: 'Draft',        color: 'default' },
  SUBMITTED:    { label: 'Submitted',    color: 'info' },
  UNDER_REVIEW: { label: 'Under Review', color: 'warning' },
  APPROVED:     { label: 'Approved',     color: 'success' },
  REJECTED:     { label: 'Rejected',     color: 'error' },
  RETURNED:     { label: 'Returned',     color: 'warning' },
  LOCKED:       { label: 'Locked',       color: 'success' },
};

export const statusLabel = (status: TimesheetStatus): string =>
  STATUS_META[status]?.label || String(status).replace(/_/g, ' ');

export const statusColor = (status: TimesheetStatus): Colour =>
  STATUS_META[status]?.color || 'default';

/** Statuses the owner may still edit and resubmit from. */
export const isEditableStatus = (status: TimesheetStatus): boolean =>
  status === 'DRAFT' || status === 'REJECTED' || status === 'RETURNED';

/** Statuses sitting with an approver. */
export const isPendingStatus = (status: TimesheetStatus): boolean =>
  status === 'SUBMITTED' || status === 'UNDER_REVIEW';

interface Props {
  status: TimesheetStatus;
  size?: 'small' | 'medium';
  variant?: 'filled' | 'outlined';
}

const TimesheetStatusChip: React.FC<Props> = ({ status, size = 'small', variant = 'filled' }) => (
  <Chip
    label={statusLabel(status)}
    color={statusColor(status)}
    size={size}
    variant={status === 'NOT_STARTED' ? 'outlined' : variant}
  />
);

export default TimesheetStatusChip;

export const ALL_STATUSES: TimesheetStatus[] = [
  'NOT_STARTED', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW',
  'APPROVED', 'REJECTED', 'RETURNED', 'LOCKED',
];

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Years the pickers offer: last year, this year, next year. */
export const yearOptions = (): number[] => {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1];
};
