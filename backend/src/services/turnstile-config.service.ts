import { prisma } from '../db.js';
import { ValidationError } from '../utils/errors.js';

const APP_CONFIG_ID = 'default';
const SECRET_MASK = '••••••••';
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileConfig {
  enabled: boolean;
  siteKey: string;
  secretKey: string | null;
}

export interface PublicTurnstileConfig {
  enabled: boolean;
  siteKey: string;
  secretKeySet: boolean;
}

export interface TurnstileConfigInput {
  enabled?: boolean;
  siteKey?: string;
  secretKey?: string | null;
}

export interface TurnstilePublicConfig {
  enabled: boolean;
  siteKey: string;
}

type TurnstileVerifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
};

const defaultTurnstileConfig: TurnstileConfig = {
  enabled: false,
  siteKey: '',
  secretKey: null,
};

async function ensureAppConfig() {
  const existing = await prisma().appConfig.findFirst();
  if (!existing) {
    return prisma().appConfig.create({ data: { id: APP_CONFIG_ID } });
  }
  return existing;
}

function parseTurnstileConfig(raw: string | null): TurnstileConfig {
  if (!raw) return { ...defaultTurnstileConfig };
  try {
    const parsed = JSON.parse(raw) as Partial<TurnstileConfig>;
    return {
      enabled: parsed.enabled === true,
      siteKey: parsed.siteKey?.trim() ?? '',
      secretKey: parsed.secretKey?.trim() || null,
    };
  } catch {
    return { ...defaultTurnstileConfig };
  }
}

function validateTurnstileConfig(config: TurnstileConfig): void {
  if (!config.enabled) return;
  if (!config.siteKey) throw new ValidationError('Turnstile Site Key 不能为空');
  if (!config.secretKey) throw new ValidationError('Turnstile Secret Key 不能为空');
}

function toPublicTurnstileConfig(config: TurnstileConfig): PublicTurnstileConfig {
  return {
    enabled: config.enabled,
    siteKey: config.siteKey,
    secretKeySet: !!config.secretKey,
  };
}

export function toTurnstilePublicConfig(config: PublicTurnstileConfig): TurnstilePublicConfig {
  return {
    enabled: config.enabled && !!config.siteKey && config.secretKeySet,
    siteKey: config.siteKey,
  };
}

export async function getFullTurnstileConfig(): Promise<TurnstileConfig> {
  const appConfig = await ensureAppConfig();
  return parseTurnstileConfig(appConfig.turnstileConfig);
}

export async function getTurnstileConfig(): Promise<PublicTurnstileConfig> {
  return toPublicTurnstileConfig(await getFullTurnstileConfig());
}

export async function updateTurnstileConfig(
  input: TurnstileConfigInput,
): Promise<PublicTurnstileConfig> {
  const existing = await ensureAppConfig();
  const current = parseTurnstileConfig(existing.turnstileConfig);
  const next: TurnstileConfig = {
    enabled: input.enabled ?? current.enabled,
    siteKey: input.siteKey !== undefined ? input.siteKey.trim() : current.siteKey,
    secretKey:
      input.secretKey !== undefined
        ? input.secretKey && input.secretKey !== SECRET_MASK
          ? input.secretKey.trim()
          : current.secretKey
        : current.secretKey,
  };

  validateTurnstileConfig(next);

  await prisma().appConfig.update({
    where: { id: existing.id },
    data: { turnstileConfig: JSON.stringify(next) },
  });

  return toPublicTurnstileConfig(next);
}

export async function verifyTurnstileToken(token: string | undefined, remoteIp?: string) {
  const config = await getFullTurnstileConfig();
  if (!config.enabled) return;
  if (!config.secretKey) throw new ValidationError('Turnstile 尚未配置');
  if (!token?.trim()) throw new ValidationError('请完成人机验证');

  const body = new URLSearchParams({
    secret: config.secretKey,
    response: token,
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  const response = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    body,
  });
  if (!response.ok) throw new ValidationError('人机验证失败，请重试');

  const result = (await response.json()) as TurnstileVerifyResponse;
  if (result.success !== true) {
    throw new ValidationError('人机验证失败，请重试');
  }
}
