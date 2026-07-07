import { prisma } from '../db.js';
import { NotFoundError } from '../utils/errors.js';
import type { AuditAction } from '../constants/audit-actions.js';
import { USER_BRIEF_SELECT } from './constants.js';

export async function listByTicket(ticketId: number) {
  const ticket = await prisma().ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('议题不存在');

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
