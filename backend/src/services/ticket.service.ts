import { TicketStatus } from '@prisma/client';
import { getPrisma } from '../db.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import * as auditService from './audit.service.js';
import { emitTicketUpdate, emitToAllServers, emitHookExecute, toHookTicketPayload } from '../socket/events.js';

const prisma = () => getPrisma();

const STAFF_ROLES = ['staff', 'admin'];
const PLAYER_STATUS_TARGETS: TicketStatus[] = ['open', 'closed'];

type TicketNotificationTarget = {
  id: number;
  title: string;
  authorId: number;
  serverId: string | null;
  author?: { minecraftUuid?: string | null } | null;
};

function isStaffRole(role: string) {
  return STAFF_ROLES.includes(role);
}

function assertPlayerStatusTransition(currentStatus: TicketStatus, nextStatus: TicketStatus) {
  if (!PLAYER_STATUS_TARGETS.includes(nextStatus)) {
    throw new ForbiddenError('玩家只能开启或关闭自己的议题');
  }
  if (currentStatus === 'invalid') {
    throw new ForbiddenError('无效议题只能由管理员或管理组重新打开');
  }
  if (nextStatus === 'open' && currentStatus !== 'closed') {
    throw new ForbiddenError('只有已关闭的议题可以重新打开');
  }
  if (nextStatus === 'closed' && currentStatus !== 'open' && currentStatus !== 'in_progress') {
    throw new ForbiddenError('只有开放或处理中的议题可以关闭');
  }
}

async function emitStatusChanged(
  ticket: TicketNotificationTarget,
  actorUserId: number,
  oldStatus: TicketStatus,
  newStatus: TicketStatus,
) {
  if (ticket.authorId === actorUserId || !ticket.author?.minecraftUuid) return;

  const actor = await prisma().user.findUnique({
    where: { id: actorUserId },
    select: { id: true, username: true, minecraftName: true, minecraftUuid: true },
  });

  const payload = {
    ticketId: ticket.id,
    title: ticket.title,
    playerUuid: ticket.author.minecraftUuid,
    oldStatus,
    newStatus,
    actorUserId,
    actorMinecraftUuid: actor?.minecraftUuid ?? null,
    actorName: actor?.minecraftName || actor?.username || null,
  };

  if (ticket.serverId) {
    emitTicketUpdate(ticket.serverId, 'ticket:status_changed', payload);
  } else {
    emitToAllServers('ticket:status_changed', payload);
  }
}

interface CreateTicketInput {
  title: string;
  body: string;
  template: string;
  formData?: Record<string, string>;
  serverId?: string;
  authorId: number;
  gameContext?: string;
}

interface ListTicketsInput {
  page?: number;
  pageSize?: number;
  status?: TicketStatus;
  type?: string;
  authorId?: number;
  serverId?: string;
  labelId?: string;
  search?: string;
}

export async function create(input: CreateTicketInput) {
  return prisma().ticket.create({
    data: {
      title: input.title,
      body: input.body,
      template: input.template,
      formData: input.formData ? JSON.stringify(input.formData) : null,
      gameContext: input.gameContext ?? null,
      authorId: input.authorId,
      serverId: input.serverId,
    },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      labels: { include: { label: true } },
    },
  });
}

export async function list(input: ListTicketsInput) {
  const page = input.page || 1;
  const pageSize = input.pageSize || 20;
  const where: any = {};

  if (input.status) where.status = input.status;
  if (input.type) where.template = input.type;
  if (input.authorId) where.authorId = input.authorId;
  if (input.serverId) where.serverId = input.serverId;
  if (input.labelId) where.labels = { some: { labelId: input.labelId } };
  if (input.search) where.OR = [
    { title: { contains: input.search } },
    { body: { contains: input.search } },
  ];

  const [tickets, total] = await Promise.all([
    prisma().ticket.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, username: true, minecraftName: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma().ticket.count({ where }),
  ]);

  return { tickets, total, page, pageSize };
}

export async function getById(id: number) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');
  return ticket;
}

export async function update(
  id: number,
  userId: number,
  userRole: string,
  data: { status?: TicketStatus; assigneeId?: number },
) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, minecraftName: true, minecraftUuid: true } },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  const updateData: any = {};
  if (data.status) {
    if (!isStaff) {
      assertPlayerStatusTransition(ticket.status, data.status);
    }

    updateData.status = data.status;
    if (data.status === 'closed' || data.status === 'invalid') {
      updateData.closedAt = new Date();
    } else {
      updateData.closedAt = null;
    }
  }
  if (data.assigneeId && isStaff) updateData.assigneeId = data.assigneeId;

  await prisma().ticket.update({
    where: { id },
    data: updateData,
  });

  if (data.status && data.status !== ticket.status) {
    await auditService.create(id, userId, 'status_change', ticket.status, data.status);
    await emitStatusChanged(ticket, userId, ticket.status, data.status);
    // Emit completion hooks if template has hooks for this status
    if (ticket.serverId) {
      const updatedTicket = await prisma().ticket.findUnique({
        where: { id },
        include: {
          author: { select: { minecraftUuid: true, minecraftName: true } },
        },
      });
      if (updatedTicket) {
        emitHookExecute(ticket.serverId, toHookTicketPayload(updatedTicket), data.status);
      }
    }
  }
  if (data.assigneeId && data.assigneeId !== ticket.assigneeId) {
    await auditService.create(id, userId, 'assign',
      ticket.assigneeId != null ? String(ticket.assigneeId) : 'unassigned',
      String(data.assigneeId));
  }

  return prisma().ticket.update({
    where: { id },
    data: updateData,
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
    },
  });
}

export async function updateBody(id: number, userId: number, userRole: string, body: string) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);
  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  const updated = await prisma().ticket.update({
    where: { id },
    data: { body },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
    },
  });

  await auditService.create(id, userId, 'body_change', ticket.body, body);

  return updated;
}

export async function updateTitle(id: number, userId: number, userRole: string, title: string) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);
  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  if (title === ticket.title) {
    return prisma().ticket.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true, minecraftName: true } },
        assignee: { select: { id: true, username: true } },
        labels: { include: { label: true } },
        server: { select: { id: true, name: true } },
      },
    });
  }

  const updated = await prisma().ticket.update({
    where: { id },
    data: { title },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
    },
  });

  await auditService.create(id, userId, 'title_change', ticket.title, title);

  return updated;
}

export async function closeTicket(id: number, userId: number, userRole: string) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, minecraftUuid: true, minecraftName: true } },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');
  if (ticket.status !== 'open' && ticket.status !== 'in_progress') {
    throw new ForbiddenError('只有开放或处理中的议题可以关闭');
  }

  await prisma().ticket.update({
    where: { id },
    data: { status: 'closed', closedAt: new Date() },
  });

  await auditService.create(id, userId, 'status_change', ticket.status, 'closed');

  await emitStatusChanged(ticket, userId, ticket.status, 'closed');

  if (ticket.serverId) {
    const updatedTicket = await prisma().ticket.findUnique({
      where: { id },
      include: {
        author: { select: { minecraftUuid: true, minecraftName: true } },
      },
    });
    if (updatedTicket) {
      emitHookExecute(ticket.serverId, toHookTicketPayload(updatedTicket), 'closed');
    }
  }

  return getById(id);
}

export async function reopenTicket(id: number, userId: number, userRole: string) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, minecraftUuid: true, minecraftName: true } },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');
  if (ticket.status !== 'closed' && !(ticket.status === 'invalid' && isStaff)) {
    throw new ForbiddenError('只有已关闭的议题可以重新打开');
  }

  await prisma().ticket.update({
    where: { id },
    data: { status: 'open', closedAt: null },
  });

  await auditService.create(id, userId, 'status_change', ticket.status, 'open');

  await emitStatusChanged(ticket, userId, ticket.status, 'open');

  return getById(id);
}
