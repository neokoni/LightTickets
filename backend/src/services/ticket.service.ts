import { PrismaClient, TicketStatus, Priority } from '@prisma/client';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import * as auditService from './audit.service.js';
import { emitTicketUpdate, emitHookExecute } from '../socket/events.js';

const prisma = new PrismaClient();

interface CreateTicketInput {
  title: string;
  body: string;
  template: string;
  formData?: Record<string, string>;
  priority?: Priority;
  serverId?: string;
  authorId: string;
}

interface ListTicketsInput {
  page?: number;
  pageSize?: number;
  status?: TicketStatus;
  type?: string;
  authorId?: string;
  serverId?: string;
  labelId?: string;
  search?: string;
}

export async function create(input: CreateTicketInput) {
  return prisma.ticket.create({
    data: {
      title: input.title,
      body: input.body,
      template: input.template,
      formData: input.formData ? JSON.stringify(input.formData) : null,
      priority: input.priority || 'medium',
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
    prisma.ticket.findMany({
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
    prisma.ticket.count({ where }),
  ]);

  return { tickets, total, page, pageSize };
}

export async function getById(id: number) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
      permissionRequest: true,
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');
  return ticket;
}

export async function update(
  id: number,
  userId: string,
  userRole: string,
  data: { status?: TicketStatus; priority?: Priority; assigneeId?: string },
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, minecraftName: true, minecraftUuid: true } },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  const updateData: any = {};
  if (data.status) {
    updateData.status = data.status;
    if (data.status === 'closed' || data.status === 'resolved') {
      updateData.closedAt = new Date();
    }
  }
  if (data.priority && isStaff) updateData.priority = data.priority;
  if (data.assigneeId && isStaff) updateData.assigneeId = data.assigneeId;

  await prisma.ticket.update({
    where: { id },
    data: updateData,
  });

  if (data.status && data.status !== ticket.status) {
    await auditService.create(id, userId, 'status_change', ticket.status, data.status);
    if (ticket.serverId && ticket.author?.minecraftUuid) {
      emitTicketUpdate(ticket.serverId, 'ticket:status_changed', {
        ticketId: ticket.id,
        playerUuid: ticket.author.minecraftUuid,
        oldStatus: ticket.status,
        newStatus: data.status,
      });
    }
    // Emit completion hooks if template has hooks for this status
    if (ticket.serverId) {
      const updatedTicket = await prisma.ticket.findUnique({
        where: { id },
        include: { author: { select: { minecraftUuid: true, minecraftName: true } } },
      });
      if (updatedTicket) {
        emitHookExecute(ticket.serverId, updatedTicket, data.status);
      }
    }
  }
  if (data.assigneeId && data.assigneeId !== ticket.assigneeId) {
    await auditService.create(id, userId, 'assign', ticket.assigneeId || 'unassigned', data.assigneeId);
  }
  if (data.priority && data.priority !== ticket.priority) {
    await auditService.create(id, userId, 'priority_change', ticket.priority, data.priority);
  }

  return prisma.ticket.update({
    where: { id },
    data: updateData,
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
      permissionRequest: true,
    },
  });
}

export async function updateBody(id: number, userId: string, userRole: string, body: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';
  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  return prisma.ticket.update({
    where: { id },
    data: { body },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
      permissionRequest: true,
    },
  });
}

export async function updateTitle(id: number, userId: string, userRole: string, title: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';
  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  if (title === ticket.title) {
    return prisma.ticket.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true, minecraftName: true } },
        assignee: { select: { id: true, username: true } },
        labels: { include: { label: true } },
        server: { select: { id: true, name: true } },
        permissionRequest: true,
      },
    });
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: { title },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
      permissionRequest: true,
    },
  });

  await auditService.create(id, userId, 'title_change', ticket.title, title);

  return updated;
}

export async function closeTicket(id: number, userId: string, userRole: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, minecraftUuid: true, minecraftName: true } },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');
  if (ticket.status !== 'open' && ticket.status !== 'in_progress') {
    throw new ForbiddenError('只有开放或处理中的议题可以关闭');
  }

  await prisma.ticket.update({
    where: { id },
    data: { status: 'resolved', closedAt: new Date() },
  });

  await auditService.create(id, userId, 'status_change', ticket.status, 'resolved');

  if (ticket.serverId && ticket.author?.minecraftUuid) {
    emitTicketUpdate(ticket.serverId, 'ticket:status_changed', {
      ticketId: ticket.id,
      playerUuid: ticket.author.minecraftUuid,
      oldStatus: ticket.status,
      newStatus: 'resolved',
    });
  }

  if (ticket.serverId) {
    const updatedTicket = await prisma.ticket.findUnique({
      where: { id },
      include: { author: { select: { minecraftUuid: true, minecraftName: true } } },
    });
    if (updatedTicket) {
      emitHookExecute(ticket.serverId, updatedTicket, 'resolved');
    }
  }

  return getById(id);
}

export async function reopenTicket(id: number, userId: string, userRole: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, minecraftUuid: true, minecraftName: true } },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');
  if (ticket.status !== 'resolved' && !(ticket.status === 'closed' && isStaff)) {
    throw new ForbiddenError('只有已解决的议题可以重新打开');
  }

  await prisma.ticket.update({
    where: { id },
    data: { status: 'open', closedAt: null },
  });

  await auditService.create(id, userId, 'status_change', ticket.status, 'open');

  if (ticket.serverId && ticket.author?.minecraftUuid) {
    emitTicketUpdate(ticket.serverId, 'ticket:status_changed', {
      ticketId: ticket.id,
      playerUuid: ticket.author.minecraftUuid,
      oldStatus: ticket.status,
      newStatus: 'open',
    });
  }

  return getById(id);
}