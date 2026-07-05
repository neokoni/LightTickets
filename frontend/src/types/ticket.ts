export type Role = 'player' | 'staff' | 'admin'
export type TicketStatus = 'open' | 'in_progress' | 'closed' | 'invalid'
export type CommentSource = 'web' | 'minecraft'

export const STATUS_META: Record<TicketStatus, { label: string; icon: string }> = {
  open: { label: '开放', icon: 'lucide:circle-dot' },
  in_progress: { label: '处理中', icon: 'lucide:loader' },
  closed: { label: '已关闭', icon: 'lucide:check-circle-2' },
  invalid: { label: '无效', icon: 'lucide:ban' },
}

export const STATUS_ALIASES: Record<string, TicketStatus> = Object.fromEntries(
  Object.entries(STATUS_META).flatMap(([key, { label }]) => [[key, key], [label, key]])
) as Record<string, TicketStatus>
export interface GameContext {
  world?: string
  x?: number
  y?: number
  z?: number
  gameMode?: string
}

export interface Label {
  id: string
  name: string
  color: string
  description?: string
}

export interface TicketLabel {
  ticketId: number
  labelId: string
  label: Label
}

export interface Comment {
  id: string
  ticketId: number
  authorId: number
  body: string
  source: CommentSource
  createdAt: string
  author: { id: number; username: string; minecraftName?: string; avatarUrl?: string | null }
}

export interface Ticket {
  id: number
  title: string
  body: string
  template: string
  status: TicketStatus
  authorId: number
  serverId?: string
  gameContext?: string | null
  assigneeId?: number
  assignees?: TicketAssignee[]
  createdAt: string
  updatedAt: string
  closedAt?: string
  author: { id: number; username: string; minecraftName?: string }
  assignee?: { id: number; username: string }
  labels: TicketLabel[]
  server?: { id: string; name: string }
  _count?: { comments: number }
}

export interface TicketAssignee {
  ticketId: number
  userId: number
  user: { id: number; username: string; avatarUrl?: string | null }
}

export interface AuditLog {
  id: string
  ticketId: number
  actorId: number
  action: string
  oldValue?: string
  newValue?: string
  createdAt: string
  actor: { id: number; username: string; minecraftName?: string }
}

export interface TemplateField {
  type: 'markdown' | 'input' | 'textarea' | 'checkboxes' | 'dropdown'
  id?: string
  validations?: { required?: boolean }
  attributes: {
    label?: string
    description?: string
    placeholder?: string
    value?: string
    options?: (string | { label: string; required?: boolean })[]
  }
}

export interface TemplateDefinition {
  name: string
  name_i18n: string
  description: string
  title_prefix?: string
  labels: string[]
  body: TemplateField[]
}

export interface TemplateSummary {
  name: string
  name_i18n: string
  description: string
  labels: string[]
}
