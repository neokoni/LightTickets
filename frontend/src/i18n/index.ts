import { computed, ref } from 'vue';
import { apiGetLanguage, apiGetLanguages } from '@/api/i18n';
import type { LanguagePack, LanguageSummary } from '@/types/i18n';
import { getLanguageCookie, setLanguageCookie } from './cookie';
import { fallbackLanguagePack, fallbackLanguageSummary } from './internal/zh-CN';

export const FALLBACK_LANGUAGE_ID = 'zh-CN';

const messages = ref<Record<string, string>>({ ...fallbackLanguagePack.messages });
const languages = ref<LanguageSummary[]>([fallbackLanguageSummary]);
const activeLanguageId = ref(FALLBACK_LANGUAGE_ID);
const loading = ref(false);

export const availableLanguages = computed(() => languages.value);
export const activeLanguage = computed(() => activeLanguageId.value);

function languageExists(languageId: string): boolean {
  return languages.value.some((language) => language.id === languageId);
}

function resolveLanguageId(preferred?: string | null, platformDefault?: string | null): string {
  if (preferred && languageExists(preferred)) return preferred;
  if (platformDefault && languageExists(platformDefault)) return platformDefault;
  return FALLBACK_LANGUAGE_ID;
}

async function loadLanguages() {
  try {
    languages.value = await apiGetLanguages();
  } catch {
    languages.value = [fallbackLanguageSummary];
  }
  if (!languageExists(FALLBACK_LANGUAGE_ID)) {
    languages.value = [fallbackLanguageSummary, ...languages.value];
  }
}

export async function setLanguage(languageId: string): Promise<void> {
  const resolved = resolveLanguageId(languageId, FALLBACK_LANGUAGE_ID);
  let pack: LanguagePack;
  try {
    pack = await apiGetLanguage(resolved);
  } catch {
    pack = fallbackLanguagePack;
  }
  messages.value = { ...fallbackLanguagePack.messages, ...pack.messages };
  activeLanguageId.value = pack.id;
  setLanguageCookie(pack.id);
  document.documentElement.lang = pack.id;
  document.documentElement.dir = pack.properties.direction ?? 'ltr';
}

export async function initI18n(platformDefault = FALLBACK_LANGUAGE_ID): Promise<void> {
  if (loading.value) return;
  loading.value = true;
  try {
    await loadLanguages();
    await setLanguage(resolveLanguageId(getLanguageCookie(), platformDefault));
  } finally {
    loading.value = false;
  }
}

export async function syncI18nWithDefault(platformDefault: string): Promise<void> {
  if (languages.value.length === 0) {
    await initI18n(platformDefault);
    return;
  }
  const resolved = resolveLanguageId(getLanguageCookie(), platformDefault);
  if (resolved !== activeLanguageId.value) {
    await setLanguage(resolved);
  } else {
    setLanguageCookie(resolved);
  }
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  let value = messages.value[key] ?? key;
  for (const [param, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${param}}`, String(replacement));
  }
  return value;
}
