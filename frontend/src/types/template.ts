import type { TemplateHiddenMode } from './ticket';

export interface AdminTemplate {
  name: string;
  nameI18n: string;
  description: string;
  titlePrefix: string | null;
  labels: string;
  body: string;
  completionHooks: string;
  enabled: boolean;
  hidden: TemplateHiddenMode;
  createdAt: string;
  updatedAt: string;
}
