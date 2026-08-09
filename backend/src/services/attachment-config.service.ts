import { DEFAULT_ATTACHMENT_CONFIG, type AttachmentConfig } from '../constants/upload.js';
import type { Prisma } from '@prisma/client';
import { attachmentConfigSchema, type AttachmentConfigInput } from '../schemas/attachment.js';
import { prisma } from '../db.js';
import { isDatabaseConfigured } from '../config.js';

const APP_CONFIG_ID = 'default';
const CACHE_TTL_MS = process.env.NODE_ENV === 'test' || process.env.VITEST ? 0 : 5_000;

type AppConfigClient = Pick<Prisma.TransactionClient, 'appConfig'>;

let cachedConfig: AttachmentConfig | null = null;
let cacheExpiresAt = 0;

function cloneConfig(config: AttachmentConfig): AttachmentConfig {
  return { ...config };
}

async function ensureAppConfig(client: AppConfigClient = prisma()) {
  const existing = await client.appConfig.findFirst();
  if (existing) return existing;
  return client.appConfig.create({ data: { id: APP_CONFIG_ID } });
}

function mergeConfig(current: AttachmentConfig, input: AttachmentConfigInput): AttachmentConfig {
  return { ...current, ...input };
}

function parseConfig(raw: string | null): AttachmentConfig {
  if (!raw) return cloneConfig(DEFAULT_ATTACHMENT_CONFIG);
  try {
    const parsed = JSON.parse(raw) as AttachmentConfigInput;
    const result = attachmentConfigSchema.safeParse(mergeConfig(DEFAULT_ATTACHMENT_CONFIG, parsed));
    return result.success ? result.data : cloneConfig(DEFAULT_ATTACHMENT_CONFIG);
  } catch {
    return cloneConfig(DEFAULT_ATTACHMENT_CONFIG);
  }
}

export function getDefaultAttachmentConfig(): AttachmentConfig {
  return cloneConfig(DEFAULT_ATTACHMENT_CONFIG);
}

export async function getAttachmentConfig(client?: AppConfigClient): Promise<AttachmentConfig> {
  if (!isDatabaseConfigured()) return cloneConfig(DEFAULT_ATTACHMENT_CONFIG);
  if (client) {
    const appConfig = await ensureAppConfig(client);
    return parseConfig(appConfig.attachmentConfig);
  }
  if (cachedConfig && Date.now() < cacheExpiresAt) return cloneConfig(cachedConfig);

  const appConfig = await ensureAppConfig();
  cachedConfig = parseConfig(appConfig.attachmentConfig);
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cloneConfig(cachedConfig);
}

export async function updateAttachmentConfig(
  input: AttachmentConfigInput,
  client: AppConfigClient = prisma(),
): Promise<AttachmentConfig> {
  const existing = await ensureAppConfig(client);
  const next = attachmentConfigSchema.parse(
    mergeConfig(parseConfig(existing.attachmentConfig), input),
  );

  await client.appConfig.update({
    where: { id: existing.id },
    data: { attachmentConfig: JSON.stringify(next) },
  });

  cachedConfig = null;
  cacheExpiresAt = 0;
  return cloneConfig(next);
}
