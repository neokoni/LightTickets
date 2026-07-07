import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NotFoundError, AppError, ValidationError } from '../utils/errors.js';

const defaultTemplatesDir = path.resolve('templates');
const dataTemplatesDir = path.resolve('data/templates');
const templatesInitializedMarker = path.resolve('data/.templates_initialized');

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
  event: 'closed' | 'invalid';
  type?: 'command' | 'minimessage';
  commands?: string[];
  messages?: string[];
  message?: string;
}

export interface ResolvedHook {
  type: 'command' | 'minimessage';
  content: string;
}

export interface TemplateDefinition {
  name: string;
  description: string;
  title_prefix?: string;
  enabled?: boolean;
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

export interface AdminTemplate {
  name: string;
  nameI18n: string;
  description: string;
  titlePrefix: string | null;
  labels: string;
  body: string;
  completionHooks: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CachedTemplate {
  name: string;
  filePath: string;
  enabled: boolean;
  definition: TemplateDefinition;
  createdAt: Date;
  updatedAt: Date;
}

const cache = new Map<string, CachedTemplate>();

function isTemplateFile(file: string): boolean {
  return file.endsWith('.yml') || file.endsWith('.yaml');
}

function templatePath(name: string): string {
  return path.join(dataTemplatesDir, `${name}.yml`);
}

function assertValidTemplateName(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new ValidationError('模板 key 只能包含字母、数字、下划线和短横线');
  }
}

function loadTemplateFile(filePath: string, nameKey: string): CachedTemplate {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const def = yaml.load(raw) as Partial<TemplateDefinition> | null;
  if (!def || !def.name || !def.description || !Array.isArray(def.body)) {
    throw new Error('missing required fields: name, description, or body');
  }

  const stat = fs.statSync(filePath);
  const definition: TemplateDefinition = {
    name: def.name,
    description: def.description,
    title_prefix: def.title_prefix,
    labels: Array.isArray(def.labels) ? def.labels : [],
    body: def.body,
    completion_hooks: Array.isArray(def.completion_hooks) ? def.completion_hooks : [],
    enabled: def.enabled ?? true,
  };

  return {
    name: nameKey,
    filePath,
    enabled: definition.enabled ?? true,
    definition,
    createdAt: stat.birthtime,
    updatedAt: stat.mtime,
  };
}

function ensureDataTemplatesInitialized(): void {
  fs.mkdirSync(dataTemplatesDir, { recursive: true });
  if (fs.existsSync(templatesInitializedMarker)) return;

  const existingTemplates = fs.readdirSync(dataTemplatesDir).filter(isTemplateFile);
  if (existingTemplates.length === 0 && fs.existsSync(defaultTemplatesDir)) {
    const defaultTemplates = fs.readdirSync(defaultTemplatesDir).filter(isTemplateFile);
    for (const file of defaultTemplates) {
      fs.copyFileSync(path.join(defaultTemplatesDir, file), path.join(dataTemplatesDir, file));
    }
    console.log(
      `[templates] released ${defaultTemplates.length} default templates to data/templates`,
    );
  }

  fs.writeFileSync(templatesInitializedMarker, new Date().toISOString(), 'utf-8');
}

export async function initTemplates(): Promise<void> {
  ensureDataTemplatesInitialized();
  cache.clear();

  const files = fs.readdirSync(dataTemplatesDir).filter(isTemplateFile).sort();
  for (const file of files) {
    const nameKey = file.replace(/\.ya?ml$/, '');
    try {
      cache.set(nameKey, loadTemplateFile(path.join(dataTemplatesDir, file), nameKey));
    } catch (err) {
      console.warn(`[templates] skipping ${file}:`, (err as Error).message);
    }
  }

  console.log(`[templates] loaded ${cache.size} templates from data/templates`);
}

export function list(): TemplateSummary[] {
  const result: TemplateSummary[] = [];
  for (const [name, entry] of cache) {
    if (!entry.enabled) continue;
    result.push({
      name,
      name_i18n: entry.definition.name,
      description: entry.definition.description,
      labels: entry.definition.labels,
    });
  }
  return result;
}

export function get(
  name: string,
): Omit<TemplateDefinition, 'completion_hooks' | 'enabled'> | undefined {
  const entry = cache.get(name);
  if (!entry || !entry.enabled) return undefined;
  const def = entry.definition;
  return {
    name: def.name,
    description: def.description,
    title_prefix: def.title_prefix,
    labels: def.labels,
    body: def.body,
  };
}

export function getDefinition(name: string): TemplateDefinition | undefined {
  return cache.get(name)?.definition;
}

export function renderBody(def: TemplateDefinition, formData: Record<string, string>): string {
  const parts: string[] = [];
  for (const field of def.body) {
    if (field.type === 'markdown') {
      parts.push(field.attributes.value || '');
    } else if (field.type === 'checkboxes') {
      if (!field.id) continue;
      const checkedLabels = formData[field.id]?.split(',').filter(Boolean) || [];
      for (const label of checkedLabels) {
        parts.push(`- [x] ${label.trim()}`);
      }
    } else {
      if (!field.id) continue;
      const label = field.attributes.label || field.id;
      const value = formData[field.id] || '';
      if (field.type === 'input' || field.type === 'dropdown') {
        parts.push(`**${label}:** ${value}`);
      } else if (field.type === 'textarea') {
        parts.push(`**${label}:**\n\n${value}`);
      }
    }
  }
  const body = parts.join('\n\n---\n\n');
  return body || 'No content provided';
}

export function resolveHooks(def: TemplateDefinition, event: string): ResolvedHook[] {
  return def.completion_hooks
    .filter((h) => h.event === event)
    .flatMap((h) => {
      const type = h.type ?? (h.commands ? 'command' : 'minimessage');
      const values =
        type === 'command' ? (h.commands ?? []) : (h.messages ?? (h.message ? [h.message] : []));
      return values.map((content) => ({ type, content }));
    });
}

function toAdminTemplate(entry: CachedTemplate): AdminTemplate {
  return {
    name: entry.name,
    nameI18n: entry.definition.name,
    description: entry.definition.description,
    titlePrefix: entry.definition.title_prefix ?? null,
    labels: JSON.stringify(entry.definition.labels),
    body: yaml.dump(entry.definition.body, { lineWidth: -1, noRefs: true }),
    completionHooks: yaml.dump(entry.definition.completion_hooks, { lineWidth: -1, noRefs: true }),
    enabled: entry.enabled,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export async function adminList(): Promise<AdminTemplate[]> {
  return Array.from(cache.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toAdminTemplate);
}

export async function adminGet(name: string): Promise<AdminTemplate> {
  const entry = cache.get(name);
  if (!entry) throw new NotFoundError('模板不存在');
  return toAdminTemplate(entry);
}

function parseYamlField(yamlStr: string, fieldName: string): unknown {
  try {
    return yaml.load(yamlStr);
  } catch {
    throw new ValidationError(`${fieldName} 字段不是有效的 YAML`);
  }
}

function parseLabels(labels: string): string[] {
  try {
    const parsed = JSON.parse(labels || '[]');
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new ValidationError('labels 字段不是有效的 JSON 字符串数组');
  }
}

function writeTemplateFile(
  name: string,
  data: {
    nameI18n: string;
    description: string;
    titlePrefix?: string | null;
    labels?: string;
    body: string;
    completionHooks?: string;
    enabled?: boolean;
  },
): void {
  assertValidTemplateName(name);

  const bodyParsed = parseYamlField(data.body, 'body');
  if (!Array.isArray(bodyParsed)) throw new ValidationError('body 字段必须是 YAML 数组');

  const hooksParsed = parseYamlField(data.completionHooks || '[]', 'completionHooks');
  if (!Array.isArray(hooksParsed))
    throw new ValidationError('completionHooks 字段必须是 YAML 数组');

  const labelsArr = parseLabels(data.labels || '[]');
  const template: TemplateDefinition = {
    name: data.nameI18n,
    description: data.description,
    labels: labelsArr,
    body: bodyParsed as TemplateField[],
    completion_hooks: hooksParsed as CompletionHook[],
    enabled: data.enabled ?? true,
  };
  if (data.titlePrefix) template.title_prefix = data.titlePrefix;

  fs.mkdirSync(dataTemplatesDir, { recursive: true });
  const content = yaml.dump(template, { lineWidth: -1, noRefs: true });
  fs.writeFileSync(templatePath(name), content, 'utf-8');
}

export async function adminCreate(data: {
  name: string;
  nameI18n: string;
  description: string;
  titlePrefix?: string;
  labels?: string;
  body: string;
  completionHooks?: string;
  enabled?: boolean;
}): Promise<AdminTemplate> {
  assertValidTemplateName(data.name);
  if (cache.has(data.name) || fs.existsSync(templatePath(data.name)))
    throw new AppError(409, '模板 key 已存在');

  writeTemplateFile(data.name, data);
  await initTemplates();
  return adminGet(data.name);
}

export async function adminUpdate(
  name: string,
  data: {
    nameI18n?: string;
    description?: string;
    titlePrefix?: string;
    labels?: string;
    body?: string;
    completionHooks?: string;
    enabled?: boolean;
  },
): Promise<AdminTemplate> {
  const existing = cache.get(name);
  if (!existing) throw new NotFoundError('模板不存在');
  const current = toAdminTemplate(existing);

  writeTemplateFile(name, {
    nameI18n: data.nameI18n ?? current.nameI18n,
    description: data.description ?? current.description,
    titlePrefix: data.titlePrefix !== undefined ? data.titlePrefix : current.titlePrefix,
    labels: data.labels ?? current.labels,
    body: data.body ?? current.body,
    completionHooks: data.completionHooks ?? current.completionHooks,
    enabled: data.enabled ?? current.enabled,
  });

  await initTemplates();
  return adminGet(name);
}

export async function adminDelete(name: string): Promise<void> {
  const existing = cache.get(name);
  if (!existing) throw new NotFoundError('模板不存在');
  fs.rmSync(existing.filePath, { force: true });
  await initTemplates();
}
