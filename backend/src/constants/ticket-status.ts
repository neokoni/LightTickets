export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
  INVALID: 'invalid',
} as const;

export type AppTicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export function canTransitionTicketStatus(from: AppTicketStatus, to: AppTicketStatus): boolean {
  if (from === TICKET_STATUS.OPEN) return to === TICKET_STATUS.CLOSED;
  if (from === TICKET_STATUS.IN_PROGRESS) return to === TICKET_STATUS.CLOSED;
  if (from === TICKET_STATUS.CLOSED) return to === TICKET_STATUS.OPEN;
  if (from === TICKET_STATUS.INVALID) return to === TICKET_STATUS.OPEN;
  return false;
}
