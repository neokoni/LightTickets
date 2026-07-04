export type Role = 'player' | 'staff' | 'admin'
export type TicketStatus = 'open' | 'in_progress' | 'closed' | 'invalid'
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type CommentSource = 'web' | 'minecraft'
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
  priority: Priority
  authorId: number
  serverId?: string
  gameContext?: string | null
  assigneeId?: number
  createdAt: string
  updatedAt: string
  closedAt?: string
  author: { id: number; username: string; minecraftName?: string }
  assignee?: { id: number; username: string }
  labels: TicketLabel[]
  server?: { id: string; name: string }
  _count?: { comments: number }
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
