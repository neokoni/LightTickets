export const LANGUAGE_SOURCE = {
  INTERNAL: 'internal',
  CUSTOM: 'custom',
} as const;

export type LanguageSource = (typeof LANGUAGE_SOURCE)[keyof typeof LANGUAGE_SOURCE];
