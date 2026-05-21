export type Role = 'player' | 'staff' | 'admin'
export type TicketType = 'bug_report' | 'permission_request' | 'suggestion' | 'report'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'rejected'
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type CommentSource = 'web' | 'minecraft'
export type ExecutionStatus = 'pending' | 'executed' | 'failed'

export interface Label {
  id: string
  name: string
  color: string
  description?: string
}

export interface TicketLabel {
  ticketId: string
  labelId: string
  label: Label
}

export interface Comment {
  id: string
  ticketId: string
  authorId: string
  body: string
  source: CommentSource
  createdAt: string
  author: { id: string; username: string; minecraftName?: string }
}

export interface PermissionRequest {
  id: string
  ticketId: string
  permissionNode?: string
  groupName?: string
  executionStatus: ExecutionStatus
  executedAt?: string
  errorMessage?: string
}

export interface Ticket {
  id: string
  title: string
  body: string
  type: TicketType
  status: TicketStatus
  priority: Priority
  authorId: string
  serverId?: string
  assigneeId?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  author: { id: string; username: string; minecraftName?: string }
  assignee?: { id: string; username: string }
  labels: TicketLabel[]
  server?: { id: string; name: string }
  permissionRequest?: PermissionRequest
  _count?: { comments: number }
}

export interface AuditLog {
  id: string
  ticketId: string
  actorId: string
  action: string
  oldValue?: string
  newValue?: string
  createdAt: string
  actor: { id: string; username: string; minecraftName?: string }
}
