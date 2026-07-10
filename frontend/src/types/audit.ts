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

export const AUDIT_ACTION_META: Record<AuditAction, { labelKey: string; icon: string }> = {
  status_change: { labelKey: 'audit.action.statusChange', icon: 'lucide:refresh-cw' },
  body_change: { labelKey: 'audit.action.bodyChange', icon: 'lucide:file-text' },
  title_change: { labelKey: 'audit.action.titleChange', icon: 'lucide:type' },
  comment_edit: { labelKey: 'audit.action.commentEdit', icon: 'lucide:message-square' },
  label_add: { labelKey: 'audit.action.labelAdd', icon: 'lucide:tag' },
  label_remove: { labelKey: 'audit.action.labelRemove', icon: 'lucide:tag-off' },
  assign: { labelKey: 'audit.action.assign', icon: 'lucide:user-plus' },
  assignees_change: { labelKey: 'audit.action.assigneesChange', icon: 'lucide:users' },
};
