export type Role = 'player' | 'staff' | 'admin';
export type TicketStatus = 'open' | 'in_progress' | 'closed' | 'invalid';
export type CommentSource = 'web' | 'minecraft';

export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
  INVALID: 'invalid',
} as const;

export const STATUS_META: Record<TicketStatus, { label: string; icon: string; color: string }> = {
  [TICKET_STATUS.OPEN]: { label: '开放', icon: 'lucide:circle-dot', color: 'text-green-500' },
  [TICKET_STATUS.IN_PROGRESS]: { label: '处理中', icon: 'lucide:loader', color: 'text-yellow-500' },
  [TICKET_STATUS.CLOSED]: {
    label: '已关闭',
    icon: 'lucide:check-circle-2',
    color: 'text-purple-500',
  },
  [TICKET_STATUS.INVALID]: { label: '无效', icon: 'lucide:ban', color: 'text-slate-400' },
};

export const STATUS_ALIASES: Record<string, TicketStatus> = Object.fromEntries(
  Object.entries(STATUS_META).flatMap(([key, { label }]) => [
    [key, key],
    [label, key],
  ]),
) as Record<string, TicketStatus>;
export interface GameContext {
  world?: string;
  x?: number;
  y?: number;
  z?: number;
  gameMode?: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface TicketLabel {
  ticketId: number;
  labelId: string;
  label: Label;
}

export interface Comment {
  id: string;
  ticketId: number;
  authorId: number;
  body: string;
  source: CommentSource;
  createdAt: string;
  author: { id: number; username: string; minecraftName?: string; avatarUrl?: string | null };
}

export interface Ticket {
  id: number;
  title: string;
  body: string;
  template: string;
  status: TicketStatus;
  authorId: number;
  serverId?: string;
  gameContext?: string | null;
  assigneeId?: number;
  assignees?: TicketAssignee[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  author: { id: number; username: string; minecraftName?: string };
  labels: TicketLabel[];
  server?: { id: string; name: string };
  _count?: { comments: number };
}

export interface TicketAssignee {
  ticketId: number;
  userId: number;
  user: { id: number; username: string; avatarUrl?: string | null };
}

export interface AuditLog {
  id: string;
  ticketId: number;
  actorId: number;
  action: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
  actor: { id: number; username: string; minecraftName?: string };
}

export interface TemplateField {
  type: 'markdown' | 'input' | 'textarea' | 'checkboxes' | 'dropdown';
  id?: string;
  validations?: { required?: boolean };
  attributes: {
    label?: string;
    description?: string;
    placeholder?: string;
    value?: string;
    options?: (string | { label: string; required?: boolean })[];
  };
}

export interface TemplateDefinition {
  name: string;
  name_i18n: string;
  description: string;
  title_prefix?: string;
  labels: string[];
  body: TemplateField[];
}

export interface TemplateSummary {
  name: string;
  name_i18n: string;
  description: string;
  labels: string[];
}

export interface CreateTicketPayload {
  title: string;
  template: string;
  formData: Record<string, string>;
  serverId?: string;
  attachmentIds?: string[];
}

export interface TicketFilters {
  page?: number;
  pageSize?: number;
  statuses?: TicketStatus[];
  type?: string;
  authorId?: string;
  authorName?: string;
  serverId?: string;
  hasServer?: boolean | string;
  labelId?: string;
  search?: string;
}
