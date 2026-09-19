import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NotFoundError, AppError, ValidationError } from '../utils/errors.js';
import { dataPath } from '../paths.js';
import { TEMPLATE_HIDDEN_MODE, type TemplateHiddenMode } from '../constants/ticket-visibility.js';
import * as playerGroupService from './player-group.service.js';

const defaultTemplatesDir = path.resolve('templates');
const dataTemplatesDir = dataPath('templates');
const templatesInitializedMarker = dataPath('.templates_initialized');
let templateMutationTail = Promise.resolve();

export interface TemplateField {
  type:
    | 'markdown'
    | 'input'
    | 'textarea'
    | 'checkboxes'
    | 'dropdown'
    | 'select_input'
    | 'player_select';
  id?: string;
  validations?: { required?: boolean };
  attributes: {
    label?: string;
    description?: string;
    placeholder?: string;
    value?: string;
    options?: TemplateOption[];
    groups?: string[];
    input_any?: boolean;
  };
}

export type TemplateOption = string | { label: string; required?: boolean };

export interface ParsedTemplateOption {
  label: string;
  value: string;
}

function templateOptionRawLabel(option: unknown): string {
  if (typeof option === 'string') return option;
  return String((isRecord(option) ? option.label : undefined) ?? '');
}

export function parseTemplateOption(option: unknown): ParsedTemplateOption {
  const rawLabel = templateOptionRawLabel(option);
  const separator = rawLabel.indexOf('|');
  return {
    label: separator >= 0 ? rawLabel.slice(0, separator) : rawLabel,
    value: separator >= 0 ? rawLabel.slice(separator + 1) : rawLabel,
  };
}

export function normalizeDropdownValue(
  options: TemplateOption[] | undefined,
  submitted: string,
): string | undefined {
  const candidates = options ?? [];
  if (candidates.some((option) => parseTemplateOption(option).value === submitted)) {
    return submitted;
  }
  const exact = candidates.find((option) => templateOptionRawLabel(option) === submitted);
  return exact ? parseTemplateOption(exact).value : undefined;
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
  type: 'input' | 'textarea' | 'checkboxes' | 'dropdown' | 'select_input' | 'player_select';
  id: string;
  validations?: { required?: boolean };
  attributes: {
    label: string;
    description?: string;
    placeholder?: string;
    options?: TemplateOption[];
    groups?: string[];
    input_any?: boolean;
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

export async function withTemplateMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = templateMutationTail;
  let release!: () => void;
  templateMutationTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
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

function isValidTemplateOption(value: unknown): value is TemplateOption {
  return (
    (typeof value === 'string' && value.length > 0) ||
    (isRecord(value) && typeof value.label === 'string' && value.label.length > 0)
  );
}

function hasValidChoiceOptions(
  type: unknown,
  options: unknown,
  validateOptions = true,
): options is TemplateOption[] {
  if (!validateOptions) return true;

  const optionsRequired = type !== 'select_input' && type !== 'player_select';
  if (options === undefined) return !optionsRequired;
  if (!Array.isArray(options)) return false;
  if (options.length === 0) return !optionsRequired;
  if (!options.every(isValidTemplateOption)) {
    return false;
  }
  if (type !== 'dropdown') return true;

  const parsed = options.map(parseTemplateOption);
  const rawLabels = options.map(templateOptionRawLabel);
  return (
    parsed.every((option) => option.label.length > 0 && option.value.length > 0) &&
    new Set(parsed.map((option) => option.label)).size === parsed.length &&
    new Set(parsed.map((option) => option.value)).size === parsed.length &&
    new Set(rawLabels).size === rawLabels.length &&
    parsed.every((option, index) =>
      rawLabels.every((rawLabel, rawIndex) => index === rawIndex || option.value !== rawLabel),
    )
  );
}

function assertPlayerSelectAttributes(attributes: Record<string, unknown>): void {
  if (
    !Array.isArray(attributes.groups) ||
    attributes.groups.length === 0 ||
    !attributes.groups.every(
      (group) => typeof group === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(group),
    ) ||
    new Set(attributes.groups).size !== attributes.groups.length
  ) {
    throw new ValidationError('player_select 必须提供至少一个有效且不重复的 groups');
  }
  if (attributes.input_any !== undefined && typeof attributes.input_any !== 'boolean') {
    throw new ValidationError('player_select 的 input_any 必须是布尔值');
  }
}

function assertValidTemplateBody(
  value: unknown[],
  validateOptions = false,
): asserts value is TemplateField[] {
  for (const field of value) {
    if (!isRecord(field)) throw new ValidationError('body 字段包含无效的模板字段');
    // Only reject unknown field types on write. On load (validateOptions=false) an
    // unknown/legacy type is tolerated so a single bad field never drops the whole
    // on-disk template out of the cache; unknown types are simply ignored downstream.
    if (
      validateOptions &&
      ![
        'markdown',
        'input',
        'textarea',
        'checkboxes',
        'dropdown',
        'select_input',
        'player_select',
      ].includes(String(field.type))
    ) {
      throw new ValidationError('body 字段包含无效的模板字段');
    }
    const attributes = isRecord(field.attributes) ? field.attributes : {};
    field.attributes = attributes;
    if (field.type === 'markdown') continue;
    if (typeof field.id !== 'string' || !field.id.trim()) {
      throw new ValidationError('body 中非 markdown 字段必须提供 id');
    }
    if (
      (field.type === 'checkboxes' || field.type === 'dropdown' || field.type === 'select_input') &&
      !hasValidChoiceOptions(field.type, attributes.options, validateOptions)
    ) {
      throw new ValidationError('body 中选择字段必须提供有效且无歧义的 options');
    }
    if (field.type === 'player_select') assertPlayerSelectAttributes(attributes);
  }
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

function assertValidSelectionField(
  value: unknown,
  validateOptions = true,
): asserts value is SelectionHookField {
  if (
    !isRecord(value) ||
    !['input', 'textarea', 'checkboxes', 'dropdown', 'select_input', 'player_select'].includes(
      String(value.type),
    ) ||
    typeof value.id !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(value.id) ||
    !isRecord(value.attributes) ||
    typeof value.attributes.label !== 'string' ||
    !value.attributes.label.trim()
  ) {
    throw new Error('invalid selection hook field');
  }
  if (value.type === 'checkboxes' || value.type === 'dropdown' || value.type === 'select_input') {
    if (!hasValidChoiceOptions(value.type, value.attributes.options, validateOptions)) {
      throw new Error('selection hook choice field requires options');
    }
  }
  if (value.type === 'player_select') assertPlayerSelectAttributes(value.attributes);
}

function assertValidCompletionHooks(value: CompletionHook[], validateOptions = true): void {
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
    hook.fields.forEach((field) => assertValidSelectionField(field, validateOptions));
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
  assertValidTemplateBody(def.body, false);
  assertValidCompletionHooks(completionHooks, false);

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

function parseTemplateSourceForWrite(source: string): TemplateDefinition {
  try {
    const definition = parseTemplateSource(source);
    assertValidTemplateBody(definition.body, true);
    assertValidCompletionHooks(definition.completion_hooks, true);
    return definition;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error instanceof Error && error.name !== 'YAMLException') {
      throw new ValidationError(error.message);
    }
    throw new ValidationError('模板原文不是有效的 YAML 模板');
  }
}

async function assertTemplatePlayerGroups(definition: TemplateDefinition): Promise<void> {
  const groupSets = [
    ...definition.body
      .filter((field) => field.type === 'player_select')
      .map((field) => field.attributes.groups ?? []),
    ...definition.completion_hooks
      .filter((hook) => hook?.type === 'selection')
      .flatMap((hook) =>
        (hook.fields ?? [])
          .filter((field) => field.type === 'player_select')
          .map((field) => field.attributes.groups ?? []),
      ),
  ];
  for (const groupIds of groupSets) {
    if (!(await playerGroupService.groupsExist(groupIds))) {
      throw new ValidationError('player_select 引用的 group 不存在');
    }
  }
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
      `[templates] released ${defaultTemplates.length} default templates to ${dataTemplatesDir}`,
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

export function usesPlayerGroup(groupId: string): boolean {
  return Array.from(cache.values()).some((entry) => {
    const bodyUsesGroup = entry.definition.body.some(
      (field) => field.type === 'player_select' && field.attributes.groups?.includes(groupId),
    );
    const hookUsesGroup = entry.definition.completion_hooks.some(
      (hook) =>
        hook?.type === 'selection' &&
        (hook.fields ?? []).some(
          (field) => field.type === 'player_select' && field.attributes.groups?.includes(groupId),
        ),
    );
    return bodyUsesGroup || hookUsesGroup;
  });
}

function checkboxOptionLabels(field: TemplateField): string[] {
  return (field.attributes.options ?? []).map((option) =>
    typeof option === 'string' ? option : option.label,
  );
}

function fieldOptionDisplayLabel(field: TemplateField, value: string): string {
  if (!value) return value;
  const options = field.attributes.options ?? [];
  const option =
    options.find((candidate) => parseTemplateOption(candidate).value === value) ??
    options.find((candidate) => templateOptionRawLabel(candidate) === value);
  return option ? parseTemplateOption(option).label : value;
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
      const allowed = checkboxOptionLabels(field);
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

    if (field.type === 'player_select') {
      const selected = Array.from(
        new Set(
          raw
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      );
      if (required && selected.length === 0) throw new ValidationError(`${label} 为必填项`);
      normalized[field.id] = selected.join(',');
      continue;
    }

    if (required && !raw.trim()) throw new ValidationError(`${label} 为必填项`);
    if (field.type === 'dropdown' && raw) {
      const value = normalizeDropdownValue(field.attributes.options, raw);
      if (value === undefined) throw new ValidationError(`${label} 包含无效选项`);
      normalized[field.id] = value;
      continue;
    }
    normalized[field.id] = raw;
  }
  return normalized;
}

export async function validateAndNormalizeFormDataAsync(
  def: TemplateDefinition,
  formData: Record<string, string>,
): Promise<Record<string, string>> {
  const normalized = validateAndNormalizeFormData(def, formData);
  for (const field of def.body) {
    if (field.type !== 'player_select' || !field.id) continue;
    const values = normalized[field.id] ? normalized[field.id].split(',').filter(Boolean) : [];
    const groups = field.attributes.groups ?? [];
    if (!(await playerGroupService.groupsExist(groups))) {
      throw new ValidationError(`${field.attributes.label || field.id} 配置的 group 不存在`);
    }
    if (values.length === 0) continue;
    if (
      (
        await playerGroupService.findInvalidValues(
          groups,
          values,
          field.attributes.input_any === true,
        )
      ).length > 0
    ) {
      throw new ValidationError(`${field.attributes.label || field.id} 包含无效玩家名`);
    }
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
      if (
        field.type === 'input' ||
        field.type === 'dropdown' ||
        field.type === 'select_input' ||
        field.type === 'player_select'
      ) {
        parts.push(
          `**${label}:** ${
            field.type === 'dropdown'
              ? fieldOptionDisplayLabel(field, value)
              : field.type === 'player_select'
                ? value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .join(', ')
                : value
          }`,
        );
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

const COMMAND_PLACEHOLDER_MAX_LENGTH = 2000;

function sanitizeCommandPlaceholderValue(value: string): string {
  // Command content is dispatched directly by Bukkit, so values must stay on one line
  // and cannot introduce native target selectors as a new command argument.
  const withoutControls = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0)!;
    if (character === '\n' || character === '\r') return ' ';
    return codePoint <= 0x1f || codePoint === 0x7f ? '' : character;
  }).join('');
  const limited = Array.from(withoutControls).slice(0, COMMAND_PLACEHOLDER_MAX_LENGTH).join('');
  return limited.replace(/(^|\s)@(?=[pares])/g, '$1＠');
}

export function resolveHookPlaceholders(
  content: string,
  variables: Record<string, string>,
): string {
  return content.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? sanitizeCommandPlaceholderValue(variables[key])
      : placeholder,
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

function buildTemplateDefinition(data: {
  nameI18n: string;
  description: string;
  titlePrefix?: string | null;
  labels?: string;
  body: string;
  completionHooks?: string;
  enabled?: boolean;
  hidden?: TemplateHiddenMode;
}): TemplateDefinition {
  const bodyParsed = parseYamlField(data.body, 'body');
  if (!Array.isArray(bodyParsed)) throw new ValidationError('body 字段必须是 YAML 数组');
  assertValidTemplateBody(bodyParsed, true);

  const hooksParsed = parseYamlField(data.completionHooks || '[]', 'completionHooks');
  if (!Array.isArray(hooksParsed))
    throw new ValidationError('completionHooks 字段必须是 YAML 数组');
  try {
    assertValidCompletionHooks(hooksParsed as CompletionHook[], true);
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
  return template;
}

async function adminCreateUnlocked(data: {
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

  const definition =
    data.source !== undefined
      ? parseTemplateSourceForWrite(data.source)
      : buildTemplateDefinition(data);
  await assertTemplatePlayerGroups(definition);
  if (cache.has(data.name) || fs.existsSync(templatePath(data.name)))
    throw new AppError(409, '模板 key 已存在');
  fs.mkdirSync(dataTemplatesDir, { recursive: true });
  const content =
    data.source !== undefined
      ? data.source
      : yaml.dump(definition, { lineWidth: -1, noRefs: true });
  fs.writeFileSync(templatePath(data.name), content, 'utf-8');
  await initTemplates();
  return adminGet(data.name);
}

export function adminCreate(data: {
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
  return withTemplateMutationLock(() => adminCreateUnlocked(data));
}

async function adminUpdateUnlocked(
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
  assertValidTemplateName(name);
  const current = toAdminTemplate(existing);

  const definition =
    data.source !== undefined
      ? parseTemplateSourceForWrite(data.source)
      : buildTemplateDefinition({
          nameI18n: data.nameI18n ?? current.nameI18n,
          description: data.description ?? current.description,
          titlePrefix: data.titlePrefix !== undefined ? data.titlePrefix : current.titlePrefix,
          labels: data.labels ?? current.labels,
          body: data.body ?? current.body,
          completionHooks: data.completionHooks ?? current.completionHooks,
          enabled: data.enabled ?? current.enabled,
          hidden: data.hidden ?? current.hidden,
        });
  await assertTemplatePlayerGroups(definition);
  if (!cache.has(name) || !fs.existsSync(existing.filePath)) throw new NotFoundError('模板不存在');
  if (fs.readFileSync(existing.filePath, 'utf-8') !== current.source)
    throw new AppError(409, '模板已被其他请求修改，请重新加载');
  fs.writeFileSync(
    existing.filePath,
    data.source ?? yaml.dump(definition, { lineWidth: -1, noRefs: true }),
    'utf-8',
  );

  await initTemplates();
  return adminGet(name);
}

export function adminUpdate(
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
  return withTemplateMutationLock(() => adminUpdateUnlocked(name, data));
}

async function adminDeleteUnlocked(name: string): Promise<void> {
  const existing = cache.get(name);
  if (!existing) throw new NotFoundError('模板不存在');
  fs.rmSync(existing.filePath, { force: true });
  await initTemplates();
}

export function adminDelete(name: string): Promise<void> {
  return withTemplateMutationLock(() => adminDeleteUnlocked(name));
}
