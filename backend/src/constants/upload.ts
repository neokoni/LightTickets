export interface UploadTypeDefinition {
  readonly mimeType: string;
  readonly magicBytes: readonly (readonly number[])[];
  readonly inline: boolean;
}

export const UPLOAD_TYPE_DEFINITIONS: readonly UploadTypeDefinition[] = [
  { mimeType: 'image/png', magicBytes: [[0x89, 0x50, 0x4e, 0x47]], inline: true },
  { mimeType: 'image/jpeg', magicBytes: [[0xff, 0xd8, 0xff]], inline: true },
  { mimeType: 'image/gif', magicBytes: [[0x47, 0x49, 0x46, 0x38]], inline: true },
  { mimeType: 'image/webp', magicBytes: [[0x52, 0x49, 0x46, 0x46]], inline: true },
  { mimeType: 'application/pdf', magicBytes: [[0x25, 0x50, 0x44, 0x46]], inline: false },
  { mimeType: 'text/plain', magicBytes: [], inline: false },
];

export const ALLOWED_MIME_TYPES: readonly string[] = UPLOAD_TYPE_DEFINITIONS.map(
  ({ mimeType }) => mimeType,
);

export const UPLOAD_TYPE_BY_MIME: ReadonlyMap<string, UploadTypeDefinition> = new Map(
  UPLOAD_TYPE_DEFINITIONS.map((definition) => [definition.mimeType, definition]),
);

export const ORPHAN_ATTACHMENT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
export const MEBIBYTE_BYTES = 1024 * 1024;

export interface AttachmentConfig {
  pendingQuotaMiB: number;
  pendingExpirationEnabled: boolean;
  pendingTtlDays: number;
}

export const DEFAULT_ATTACHMENT_CONFIG: AttachmentConfig = {
  pendingQuotaMiB: 50,
  pendingExpirationEnabled: true,
  pendingTtlDays: 7,
};
