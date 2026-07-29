import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { getIO } from '../socket/index.js';
import { ValidationError } from '../utils/errors.js';
import * as templateService from './template.service.js';

const RETRY_DELAY_MS = 15_000;
const RETRY_BATCH_SIZE = 100;

type HookTicket = {
  id: number;
  title: string;
  template: string;
  formData: string | null;
  serverId?: string | null;
  author?: { minecraftUuid?: string | null; minecraftName?: string | null } | null;
};

type StoredHook = {
  hookId: string;
  type: templateService.ResolvedHook['type'];
  content: string;
};

export function resolveTemplateEvent(ticket: HookTicket, event: string) {
  const definition = templateService.getDefinition(ticket.template);
  if (!definition) return { hooks: [], variables: {} };
  const variables = templateService.createHookVariables(ticket);
  return {
    hooks: templateService.resolveHooks(definition, event, variables),
    variables,
  };
}

export async function createForResolvedHooks(
  tx: Prisma.TransactionClient,
  ticket: HookTicket,
  event: string,
  hooks: templateService.ResolvedHook[],
  variables: Record<string, string> = {},
): Promise<string | null> {
  if (!ticket.serverId || hooks.length === 0) return null;

  const deliveryId = crypto.randomUUID();
  const storedHooks: StoredHook[] = hooks.map((hook, index) => ({
    hookId: `${deliveryId}:${index}`,
    type: hook.type,
    content: templateService.resolveHookPlaceholders(hook.content, variables),
  }));
  await tx.minecraftHookDelivery.create({
    data: {
      id: deliveryId,
      ticketId: ticket.id,
      serverId: ticket.serverId,
      event,
      playerUuid: ticket.author?.minecraftUuid ?? null,
      hooks: JSON.stringify(storedHooks),
    },
  });
  return deliveryId;
}

export async function dispatch(deliveryId: string): Promise<void> {
  const io = getIO();
  if (!io) return;
  const delivery = await prisma().minecraftHookDelivery.findFirst({
    where: { id: deliveryId, acknowledgedAt: null },
  });
  if (!delivery) return;

  const namespace = io.of('/mc');
  const room = `server:${delivery.serverId}`;
  if (!namespace.adapter.rooms.get(room)?.size) return;

  const hooks = parseHooks(delivery.hooks);
  const claimed = await prisma().minecraftHookDelivery.updateMany({
    where: { id: delivery.id, acknowledgedAt: null },
    data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
  });
  if (claimed.count !== 1) return;

  namespace.to(room).emit('hook:execute', {
    deliveryId: delivery.id,
    ticketId: delivery.ticketId,
    event: delivery.event,
    playerUuid: delivery.playerUuid,
    hooks,
  });
}

export async function dispatchPendingForServer(serverId: string): Promise<void> {
  const retryBefore = new Date(Date.now() - RETRY_DELAY_MS);
  const pending = await prisma().minecraftHookDelivery.findMany({
    where: {
      serverId,
      acknowledgedAt: null,
      OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: retryBefore } }],
    },
    orderBy: { createdAt: 'asc' },
    take: RETRY_BATCH_SIZE,
    select: { id: true },
  });
  for (const delivery of pending) await dispatch(delivery.id);
}

export async function acknowledge(serverId: string, deliveryId: string): Promise<boolean> {
  const result = await prisma().minecraftHookDelivery.updateMany({
    where: { id: deliveryId, serverId, acknowledgedAt: null },
    data: { acknowledgedAt: new Date() },
  });
  return result.count === 1;
}

function parseHooks(value: string): StoredHook[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed as StoredHook[];
  } catch {
    throw new ValidationError('Minecraft Hook delivery 数据无效');
  }
}
