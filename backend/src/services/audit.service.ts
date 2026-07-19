import { prisma } from '../db.js';
import type { AuditAction } from '../constants/audit-actions.js';
import { USER_BRIEF_SELECT } from './constants.js';
import * as ticketService from './ticket.service.js';

export async function listByTicket(ticketId: number, viewer?: ticketService.TicketViewer) {
  await ticketService.assertTicketVisible(ticketId, viewer);

  return prisma().auditLog.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    include: {
      actor: { select: USER_BRIEF_SELECT },
    },
  });
}

export async function create(
  ticketId: number,
  actorId: number,
  action: AuditAction,
  oldValue?: string,
  newValue?: string,
) {
  return prisma().auditLog.create({
    data: { ticketId, actorId, action, oldValue, newValue },
    include: {
      actor: { select: USER_BRIEF_SELECT },
    },
  });
}
