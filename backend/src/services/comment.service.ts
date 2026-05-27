import { PrismaClient, CommentSource } from '@prisma/client';
import { NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function create(ticketId: number, authorId: string, body: string, source: CommentSource = 'web') {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('议题不存在');

  return prisma.comment.create({
    data: { ticketId, authorId, body, source },
    include: { author: { select: { id: true, username: true, minecraftName: true } } },
  });
}

export async function listByTicket(ticketId: number) {
  return prisma.comment.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, username: true, minecraftName: true } } },
  });
}
