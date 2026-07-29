import { CommentSource, type TicketStatus } from '@prisma/client';
import { getConfig } from '../config.js';
import { prisma } from '../db.js';
import { AppError, NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { generateLinkCode } from '../utils/link-code.js';
import { USER_PUBLIC_SELECT } from './constants.js';
import * as commentService from './comment.service.js';
import * as ticketService from './ticket.service.js';
import { generateMinecraftSecret, hashMinecraftSecret } from '../utils/minecraft-credential.js';
import { MINECRAFT_PLAYER_SESSION_TTL_MS } from '../constants/minecraft-session.js';
import type { MinecraftPlayerIdentity } from '../middleware/minecraft-player-session.js';

export async function createLinkCode(input: {
  minecraftUuid: string;
  minecraftName: string;
  serverId: string;
}) {
  const existing = await prisma().user.findUnique({
    where: { minecraftUuid: input.minecraftUuid },
  });
  if (existing) throw new AppError(409, '该Minecraft账号已绑定到账户');

  const code = generateLinkCode();
  const playerCredential = generateMinecraftSecret();
  const expiresAt = new Date(Date.now() + getConfig().linkCodeExpiry);
  const linkCode = await prisma().linkCode.create({
    data: {
      code,
      minecraftUuid: input.minecraftUuid,
      minecraftName: input.minecraftName,
      serverId: input.serverId,
      expiresAt,
      playerCredentialHash: hashMinecraftSecret(playerCredential),
    },
  });

  return { code: linkCode.code, expiresAt: linkCode.expiresAt, playerCredential };
}

export async function issuePlayerSession(input: {
  minecraftUuid: string;
  playerCredential: string;
  serverId: string;
}) {
  const credential = await prisma().minecraftPlayerCredential.findUnique({
    where: { credentialHash: hashMinecraftSecret(input.playerCredential) },
    include: { user: { select: { minecraftUuid: true } } },
  });
  if (!credential || credential.minecraftUuid !== input.minecraftUuid) {
    throw new UnauthorizedError('Minecraft player credential is invalid');
  }
  if (credential.user.minecraftUuid !== credential.minecraftUuid) {
    throw new UnauthorizedError('Minecraft account is no longer linked');
  }

  const sessionToken = generateMinecraftSecret();
  const expiresAt = new Date(Date.now() + MINECRAFT_PLAYER_SESSION_TTL_MS);
  await prisma().$transaction([
    prisma().minecraftPlayerSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
    prisma().minecraftPlayerSession.create({
      data: {
        credentialId: credential.id,
        serverId: input.serverId,
        tokenHash: hashMinecraftSecret(sessionToken),
        expiresAt,
      },
    }),
  ]);
  return { sessionToken, expiresAt };
}

export async function getLinkedUser(identity: MinecraftPlayerIdentity) {
  const user = await prisma().user.findUnique({
    where: { id: identity.userId },
    select: USER_PUBLIC_SELECT,
  });
  if (!user) throw new NotFoundError('该 Minecraft 账号未绑定');
  return user;
}

export async function listTicketsForMinecraft(input: {
  page?: number;
  pageSize?: number;
  identity: MinecraftPlayerIdentity;
}) {
  return listTicketsForMinecraftViewer(input);
}

export async function listTicketsForMinecraftViewer(input: {
  page?: number;
  pageSize?: number;
  identity: MinecraftPlayerIdentity;
}) {
  return ticketService.list({
    page: input.page,
    pageSize: input.pageSize,
    serverId: input.identity.serverId,
    viewer: { userId: input.identity.userId, role: input.identity.role },
  });
}

async function assertServerTicket(ticketId: number, serverId: string): Promise<void> {
  const ticket = await prisma().ticket.findFirst({
    where: { id: ticketId, serverId },
    select: { id: true },
  });
  if (!ticket) throw new NotFoundError('议题不存在');
}

export async function getTicketForMinecraft(ticketId: number, identity: MinecraftPlayerIdentity) {
  await assertServerTicket(ticketId, identity.serverId);
  return ticketService.getById(ticketId, { userId: identity.userId, role: identity.role });
}

export async function listCommentsForMinecraft(
  ticketId: number,
  identity: MinecraftPlayerIdentity,
) {
  await assertServerTicket(ticketId, identity.serverId);
  return commentService.listByTicket(ticketId, {
    userId: identity.userId,
    role: identity.role,
  });
}

export async function createTicketFromMinecraft(input: {
  title: string;
  body: string;
  template: string;
  formData?: Record<string, string>;
  context?: Record<string, unknown>;
  identity: MinecraftPlayerIdentity;
  hidden?: boolean;
}) {
  return ticketService.create({
    title: input.title,
    body: input.body,
    template: input.template,
    formData: input.formData || {},
    authorId: input.identity.userId,
    serverId: input.identity.serverId,
    creatorRole: input.identity.role,
    trustedServer: true,
    gameContext: input.context ? JSON.stringify(input.context) : undefined,
    hidden: input.hidden,
  });
}

export async function createCommentFromMinecraft(input: {
  ticketId: number;
  body: string;
  identity: MinecraftPlayerIdentity;
}) {
  await assertServerTicket(input.ticketId, input.identity.serverId);

  return commentService.create(
    input.ticketId,
    input.identity.userId,
    input.body,
    CommentSource.minecraft,
    input.identity.role,
  );
}

export async function closeTicketFromMinecraft(
  ticketId: number,
  identity: MinecraftPlayerIdentity,
) {
  await assertServerTicket(ticketId, identity.serverId);
  return ticketService.closeTicket(ticketId, identity.userId, identity.role);
}

export async function reopenTicketFromMinecraft(
  ticketId: number,
  identity: MinecraftPlayerIdentity,
) {
  await assertServerTicket(ticketId, identity.serverId);
  return ticketService.reopenTicket(ticketId, identity.userId, identity.role);
}

export async function updateTicketStatusFromMinecraft(
  ticketId: number,
  input: { status: TicketStatus; identity: MinecraftPlayerIdentity },
) {
  await assertServerTicket(ticketId, input.identity.serverId);
  return ticketService.update(ticketId, input.identity.userId, input.identity.role, {
    status: input.status,
  });
}
