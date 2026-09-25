export const BRANDING_SLOTS = ['favicon', 'favicon-dark', 'logo', 'logo-dark'] as const;

export type BrandingSlot = (typeof BRANDING_SLOTS)[number];

export const BRANDING_MAX_FILE_BYTES = 2 * 1024 * 1024;

export const BRANDING_FILE_FIELD = 'file';

export const BRANDING_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export const BRANDING_MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(BRANDING_EXTENSION_BY_MIME).map(([mimeType, extension]) => [extension, mimeType]),
);

export const BRANDING_MIME_TYPES: readonly string[] = Object.keys(BRANDING_EXTENSION_BY_MIME);

export const BRANDING_EXTENSIONS: readonly string[] = Object.keys(BRANDING_MIME_BY_EXTENSION);

export const BRANDING_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; sandbox";
