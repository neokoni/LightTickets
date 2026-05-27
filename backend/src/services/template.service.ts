import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface TemplateField {
  type: 'markdown' | 'input' | 'textarea' | 'checkboxes' | 'dropdown';
  id?: string;
  validations?: { required?: boolean };
  attributes: {
    label?: string;
    description?: string;
    placeholder?: string;
    value?: string;
    options?: string[] | { label: string; required?: boolean }[];
  };
}

export interface CompletionHook {
  event: 'resolved' | 'closed' | 'rejected';
  commands: string[];
}

export interface TemplateDefinition {
  name: string;
  description: string;
  title_prefix?: string;
  labels: string[];
  body: TemplateField[];
  completion_hooks: CompletionHook[];
}

export interface TemplateSummary {
  name: string;
  name_i18n: string;
  description: string;
  labels: string[];
}

const templatesDir = path.resolve('templates');
const cache = new Map<string, TemplateDefinition>();

export function loadTemplates(): void {
  cache.clear();
  if (!fs.existsSync(templatesDir)) {
    console.warn('[templates] templates/ directory not found, skipping');
    return;
  }
  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(templatesDir, file), 'utf-8');
      const def = yaml.load(raw) as TemplateDefinition;
      const name = file.replace(/\.ya?ml$/, '');
      cache.set(name, def);
      console.log(`[templates] loaded: ${name} (${def.name})`);
    } catch (err) {
      console.warn(`[templates] skipping malformed template ${file}:`, (err as Error).message);
    }
  }
}

export function list(): TemplateSummary[] {
  return Array.from(cache.entries()).map(([name, def]) => ({
    name,
    name_i18n: def.name,
    description: def.description,
    labels: def.labels,
  }));
}

export function get(name: string): Omit<TemplateDefinition, 'completion_hooks'> | undefined {
  const def = cache.get(name);
  if (!def) return undefined;
  return {
    name: def.name,
    description: def.description,
    title_prefix: def.title_prefix,
    labels: def.labels,
    body: def.body,
  };
}

export function getDefinition(name: string): TemplateDefinition | undefined {
  return cache.get(name);
}

export function renderBody(def: TemplateDefinition, formData: Record<string, string>): string {
  const parts: string[] = [];
  for (const field of def.body) {
    if (field.type === 'markdown') {
      parts.push(field.attributes.value || '');
    } else if (field.type === 'checkboxes') {
      const checkedLabels = formData[field.id!]?.split(',').filter(Boolean) || [];
      for (const label of checkedLabels) {
        parts.push(`- [x] ${label.trim()}`);
      }
    } else {
      const label = field.attributes.label || field.id;
      const value = formData[field.id!] || '';
      if (field.type === 'input' || field.type === 'dropdown') {
        parts.push(`**${label}:** ${value}`);
      } else if (field.type === 'textarea') {
        parts.push(`**${label}:**\n\n${value}`);
      }
    }
    parts.push('');
  }

  const body = parts.join('\n---\n\n');
  return body || 'No content provided';
}

export function resolveHooks(def: TemplateDefinition, event: string): string[] {
  return def.completion_hooks
    .filter(h => h.event === event)
    .flatMap(h => h.commands);
}
