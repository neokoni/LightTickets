import { getIO } from './index.js';
import { getDefinition, resolveHooks } from '../services/template.service.js';

export function emitTicketUpdate(serverId: string, event: string, data: unknown) {
  const io = getIO();
  if (!io) return;
  io.of('/mc').to(`server:${serverId}`).emit(event, data);
}

export function emitToAllServers(event: string, data: unknown) {
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
};

export function toHookTicketPayload(ticket: HookTicketPayload): HookTicketPayload {
  return {
    id: ticket.id,
    title: ticket.title,
    template: ticket.template,
    formData: ticket.formData,
    author: ticket.author,
  };
}

export function emitHookExecute(serverId: string, ticket: HookTicketPayload, event: string) {
  const def = getDefinition(ticket.template);
  if (!def) return;
  let formData: Record<string, string> = {};
  if (ticket.formData) {
    try {
      formData = JSON.parse(ticket.formData);
    } catch {
      formData = {};
    }
  }

  const variables: Record<string, string> = {
    ticket_id: String(ticket.id),
    ticket_title: ticket.title,
    player_name: ticket.author?.minecraftName || 'unknown',
    player_uuid: ticket.author?.minecraftUuid || 'unknown',
  };
  for (const [id, value] of Object.entries(formData)) {
    variables[`field.${id}`] = value;
  }

  const hooks = resolveHooks(def, event, variables);
  if (hooks.length === 0) return;

  const resolvePlaceholders = (content: string) =>
    content.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (placeholder, key: string) =>
      Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : placeholder,
    );

  const resolvedHooks = hooks.map((hook) => ({
    hookId: ['hook', ticket.id, event, Date.now(), Math.random().toString(36).slice(2, 10)].join(
      ':',
    ),
    ticketId: ticket.id,
    event,
    type: hook.type,
    content: resolvePlaceholders(hook.content),
  }));
  const resolvedCommands = resolvedHooks
    .filter((hook) => hook.type === 'command')
    .map((hook) => hook.content);

  const io = getIO();
  if (!io) return;
  io.of('/mc')
    .to(`server:${serverId}`)
    .emit('hook:execute', {
      ticketId: ticket.id,
      event,
      playerUuid: ticket.author?.minecraftUuid || null,
      hooks: resolvedHooks,
      commands: resolvedCommands,
    });
}
