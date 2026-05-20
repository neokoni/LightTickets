import { PrismaClient, CommentSource } from '@prisma/client';
import { NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function create(ticketId: string, authorId: string, body: string, source: CommentSource = 'web') {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  return prisma.comment.create({
    data: { ticketId, authorId, body, source },
    include: { author: { select: { id: true, username: true, minecraftName: true } } },
  });
}

export async function listByTicket(ticketId: string) {
  return prisma.comment.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, username: true, minecraftName: true } } },
  });
}
