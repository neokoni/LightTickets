import { prisma } from '../db.js';
import { ValidationError } from '../utils/errors.js';

const APP_CONFIG_ID = 'default';
const SECRET_MASK = '••••••••';

export interface MailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromName: string;
  fromAddress: string;
}

export interface PublicMailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  passwordSet: boolean;
  fromName: string;
  fromAddress: string;
}

export interface MailConfigInput {
  enabled?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string | null;
  password?: string | null;
  fromName?: string;
  fromAddress?: string;
}

const defaultMailConfig: MailConfig = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  username: null,
  password: null,
  fromName: '',
  fromAddress: '',
};

async function ensureAppConfig() {
  const existing = await prisma().appConfig.findFirst();
  if (!existing) {
    return prisma().appConfig.create({ data: { id: APP_CONFIG_ID } });
  }
  return existing;
}

function parseMailConfig(raw: string | null): MailConfig {
  if (!raw) return { ...defaultMailConfig };
  try {
    const parsed = JSON.parse(raw) as Partial<MailConfig>;
    return {
      enabled: parsed.enabled === true,
      host: parsed.host?.trim() ?? '',
      port: Number(parsed.port) || 587,
      secure: parsed.secure === true,
      username: parsed.username?.trim() || null,
      password: parsed.password || null,
      fromName: parsed.fromName?.trim() ?? '',
      fromAddress: parsed.fromAddress?.trim() ?? '',
    };
  } catch {
    return { ...defaultMailConfig };
  }
}

function validateMailConfig(config: MailConfig): void {
  if (!config.enabled) return;

  if (!config.host) throw new ValidationError('SMTP 主机不能为空');
  if (!Number.isInteger(config.port) || config.port <= 0) {
    throw new ValidationError('SMTP 端口无效');
  }
  if (!config.fromAddress) throw new ValidationError('发件邮箱不能为空');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.fromAddress)) {
    throw new ValidationError('发件邮箱格式无效');
  }
  if (config.username && !config.password) {
    throw new ValidationError('SMTP 密码不能为空');
  }
}

function toPublicMailConfig(config: MailConfig): PublicMailConfig {
  return {
    enabled: config.enabled,
    host: config.host,
    port: config.port,
    secure: config.secure,
    username: config.username,
    passwordSet: !!config.password,
    fromName: config.fromName,
    fromAddress: config.fromAddress,
  };
}

export async function getFullMailConfig(): Promise<MailConfig> {
  const appConfig = await ensureAppConfig();
  return parseMailConfig(appConfig.mailConfig);
}

export async function getMailConfig(): Promise<PublicMailConfig> {
  return toPublicMailConfig(await getFullMailConfig());
}

export async function updateMailConfig(input: MailConfigInput): Promise<PublicMailConfig> {
  const existing = await ensureAppConfig();
  const current = parseMailConfig(existing.mailConfig);
  const next: MailConfig = {
    enabled: input.enabled ?? current.enabled,
    host: input.host !== undefined ? input.host.trim() : current.host,
    port: input.port ?? current.port,
    secure: input.secure ?? current.secure,
    username: input.username !== undefined ? input.username?.trim() || null : current.username,
    password:
      input.password !== undefined
        ? input.password && input.password !== SECRET_MASK
          ? input.password
          : current.password
        : current.password,
    fromName: input.fromName !== undefined ? input.fromName.trim() : current.fromName,
    fromAddress: input.fromAddress !== undefined ? input.fromAddress.trim() : current.fromAddress,
  };

  validateMailConfig(next);

  await prisma().appConfig.update({
    where: { id: existing.id },
    data: { mailConfig: JSON.stringify(next) },
  });

  return toPublicMailConfig(next);
}
