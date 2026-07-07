export const AUDIT_ACTION = {
  STATUS_CHANGE: 'status_change',
  BODY_CHANGE: 'body_change',
  TITLE_CHANGE: 'title_change',
  COMMENT_EDIT: 'comment_edit',
  LABEL_ADD: 'label_add',
  LABEL_REMOVE: 'label_remove',
  ASSIGN: 'assign',
  ASSIGNEES_CHANGE: 'assignees_change',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
