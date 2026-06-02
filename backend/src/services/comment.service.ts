import { PrismaClient, CommentSource } from '@prisma/client';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import * as auditService from './audit.service.js';

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

export async function updateBody(id: string, userId: string, body: string) {
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!comment) throw new NotFoundError('评论不存在');
  if (comment.authorId !== userId) throw new ForbiddenError('无权操作此评论');

  const updated = await prisma.comment.update({
    where: { id },
    data: { body },
    include: { author: { select: { id: true, username: true, minecraftName: true } } },
  });

  await auditService.create(comment.ticketId, userId, 'comment_edit', comment.body, body);

  return updated;
}
