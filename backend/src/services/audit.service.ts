import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function listByTicket(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  return prisma.auditLog.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    include: {
      actor: { select: { id: true, username: true, minecraftName: true } },
    },
  });
}

export async function create(
  ticketId: string,
  actorId: string,
  action: string,
  oldValue?: string,
  newValue?: string,
) {
  return prisma.auditLog.create({
    data: { ticketId, actorId, action, oldValue, newValue },
    include: {
      actor: { select: { id: true, username: true, minecraftName: true } },
    },
  });
}
