import { DEFAULT_RATE_LIMIT_CONFIG, type RateLimitConfig } from '../constants/rate-limit.js';
import { rateLimitConfigSchema, type RateLimitConfigInput } from '../schemas/rate-limit.js';
import { prisma } from '../db.js';
import { isDatabaseConfigured } from '../config.js';

const APP_CONFIG_ID = 'default';
const CACHE_TTL_MS = process.env.NODE_ENV === 'test' || process.env.VITEST ? 0 : 5_000;

let cachedConfig: RateLimitConfig | null = null;
let cacheExpiresAt = 0;

interface LegacyRateLimitConfigInput extends RateLimitConfigInput {
  registrationEmail?: { cooldownSeconds?: number };
  passwordResetEmail?: { cooldownSeconds?: number };
}

function cloneConfig(config: RateLimitConfig): RateLimitConfig {
  return {
    global: { ...config.global },
    auth: { ...config.auth },
    email: { ...config.email },
  };
}

async function ensureAppConfig() {
  const existing = await prisma().appConfig.findFirst();
  if (existing) return existing;
  return prisma().appConfig.create({ data: { id: APP_CONFIG_ID } });
}

function mergeConfig(current: RateLimitConfig, input: RateLimitConfigInput): RateLimitConfig {
  return {
    global: { ...current.global, ...input.global },
    auth: { ...current.auth, ...input.auth },
    email: { ...current.email, ...input.email },
  };
}

function normalizeStoredConfig(parsed: LegacyRateLimitConfigInput): RateLimitConfigInput {
  if (parsed.email) return parsed;
  const legacyCooldowns = [
    parsed.registrationEmail?.cooldownSeconds,
    parsed.passwordResetEmail?.cooldownSeconds,
  ].filter((value): value is number => typeof value === 'number');
  if (legacyCooldowns.length === 0) return parsed;
  return {
    ...parsed,
    email: { cooldownSeconds: Math.max(...legacyCooldowns) },
  };
}

function parseConfig(raw: string | null): RateLimitConfig {
  if (!raw) return cloneConfig(DEFAULT_RATE_LIMIT_CONFIG);
  try {
    const parsed = normalizeStoredConfig(JSON.parse(raw) as LegacyRateLimitConfigInput);
    const result = rateLimitConfigSchema.safeParse(mergeConfig(DEFAULT_RATE_LIMIT_CONFIG, parsed));
    return result.success ? result.data : cloneConfig(DEFAULT_RATE_LIMIT_CONFIG);
  } catch {
    return cloneConfig(DEFAULT_RATE_LIMIT_CONFIG);
  }
}

export function getDefaultRateLimitConfig(): RateLimitConfig {
  return cloneConfig(DEFAULT_RATE_LIMIT_CONFIG);
}

export async function getRateLimitConfig(): Promise<RateLimitConfig> {
  if (!isDatabaseConfigured()) return cloneConfig(DEFAULT_RATE_LIMIT_CONFIG);
  if (cachedConfig && Date.now() < cacheExpiresAt) return cloneConfig(cachedConfig);

  const appConfig = await ensureAppConfig();
  cachedConfig = parseConfig(appConfig.rateLimitConfig);
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cloneConfig(cachedConfig);
}

export async function updateRateLimitConfig(input: RateLimitConfigInput): Promise<RateLimitConfig> {
  const existing = await ensureAppConfig();
  const next = rateLimitConfigSchema.parse(
    mergeConfig(parseConfig(existing.rateLimitConfig), input),
  );

  await prisma().appConfig.update({
    where: { id: existing.id },
    data: { rateLimitConfig: JSON.stringify(next) },
  });

  cachedConfig = next;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return cloneConfig(next);
}
