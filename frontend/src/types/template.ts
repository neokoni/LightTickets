import type { TemplateField, TemplateHiddenMode } from './ticket';

export interface EditableTemplateOption {
  label: string;
  required: boolean;
}

export interface EditableTemplateField {
  editorKey: number;
  type: TemplateField['type'];
  id: string;
  required: boolean;
  label: string;
  description: string;
  placeholder: string;
  value: string;
  options: EditableTemplateOption[];
  advancedOpen: boolean;
}

export type TemplateCompletionHookEvent = 'closed' | 'invalid';
export type TemplateCompletionHookType = 'command' | 'minimessage';

export interface TemplateCompletionHook {
  event: TemplateCompletionHookEvent;
  if?: string;
  type?: TemplateCompletionHookType;
  commands?: string[];
  messages?: string[];
  message?: string;
}

export interface EditableTemplateCompletionHook {
  editorKey: number;
  event: TemplateCompletionHookEvent;
  type: TemplateCompletionHookType;
  condition: string;
  contents: string[];
  advancedOpen: boolean;
}

export interface AdminTemplate {
  name: string;
  nameI18n: string;
  description: string;
  titlePrefix: string | null;
  labels: string;
  body: string;
  completionHooks: string;
  source: string;
  enabled: boolean;
  hidden: TemplateHiddenMode;
  createdAt: string;
  updatedAt: string;
}
