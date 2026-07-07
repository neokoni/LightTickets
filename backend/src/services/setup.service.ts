import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { AppError, ValidationError } from '../utils/errors.js';
import { generateTokens } from '../utils/token.js';
import { ROLE } from '../constants/roles.js';
import { CONFIG_PATH, isDatabaseConfigured, validateS3Config, type S3Config } from '../config.js';

type SetupConfigFile = {
  server?: { port?: number; corsOrigins?: string[] };
  database?: {
    provider?: 'sqlite' | 'mysql';
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  };
  security?: { jwtSecret?: string; jwtRefreshSecret?: string };
};

function readYaml(filePath: string): SetupConfigFile {
  const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'));
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as SetupConfigFile) : {};
}

export interface SiteConfig {
  isSetup: boolean;
  requireLogin: boolean;
  allowWebRegister: boolean;
  allowMcRegister: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
}

export interface SiteConfigInput {
  siteName?: string;
  siteUrl?: string;
}

export interface SetupInput {
  db: {
    provider: 'sqlite' | 'mysql';
    databaseUrl?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
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
    driver: 'local' | 's3';
    uploadDir?: string;
    s3?: Partial<S3Config>;
  };
}

function buildStorageConfig(input: SetupInput['storage']) {
  if (!input || input.driver === 'local') {
    return {
      storageDriver: 'local',
      uploadDir: input?.uploadDir?.trim() || 'data/uploads',
      s3Config: null,
    };
  }

  const s3: Partial<S3Config> = {
    endpoint: input.s3?.endpoint,
    region: input.s3?.region || 'us-east-1',
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
    storageDriver: 's3',
    uploadDir: input.uploadDir?.trim() || 'data/uploads',
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
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    };
  }

  try {
    const { getPrisma } = await import('../db.js');
    const prisma = getPrisma();
    const status = await prisma.setupStatus.findFirst();
    return {
      isSetup: status?.isSetup ?? false,
      requireLogin: status?.requireLogin ?? false,
      allowWebRegister: status?.allowWebRegister ?? true,
      allowMcRegister: status?.allowMcRegister ?? true,
      siteName: status?.siteName || 'LightTickets',
      siteUrl: status?.siteUrl ?? null,
      footerContent: status?.footerContent ?? null,
    };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    const msg = error.message || '';
    if (error.name === 'PrismaClientValidationError' || msg.includes('Unknown argument')) {
      throw e;
    }
    console.warn('[setup] Could not query setup status:', msg);
    return {
      isSetup: false,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    };
  }
}

export async function updateSettings(data: {
  requireLogin?: boolean;
  allowWebRegister?: boolean;
  allowMcRegister?: boolean;
  siteName?: string;
  siteUrl?: string | null;
  footerContent?: string | null;
}) {
  const { getPrisma } = await import('../db.js');
  const prisma = getPrisma();

  const status = await prisma.setupStatus.findFirst();
  if (!status) throw new AppError(404, '站点尚未初始化');

  const updated = await prisma.setupStatus.update({
    where: { id: status.id },
    data: {
      ...(data.requireLogin !== undefined && { requireLogin: data.requireLogin }),
      ...(data.allowWebRegister !== undefined && { allowWebRegister: data.allowWebRegister }),
      ...(data.allowMcRegister !== undefined && { allowMcRegister: data.allowMcRegister }),
      ...(data.siteName !== undefined && { siteName: data.siteName }),
      ...(data.siteUrl !== undefined && { siteUrl: data.siteUrl }),
      ...(data.footerContent !== undefined && { footerContent: data.footerContent }),
    },
  });

  return {
    requireLogin: updated.requireLogin,
    allowWebRegister: updated.allowWebRegister,
    allowMcRegister: updated.allowMcRegister,
    siteName: updated.siteName,
    siteUrl: updated.siteUrl,
    footerContent: updated.footerContent,
  };
}

export async function completeSetup(input: SetupInput) {
  if (isDatabaseConfigured()) {
    try {
      const { getPrisma } = await import('../db.js');
      const prisma = getPrisma();
      const existing = await prisma.setupStatus.findFirst();
      if (existing) {
        throw new AppError(409, '站点已完成初始化，无法重复设置');
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
    }
  }

  if (!input.db.provider || !['sqlite', 'mysql'].includes(input.db.provider)) {
    throw new ValidationError('无效的数据库类型，仅支持 sqlite 或 mysql');
  }

  if (!input.admin.email || !input.admin.password || !input.admin.username) {
    throw new ValidationError('管理员邮箱、密码和用户名均为必填项');
  }
  if (input.admin.password.length < 6) {
    throw new ValidationError('管理员密码长度不能低于 6 位');
  }

  const storageConfig = buildStorageConfig(input.storage);

  const configData: Required<SetupConfigFile> = {
    server: {
      port: 3000,
      corsOrigins: ['http://localhost:5173'],
    },
    database: {
      provider: input.db.provider,
    },
    security: {
      jwtSecret: crypto.randomBytes(32).toString('hex'),
      jwtRefreshSecret: crypto.randomBytes(32).toString('hex'),
    },
  };

  if (input.db.provider === 'mysql') {
    configData.database.host = input.db.host || 'localhost';
    configData.database.port = input.db.port || 3306;
    configData.database.username = input.db.username || '';
    configData.database.password = input.db.password || '';
    configData.database.database = input.db.database || 'lighttickets';
  }

  if (fs.existsSync(CONFIG_PATH)) {
    const existing = readYaml(CONFIG_PATH);
    if (existing.server?.port) configData.server.port = existing.server.port;
    if (existing.server?.corsOrigins) configData.server.corsOrigins = existing.server.corsOrigins;
    if (existing.security?.jwtSecret) configData.security.jwtSecret = existing.security.jwtSecret;
    if (existing.security?.jwtRefreshSecret)
      configData.security.jwtRefreshSecret = existing.security.jwtRefreshSecret;
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

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email: input.admin.email }, { username: input.admin.username }] },
  });
  if (existingUser) {
    throw new AppError(409, '该邮箱或用户名已被使用');
  }

  const passwordHash = await bcrypt.hash(input.admin.password, 12);
  const admin = await prisma.user.create({
    data: {
      email: input.admin.email,
      passwordHash,
      username: input.admin.username,
      role: ROLE.ADMIN,
    },
  });

  const siteConfig = input.site || {};
  const setupRecord = await prisma.setupStatus.create({
    data: {
      isSetup: true,
      siteName: siteConfig.siteName || 'LightTickets',
      siteUrl: siteConfig.siteUrl || null,
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
        apiKey,
      },
    });
  }

  const { initTemplates } = await import('./template.service.js');
  await initTemplates();

  const tokens = generateTokens(admin.id, admin.role);
  return {
    setup: setupRecord,
    admin: { id: admin.id, email: admin.email, username: admin.username, role: admin.role },
    ...tokens,
  };
}
