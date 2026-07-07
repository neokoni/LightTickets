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

export const AUDIT_ACTION_META: Record<AuditAction, { label: string; icon: string }> = {
  status_change: { label: '状态变更', icon: 'lucide:refresh-cw' },
  body_change: { label: '正文修改', icon: 'lucide:file-text' },
  title_change: { label: '标题修改', icon: 'lucide:type' },
  comment_edit: { label: '评论编辑', icon: 'lucide:message-square' },
  label_add: { label: '添加标签', icon: 'lucide:tag' },
  label_remove: { label: '移除标签', icon: 'lucide:tag-off' },
  assign: { label: '分配', icon: 'lucide:user-plus' },
  assignees_change: { label: '负责人变更', icon: 'lucide:users' },
};
