import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dataPath } from '../paths.js';
import { LANGUAGE_SOURCE, type LanguageSource } from '../constants/language-source.js';

export const DEFAULT_LANGUAGE_ID = 'zh-CN';

export interface LanguageManifest {
  displayName: string;
  nativeName?: string;
  direction?: 'ltr' | 'rtl';
}

export interface LanguageSummary extends LanguageManifest {
  id: string;
  source: LanguageSource;
}

export interface LanguagePack {
  id: string;
  properties: LanguageManifest;
  messages: Record<string, string>;
}

interface RawLanguageFile {
  manifest?: Partial<LanguageManifest>;
  messages?: Record<string, unknown>;
}

interface LoadedLanguage {
  id: string;
  manifest: LanguageManifest;
  messages: Record<string, string>;
  source: LanguageSource;
}

const languageIdPattern = /^[A-Za-z0-9_-]+$/;
const currentDir = path.dirname(fileURLToPath(import.meta.url));

function internalLocaleDirs(): string[] {
  return [
    path.resolve(currentDir, '../locales'),
    path.resolve(process.cwd(), 'src/locales'),
    path.resolve(process.cwd(), 'dist/locales'),
  ];
}

function customLocaleDir(): string {
  return dataPath('locales');
}

function isLanguageFile(file: string): boolean {
  return file.endsWith('.json') && !file.includes('.properties.');
}

function languageIdFromFile(file: string): string {
  return file.replace(/\.json$/, '');
}

function toStringRecord(value: Record<string, unknown> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value ?? {})) {
    if (typeof raw === 'string') result[key] = raw;
  }
  return result;
}

function readLanguageFile(filePath: string, id: string, source: LanguageSource) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RawLanguageFile;
  const displayName = raw.manifest?.displayName;
  if (typeof displayName !== 'string' || !displayName.trim()) return null;

  const direction = raw.manifest?.direction === 'rtl' ? 'rtl' : 'ltr';
  return {
    id,
    manifest: {
      displayName,
      nativeName: raw.manifest?.nativeName,
      direction,
    },
    messages: toStringRecord(raw.messages),
    source,
  } satisfies LoadedLanguage;
}

function scanDirectory(dir: string, source: LanguageSource): Map<string, LoadedLanguage> {
  const result = new Map<string, LoadedLanguage>();
  if (!fs.existsSync(dir)) return result;

  for (const file of fs.readdirSync(dir).filter(isLanguageFile).sort()) {
    const id = languageIdFromFile(file);
    if (!languageIdPattern.test(id)) continue;
    try {
      const language = readLanguageFile(path.join(dir, file), id, source);
      if (language) result.set(id, language);
    } catch (err) {
      console.warn(`[i18n] skipping ${source} language ${file}:`, (err as Error).message);
    }
  }

  return result;
}

function loadInternalLanguages(): Map<string, LoadedLanguage> {
  const result = new Map<string, LoadedLanguage>();
  for (const dir of internalLocaleDirs()) {
    const languages = scanDirectory(dir, LANGUAGE_SOURCE.INTERNAL);
    for (const [id, language] of languages) result.set(id, language);
  }
  return result;
}

function loadCustomLanguages(): Map<string, LoadedLanguage> {
  return scanDirectory(customLocaleDir(), LANGUAGE_SOURCE.CUSTOM);
}

function loadLanguages(): Map<string, LoadedLanguage> {
  const internal = loadInternalLanguages();
  const custom = loadCustomLanguages();
  const result = new Map(internal);

  for (const [id, customLanguage] of custom) {
    const base = internal.get(id);
    result.set(id, {
      id,
      source: LANGUAGE_SOURCE.CUSTOM,
      manifest: { ...(base?.manifest ?? {}), ...customLanguage.manifest },
      messages: { ...(base?.messages ?? {}), ...customLanguage.messages },
    });
  }

  return result;
}

function getDefaultLanguage(languages: Map<string, LoadedLanguage>): LoadedLanguage {
  const language = languages.get(DEFAULT_LANGUAGE_ID);
  if (!language) {
    return {
      id: DEFAULT_LANGUAGE_ID,
      source: LANGUAGE_SOURCE.INTERNAL,
      manifest: { displayName: '简体中文', nativeName: '简体中文', direction: 'ltr' },
      messages: {},
    };
  }
  return language;
}

export function listLanguages(): LanguageSummary[] {
  const languages = loadLanguages();
  return Array.from(languages.values())
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((language) => ({
      id: language.id,
      source: language.source,
      ...language.manifest,
    }));
}

export function hasLanguage(id: string | undefined | null): boolean {
  if (!id) return false;
  return loadLanguages().has(id);
}

export function resolveLanguageId(id: string | undefined | null): string {
  if (id && hasLanguage(id)) return id;
  return DEFAULT_LANGUAGE_ID;
}

export function getLanguage(id: string): LanguagePack {
  const languages = loadLanguages();
  const fallback = getDefaultLanguage(languages);
  const language = languages.get(id) ?? fallback;
  return {
    id: language.id,
    properties: { ...fallback.manifest, ...language.manifest },
    messages: { ...fallback.messages, ...language.messages },
  };
}
