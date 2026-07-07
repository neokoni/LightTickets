import type { TicketStatus, TemplateSummary } from '@/types/ticket';
import { STATUS_ALIASES, STATUS_META } from '@/types/ticket';
import type { Server } from '@/types/user';
import type { Label } from '@/types/ticket';

export interface SearchToken {
  raw: string;
  type: 'filter' | 'text';
  key?: string;
  value?: string;
  filterType?: string;
  error?: boolean;
}

export interface SuggestionItem {
  value: string;
  label: string;
}

export interface SuggestionResult {
  type: 'key' | 'value';
  key?: string;
  items: SuggestionItem[];
}

export interface ParsedQuery {
  statuses?: TicketStatus[];
  type?: string;
  labelId?: string;
  serverId?: string;
  hasServer?: boolean;
  authorName?: string;
  search: string;
}

type ParsedQueryKey = keyof ParsedQuery;
type ParsedQueryValue = ParsedQuery[ParsedQueryKey];

export interface FilterDefinition {
  key: string;
  aliases: string[];
  label: string;
  color: { bg: string; text: string; border: string };
  collect?: boolean;
  parse: (value: string, ctx: FilterContext) => Partial<ParsedQuery> | null;
  preview: (value: string, ctx: FilterContext) => string;
  suggestions: (ctx: FilterContext) => SuggestionItem[];
}

export interface FilterContext {
  labels: Label[];
  templates: TemplateSummary[];
  servers: Server[];
}

function resolveStatus(raw: string): TicketStatus | null {
  return STATUS_ALIASES[raw.toLowerCase()] ?? null;
}

function statusLabel(status: TicketStatus): string {
  return STATUS_META[status]?.label ?? status;
}

function aliasMap(defs: FilterDefinition[]): Record<string, FilterDefinition> {
  const map: Record<string, FilterDefinition> = {};
  for (const d of defs) {
    for (const alias of d.aliases) {
      map[alias.toLowerCase()] = d;
    }
  }
  return map;
}

function byKey(defs: FilterDefinition[]): Record<string, FilterDefinition> {
  const map: Record<string, FilterDefinition> = {};
  for (const d of defs) map[d.key] = d;
  return map;
}

const FILTER_DEFS: FilterDefinition[] = [
  {
    key: 'status',
    aliases: ['status', '状态'],
    label: '状态',
    color: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-800 dark:text-green-300',
      border: 'border-green-300 dark:border-green-700',
    },
    collect: true,
    parse: (value, _ctx) => {
      const s = resolveStatus(value);
      if (!s) return null;
      return { statuses: [s] };
    },
    preview: (value) => (resolveStatus(value) ? statusLabel(resolveStatus(value)!) : value),
    suggestions: () =>
      Object.entries(STATUS_META).map(([k, { label }]) => ({
        value: k,
        label: `${k} (${label})`,
      })),
  },
  {
    key: 'type',
    aliases: ['type', '类型', '模板'],
    label: '类型',
    color: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-800 dark:text-blue-300',
      border: 'border-blue-300 dark:border-blue-700',
    },
    parse: (value, ctx) => {
      const v = value.toLowerCase();
      const matched = ctx.templates.find(
        (t) => t.name.toLowerCase() === v || t.name_i18n.toLowerCase() === v,
      );
      return matched ? { type: matched.name } : null;
    },
    preview: (value, ctx) => {
      const v = value.toLowerCase();
      const matched = ctx.templates.find(
        (t) => t.name.toLowerCase() === v || t.name_i18n.toLowerCase() === v,
      );
      return matched ? matched.name_i18n : value;
    },
    suggestions: (ctx) =>
      ctx.templates.map((t) => ({ value: t.name, label: `${t.name} (${t.name_i18n})` })),
  },
  {
    key: 'label',
    aliases: ['label', '标签'],
    label: '标签',
    color: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-800 dark:text-purple-300',
      border: 'border-purple-300 dark:border-purple-700',
    },
    parse: (value, ctx) => {
      const v = value.toLowerCase();
      const matched = ctx.labels.find((l) => l.name.toLowerCase() === v);
      return matched ? { labelId: matched.id } : null;
    },
    preview: (value, ctx) => {
      const v = value.toLowerCase();
      const matched = ctx.labels.find((l) => l.name.toLowerCase() === v);
      return matched ? matched.name : value;
    },
    suggestions: (ctx) => ctx.labels.map((l) => ({ value: l.name, label: l.name })),
  },
  {
    key: 'from',
    aliases: ['from', '来源'],
    label: '来源',
    color: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      text: 'text-orange-800 dark:text-orange-300',
      border: 'border-orange-300 dark:border-orange-700',
    },
    parse: (value, ctx) => {
      const v = value.toLowerCase();
      if (v === 'web') return { hasServer: false };
      if (v === 'minecraft') return { hasServer: true };
      if (v.startsWith('minecraft:')) {
        const serverName = v.slice('minecraft:'.length);
        const matched = ctx.servers.find((s) => s.name.toLowerCase() === serverName);
        return matched ? { serverId: matched.id, hasServer: undefined } : null;
      }
      return null;
    },
    preview: (value, ctx) => {
      const v = value.toLowerCase();
      if (v === 'web') return 'Web';
      if (v === 'minecraft') return 'Minecraft';
      if (v.startsWith('minecraft:')) {
        const serverName = v.slice('minecraft:'.length);
        const matched = ctx.servers.find((s) => s.name.toLowerCase() === serverName);
        return matched ? `MC:${matched.name}` : value;
      }
      return value;
    },
    suggestions: (ctx) => [
      { value: 'web', label: 'web (网页)' },
      { value: 'minecraft', label: 'minecraft (游戏内)' },
      ...ctx.servers.map((s) => ({
        value: `minecraft:${s.name}`,
        label: `minecraft:${s.name} (${s.name}服务器)`,
      })),
    ],
  },
  {
    key: 'author',
    aliases: ['author', '作者'],
    label: '作者',
    color: {
      bg: 'bg-cyan-100 dark:bg-cyan-900/30',
      text: 'text-cyan-800 dark:text-cyan-300',
      border: 'border-cyan-300 dark:border-cyan-700',
    },
    parse: (value) => ({ authorName: value }),
    preview: (value) => value,
    suggestions: () => [],
  },
];

const ALIAS_MAP = aliasMap(FILTER_DEFS);
const DEF_BY_KEY = byKey(FILTER_DEFS);

export const FILTER_COLORS = Object.fromEntries(FILTER_DEFS.map((d) => [d.key, d.color]));

export function normalizeKey(raw: string): FilterDefinition | null {
  return ALIAS_MAP[raw.toLowerCase()] ?? null;
}

export function tokenize(raw: string): SearchToken[] {
  if (!raw.trim()) return [];
  const tokens: SearchToken[] = [];
  const regex = /(\S+):\s*(\S+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      const text = raw.slice(lastIndex, match.index).trim();
      if (text) tokens.push({ raw: text, type: 'text' });
    }

    const key = match[1];
    const value = match[2];
    const def = normalizeKey(key);

    if (def) {
      tokens.push({
        raw: match[0],
        type: 'filter',
        key: def.key,
        value,
        filterType: def.key,
        error: false,
      });
    } else {
      tokens.push({ raw: match[0], type: 'text' });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < raw.length) {
    const text = raw.slice(lastIndex).trim();
    if (text) tokens.push({ raw: text, type: 'text' });
  }

  return tokens;
}

export function parseQuery(
  raw: string,
  labels: Label[],
  templates: TemplateSummary[],
  servers: Server[],
): ParsedQuery {
  const ctx: FilterContext = { labels, templates, servers };
  const tokens = tokenize(raw);
  const result: ParsedQuery = { search: '' };
  const textParts: string[] = [];

  for (const t of tokens) {
    if (t.type !== 'filter' || !t.filterType || !t.value) {
      textParts.push(t.raw);
      continue;
    }

    const def = DEF_BY_KEY[t.filterType];
    if (!def) {
      textParts.push(t.raw);
      continue;
    }

    const parsed = def.parse(t.value, ctx);
    if (!parsed) {
      textParts.push(t.raw);
      continue;
    }

    for (const [k, v] of Object.entries(parsed) as [ParsedQueryKey, ParsedQueryValue][]) {
      if (v === undefined) continue;
      if (def.collect && k === 'statuses') {
        const arr = result.statuses || [];
        for (const item of v as TicketStatus[]) {
          if (!arr.includes(item)) arr.push(item);
        }
        result.statuses = arr;
      } else {
        Object.assign(result, { [k]: v });
      }
    }
  }

  result.search = textParts.join(' ').trim();
  return result;
}

export function getFilterValuePreview(
  key: string,
  value: string,
  labels: Label[],
  templates: TemplateSummary[],
  servers: Server[],
): string {
  const def = DEF_BY_KEY[key];
  if (!def) return value;
  return def.preview(value, { labels, templates, servers });
}

export function getSuggestions(
  raw: string,
  cursorPos: number,
  labels: Label[],
  templates: TemplateSummary[],
  servers: Server[],
): SuggestionResult | null {
  const ctx: FilterContext = { labels, templates, servers };
  const textBefore = raw.slice(0, cursorPos);
  const keyMatch = textBefore.match(/(?:^|\s)(\S+):\s*([^\s:]*)$/);

  if (keyMatch) {
    const rawKey = keyMatch[1];
    const partialValue = keyMatch[2];
    const def = normalizeKey(rawKey);
    if (!def) return null;

    const items = def.suggestions(ctx);
    const filtered = items.filter(
      (i) =>
        i.value.toLowerCase().startsWith(partialValue.toLowerCase()) ||
        i.label.toLowerCase().includes(partialValue.toLowerCase()),
    );
    return { type: 'value', key: def.key, items: filtered.length ? filtered : items };
  }

  const partialKeyMatch = textBefore.match(/(?:^|\s)([^\s:]*)$/);
  if (partialKeyMatch && partialKeyMatch[1]) {
    const partial = partialKeyMatch[1].toLowerCase();
    const items = FILTER_DEFS.filter((d) =>
      d.aliases.some((a) => a.toLowerCase().startsWith(partial)),
    ).map((d) => ({
      value: d.key,
      label: `${d.key} (${d.label})`,
    }));
    if (items.length > 0 && partial.length >= 1) {
      return { type: 'key', items };
    }
  }

  return null;
}

export function applySuggestion(
  raw: string,
  cursorPos: number,
  suggestion: string,
  type: 'key' | 'value',
): { text: string; cursorPos: number } {
  const textBefore = raw.slice(0, cursorPos);
  const textAfter = raw.slice(cursorPos);

  if (type === 'key') {
    const match = textBefore.match(/(?:^|\s)([^\s:]*)$/);
    if (match) {
      const keyIdx = textBefore.lastIndexOf(match[1]);
      const prefix = textBefore.slice(0, keyIdx);
      const newText = prefix + suggestion + ':' + textAfter;
      return { text: newText, cursorPos: prefix.length + suggestion.length + 1 };
    }
    return { text: raw, cursorPos };
  }

  if (type === 'value') {
    const match = textBefore.match(/(?:^|\s)(\S+:)\s*([^\s:]*)$/);
    if (match) {
      const keyColonIdx = textBefore.lastIndexOf(match[1]);
      const prefix = textBefore.slice(0, keyColonIdx + match[1].length);
      let suffix = textAfter;
      const oldValueMatch = suffix.match(/^([^\s:]*)/);
      if (oldValueMatch && oldValueMatch[1]) {
        suffix = suffix.slice(oldValueMatch[1].length);
      }
      const newText = prefix + suggestion + ' ' + suffix;
      return { text: newText, cursorPos: prefix.length + suggestion.length + 1 };
    }
    return { text: raw, cursorPos };
  }

  return { text: raw, cursorPos };
}

export function removeFilterToken(raw: string, key: string, value?: string): string {
  const regex = /\S+:\s*\S+/gi;
  return raw
    .replace(regex, (match) => {
      const colonIdx = match.indexOf(':');
      const k = match.slice(0, colonIdx);
      const def = normalizeKey(k);
      if (!def || def.key !== key) return match;
      if (value) {
        const v = match.slice(colonIdx + 1).replace(/^\s+/, '');
        if (v.toLowerCase() !== value.toLowerCase()) return match;
      }
      return '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}
