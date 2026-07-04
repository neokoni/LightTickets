import { getIO } from './index.js';
import { getDefinition, resolveHooks } from '../services/template.service.js';

export function emitTicketUpdate(serverId: string, event: string, data: any) {
  const io = getIO();
  if (!io) return;
  io.of('/mc').to(`server:${serverId}`).emit(event, data);
}

export function emitToAllServers(event: string, data: any) {
  const io = getIO();
  if (!io) return;
  io.of('/mc').emit(event, data);
}

export type HookTicketPayload = {
  id: number;
  title: string;
  template: string;
  formData: string | null;
  author?: { minecraftUuid?: string | null; minecraftName?: string | null } | null;
  resultTarget?: unknown | null;
};

export function toHookTicketPayload(ticket: HookTicketPayload): HookTicketPayload {
  return {
    id: ticket.id,
    title: ticket.title,
    template: ticket.template,
    formData: ticket.formData,
    author: ticket.author,
    resultTarget: ticket.resultTarget ?? null,
  };
}

export function emitHookExecute(serverId: string, ticket: HookTicketPayload, event: string) {
  const def = getDefinition(ticket.template);
  if (!def) return;
  const hooks = resolveHooks(def, event);
  if (hooks.length === 0) return;

  let formData: Record<string, string> = {};
  if (ticket.formData) {
    try {
      formData = JSON.parse(ticket.formData);
    } catch {
      formData = {};
    }
  }

  const resolvePlaceholders = (content: string) =>
    content
      .replace(/\{ticket_id\}/g, String(ticket.id))
      .replace(/\{ticket_title\}/g, ticket.title)
      .replace(/\{player_name\}/g, ticket.author?.minecraftName || 'unknown')
      .replace(/\{player_uuid\}/g, ticket.author?.minecraftUuid || 'unknown')
      .replace(/\{field\.(\w+)\}/g, (_, id: string) => formData[id] || '');

  const resolvedHooks = hooks.map(hook => ({
    hookId: [
      'hook',
      ticket.id,
      event,
      Date.now(),
      Math.random().toString(36).slice(2, 10),
    ].join(':'),
    ticketId: ticket.id,
    event,
    type: hook.type,
    content: resolvePlaceholders(hook.content),
    reportResult: Boolean(ticket.resultTarget),
  }));
  const resolvedCommands = resolvedHooks
    .filter(hook => hook.type === 'command')
    .map(hook => hook.content);

  const io = getIO();
  if (!io) return;
  io.of('/mc').to(`server:${serverId}`).emit('hook:execute', {
    ticketId: ticket.id,
    event,
    playerUuid: ticket.author?.minecraftUuid || null,
    hooks: resolvedHooks,
    commands: resolvedCommands,
    reportResult: Boolean(ticket.resultTarget),
  });
}
