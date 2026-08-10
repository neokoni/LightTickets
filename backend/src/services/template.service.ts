import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NotFoundError, AppError, ValidationError } from '../utils/errors.js';
import { dataPath } from '../paths.js';
import { TEMPLATE_HIDDEN_MODE, type TemplateHiddenMode } from '../constants/ticket-visibility.js';

const defaultTemplatesDir = path.resolve('templates');
const dataTemplatesDir = dataPath('templates');
const templatesInitializedMarker = dataPath('.templates_initialized');

export interface TemplateField {
  type: 'markdown' | 'input' | 'textarea' | 'checkboxes' | 'dropdown' | 'select_input';
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
  if?: string;
  type?: 'command' | 'minimessage' | 'selection';
  commands?: string[];
  messages?: string[];
  message?: string;
  title?: string;
  visibility?: 'public' | 'staff';
  fields?: SelectionHookField[];
  actions?: CompletionHookAction[];
}

export interface SelectionHookField {
  type: 'input' | 'textarea' | 'checkboxes' | 'dropdown' | 'select_input';
  id: string;
  validations?: { required?: boolean };
  attributes: {
    label: string;
    description?: string;
    placeholder?: string;
    options?: string[] | { label: string; required?: boolean }[];
  };
}

export interface CompletionHookAction {
  type: 'command' | 'minimessage';
  commands?: string[];
  messages?: string[];
  message?: string;
}

export interface ResolvedHook {
  type: 'command' | 'minimessage';
  content: string;
}

export interface ResolvedSelectionHook {
  title: string;
  visibility: 'public' | 'staff';
  fields: SelectionHookField[];
  actions: CompletionHookAction[];
}

export interface TemplateDefinition {
  name: string;
  description: string;
  title_prefix?: string;
  enabled?: boolean;
  hidden: TemplateHiddenMode;
  labels: string[];
  body: TemplateField[];
  completion_hooks: CompletionHook[];
}

export interface TemplateSummary {
  name: string;
  name_i18n: string;
  description: string;
  labels: string[];
  hidden: TemplateHiddenMode;
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
const conditionPattern =
  /^\s*(\{[a-zA-Z0-9_.-]+\}|[a-zA-Z0-9_.-]+)\s*(==|!=|<=|>=|<|>)\s*(?:"([^"]*)"|'([^']*)'|(.+?))\s*$/;
const variablePattern = /^\{([a-zA-Z0-9_.-]+)\}$/;

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

function compareConditionValues(left: string, right: string, operator: string): boolean {
  if (operator === '==') return left === right;
  if (operator === '!=') return left !== right;

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const comparison =
    Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
      ? leftNumber - rightNumber
      : left.localeCompare(right);

  if (operator === '<') return comparison < 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '>=') return comparison >= 0;
  return false;
}

export function evaluateTemplateCondition(
  condition: string | undefined,
  variables: Record<string, string>,
): boolean {
  if (!condition?.trim()) return true;

  const match = condition.match(conditionPattern);
  if (!match) {
    throw new ValidationError(`无效的 if 条件: ${condition}`);
  }

  const [, leftToken, operator, doubleQuoted, singleQuoted, unquoted] = match;
  const left = resolveConditionToken(leftToken, variables, true);
  const right =
    doubleQuoted ??
    singleQuoted ??
    resolveConditionToken((unquoted ?? '').trim(), variables, false);
  return compareConditionValues(left, right, operator);
}

function resolveConditionToken(
  token: string,
  variables: Record<string, string>,
  variableByDefault: boolean,
): string {
  const variableMatch = token.match(variablePattern);
  if (variableMatch) return variables[variableMatch[1]] ?? '';
  return variableByDefault ? (variables[token] ?? '') : token;
}

function shouldRunHook(hook: CompletionHook, variables: Record<string, string>): boolean {
  try {
    return evaluateTemplateCondition(hook.if, variables);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function assertValidHookAction(value: unknown): asserts value is CompletionHookAction {
  if (!isRecord(value) || (value.type !== 'command' && value.type !== 'minimessage')) {
    throw new Error('invalid completion hook action');
  }
  if (value.type === 'command') {
    if (!isStringArray(value.commands) || value.commands.length === 0) {
      throw new Error('command action requires commands');
    }
    return;
  }
  const hasMessage = typeof value.message === 'string' && value.message.length > 0;
  const hasMessages = isStringArray(value.messages) && value.messages.length > 0;
  if (!hasMessage && !hasMessages) throw new Error('minimessage action requires messages');
}

function assertValidSelectionField(value: unknown): asserts value is SelectionHookField {
  if (
    !isRecord(value) ||
    !['input', 'textarea', 'checkboxes', 'dropdown', 'select_input'].includes(String(value.type)) ||
    typeof value.id !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(value.id) ||
    !isRecord(value.attributes) ||
    typeof value.attributes.label !== 'string' ||
    !value.attributes.label.trim()
  ) {
    throw new Error('invalid selection hook field');
  }
  if (value.type === 'checkboxes' || value.type === 'dropdown' || value.type === 'select_input') {
    const options = value.attributes.options;
    if (
      !Array.isArray(options) ||
      options.length === 0 ||
      !options.every(
        (option) =>
          (typeof option === 'string' && option.length > 0) ||
          (isRecord(option) && typeof option.label === 'string' && option.label.length > 0),
      )
    ) {
      throw new Error('selection hook choice field requires options');
    }
  }
}

function assertValidCompletionHooks(value: CompletionHook[]): void {
  for (const hook of value) {
    // Existing command/minimessage hooks historically accepted loose YAML. Keep
    // that compatibility and apply strict validation only to the new type.
    if (!isRecord(hook) || hook.type !== 'selection') continue;
    if (hook.event !== 'closed' && hook.event !== 'invalid') {
      throw new Error('invalid selection hook event');
    }
    if (hook.if !== undefined && typeof hook.if !== 'string') {
      throw new Error('invalid selection hook condition');
    }
    if (
      hook.visibility !== undefined &&
      hook.visibility !== 'public' &&
      hook.visibility !== 'staff'
    ) {
      throw new Error('invalid selection hook visibility');
    }
    if (
      typeof hook.title !== 'string' ||
      !hook.title.trim() ||
      hook.title.length > 191 ||
      !Array.isArray(hook.fields) ||
      hook.fields.length === 0 ||
      !Array.isArray(hook.actions) ||
      hook.actions.length === 0
    ) {
      throw new Error('selection hook requires title, fields, and actions');
    }
    hook.fields.forEach(assertValidSelectionField);
    if (new Set(hook.fields.map((field) => field.id)).size !== hook.fields.length) {
      throw new Error('selection hook field ids must be unique');
    }
    hook.actions.forEach(assertValidHookAction);
  }
}

function parseTemplateSource(raw: string): TemplateDefinition {
  const def = yaml.load(raw) as Partial<TemplateDefinition> | null;
  if (
    !def ||
    typeof def.name !== 'string' ||
    !def.name ||
    typeof def.description !== 'string' ||
    !def.description ||
    !Array.isArray(def.body)
  ) {
    throw new Error('missing required fields: name, description, or body');
  }
  if (
    (def.labels !== undefined &&
      (!Array.isArray(def.labels) || !def.labels.every((label) => typeof label === 'string'))) ||
    (def.title_prefix !== undefined && typeof def.title_prefix !== 'string') ||
    (def.completion_hooks !== undefined && !Array.isArray(def.completion_hooks)) ||
    (def.enabled !== undefined && typeof def.enabled !== 'boolean')
  ) {
    throw new Error('invalid optional template fields');
  }

  const completionHooks = Array.isArray(def.completion_hooks) ? def.completion_hooks : [];
  assertValidCompletionHooks(completionHooks);

  return {
    name: def.name,
    description: def.description,
    title_prefix: def.title_prefix?.trim() || undefined,
    labels: Array.isArray(def.labels) ? def.labels : [],
    body: def.body,
    completion_hooks: completionHooks,
    enabled: def.enabled ?? true,
    hidden: normalizeTemplateHiddenMode(def.hidden),
  };
}

function writeTemplateSource(name: string, source: string): void {
  assertValidTemplateName(name);
  try {
    parseTemplateSource(source);
  } catch {
    throw new ValidationError('模板原文不是有效的 YAML 模板');
  }
  fs.mkdirSync(dataTemplatesDir, { recursive: true });
  fs.writeFileSync(templatePath(name), source, 'utf-8');
}

function loadTemplateFile(filePath: string, nameKey: string): CachedTemplate {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const definition = parseTemplateSource(raw);
  const stat = fs.statSync(filePath);

  return {
    name: nameKey,
    filePath,
    enabled: definition.enabled ?? true,
    definition,
    createdAt: stat.birthtime,
    updatedAt: stat.mtime,
  };
}

export function normalizeTemplateHiddenMode(value: unknown): TemplateHiddenMode {
  if (value === true || value === false || value === TEMPLATE_HIDDEN_MODE.OPTIONAL) return value;
  if (value === 'optinal') return TEMPLATE_HIDDEN_MODE.OPTIONAL;
  if (value === undefined || value === null) return TEMPLATE_HIDDEN_MODE.PUBLIC;
  throw new ValidationError('hidden 必须为 true、false 或 optional');
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
      hidden: entry.definition.hidden,
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
    hidden: def.hidden,
    body: def.body,
  };
}

export function getDefinition(name: string): TemplateDefinition | undefined {
  const entry = cache.get(name);
  return entry?.enabled ? entry.definition : undefined;
}

export function getAdminDefinition(name: string): TemplateDefinition | undefined {
  return cache.get(name)?.definition;
}

function fieldOptionLabels(field: TemplateField): string[] {
  return (field.attributes.options ?? []).map((option) =>
    typeof option === 'string' ? option : option.label,
  );
}

export function validateAndNormalizeFormData(
  def: TemplateDefinition,
  formData: Record<string, string>,
): Record<string, string> {
  const fields = def.body.filter(
    (field): field is TemplateField & { id: string } => field.type !== 'markdown' && !!field.id,
  );
  const knownIds = new Set(fields.map((field) => field.id));
  if (Object.keys(formData).some((id) => !knownIds.has(id))) {
    throw new ValidationError('提交内容包含未知字段');
  }

  const normalized: Record<string, string> = {};
  for (const field of fields) {
    const raw = formData[field.id] ?? '';
    const label = field.attributes.label || field.id;
    const required = field.validations?.required === true;
    if (raw.length > 2000) throw new ValidationError(`${label} 内容过长`);

    if (field.type === 'checkboxes') {
      const selected = Array.from(
        new Set(
          raw
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      );
      const allowed = fieldOptionLabels(field);
      if (selected.some((value) => !allowed.includes(value))) {
        throw new ValidationError(`${label} 包含无效选项`);
      }
      if (required && selected.length === 0) throw new ValidationError(`${label} 为必填项`);
      const requiredOptions = (field.attributes.options ?? []).flatMap((option) =>
        typeof option !== 'string' && option.required ? [option.label] : [],
      );
      if (requiredOptions.some((value) => !selected.includes(value))) {
        throw new ValidationError(`${label} 缺少必选项`);
      }
      normalized[field.id] = selected.join(',');
      continue;
    }

    if (required && !raw.trim()) throw new ValidationError(`${label} 为必填项`);
    if (field.type === 'dropdown' && raw && !fieldOptionLabels(field).includes(raw)) {
      throw new ValidationError(`${label} 包含无效选项`);
    }
    normalized[field.id] = raw;
  }
  return normalized;
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
      if (field.type === 'input' || field.type === 'dropdown' || field.type === 'select_input') {
        parts.push(`**${label}:** ${value}`);
      } else if (field.type === 'textarea') {
        parts.push(`**${label}:**\n\n${value}`);
      }
    }
  }
  const body = parts.join('\n\n---\n\n');
  return body || 'No content provided';
}

export function resolveHooks(
  def: TemplateDefinition,
  event: string,
  variables: Record<string, string> = {},
): ResolvedHook[] {
  return def.completion_hooks
    .filter((h) => h.type !== 'selection' && h.event === event && shouldRunHook(h, variables))
    .flatMap((h) => {
      const type: ResolvedHook['type'] =
        h.type === 'command' || (h.type === undefined && h.commands) ? 'command' : 'minimessage';
      const values =
        type === 'command' ? (h.commands ?? []) : (h.messages ?? (h.message ? [h.message] : []));
      return values.map((content) => ({ type, content }));
    });
}

export function resolveSelectionHooks(
  def: TemplateDefinition,
  event: string,
  variables: Record<string, string> = {},
): ResolvedSelectionHook[] {
  return def.completion_hooks
    .filter(
      (hook) => hook.type === 'selection' && hook.event === event && shouldRunHook(hook, variables),
    )
    .map((hook) => ({
      title: hook.title!,
      visibility: hook.visibility ?? 'staff',
      fields: hook.fields!,
      actions: hook.actions!,
    }));
}

export function resolveHookActions(
  actions: CompletionHookAction[],
  variables: Record<string, string>,
): ResolvedHook[] {
  return actions.flatMap((action) => {
    const values =
      action.type === 'command'
        ? (action.commands ?? [])
        : (action.messages ?? (action.message ? [action.message] : []));
    return values.map((content) => ({
      type: action.type,
      content: action.type === 'command' ? resolveHookPlaceholders(content, variables) : content,
    }));
  });
}

export function resolveHookPlaceholders(
  content: string,
  variables: Record<string, string>,
): string {
  return content.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : placeholder,
  );
}

export function createHookVariables(ticket: {
  id: number;
  title: string;
  formData: string | null;
  author?: { minecraftUuid?: string | null; minecraftName?: string | null } | null;
}): Record<string, string> {
  const variables: Record<string, string> = {
    ticket_id: String(ticket.id),
    ticket_title: ticket.title,
    player_name: ticket.author?.minecraftName || 'unknown',
    player_uuid: ticket.author?.minecraftUuid || 'unknown',
  };
  if (!ticket.formData) return variables;
  try {
    const formData = JSON.parse(ticket.formData) as Record<string, unknown>;
    for (const [id, value] of Object.entries(formData)) {
      variables[`field.${id}`] = Array.isArray(value) ? value.join(',') : String(value ?? '');
    }
  } catch {
    // A malformed historical formData value should not prevent a status transition.
  }
  return variables;
}

function toAdminTemplate(entry: CachedTemplate): AdminTemplate {
  return {
    name: entry.name,
    nameI18n: entry.definition.name,
    description: entry.definition.description,
    titlePrefix: entry.definition.title_prefix ?? null,
    labels: JSON.stringify(entry.definition.labels),
    // JSON is also valid YAML and gives the admin field builder a deterministic
    // representation that can be deserialized without shipping a second YAML parser.
    body: JSON.stringify(entry.definition.body, null, 2),
    completionHooks: JSON.stringify(entry.definition.completion_hooks, null, 2),
    source: fs.readFileSync(entry.filePath, 'utf-8'),
    enabled: entry.enabled,
    hidden: entry.definition.hidden,
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
    hidden?: TemplateHiddenMode;
  },
): void {
  assertValidTemplateName(name);

  const bodyParsed = parseYamlField(data.body, 'body');
  if (!Array.isArray(bodyParsed)) throw new ValidationError('body 字段必须是 YAML 数组');

  const hooksParsed = parseYamlField(data.completionHooks || '[]', 'completionHooks');
  if (!Array.isArray(hooksParsed))
    throw new ValidationError('completionHooks 字段必须是 YAML 数组');
  try {
    assertValidCompletionHooks(hooksParsed as CompletionHook[]);
  } catch {
    throw new ValidationError('completionHooks 字段包含无效的钩子配置');
  }

  const labelsArr = parseLabels(data.labels || '[]');
  const template: TemplateDefinition = {
    name: data.nameI18n,
    description: data.description,
    labels: labelsArr,
    body: bodyParsed as TemplateField[],
    completion_hooks: hooksParsed as CompletionHook[],
    enabled: data.enabled ?? true,
    hidden: normalizeTemplateHiddenMode(data.hidden),
  };
  const titlePrefix = data.titlePrefix?.trim();
  if (titlePrefix) template.title_prefix = titlePrefix;

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
  source?: string;
  enabled?: boolean;
  hidden?: TemplateHiddenMode;
}): Promise<AdminTemplate> {
  assertValidTemplateName(data.name);
  if (cache.has(data.name) || fs.existsSync(templatePath(data.name)))
    throw new AppError(409, '模板 key 已存在');

  if (data.source !== undefined) writeTemplateSource(data.name, data.source);
  else writeTemplateFile(data.name, data);
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
    source?: string;
    enabled?: boolean;
    hidden?: TemplateHiddenMode;
  },
): Promise<AdminTemplate> {
  const existing = cache.get(name);
  if (!existing) throw new NotFoundError('模板不存在');

  if (data.source !== undefined) {
    writeTemplateSource(name, data.source);
    await initTemplates();
    return adminGet(name);
  }

  const current = toAdminTemplate(existing);

  writeTemplateFile(name, {
    nameI18n: data.nameI18n ?? current.nameI18n,
    description: data.description ?? current.description,
    titlePrefix: data.titlePrefix !== undefined ? data.titlePrefix : current.titlePrefix,
    labels: data.labels ?? current.labels,
    body: data.body ?? current.body,
    completionHooks: data.completionHooks ?? current.completionHooks,
    enabled: data.enabled ?? current.enabled,
    hidden: data.hidden ?? current.hidden,
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
