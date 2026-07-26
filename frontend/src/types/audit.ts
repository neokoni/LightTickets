export const AUDIT_ACTION = {
  STATUS_CHANGE: 'status_change',
  BODY_CHANGE: 'body_change',
  COMPLETION_HOOK: 'completion_hook',
  COMPLETION_HOOK_PENDING: 'completion_hook_pending',
  TITLE_CHANGE: 'title_change',
  COMMENT_EDIT: 'comment_edit',
  LABEL_ADD: 'label_add',
  LABEL_REMOVE: 'label_remove',
  ASSIGN: 'assign',
  ASSIGNEES_CHANGE: 'assignees_change',
  VISIBILITY_CHANGE: 'visibility_change',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export const AUDIT_ACTION_META: Record<AuditAction, { labelKey: string; icon: string }> = {
  status_change: { labelKey: 'audit.action.statusChange', icon: 'lucide:refresh-cw' },
  body_change: { labelKey: 'audit.action.bodyChange', icon: 'lucide:file-text' },
  completion_hook: { labelKey: 'audit.action.completionHook', icon: 'lucide:list-checks' },
  completion_hook_pending: {
    labelKey: 'audit.action.completionHookPending',
    icon: 'lucide:hourglass',
  },
  title_change: { labelKey: 'audit.action.titleChange', icon: 'lucide:type' },
  comment_edit: { labelKey: 'audit.action.commentEdit', icon: 'lucide:message-square' },
  label_add: { labelKey: 'audit.action.labelAdd', icon: 'lucide:tag' },
  label_remove: { labelKey: 'audit.action.labelRemove', icon: 'lucide:tag-off' },
  assign: { labelKey: 'audit.action.assign', icon: 'lucide:user-plus' },
  assignees_change: { labelKey: 'audit.action.assigneesChange', icon: 'lucide:users' },
  visibility_change: { labelKey: 'audit.action.visibilityChange', icon: 'lucide:eye' },
};
