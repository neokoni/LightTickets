import { ref, computed, type Ref } from 'vue';
import { apiFetch } from '@/api/client';
import { useLabelsStore } from '@/stores/labels';
import { STATUS_META } from '@/types/ticket';
import { AUDIT_ACTION } from '@/types/audit';
import type { Comment, AuditLog, TicketStatus } from '@/types/ticket';
import type { Ticket } from '@/types/ticket';
import type { AssignableUser } from '@/types/user';

export function useAuditTimeline(
  ticketId: number,
  comments: Ref<Comment[]>,
  ticket: Ref<Ticket | null>,
  assignableUsers: Ref<AssignableUser[]>,
) {
  const labels = useLabelsStore();

  const auditLogs = ref<AuditLog[]>([]);

  async function fetchAuditLogs() {
    try {
      auditLogs.value = await apiFetch<AuditLog[]>(`/tickets/${ticketId}/audit`);
    } catch {
      /* ignore */
    }
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
      const prefix = hasComment ? '评论并' : '';
      if (item.newValue === 'closed') {
        return item.actor.id === ticket.value?.authorId
          ? prefix + '关闭了此议题'
          : prefix + '关闭了此议题并标记为已完成';
      }
      if (item.newValue === 'open') return prefix + '重新打开了此议题';
      if (item.newValue === 'in_progress') return '开始处理此议题';
      if (item.newValue === 'invalid') return '标记为不做计划';
    }
    if (item.action === AUDIT_ACTION.ASSIGNEES_CHANGE) {
      const oldNames = parseUserIds(item.oldValue);
      const newNames = parseUserIds(item.newValue);
      if (newNames.length === 0) return '取消了所有受理人';
      if (newNames.length === 1 && oldNames.length === 0 && newNames[0] === item.actor.username)
        return '分配给了自己';
      const added = newNames.filter((n) => !oldNames.includes(n));
      const removed = oldNames.filter((n) => !newNames.includes(n));
      const parts: string[] = [];
      if (added.length) parts.push(`添加了 ${added.join('、')}`);
      if (removed.length) parts.push(`移除了 ${removed.join('、')}`);
      if (parts.length) return `分配给了 ${newNames.join('、')}（${parts.join('，')}）`;
      return `分配给了 ${newNames.join('、')}`;
    }
    const map: Record<string, string> = {
      assign: '变更了受理人',
      assignees_change: '变更了受理人',
      label_add: '添加了标签',
      label_remove: '移除了标签',
      title_change: '更改了标题',
      body_change: '编辑了内容',
      comment_edit: '编辑了评论',
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
  };
}
