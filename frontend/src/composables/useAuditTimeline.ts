import { ref, computed, unref, type Ref } from 'vue';
import { apiFetch } from '@/api/client';
import { useLabelsStore } from '@/stores/labels';
import { STATUS_META } from '@/types/ticket';
import { AUDIT_ACTION } from '@/types/audit';
import { t } from '@/i18n';
import type { Comment, AuditLog, TicketStatus } from '@/types/ticket';
import type { Ticket } from '@/types/ticket';
import type { AssignableUser } from '@/types/user';

export function useAuditTimeline(
  ticketId: number | Ref<number>,
  comments: Ref<Comment[]>,
  ticket: Ref<Ticket | null>,
  assignableUsers: Ref<AssignableUser[]>,
) {
  const labels = useLabelsStore();

  const auditLogs = ref<AuditLog[]>([]);
  let auditRequestId = 0;

  async function fetchAuditLogs() {
    const id = unref(ticketId);
    const requestId = ++auditRequestId;
    try {
      const logs = await apiFetch<AuditLog[]>(`/tickets/${id}/audit`);
      if (requestId === auditRequestId && unref(ticketId) === id) {
        auditLogs.value = logs;
      }
    } catch {
      /* ignore */
    }
  }

  function resetAuditLogs() {
    auditRequestId++;
    auditLogs.value = [];
  }

  function isComment(item: Comment | AuditLog): item is Comment {
    return 'body' in item;
  }

  const timeline = computed<(Comment | AuditLog)[]>(() => {
    const items: (Comment | AuditLog)[] = [...comments.value, ...auditLogs.value];
    items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return items;
  });

  function parseUserIds(json: string | undefined): string[] {
    if (!json) return [];
    try {
      const ids: number[] = JSON.parse(json);
      return ids.map((id) => {
        const current = ticket.value?.assignees?.find((a) => a.userId === id);
        if (current) return current.user.username;
        const loaded = assignableUsers.value.find((a) => a.id === id);
        return loaded ? loaded.username : `#${id}`;
      });
    } catch {
      return [];
    }
  }

  function eventLabel(item: AuditLog): string {
    if (item.action === AUDIT_ACTION.STATUS_CHANGE) {
      const hasComment = comments.value.some(
        (c) =>
          c.authorId === item.actorId &&
          Math.abs(new Date(c.createdAt).getTime() - new Date(item.createdAt).getTime()) < 10000,
      );
      const prefix = hasComment ? t('ticket.timeline.commentAnd') : '';
      if (item.newValue === 'closed') {
        return item.actor.id === ticket.value?.authorId
          ? prefix + t('ticket.timeline.closed')
          : prefix + t('ticket.timeline.closedCompleted');
      }
      if (item.newValue === 'open') return prefix + t('ticket.timeline.reopened');
      if (item.newValue === 'in_progress') return t('ticket.timeline.inProgress');
      if (item.newValue === 'invalid') return t('ticket.timeline.invalid');
    }
    if (item.action === AUDIT_ACTION.ASSIGNEES_CHANGE) {
      const oldNames = parseUserIds(item.oldValue);
      const newNames = parseUserIds(item.newValue);
      if (newNames.length === 0) return t('ticket.timeline.assigneesCleared');
      if (newNames.length === 1 && oldNames.length === 0 && newNames[0] === item.actor.username)
        return t('ticket.timeline.assignedSelf');
      const added = newNames.filter((n) => !oldNames.includes(n));
      const removed = oldNames.filter((n) => !newNames.includes(n));
      const parts: string[] = [];
      if (added.length)
        parts.push(t('ticket.timeline.addedAssignees', { names: added.join('、') }));
      if (removed.length) {
        parts.push(t('ticket.timeline.removedAssignees', { names: removed.join('、') }));
      }
      if (parts.length) {
        return t('ticket.timeline.assignedWithChanges', {
          names: newNames.join('、'),
          changes: parts.join('，'),
        });
      }
      return t('ticket.timeline.assignedTo', { names: newNames.join('、') });
    }
    const map: Record<string, string> = {
      assign: t('ticket.timeline.assigneesChanged'),
      assignees_change: t('ticket.timeline.assigneesChanged'),
      label_add: t('ticket.timeline.labelAdded'),
      label_remove: t('ticket.timeline.labelRemoved'),
      title_change: t('ticket.timeline.titleChanged'),
      body_change: t('ticket.timeline.bodyChanged'),
      comment_edit: t('ticket.timeline.commentEdited'),
    };
    return map[item.action] || item.action;
  }

  function parseLabelData(json: string | undefined): { name: string; color: string } | null {
    if (!json) return null;
    try {
      const data = JSON.parse(json) as { name: string; color: string };
      const current = labels.labels.find((l) => l.name === data.name);
      return current ? { name: current.name, color: current.color } : data;
    } catch {
      return null;
    }
  }

  function eventIcon(item: AuditLog): string {
    if (item.action === AUDIT_ACTION.STATUS_CHANGE && item.newValue) {
      return STATUS_META[item.newValue as TicketStatus]?.icon || 'lucide:circle';
    }
    const map: Record<string, string> = {
      assign: 'lucide:user-plus',
      assignees_change: 'lucide:user-plus',
      label_add: 'lucide:tag',
      label_remove: 'lucide:tag',
      title_change: 'lucide:type',
      body_change: 'lucide:file-text',
      comment_edit: 'lucide:message-square-pen',
    };
    return map[item.action] || 'lucide:dot';
  }

  return {
    auditLogs,
    timeline,
    isComment,
    parseUserIds,
    eventLabel,
    parseLabelData,
    eventIcon,
    fetchAuditLogs,
    resetAuditLogs,
  };
}
