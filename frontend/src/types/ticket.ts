export type Role = 'player' | 'staff' | 'admin';
export type TicketStatus = 'open' | 'in_progress' | 'closed' | 'invalid';
export type TemplateHiddenMode = boolean | 'optional';

export const CommentSource = {
  WEB: 'web',
  MINECRAFT: 'minecraft',
} as const;

export type CommentSource = (typeof CommentSource)[keyof typeof CommentSource];

export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
  INVALID: 'invalid',
} as const;

export const STATUS_META: Record<TicketStatus, { labelKey: string; icon: string; color: string }> =
  {
    [TICKET_STATUS.OPEN]: {
      labelKey: 'ticket.status.open',
      icon: 'lucide:circle-dot',
      color: 'text-green-500',
    },
    [TICKET_STATUS.IN_PROGRESS]: {
      labelKey: 'ticket.status.inProgress',
      icon: 'lucide:loader',
      color: 'text-yellow-500',
    },
    [TICKET_STATUS.CLOSED]: {
      labelKey: 'ticket.status.closed',
      icon: 'lucide:check-circle-2',
      color: 'text-purple-500',
    },
    [TICKET_STATUS.INVALID]: {
      labelKey: 'ticket.status.invalid',
      icon: 'lucide:ban',
      color: 'text-slate-400',
    },
  };

export const STATUS_ALIASES: Record<string, TicketStatus> = Object.fromEntries(
  Object.keys(STATUS_META).map((key) => [key, key]),
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
  hidden: boolean;
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
  hidden: TemplateHiddenMode;
}

export interface TemplateSummary {
  name: string;
  name_i18n: string;
  description: string;
  labels: string[];
  hidden: TemplateHiddenMode;
}

export interface CreateTicketPayload {
  title: string;
  template: string;
  formData: Record<string, string>;
  serverId?: string;
  attachmentIds?: string[];
  hidden?: boolean;
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
