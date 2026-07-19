import type { TicketStatus, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import * as templateService from './template.service.js';
import { TICKET_INCLUDE_BASE, TICKET_INCLUDE_DETAIL, USER_BRIEF_SELECT } from './constants.js';
import { AUDIT_ACTION } from '../constants/audit-actions.js';
import { isStaffRole } from '../constants/roles.js';
import { TICKET_STATUS } from '../constants/ticket-status.js';
import { TEMPLATE_HIDDEN_MODE } from '../constants/ticket-visibility.js';
import {
  emitTicketUpdate,
  emitToAllServers,
  emitHookExecute,
  toHookTicketPayload,
} from '../socket/events.js';

type PrismaTx = Omit<
  ReturnType<typeof prisma>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const PLAYER_STATUS_TARGETS: TicketStatus[] = [TICKET_STATUS.OPEN, TICKET_STATUS.CLOSED];

type TicketNotificationTarget = {
  id: number;
  title: string;
  authorId: number;
  serverId: string | null;
  author?: { minecraftUuid?: string | null } | null;
};

function assertPlayerStatusTransition(currentStatus: TicketStatus, nextStatus: TicketStatus) {
  if (!PLAYER_STATUS_TARGETS.includes(nextStatus)) {
    throw new ForbiddenError('玩家只能开启或关闭自己的议题');
  }
  if (currentStatus === TICKET_STATUS.INVALID) {
    throw new ForbiddenError('无效议题只能由管理员或管理组重新打开');
  }
  if (nextStatus === TICKET_STATUS.OPEN && currentStatus !== TICKET_STATUS.CLOSED) {
    throw new ForbiddenError('只有已关闭的议题可以重新打开');
  }
  if (
    nextStatus === TICKET_STATUS.CLOSED &&
    currentStatus !== TICKET_STATUS.OPEN &&
    currentStatus !== TICKET_STATUS.IN_PROGRESS
  ) {
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

function createAudit(
  tx: PrismaTx,
  ticketId: number,
  actorId: number,
  action: (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION],
  oldValue?: string,
  newValue?: string,
) {
  return tx.auditLog.create({
    data: { ticketId, actorId, action, oldValue, newValue },
  });
}

interface CreateTicketInput {
  title: string;
  body?: string;
  template: string;
  formData?: Record<string, string>;
  serverId?: string;
  authorId: number;
  gameContext?: string;
  attachmentIds?: string[];
  hidden?: boolean;
}

interface ListTicketsInput {
  page?: number;
  pageSize?: number;
  statuses?: TicketStatus[];
  type?: string;
  authorId?: number;
  authorName?: string;
  serverId?: string;
  serverName?: string;
  hasServer?: boolean;
  labelId?: string;
  search?: string;
  viewer?: TicketViewer;
}

export interface TicketViewer {
  userId?: number;
  role?: string;
}

type TicketVisibility = { hidden: boolean; authorId: number };

export function canViewTicket(ticket: TicketVisibility, viewer?: TicketViewer): boolean {
  return (
    !ticket.hidden ||
    ticket.authorId === viewer?.userId ||
    (viewer?.role !== undefined && isStaffRole(viewer.role))
  );
}

function visibilityWhere(viewer?: TicketViewer): Prisma.TicketWhereInput {
  if (viewer?.role !== undefined && isStaffRole(viewer.role)) return {};
  if (viewer?.userId !== undefined) {
    return { OR: [{ hidden: false }, { authorId: viewer.userId }] };
  }
  return { hidden: false };
}

export async function assertTicketVisible(id: number, viewer?: TicketViewer) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    select: { id: true, hidden: true, authorId: true },
  });
  if (!ticket || !canViewTicket(ticket, viewer)) throw new NotFoundError('议题不存在');
  return ticket;
}

export function resolveTicketHidden(
  mode: ReturnType<typeof templateService.normalizeTemplateHiddenMode>,
  requested: boolean | undefined,
): boolean {
  if (mode === TEMPLATE_HIDDEN_MODE.OPTIONAL) {
    if (requested === undefined) throw new ValidationError('此模板必须选择议题可见性');
    return requested;
  }
  return mode;
}

export async function create(input: CreateTicketInput) {
  let title = input.title;
  let body = input.body;
  const def = templateService.getDefinition(input.template);
  if (!def) throw new ValidationError('无效的模板');
  const hidden = resolveTicketHidden(def.hidden, input.hidden);

  if (body === undefined) {
    body = templateService.renderBody(def, input.formData || {});
    if (def.title_prefix && !title.startsWith(def.title_prefix)) {
      title = def.title_prefix + title;
    }
  }

  const attachmentIds = Array.from(new Set(input.attachmentIds ?? []));

  return prisma().$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        title,
        body,
        template: input.template,
        formData: input.formData ? JSON.stringify(input.formData) : null,
        gameContext: input.gameContext ?? null,
        authorId: input.authorId,
        serverId: input.serverId,
        hidden,
      },
      include: TICKET_INCLUDE_BASE,
    });

    if (attachmentIds.length > 0) {
      const claimed = await tx.attachment.updateMany({
        where: {
          id: { in: attachmentIds },
          uploadedBy: input.authorId,
          ticketId: null,
          commentId: null,
        },
        data: { ticketId: ticket.id },
      });

      if (claimed.count !== attachmentIds.length) {
        throw new ValidationError('附件不存在或无权关联');
      }
    }

    return ticket;
  });
}

export async function list(input: ListTicketsInput) {
  const page = input.page || 1;
  const pageSize = input.pageSize || 20;
  const where: Prisma.TicketWhereInput = visibilityWhere(input.viewer);

  if (input.statuses && input.statuses.length > 0) where.status = { in: input.statuses };
  if (input.type) where.template = input.type;
  if (input.authorId) where.authorId = input.authorId;
  if (input.authorName) where.author = { username: { contains: input.authorName } };
  if (input.serverId) where.serverId = input.serverId;
  if (input.serverName) where.server = { name: input.serverName };
  if (input.hasServer !== undefined) where.serverId = input.hasServer ? { not: null } : null;
  if (input.labelId) where.labels = { some: { labelId: input.labelId } };
  if (input.search) {
    where.AND = [
      { OR: [{ title: { contains: input.search } }, { body: { contains: input.search } }] },
    ];
  }

  const [tickets, total] = await Promise.all([
    prisma().ticket.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: TICKET_INCLUDE_DETAIL,
    }),
    prisma().ticket.count({ where }),
  ]);

  return { tickets, total, page, pageSize };
}

export async function getById(id: number, viewer?: TicketViewer) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: {
      author: { select: USER_BRIEF_SELECT },
      assignees: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
    },
  });
  if (!ticket || !canViewTicket(ticket, viewer)) throw new NotFoundError('议题不存在');
  return ticket;
}

export async function update(
  id: number,
  userId: number,
  userRole: string,
  data: { status?: TicketStatus; assigneeId?: number; hidden?: boolean },
) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, minecraftName: true, minecraftUuid: true } },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');
  if (!canViewTicket(ticket, { userId, role: userRole })) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  const updateData: Prisma.TicketUncheckedUpdateInput = {};
  if (data.status) {
    if (!isStaff) {
      assertPlayerStatusTransition(ticket.status, data.status);
    }

    updateData.status = data.status;
    if (data.status === TICKET_STATUS.CLOSED || data.status === TICKET_STATUS.INVALID) {
      updateData.closedAt = new Date();
    } else {
      updateData.closedAt = null;
    }
  }
  if (data.assigneeId && isStaff) updateData.assigneeId = data.assigneeId;
  if (data.hidden !== undefined) {
    if (!isStaff) throw new ForbiddenError('只有管理员或管理组可以更改议题可见性');
    updateData.hidden = data.hidden;
  }

  const nextStatus = data.status;
  const nextAssigneeId = data.assigneeId;
  const statusChanged = nextStatus !== undefined && nextStatus !== ticket.status;
  const assigneeChanged = nextAssigneeId !== undefined && nextAssigneeId !== ticket.assigneeId;
  const visibilityChanged = data.hidden !== undefined && data.hidden !== ticket.hidden;

  const updated = await prisma().$transaction(async (tx) => {
    const updatedTicket = await tx.ticket.update({
      where: { id },
      data: updateData,
      include: {
        author: { select: USER_BRIEF_SELECT },
        labels: { include: { label: true } },
        server: { select: { id: true, name: true } },
      },
    });

    if (statusChanged) {
      await createAudit(tx, id, userId, AUDIT_ACTION.STATUS_CHANGE, ticket.status, nextStatus);
    }
    if (assigneeChanged) {
      await createAudit(
        tx,
        id,
        userId,
        AUDIT_ACTION.ASSIGN,
        ticket.assigneeId != null ? String(ticket.assigneeId) : 'unassigned',
        String(nextAssigneeId),
      );
    }
    if (visibilityChanged) {
      await createAudit(
        tx,
        id,
        userId,
        AUDIT_ACTION.VISIBILITY_CHANGE,
        String(ticket.hidden),
        String(data.hidden),
      );
    }

    return updatedTicket;
  });

  if (statusChanged) {
    await emitStatusChanged(ticket, userId, ticket.status, nextStatus);
    if (ticket.serverId) {
      const hookTicket = await prisma().ticket.findUnique({
        where: { id },
        include: {
          author: { select: { minecraftUuid: true, minecraftName: true } },
        },
      });
      if (hookTicket) {
        emitHookExecute(ticket.serverId, toHookTicketPayload(hookTicket), nextStatus);
      }
    }
  }

  return updated;
}

export async function updateBody(id: number, userId: number, userRole: string, body: string) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!ticket) throw new NotFoundError('议题不存在');
  if (!canViewTicket(ticket, { userId, role: userRole })) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);
  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  return prisma().$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id },
      data: { body },
      include: {
        author: { select: USER_BRIEF_SELECT },
        labels: { include: { label: true } },
        server: { select: { id: true, name: true } },
      },
    });

    await createAudit(tx, id, userId, AUDIT_ACTION.BODY_CHANGE, ticket.body, body);
    return updated;
  });
}

export async function updateTitle(id: number, userId: number, userRole: string, title: string) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!ticket) throw new NotFoundError('议题不存在');
  if (!canViewTicket(ticket, { userId, role: userRole })) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);
  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  if (title === ticket.title) {
    return prisma().ticket.findUnique({
      where: { id },
      include: {
        author: { select: USER_BRIEF_SELECT },
        labels: { include: { label: true } },
        server: { select: { id: true, name: true } },
      },
    });
  }

  return prisma().$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id },
      data: { title },
      include: {
        author: { select: USER_BRIEF_SELECT },
        labels: { include: { label: true } },
        server: { select: { id: true, name: true } },
      },
    });

    await createAudit(tx, id, userId, AUDIT_ACTION.TITLE_CHANGE, ticket.title, title);
    return updated;
  });
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
  if (!canViewTicket(ticket, { userId, role: userRole })) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');
  if (ticket.status !== TICKET_STATUS.OPEN && ticket.status !== TICKET_STATUS.IN_PROGRESS) {
    throw new ForbiddenError('只有开放或处理中的议题可以关闭');
  }

  await prisma().$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id },
      data: { status: TICKET_STATUS.CLOSED, closedAt: new Date() },
    });
    await createAudit(
      tx,
      id,
      userId,
      AUDIT_ACTION.STATUS_CHANGE,
      ticket.status,
      TICKET_STATUS.CLOSED,
    );
  });

  await emitStatusChanged(ticket, userId, ticket.status, TICKET_STATUS.CLOSED);

  if (ticket.serverId) {
    const updatedTicket = await prisma().ticket.findUnique({
      where: { id },
      include: {
        author: { select: { minecraftUuid: true, minecraftName: true } },
      },
    });
    if (updatedTicket) {
      emitHookExecute(ticket.serverId, toHookTicketPayload(updatedTicket), TICKET_STATUS.CLOSED);
    }
  }

  return getById(id, { userId, role: userRole });
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
  if (!canViewTicket(ticket, { userId, role: userRole })) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = isStaffRole(userRole);

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');
  if (
    ticket.status !== TICKET_STATUS.CLOSED &&
    !(ticket.status === TICKET_STATUS.INVALID && isStaff)
  ) {
    throw new ForbiddenError('只有已关闭的议题可以重新打开');
  }

  await prisma().$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id },
      data: { status: TICKET_STATUS.OPEN, closedAt: null },
    });
    await createAudit(
      tx,
      id,
      userId,
      AUDIT_ACTION.STATUS_CHANGE,
      ticket.status,
      TICKET_STATUS.OPEN,
    );
  });

  await emitStatusChanged(ticket, userId, ticket.status, TICKET_STATUS.OPEN);

  return getById(id, { userId, role: userRole });
}

export async function setAssignees(id: number, userId: number, assigneeIds: number[]) {
  const ticket = await prisma().ticket.findUnique({
    where: { id },
    include: {
      assignees: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const oldIds = ticket.assignees.map((a) => a.user.id);
  const toAdd = assigneeIds.filter((aid) => !oldIds.includes(aid));
  const toRemove = oldIds.filter((oid) => !assigneeIds.includes(oid));

  await prisma().$transaction(async (tx) => {
    await Promise.all([
      ...toRemove.map((uid) =>
        tx.ticketAssignee.delete({ where: { ticketId_userId: { ticketId: id, userId: uid } } }),
      ),
      ...toAdd.map((uid) => tx.ticketAssignee.create({ data: { ticketId: id, userId: uid } })),
    ]);

    if (toAdd.length > 0 || toRemove.length > 0) {
      await createAudit(
        tx,
        id,
        userId,
        AUDIT_ACTION.ASSIGNEES_CHANGE,
        JSON.stringify(oldIds),
        JSON.stringify(assigneeIds),
      );
    }
  });

  return getById(id, { userId, role: 'staff' });
}
