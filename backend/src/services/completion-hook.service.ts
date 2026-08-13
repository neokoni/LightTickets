import type { CompletionHookStatus, CompletionHookVisibility, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { AUDIT_ACTION } from '../constants/audit-actions.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import * as templateService from './template.service.js';
import * as minecraftHookDeliveryService from './minecraft-hook-delivery.service.js';

type HookValue = string | string[];

type HookTicket = {
  id: number;
  title: string;
  template: string;
  formData: string | null;
  status?: string;
  serverId?: string | null;
  author?: { minecraftUuid?: string | null; minecraftName?: string | null } | null;
};

export interface CompletionHookView {
  id: string;
  event: string;
  title: string;
  fields: templateService.SelectionHookField[];
  response: Record<string, HookValue> | null;
  status: CompletionHookStatus;
  visibility: CompletionHookVisibility;
  createdAt: Date;
  completedAt: Date | null;
  completedBy: { id: number; username: string; minecraftName: string | null } | null;
}

function parseJson<T>(value: string, field: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new ValidationError(`${field} 数据无效`);
  }
}

function optionLabels(field: templateService.SelectionHookField): string[] {
  return (field.attributes.options ?? []).map((option) =>
    typeof option === 'string' ? option : option.label,
  );
}

function validateResponse(
  fields: templateService.SelectionHookField[],
  values: Record<string, HookValue>,
): Record<string, HookValue> {
  const knownIds = new Set(fields.map((field) => field.id));
  if (Object.keys(values).some((id) => !knownIds.has(id))) {
    throw new ValidationError('提交内容包含未知字段');
  }

  const normalized: Record<string, HookValue> = {};
  for (const field of fields) {
    const value = values[field.id];
    const required = field.validations?.required === true;
    if (field.type === 'checkboxes') {
      if (value !== undefined && !Array.isArray(value)) {
        throw new ValidationError(`${field.attributes.label} 必须为多选值`);
      }
      const selected = Array.from(new Set(value ?? []));
      const allowed = optionLabels(field);
      if (selected.some((item) => !allowed.includes(item))) {
        throw new ValidationError(`${field.attributes.label} 包含无效选项`);
      }
      if (required && selected.length === 0) {
        throw new ValidationError(`${field.attributes.label} 为必填项`);
      }
      const requiredOptions = (field.attributes.options ?? []).flatMap((option) =>
        typeof option !== 'string' && option.required ? [option.label] : [],
      );
      if (requiredOptions.some((option) => !selected.includes(option))) {
        throw new ValidationError(`${field.attributes.label} 缺少必选项`);
      }
      normalized[field.id] = selected;
      continue;
    }

    if (value !== undefined && typeof value !== 'string') {
      throw new ValidationError(`${field.attributes.label} 必须为文本值`);
    }
    const text = value ?? '';
    if (text.length > 2000) throw new ValidationError(`${field.attributes.label} 内容过长`);
    if (required && !text.trim()) throw new ValidationError(`${field.attributes.label} 为必填项`);
    if (field.type === 'dropdown' && text && !optionLabels(field).includes(text)) {
      throw new ValidationError(`${field.attributes.label} 包含无效选项`);
    }
    normalized[field.id] = text;
  }
  return normalized;
}

function toView(hook: {
  id: string;
  event: string;
  title: string;
  fields: string;
  response: string | null;
  status: CompletionHookStatus;
  visibility: CompletionHookVisibility;
  createdAt: Date;
  completedAt: Date | null;
  completedBy: { id: number; username: string; minecraftName: string | null } | null;
}): CompletionHookView {
  return {
    ...hook,
    fields: parseJson<templateService.SelectionHookField[]>(hook.fields, '完成钩子字段'),
    response: hook.response
      ? parseJson<Record<string, HookValue>>(hook.response, '完成钩子响应')
      : null,
  };
}

const hookViewSelect = {
  id: true,
  event: true,
  title: true,
  fields: true,
  response: true,
  status: true,
  visibility: true,
  createdAt: true,
  completedAt: true,
  completedBy: { select: { id: true, username: true, minecraftName: true } },
} satisfies Prisma.TicketCompletionHookSelect;

export async function listForTicket(
  ticketId: number,
  includePrivate: boolean,
): Promise<CompletionHookView[]> {
  const hooks = await prisma().ticketCompletionHook.findMany({
    where: includePrivate ? { ticketId } : { ticketId, status: 'completed', visibility: 'public' },
    orderBy: { createdAt: 'asc' },
    select: hookViewSelect,
  });
  return hooks.map(toView);
}

export async function createPendingForEvent(
  tx: Prisma.TransactionClient,
  ticket: HookTicket,
  event: string,
): Promise<number> {
  const definition = templateService.getDefinition(ticket.template);
  if (!definition) return 0;
  const variables = templateService.createHookVariables(ticket);
  const hooks = templateService.resolveSelectionHooks(definition, event, variables);
  if (hooks.length === 0) return 0;

  // Decision hooks are triggered only once per ticket — on the first close.
  // Reopen → re-close does not re-trigger them.  The CAS update on
  // completionHooksTriggered ensures exactly-one execution.
  const claimed = await tx.ticket.updateMany({
    where: { id: ticket.id, completionHooksTriggered: false },
    data: { completionHooksTriggered: true },
  });
  if (claimed.count === 0) return 0;

  const created = await tx.ticketCompletionHook.createMany({
    data: hooks.map((hook) => ({
      ticketId: ticket.id,
      event,
      title: hook.title,
      visibility: hook.visibility,
      fields: JSON.stringify(hook.fields),
      actions: JSON.stringify(hook.actions),
    })),
  });
  return created.count;
}

export async function complete(
  ticketId: number,
  hookId: string,
  userId: number,
  values: Record<string, HookValue>,
): Promise<CompletionHookView> {
  const hook = await prisma().ticketCompletionHook.findFirst({
    where: { id: hookId, ticketId },
    include: {
      ticket: {
        include: {
          author: { select: { minecraftUuid: true, minecraftName: true } },
        },
      },
    },
  });
  if (!hook) throw new NotFoundError('完成钩子不存在');
  if (hook.status !== 'pending') throw new AppError(409, '完成钩子已处理');

  const fields = parseJson<templateService.SelectionHookField[]>(hook.fields, '完成钩子字段');
  const normalized = validateResponse(fields, values);
  const completedAt = new Date();
  const variables = templateService.createHookVariables(hook.ticket);
  for (const [id, value] of Object.entries(normalized)) {
    variables[`selection.${id}`] = Array.isArray(value) ? value.join(',') : value;
  }
  const actions = parseJson<templateService.CompletionHookAction[]>(hook.actions, '完成钩子动作');
  const resolved = templateService.resolveHookActions(actions, variables);

  const result = await prisma().$transaction(async (tx) => {
    const result = await tx.ticketCompletionHook.updateMany({
      where: { id: hook.id, ticketId, status: 'pending' },
      data: {
        response: JSON.stringify(normalized),
        status: 'completed',
        completedById: userId,
        completedAt,
      },
    });
    if (result.count !== 1) throw new AppError(409, '完成钩子已处理');
    await tx.auditLog.create({
      data: {
        ticketId,
        actorId: userId,
        action: AUDIT_ACTION.COMPLETION_HOOK,
        newValue: hook.title,
      },
    });
    const completed = await tx.ticketCompletionHook.findUniqueOrThrow({
      where: { id: hook.id },
      select: hookViewSelect,
    });
    const deliveryId = await minecraftHookDeliveryService.createForResolvedHooks(
      tx,
      hook.ticket,
      hook.event,
      resolved,
      variables,
    );
    return { completed, deliveryId };
  });

  if (result.deliveryId) await minecraftHookDeliveryService.dispatch(result.deliveryId);

  return toView(result.completed);
}
