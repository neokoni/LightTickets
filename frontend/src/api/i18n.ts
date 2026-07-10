import { apiFetch } from './client';
import type { LanguagePack, LanguageSummary } from '@/types/i18n';

export function apiGetLanguages() {
  return apiFetch<LanguageSummary[]>('/i18n/languages');
}

export function apiGetLanguage(id: string) {
  return apiFetch<LanguagePack>(`/i18n/languages/${encodeURIComponent(id)}`);
}
