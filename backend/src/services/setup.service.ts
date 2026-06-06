import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { AppError, ValidationError } from '../utils/errors.js';
import { generateTokens } from '../utils/token.js';

const CONFIG_PATH = path.resolve('data/config.yml');

function readYaml(filePath: string): Record<string, any> {
  const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'));
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, any> : {};
}

export interface SiteConfig {
  isSetup: boolean;
  requireLogin: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
}

export interface DbConfig {
  provider: 'sqlite' | 'mysql';
  databaseUrl: string;
}

export interface SiteConfigInput {
  siteName?: string;
  siteUrl?: string;
}

export interface SetupInput {
  db: DbConfig;
  admin: {
    email: string;
    password: string;
    username: string;
  };
  site?: SiteConfigInput;
  mc?: {
    defaultServerName?: string;
  };
}

export async function getSiteConfig(): Promise<SiteConfig> {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { isSetup: false, requireLogin: false, siteName: 'LightTickets', siteUrl: null, footerContent: null };
  }

  const raw = readYaml(CONFIG_PATH);
  if (!raw.db?.databaseUrl || !raw.db?.provider) {
    return { isSetup: false, requireLogin: false, siteName: raw.siteName || 'LightTickets', siteUrl: null, footerContent: null };
  }

  try {
    const { getPrisma } = await import('../db.js');
    const prisma = getPrisma();
    const status = await prisma.setupStatus.findFirst();
    return {
      isSetup: status?.isSetup ?? false,
      requireLogin: status?.requireLogin ?? false,
      siteName: status?.siteName || raw.siteName || 'LightTickets',
      siteUrl: status?.siteUrl ?? null,
      footerContent: status?.footerContent ?? null,
    };
  } catch (e) {
    // DB not initialized yet — expected on fresh install
    console.warn('[setup] Could not query setup status:', e instanceof Error ? e.message : e);
    return { isSetup: false, requireLogin: false, siteName: raw.siteName || 'LightTickets', siteUrl: null, footerContent: null };
  }
}

export async function updateSettings(data: {
  requireLogin?: boolean;
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
      ...(data.siteName !== undefined && { siteName: data.siteName }),
      ...(data.siteUrl !== undefined && { siteUrl: data.siteUrl }),
      ...(data.footerContent !== undefined && { footerContent: data.footerContent }),
    },
  });

  return {
    requireLogin: updated.requireLogin,
    siteName: updated.siteName,
    siteUrl: updated.siteUrl,
    footerContent: updated.footerContent,
  };
}

export async function getSetupStatus() {
  const { getPrisma } = await import('../db.js');
  const prisma = getPrisma();

  const status = await prisma.setupStatus.findFirst();
  return {
    isSetup: status?.isSetup ?? false,
    siteName: status?.siteName ?? 'LightTickets',
  };
}

export async function completeSetup(input: SetupInput) {
  // Guard: check if already set up
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = readYaml(CONFIG_PATH);
    if (raw.db?.databaseUrl && raw.db?.provider) {
      try {
        const { getPrisma } = await import('../db.js');
        const prisma = getPrisma();
        const existing = await prisma.setupStatus.findFirst();
        if (existing) {
          throw new AppError(409, '站点已完成初始化，无法重复设置');
        }
      } catch (e) {
        if (e instanceof AppError) throw e;
        // DB not initialized, proceed with setup
      }
    }
  }

  // 1. Validate DB config
  if (!input.db.provider || !['sqlite', 'mysql'].includes(input.db.provider)) {
    throw new ValidationError('无效的数据库类型，仅支持 sqlite 或 mysql');
  }
  if (!input.db.databaseUrl) {
    throw new ValidationError('数据库连接地址不能为空');
  }

  // 2. Validate admin
  if (!input.admin.email || !input.admin.password || !input.admin.username) {
    throw new ValidationError('管理员邮箱、密码和用户名均为必填项');
  }
  if (input.admin.password.length < 6) {
    throw new ValidationError('管理员密码长度不能低于 6 位');
  }

  // 3. Write config.yml
  const configData: Record<string, any> = {
    port: 3000,
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    jwtRefreshSecret: crypto.randomBytes(32).toString('hex'),
    db: {
      provider: input.db.provider,
      databaseUrl: input.db.databaseUrl,
    },
  };

  if (fs.existsSync(CONFIG_PATH)) {
    const existing = readYaml(CONFIG_PATH);
    if (existing.port) configData.port = existing.port;
    if (existing.jwtSecret) configData.jwtSecret = existing.jwtSecret;
    if (existing.jwtRefreshSecret) configData.jwtRefreshSecret = existing.jwtRefreshSecret;
  }

  fs.writeFileSync(CONFIG_PATH, yaml.dump(configData, { lineWidth: -1 }), 'utf-8');

  // 4. Set DATABASE_URL and run migrations
  let databaseUrl = input.db.databaseUrl;
  if (input.db.provider === 'sqlite' && databaseUrl.startsWith('file:')) {
    const relPath = databaseUrl.slice(5);
    databaseUrl = `file:${path.resolve('data', relPath)}`;
  }
  process.env.DATABASE_URL = databaseUrl;

  // Only run migrations and init prisma if not already initialized
  let prisma;
  try {
    const { getPrisma } = await import('../db.js');
    prisma = getPrisma();
  } catch {
    const { runMigrations } = await import('../migrate.js');
    runMigrations(input.db.provider);

    const { initPrisma, getPrisma } = await import('../db.js');
    initPrisma();
    prisma = getPrisma();
  }

  // 5. Create admin user
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
      role: 'admin',
    },
  });

  // 6. Create setup status record
  const siteConfig = input.site || {};
  const setupRecord = await prisma.setupStatus.create({
    data: {
      isSetup: true,
      siteName: siteConfig.siteName || 'LightTickets',
      siteUrl: siteConfig.siteUrl || null,
    },
  });

  // 7. Optionally create a default server
  if (input.mc?.defaultServerName) {
    const apiKey = `lt_${crypto.randomBytes(24).toString('hex')}`;
    await prisma.server.create({
      data: {
        name: input.mc.defaultServerName,
        apiKey,
      },
    });
  }

  // 8. Seed templates
  const { seedTemplatesFromFiles } = await import('./template.service.js');
  await seedTemplatesFromFiles();

  const tokens = generateTokens(admin.id, admin.role);
  return {
    setup: setupRecord,
    admin: { id: admin.id, email: admin.email, username: admin.username, role: admin.role },
    ...tokens,
  };
}

export async function startFullAppAfterSetup(setupServer: import('http').Server): Promise<void> {
  const { loadConfig } = await import('../config.js');
  const config = loadConfig();

  const { initPrisma } = await import('../db.js');
  initPrisma();

  const { initTemplates } = await import('./template.service.js');
  await initTemplates();

  const { createApp } = await import('../app.js');
  const { createServer } = await import('http');
  const { initSocket } = await import('../socket/index.js');

  const app = createApp();
  const server = createServer(app);
  initSocket(server);

  setupServer.close(() => {
    server.listen(config.port, () => {
      console.log(`LightTickets API running on port ${config.port}`);
    });
  });
}
