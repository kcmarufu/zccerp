import { RequestStatus } from '../types';

/**
 * Statuses in which the requester may still amend their own float request.
 * Mirrors REQUESTER_EDITABLE_STATUSES in backend/src/config/roles.js — the
 * server enforces it, this only decides whether the Edit button is offered.
 */
export const REQUESTER_EDITABLE_STATUSES: RequestStatus[] = [
  'DRAFT',
  'REJECTED',
  'PENDING_LEAD_APPROVAL',
  'PENDING_ADMIN_APPROVAL',
  'PENDING_GS_APPROVAL',
  'PENDING_HOP_APPROVAL',
];

export const isRequesterEditable = (status?: string | null): boolean =>
  !!status && (REQUESTER_EDITABLE_STATUSES as string[]).includes(status);
