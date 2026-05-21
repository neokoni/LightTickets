import { PrismaClient, TicketStatus, TicketType, Priority } from '@prisma/client';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import * as auditService from './audit.service.js';

const prisma = new PrismaClient();

interface CreateTicketInput {
  title: string;
  body: string;
  type: TicketType;
  priority?: Priority;
  serverId?: string;
  authorId: string;
}

interface ListTicketsInput {
  page?: number;
  pageSize?: number;
  status?: TicketStatus;
  type?: TicketType;
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
      type: input.type,
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
  if (input.type) where.type = input.type;
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

export async function getById(id: string) {
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
  if (!ticket) throw new NotFoundError('工单不存在');
  return ticket;
}

export async function update(
  id: string,
  userId: string,
  userRole: string,
  data: { status?: TicketStatus; priority?: Priority; assigneeId?: string },
) {
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw new NotFoundError('工单不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此工单');

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