import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { AppError, ValidationError } from '../utils/errors.js';
import { generateAccessToken } from '../utils/token.js';
import { ROLE } from '../constants/roles.js';
import { DatabaseProvider } from '../constants/database-provider.js';
import { StorageDriver } from '../constants/storage-driver.js';
import { CONFIG_PATH, isDatabaseConfigured, validateS3Config, type S3Config } from '../config.js';
import { DEFAULT_SERVER_PORT } from '../server-port.js';
import type { MailConfigInput, PublicMailConfig } from './mail-config.service.js';
import * as i18nService from './i18n.service.js';
import * as mailConfigService from './mail-config.service.js';
import * as turnstileConfigService from './turnstile-config.service.js';
import * as rateLimitConfigService from './rate-limit-config.service.js';
import * as attachmentConfigService from './attachment-config.service.js';
import * as federatedAuthProviderService from './federatedauth-provider.service.js';
import type { RateLimitConfigInput } from '../schemas/rate-limit.js';
import type { AttachmentConfigInput } from '../schemas/attachment.js';
import { DEFAULT_SITE_TITLE, resolveSiteTitle } from './site.js';
import { normalizeSiteUrl, resolvePasswordResetOrigin } from '../utils/site-url.js';
import { normalizeIpAddress } from '../trusted-proxy.js';
import * as refreshSessionService from './refresh-session.service.js';
import { MIN_PASSWORD_LENGTH } from '../constants/auth.js';
import { hashServerApiKey } from '../utils/server-key.js';

type SetupConfigFile = {
  server?: { port?: number; corsOrigins?: string[]; trustedProxyIps?: string[] };
  database?: {
    provider?: DatabaseProvider;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    args?: string;
  };
  security?: {
    jwtSecret?: string;
    jwtRefreshSecret?: string;
    jwtUnsubscribeSecret?: string;
    legacyJwtCutoff?: number;
    externalEncryptionKey?: string;
  };
};

function readYaml(filePath: string): SetupConfigFile {
  const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'));
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as SetupConfigFile) : {};
}

function normalizeAccessOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function requiredTrim(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new ValidationError(`MySQL 配置缺少必填字段: ${field}`);
  return trimmed;
}

function normalizeConfiguredSiteUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  const normalized = normalizeSiteUrl(value);
  if (!normalized) {
    throw new ValidationError('站点地址必须是仅包含 origin 的 HTTP(S) URL');
  }
  return normalized;
}

export interface SiteConfig {
  isSetup: boolean;
  requireLogin: boolean;
  allowWebRegister: boolean;
  allowMcRegister: boolean;
  passwordResetEnabled: boolean;
  registrationEmailVerificationEnabled: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
  defaultLanguage: string;
  turnstile: turnstileConfigService.TurnstilePublicConfig;
  federatedAuthProviders: Array<{
    slug: string;
    name: string;
    iconUrl: string | null;
    allowRegistration: boolean;
  }>;
}

export interface AdminSettings extends Omit<SiteConfig, 'isSetup'> {
  sendEmailNotifications: boolean;
  mail: PublicMailConfig;
  turnstile: turnstileConfigService.PublicTurnstileConfig;
  rateLimit: Awaited<ReturnType<typeof rateLimitConfigService.getRateLimitConfig>>;
  rateLimitDefaults: ReturnType<typeof rateLimitConfigService.getDefaultRateLimitConfig>;
  attachment: Awaited<ReturnType<typeof attachmentConfigService.getAttachmentConfig>>;
  attachmentDefaults: ReturnType<typeof attachmentConfigService.getDefaultAttachmentConfig>;
}

export interface SiteConfigInput {
  siteName?: string;
  siteUrl?: string;
  defaultLanguage?: string;
}

export interface SetupInput {
  db: {
    provider: DatabaseProvider;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    args?: string;
  };
  admin: {
    email: string;
    password: string;
    username: string;
  };
  site?: SiteConfigInput;
  mc?: {
    defaultServerName?: string;
  };
  storage?: {
    driver: StorageDriver;
    s3?: Omit<Partial<S3Config>, 'region'>;
  };
  accessOrigin?: string;
  trustedProxyIp?: string;
}

function toSiteConfig(status: {
  isSetup: boolean;
  requireLogin: boolean;
  allowWebRegister: boolean;
  allowMcRegister: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
  defaultLanguage: string;
}): SiteConfig {
  const defaultLanguage = i18nService.resolveLanguageId(status.defaultLanguage);
  return {
    isSetup: status.isSetup,
    requireLogin: status.requireLogin,
    allowWebRegister: status.allowWebRegister,
    allowMcRegister: status.allowMcRegister,
    passwordResetEnabled: false,
    registrationEmailVerificationEnabled: false,
    siteName: resolveSiteTitle(status.siteName),
    siteUrl: normalizeSiteUrl(status.siteUrl),
    footerContent: status.footerContent ?? null,
    defaultLanguage,
    turnstile: { enabled: false, siteKey: '' },
    federatedAuthProviders: [],
  };
}

function getMailFeatureAvailability(siteUrl: string | null, mail: PublicMailConfig) {
  const mailEnabled = mailConfigService.canSendPasswordResetMail(mail);
  return {
    passwordResetEnabled: mailEnabled && resolvePasswordResetOrigin(siteUrl) !== null,
    registrationEmailVerificationEnabled: mailEnabled,
  };
}

function applyMailFeatureAvailability(siteConfig: SiteConfig, mail: PublicMailConfig): void {
  Object.assign(siteConfig, getMailFeatureAvailability(siteConfig.siteUrl, mail));
}

function buildStorageConfig(input: SetupInput['storage']) {
  if (!input || input.driver === StorageDriver.LOCAL) {
    return {
      storageDriver: StorageDriver.LOCAL,
      uploadDir: 'data/uploads',
      s3Config: null,
    };
  }

  const s3: Partial<S3Config> = {
    endpoint: input.s3?.endpoint,
    region: 'us-east-1',
    bucket: input.s3?.bucket,
    accessKeyId: input.s3?.accessKeyId,
    secretAccessKey: input.s3?.secretAccessKey,
    forcePathStyle: input.s3?.forcePathStyle !== false,
    presignExpiry: Number(input.s3?.presignExpiry) || 300,
  };

  try {
    validateS3Config(s3);
  } catch (err: unknown) {
    throw new ValidationError(err instanceof Error ? err.message : 'S3 配置无效');
  }

  return {
    storageDriver: StorageDriver.S3,
    uploadDir: 'data/uploads',
    s3Config: JSON.stringify(s3),
  };
}

export async function getSiteConfig(): Promise<SiteConfig> {
  if (!isDatabaseConfigured()) {
    return {
      isSetup: false,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      passwordResetEnabled: false,
      registrationEmailVerificationEnabled: false,
      siteName: DEFAULT_SITE_TITLE,
      siteUrl: null,
      footerContent: null,
      defaultLanguage: i18nService.DEFAULT_LANGUAGE_ID,
      turnstile: { enabled: false, siteKey: '' },
      federatedAuthProviders: [],
    };
  }

  try {
    const { getPrisma } = await import('../db.js');
    const prisma = getPrisma();
    const status = await prisma.setupStatus.findFirst();
    if (status?.isSetup) {
      const siteConfig = toSiteConfig(status);
      const [turnstile, mail, providers] = await Promise.all([
        turnstileConfigService.getTurnstileConfig(),
        mailConfigService.getMailConfig(),
        federatedAuthProviderService.listPublicProviders(),
      ]);
      siteConfig.turnstile = turnstileConfigService.toTurnstilePublicConfig(turnstile);
      applyMailFeatureAvailability(siteConfig, mail);
      siteConfig.federatedAuthProviders = providers;
      return siteConfig;
    }

    const userCount = await prisma.user.count();
    if (userCount > 0) {
      const recovered = status
        ? await prisma.setupStatus.update({
            where: { id: status.id },
            data: { isSetup: true },
          })
        : await prisma.setupStatus.create({
            data: { isSetup: true },
          });

      const appConfig = await prisma.appConfig.findFirst();
      if (!appConfig) {
        await prisma.appConfig.create({ data: {} });
      }

      console.warn('[setup] Recovered missing setup status from existing users');
      const siteConfig = toSiteConfig(recovered);
      const [turnstile, mail, providers] = await Promise.all([
        turnstileConfigService.getTurnstileConfig(),
        mailConfigService.getMailConfig(),
        federatedAuthProviderService.listPublicProviders(),
      ]);
      siteConfig.turnstile = turnstileConfigService.toTurnstilePublicConfig(turnstile);
      applyMailFeatureAvailability(siteConfig, mail);
      siteConfig.federatedAuthProviders = providers;
      return siteConfig;
    }

    return {
      isSetup: false,
      requireLogin: status?.requireLogin ?? false,
      allowWebRegister: status?.allowWebRegister ?? true,
      allowMcRegister: status?.allowMcRegister ?? true,
      passwordResetEnabled: false,
      registrationEmailVerificationEnabled: false,
      siteName: resolveSiteTitle(status?.siteName),
      siteUrl: status?.siteUrl ?? null,
      footerContent: status?.footerContent ?? null,
      defaultLanguage: i18nService.resolveLanguageId(status?.defaultLanguage),
      turnstile: { enabled: false, siteKey: '' },
      federatedAuthProviders: [],
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    const msg = error.message || '';
    console.warn('[setup] Could not query setup status:', msg);
    throw e;
  }
}

export async function updateSettings(data: {
  requireLogin?: boolean;
  allowWebRegister?: boolean;
  allowMcRegister?: boolean;
  siteName?: string;
  siteUrl?: string | null;
  footerContent?: string | null;
  defaultLanguage?: string;
  sendEmailNotifications?: boolean;
  mail?: MailConfigInput;
  turnstile?: turnstileConfigService.TurnstileConfigInput;
  rateLimit?: RateLimitConfigInput;
  attachment?: AttachmentConfigInput;
}) {
  const { getPrisma } = await import('../db.js');
  const prisma = getPrisma();
  const siteUrl = normalizeConfiguredSiteUrl(data.siteUrl);

  const { updated, mail, turnstile, rateLimit, attachment } = await prisma.$transaction(
    async (tx) => {
      const status = await tx.setupStatus.findFirst();
      if (!status) throw new AppError(404, '站点尚未初始化');

      const updated = await tx.setupStatus.update({
        where: { id: status.id },
        data: {
          ...(data.requireLogin !== undefined && { requireLogin: data.requireLogin }),
          ...(data.allowWebRegister !== undefined && { allowWebRegister: data.allowWebRegister }),
          ...(data.allowMcRegister !== undefined && { allowMcRegister: data.allowMcRegister }),
          ...(data.siteName !== undefined && { siteName: data.siteName }),
          ...(siteUrl !== undefined && { siteUrl }),
          ...(data.footerContent !== undefined && { footerContent: data.footerContent }),
          ...(data.defaultLanguage !== undefined && {
            defaultLanguage: i18nService.resolveLanguageId(data.defaultLanguage),
          }),
          ...(data.sendEmailNotifications !== undefined && {
            sendEmailNotifications: data.sendEmailNotifications,
          }),
        },
      });
      const mail = data.mail
        ? await mailConfigService.updateMailConfig(data.mail, tx)
        : await mailConfigService.getMailConfig(tx);
      const turnstile = data.turnstile
        ? await turnstileConfigService.updateTurnstileConfig(data.turnstile, tx)
        : await turnstileConfigService.getTurnstileConfig(tx);
      const rateLimit = data.rateLimit
        ? await rateLimitConfigService.updateRateLimitConfig(data.rateLimit, tx)
        : await rateLimitConfigService.getRateLimitConfig(tx);
      const attachment = data.attachment
        ? await attachmentConfigService.updateAttachmentConfig(data.attachment, tx)
        : await attachmentConfigService.getAttachmentConfig(tx);

      return { updated, mail, turnstile, rateLimit, attachment };
    },
  );
  const mailFeatureAvailability = getMailFeatureAvailability(updated.siteUrl, mail);

  return {
    requireLogin: updated.requireLogin,
    allowWebRegister: updated.allowWebRegister,
    allowMcRegister: updated.allowMcRegister,
    siteName: updated.siteName,
    siteUrl: updated.siteUrl,
    footerContent: updated.footerContent,
    defaultLanguage: i18nService.resolveLanguageId(updated.defaultLanguage),
    sendEmailNotifications: updated.sendEmailNotifications,
    ...mailFeatureAvailability,
    mail,
    turnstile,
    rateLimit,
    rateLimitDefaults: rateLimitConfigService.getDefaultRateLimitConfig(),
    attachment,
    attachmentDefaults: attachmentConfigService.getDefaultAttachmentConfig(),
  };
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const siteConfig = await getSiteConfig();
  const { getPrisma } = await import('../db.js');
  const status = await getPrisma().setupStatus.findFirst();

  return {
    requireLogin: siteConfig.requireLogin,
    allowWebRegister: siteConfig.allowWebRegister,
    allowMcRegister: siteConfig.allowMcRegister,
    passwordResetEnabled: siteConfig.passwordResetEnabled,
    registrationEmailVerificationEnabled: siteConfig.registrationEmailVerificationEnabled,
    siteName: status?.siteName ?? siteConfig.siteName,
    siteUrl: status?.siteUrl ?? siteConfig.siteUrl,
    footerContent: siteConfig.footerContent,
    defaultLanguage: siteConfig.defaultLanguage,
    sendEmailNotifications: status?.sendEmailNotifications ?? false,
    turnstile: await turnstileConfigService.getTurnstileConfig(),
    mail: await mailConfigService.getMailConfig(),
    rateLimit: await rateLimitConfigService.getRateLimitConfig(),
    rateLimitDefaults: rateLimitConfigService.getDefaultRateLimitConfig(),
    attachment: await attachmentConfigService.getAttachmentConfig(),
    attachmentDefaults: attachmentConfigService.getDefaultAttachmentConfig(),
    federatedAuthProviders: siteConfig.federatedAuthProviders,
  };
}

export async function completeSetup(input: SetupInput) {
  if (isDatabaseConfigured()) {
    try {
      const { getPrisma } = await import('../db.js');
      const prisma = getPrisma();
      const existing = await prisma.setupStatus.findFirst();
      if (existing?.isSetup) {
        throw new AppError(409, '站点已完成初始化，无法重复设置');
      }

      const userCount = await prisma.user.count();
      if (userCount > 0) {
        if (existing) {
          await prisma.setupStatus.update({
            where: { id: existing.id },
            data: { isSetup: true },
          });
        } else {
          await prisma.setupStatus.create({ data: { isSetup: true } });
        }

        const appConfig = await prisma.appConfig.findFirst();
        if (!appConfig) {
          await prisma.appConfig.create({ data: {} });
        }

        console.warn('[setup] Recovered missing setup status from existing users');
        throw new AppError(409, '站点已完成初始化，无法重复设置');
      }

      if (existing) {
        throw new AppError(409, '站点已完成初始化，无法重复设置');
      }
    } catch (e: unknown) {
      if (e instanceof AppError) throw e;
      throw new AppError(503, '数据库暂时不可用，无法确认初始化状态');
    }
  }

  if (
    !input.db.provider ||
    ![DatabaseProvider.SQLITE, DatabaseProvider.MYSQL].includes(input.db.provider)
  ) {
    throw new ValidationError('无效的数据库类型，仅支持 sqlite 或 mysql');
  }

  if (!input.admin.email || !input.admin.password || !input.admin.username) {
    throw new ValidationError('管理员邮箱、密码和用户名均为必填项');
  }
  if (input.admin.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`管理员密码长度不能低于 ${MIN_PASSWORD_LENGTH} 位`);
  }

  const storageConfig = buildStorageConfig(input.storage);
  const siteUrl = normalizeConfiguredSiteUrl(input.site?.siteUrl) ?? null;

  const accessOrigin = normalizeAccessOrigin(input.accessOrigin);
  const trustedProxyIp = input.trustedProxyIp
    ? normalizeIpAddress(input.trustedProxyIp.trim())
    : null;
  if (input.trustedProxyIp && !trustedProxyIp) {
    throw new ValidationError('无法识别可信代理 IP 地址');
  }

  const configData: Required<SetupConfigFile> = {
    server: {
      port: DEFAULT_SERVER_PORT,
      corsOrigins: accessOrigin ? [accessOrigin] : ['http://localhost:23310'],
      trustedProxyIps: trustedProxyIp ? [trustedProxyIp] : [],
    },
    database: {
      provider: input.db.provider,
    },
    security: {
      jwtSecret: crypto.randomBytes(32).toString('hex'),
      jwtRefreshSecret: crypto.randomBytes(32).toString('hex'),
      jwtUnsubscribeSecret: crypto.randomBytes(32).toString('hex'),
      legacyJwtCutoff: 0,
      externalEncryptionKey: crypto.randomBytes(32).toString('hex'),
    },
  };

  if (input.db.provider === DatabaseProvider.MYSQL) {
    configData.database.host = requiredTrim(input.db.host, 'host');
    configData.database.port = input.db.port ?? 3306;
    configData.database.username = requiredTrim(input.db.username, 'username');
    configData.database.password = input.db.password ?? '';
    configData.database.database = requiredTrim(input.db.database, 'database');
    if (input.db.args?.trim()) {
      configData.database.args = input.db.args.trim().replace(/^\?/, '');
    }
  }

  if (fs.existsSync(CONFIG_PATH)) {
    const existing = readYaml(CONFIG_PATH);
    if (existing.server?.port) configData.server.port = existing.server.port;
    if (existing.server?.corsOrigins) configData.server.corsOrigins = existing.server.corsOrigins;
    if (existing.server?.trustedProxyIps !== undefined)
      configData.server.trustedProxyIps = existing.server.trustedProxyIps;
    if (existing.security?.jwtSecret) configData.security.jwtSecret = existing.security.jwtSecret;
    if (existing.security?.jwtRefreshSecret)
      configData.security.jwtRefreshSecret = existing.security.jwtRefreshSecret;
    if (existing.security?.jwtUnsubscribeSecret)
      configData.security.jwtUnsubscribeSecret = existing.security.jwtUnsubscribeSecret;
    if (existing.security?.legacyJwtCutoff !== undefined)
      configData.security.legacyJwtCutoff = existing.security.legacyJwtCutoff;
    if (existing.security?.externalEncryptionKey)
      configData.security.externalEncryptionKey = existing.security.externalEncryptionKey;
  }

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, yaml.dump(configData, { lineWidth: -1 }), 'utf-8');
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // non-fatal
  }

  const { reloadConfig } = await import('../config.js');
  reloadConfig();

  const { runMigrations } = await import('../migrate.js');
  runMigrations(input.db.provider);

  const { initPrisma, getPrisma } = await import('../db.js');
  initPrisma();
  const prisma = getPrisma();
  const normalizedAdminEmail = input.admin.email.trim().toLowerCase();

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email: normalizedAdminEmail }, { username: input.admin.username }] },
  });
  if (existingUser) {
    throw new AppError(409, '该邮箱或用户名已被使用');
  }

  const passwordHash = await bcrypt.hash(input.admin.password, 12);
  const admin = await prisma.user.create({
    data: {
      email: normalizedAdminEmail,
      passwordHash,
      username: input.admin.username,
      role: ROLE.ADMIN,
    },
  });

  const siteConfig = input.site || {};
  const setupRecord = await prisma.setupStatus.create({
    data: {
      isSetup: true,
      siteName: resolveSiteTitle(siteConfig.siteName),
      siteUrl,
      defaultLanguage: i18nService.resolveLanguageId(siteConfig.defaultLanguage),
    },
  });

  await prisma.appConfig.create({
    data: storageConfig,
  });

  if (input.mc?.defaultServerName) {
    const apiKey = `lt_${crypto.randomBytes(24).toString('hex')}`;
    await prisma.server.create({
      data: {
        name: input.mc.defaultServerName,
        apiKeyHash: hashServerApiKey(apiKey),
      },
    });
  }

  const { initTemplates } = await import('./template.service.js');
  await initTemplates();

  const refreshToken = await refreshSessionService.createRefreshSession(admin.id, prisma);
  return {
    setup: setupRecord,
    admin: { id: admin.id, email: admin.email, username: admin.username, role: admin.role },
    accessToken: generateAccessToken(admin.id, admin.role, admin.tokenEpoch),
    refreshToken,
  };
}
