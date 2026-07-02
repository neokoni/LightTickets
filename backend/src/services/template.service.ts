import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { getPrisma } from '../db.js';
import { NotFoundError, AppError, ValidationError } from '../utils/errors.js';

const prisma = () => getPrisma();
const templatesDir = path.resolve('templates');

// --- Types (unchanged) ---

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
  event: 'resolved' | 'closed';
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

interface CachedTemplate {
  id: number;
  enabled: boolean;
  definition: TemplateDefinition;
}

const cache = new Map<string, CachedTemplate>();

// --- Init (replaces loadTemplates) ---

export async function initTemplates(): Promise<void> {
  cache.clear();
  const rows = await prisma().ticketTemplate.findMany();
  for (const row of rows) {
    cache.set(row.name, {
      id: row.id,
      enabled: row.enabled,
      definition: {
        name: row.nameI18n,
        description: row.description,
        title_prefix: row.titlePrefix ?? undefined,
        labels: JSON.parse(row.labels),
        body: JSON.parse(row.body),
        completion_hooks: JSON.parse(row.completionHooks),
      },
    });
  }
  console.log(`[templates] loaded ${cache.size} templates from database`);
  if (cache.size === 0) {
    await seedTemplatesFromFiles();
  }
}

// --- Seed from YAML files (called during setup) ---

export async function seedTemplatesFromFiles(): Promise<void> {
  if (!fs.existsSync(templatesDir)) {
    console.warn('[templates] templates/ directory not found, skipping seed');
    return;
  }
  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(templatesDir, file), 'utf-8');
      const def = yaml.load(raw) as TemplateDefinition;
      if (!def.name || !def.description || !Array.isArray(def.body)) {
        throw new Error(`missing required fields: name, description, or body`);
      }
      const nameKey = file.replace(/\.ya?ml$/, '');
      const existing = await prisma().ticketTemplate.findUnique({ where: { name: nameKey } });
      if (!existing) {
        await prisma().ticketTemplate.create({
          data: {
            name: nameKey,
            nameI18n: def.name,
            description: def.description,
            titlePrefix: def.title_prefix ?? null,
            labels: JSON.stringify(def.labels || []),
            body: JSON.stringify(def.body),
            completionHooks: JSON.stringify(def.completion_hooks || []),
            enabled: true,
          },
        });
        console.log(`[templates] seeded: ${nameKey} (${def.name})`);
      }
    } catch (err) {
      console.warn(`[templates] skipping ${file}:`, (err as Error).message);
    }
  }
  await initTemplates();
}

// --- Public read functions (synchronous, from cache) ---

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

export function get(name: string): Omit<TemplateDefinition, 'completion_hooks'> | undefined {
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
  // No enabled check — hooks must still fire for tickets using now-disabled templates
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

export function resolveHooks(def: TemplateDefinition, event: string): string[] {
  return def.completion_hooks
    .filter(h => h.event === event)
    .flatMap(h => h.commands);
}

// --- Admin CRUD functions (async, from DB) ---

export async function adminList() {
  return prisma().ticketTemplate.findMany({ orderBy: { name: 'asc' } });
}

export async function adminGet(id: number) {
  const row = await prisma().ticketTemplate.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('模板不存在');
  return row;
}

export function toAdminEditorResponse(row: {
  id: number; name: string; nameI18n: string; description: string;
  titlePrefix: string | null; labels: string; body: string;
  completionHooks: string; enabled: boolean;
  createdAt: Date; updatedAt: Date;
}) {
  let bodyYaml = '';
  let hooksYaml = '';
  try { bodyYaml = yaml.dump(JSON.parse(row.body), { lineWidth: -1, noRefs: true }); } catch { bodyYaml = row.body; }
  try { hooksYaml = yaml.dump(JSON.parse(row.completionHooks), { lineWidth: -1, noRefs: true }); } catch { hooksYaml = row.completionHooks; }
  return { ...row, body: bodyYaml, completionHooks: hooksYaml };
}

function parseYamlField(yamlStr: string, fieldName: string): string {
  try {
    const parsed = yaml.load(yamlStr);
    return JSON.stringify(parsed);
  } catch {
    throw new ValidationError(`${fieldName} 字段不是有效的 YAML`);
  }
}

function writeTemplateFile(name: string, nameI18n: string, description: string, titlePrefix: string | null, labels: string, bodyYaml: string, hooksYaml: string): void {
  const bodyParsed = yaml.load(bodyYaml);
  const hooksParsed = yaml.load(hooksYaml || '[]');
  const template: Record<string, unknown> = {
    name: nameI18n,
    description,
  };
  if (titlePrefix) template.title_prefix = titlePrefix;
  const labelsArr = JSON.parse(labels || '[]');
  if (labelsArr.length > 0) template.labels = labelsArr;
  template.body = bodyParsed;
  template.completion_hooks = hooksParsed;
  const content = yaml.dump(template, { lineWidth: -1, noRefs: true });
  fs.writeFileSync(path.join(templatesDir, `${name}.yml`), content, 'utf-8');
}

export async function adminCreate(data: {
  name: string; nameI18n: string; description: string;
  titlePrefix?: string; labels?: string;
  body: string; completionHooks?: string; enabled?: boolean;
}) {
  const existing = await prisma().ticketTemplate.findUnique({ where: { name: data.name } });
  if (existing) throw new AppError(409, '模板 key 已存在');

  const bodyJson = parseYamlField(data.body, 'body');
  const hooksJson = data.completionHooks ? parseYamlField(data.completionHooks, 'completionHooks') : '[]';

  const row = await prisma().ticketTemplate.create({
    data: {
      name: data.name,
      nameI18n: data.nameI18n,
      description: data.description,
      titlePrefix: data.titlePrefix ?? null,
      labels: data.labels || '[]',
      body: bodyJson,
      completionHooks: hooksJson,
      enabled: data.enabled ?? true,
    },
  });
  await initTemplates();
  writeTemplateFile(data.name, data.nameI18n, data.description, data.titlePrefix ?? null, data.labels || '[]', data.body, data.completionHooks || '[]');
  return row;
}

export async function adminUpdate(id: number, data: {
  nameI18n?: string; description?: string; titlePrefix?: string;
  labels?: string; body?: string; completionHooks?: string; enabled?: boolean;
}) {
  const existing = await prisma().ticketTemplate.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('模板不存在');

  const updateData: Record<string, unknown> = {};
  if (data.nameI18n !== undefined) updateData.nameI18n = data.nameI18n;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.titlePrefix !== undefined) updateData.titlePrefix = data.titlePrefix || null;
  if (data.labels !== undefined) updateData.labels = data.labels;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  if (data.body !== undefined) updateData.body = parseYamlField(data.body, 'body');
  if (data.completionHooks !== undefined) updateData.completionHooks = parseYamlField(data.completionHooks, 'completionHooks');

  const row = await prisma().ticketTemplate.update({ where: { id }, data: updateData });
  await initTemplates();

  // Sync back to local YAML file — use updated values where provided, fall back to existing
  const bodyYaml = data.body ?? toAdminEditorResponse(row).body;
  const hooksYaml = data.completionHooks ?? toAdminEditorResponse(row).completionHooks;
  writeTemplateFile(row.name, row.nameI18n, row.description, row.titlePrefix, row.labels, bodyYaml, hooksYaml);

  return row;
}

export async function adminDelete(id: number): Promise<void> {
  const existing = await prisma().ticketTemplate.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('模板不存在');
  await prisma().ticketTemplate.delete({ where: { id } });
  const filePath = path.join(templatesDir, `${existing.name}.yml`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await initTemplates();
}
