import { CommentSource } from '@prisma/client';
import { prisma } from '../db.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import * as auditService from './audit.service.js';
import * as attachmentService from './attachment.service.js';
import { emitTicketUpdate, emitToAllServers } from '../socket/events.js';
import { AUDIT_ACTION } from '../constants/audit-actions.js';
import { isStaffRole } from '../constants/roles.js';
import * as ticketService from './ticket.service.js';

export async function create(
  ticketId: number,
  authorId: number,
  body: string,
  source: CommentSource = CommentSource.web,
  userRole = 'player',
) {
  await ticketService.assertTicketVisible(ticketId, { userId: authorId, role: userRole });
  const ticket = await prisma().ticket.findUnique({
    where: { id: ticketId },
    include: {
      author: { select: { id: true, minecraftUuid: true } },
      assignees: {
        include: {
          user: { select: { id: true, minecraftUuid: true } },
        },
      },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const comment = await prisma().comment.create({
    data: { ticketId, authorId, body, source },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          minecraftName: true,
          minecraftUuid: true,
          avatarUrl: true,
        },
      },
    },
  });

  const targetUuids = new Set<string>();
  if (ticket.author?.minecraftUuid && ticket.authorId !== authorId) {
    targetUuids.add(ticket.author.minecraftUuid);
  }
  for (const assignee of ticket.assignees) {
    if (assignee.user.id !== authorId && assignee.user.minecraftUuid) {
      targetUuids.add(assignee.user.minecraftUuid);
    }
  }

  if (
    targetUuids.size === 0 &&
    source === CommentSource.minecraft &&
    ticket.authorId === authorId
  ) {
    const staffUsers = await prisma().user.findMany({
      where: {
        role: { in: ['staff', 'admin'] },
        minecraftUuid: { not: null },
        id: { not: authorId },
      },
      select: { minecraftUuid: true },
    });
    for (const staff of staffUsers) {
      if (staff.minecraftUuid) targetUuids.add(staff.minecraftUuid);
    }
  }

  for (const playerUuid of targetUuids) {
    const payload = {
      ticketId: ticket.id,
      title: ticket.title,
      playerUuid,
      commentId: comment.id,
      body: comment.body,
      authorUserId: comment.author.id,
      authorMinecraftUuid: comment.author.minecraftUuid,
      authorName: comment.author.minecraftName || comment.author.username,
      source,
    };

    if (ticket.serverId) {
      emitTicketUpdate(ticket.serverId, 'ticket:comment_created', payload);
    } else {
      emitToAllServers('ticket:comment_created', payload);
    }
  }

  return comment;
}

export async function listByTicket(ticketId: number, viewer?: ticketService.TicketViewer) {
  await ticketService.assertTicketVisible(ticketId, viewer);
  return prisma().comment.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, username: true, minecraftName: true, avatarUrl: true } },
    },
  });
}

export async function updateBody(id: string, userId: number, body: string, userRole: string) {
  const comment = await prisma().comment.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!comment) throw new NotFoundError('评论不存在');
  await ticketService.assertTicketVisible(comment.ticketId, { userId, role: userRole });
  if (comment.authorId !== userId) throw new ForbiddenError('无权操作此评论');

  const updated = await prisma().comment.update({
    where: { id },
    data: { body },
    include: {
      author: { select: { id: true, username: true, minecraftName: true, avatarUrl: true } },
    },
  });

  await auditService.create(
    comment.ticketId,
    userId,
    AUDIT_ACTION.COMMENT_EDIT,
    comment.body,
    body,
  );

  return updated;
}

export async function deleteComment(id: string, userId: number, userRole: string) {
  const comment = await prisma().comment.findUnique({
    where: { id },
    select: { id: true, authorId: true, ticketId: true },
  });
  if (!comment) throw new NotFoundError('评论不存在');
  await ticketService.assertTicketVisible(comment.ticketId, { userId, role: userRole });

  const isAuthor = comment.authorId === userId;
  const isStaff = isStaffRole(userRole);
  if (!isAuthor && !isStaff) throw new ForbiddenError('无权删除此评论');

  await attachmentService.cleanupCommentAttachments(id);
  await prisma().comment.delete({ where: { id } });
}
