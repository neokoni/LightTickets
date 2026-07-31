import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { getIO } from '../socket/index.js';
import { ValidationError } from '../utils/errors.js';
import * as templateService from './template.service.js';

export const HOOK_DELIVERY_MAX_ATTEMPTS = 5;
export const HOOK_DELIVERY_RETRY_BASE_MS = 15_000;
export const HOOK_DELIVERY_RETRY_MAX_MS = 15 * 60_000;
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
  placeholders?: Record<string, string>;
};

function referencedPlaceholders(
  content: string,
  variables: Record<string, string>,
): Record<string, string> {
  const keys = [...content.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g)].map((match) => match[1]);
  return Object.fromEntries(
    [...new Set(keys)]
      .filter((key) => Object.prototype.hasOwnProperty.call(variables, key))
      .map((key) => [key, variables[key]]),
  );
}

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
  const storedHooks: StoredHook[] = hooks.map((hook, index) => {
    const base = { hookId: `${deliveryId}:${index}`, type: hook.type };
    if (hook.type === 'command') {
      return {
        ...base,
        content: templateService.resolveHookPlaceholders(hook.content, variables),
      };
    }
    return {
      ...base,
      content: hook.content,
      placeholders: referencedPlaceholders(hook.content, variables),
    };
  });
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
  const delivery = await prisma().minecraftHookDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (!delivery) return;

  if (delivery.status === 'delivered' || delivery.status === 'failed') return;

  const now = Date.now();
  if (
    delivery.status === 'delivering' &&
    delivery.lastAttemptAt &&
    now - delivery.lastAttemptAt.getTime() < retryDelayMs(delivery.attempts)
  ) {
    return;
  }
  if (delivery.attempts >= HOOK_DELIVERY_MAX_ATTEMPTS) {
    await markFailed(delivery.id);
    return;
  }

  const namespace = io.of('/mc');
  const room = `server:${delivery.serverId}`;
  if (!namespace.adapter.rooms.get(room)?.size) return;

  const hooks = parseHooks(delivery.hooks);
  const claimed = await prisma().minecraftHookDelivery.updateMany({
    where: {
      id: delivery.id,
      acknowledgedAt: null,
      status: { in: ['pending', 'delivering'] },
      attempts: { lt: HOOK_DELIVERY_MAX_ATTEMPTS },
    },
    data: {
      status: 'delivering',
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
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
  const pending = await prisma().minecraftHookDelivery.findMany({
    where: {
      serverId,
      acknowledgedAt: null,
      status: { in: ['pending', 'delivering'] },
    },
    orderBy: { createdAt: 'asc' },
    take: RETRY_BATCH_SIZE,
    select: { id: true },
  });
  for (const delivery of pending) await dispatch(delivery.id);
}

export async function acknowledge(serverId: string, deliveryId: string): Promise<boolean> {
  const result = await prisma().minecraftHookDelivery.updateMany({
    where: {
      id: deliveryId,
      serverId,
      acknowledgedAt: null,
      status: { in: ['pending', 'delivering'] },
    },
    data: { status: 'delivered', acknowledgedAt: new Date() },
  });
  return result.count === 1;
}

export async function listDeadLetters() {
  return prisma().minecraftHookDelivery.findMany({
    where: { status: 'failed' },
    orderBy: { failedAt: 'desc' },
  });
}

export async function retryDeadLetter(deliveryId: string): Promise<boolean> {
  const result = await prisma().minecraftHookDelivery.updateMany({
    where: { id: deliveryId, status: 'failed' },
    data: {
      status: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      failedAt: null,
    },
  });
  return result.count === 1;
}

async function markFailed(deliveryId: string): Promise<void> {
  await prisma().minecraftHookDelivery.updateMany({
    where: {
      id: deliveryId,
      status: { in: ['pending', 'delivering'] },
      acknowledgedAt: null,
    },
    data: { status: 'failed', failedAt: new Date() },
  });
}

function retryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(HOOK_DELIVERY_RETRY_BASE_MS * 2 ** (attempts - 1), HOOK_DELIVERY_RETRY_MAX_MS);
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
