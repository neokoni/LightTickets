export const LANGUAGE_SOURCE = {
  INTERNAL: 'internal',
  CUSTOM: 'custom',
} as const;

export type LanguageSource = (typeof LANGUAGE_SOURCE)[keyof typeof LANGUAGE_SOURCE];

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
