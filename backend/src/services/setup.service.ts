import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { AppError, ValidationError } from '../utils/errors.js';
import { generateTokens } from '../utils/token.js';

const prisma = new PrismaClient();

export interface DbConfig {
  provider: 'sqlite' | 'mysql';
  databaseUrl: string;
}

export interface SiteConfig {
  siteName: string;
  siteUrl?: string;
}

export interface SetupInput {
  db: DbConfig;
  admin: {
    email: string;
    password: string;
    username: string;
  };
  site?: SiteConfig;
  mc?: {
    defaultServerName?: string;
  };
}

export async function getSetupStatus() {
  const status = await prisma.setupStatus.findFirst();
  return {
    isSetup: status?.isSetup ?? false,
    siteName: status?.siteName ?? 'LightTicket',
  };
}

export async function completeSetup(input: SetupInput) {
  // Guard: already set up
  const existingSetup = await prisma.setupStatus.findFirst();
  if (existingSetup) {
    throw new AppError(409, '站点已完成初始化，无法重复设置');
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

  // 3. Create admin user
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.admin.email }, { username: input.admin.username }] },
  });
  if (existing) {
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

  // 4. Create setup status record
  const siteConfig = input.site || {};
  const setupRecord = await prisma.setupStatus.create({
    data: {
      isSetup: true,
      siteName: siteConfig.siteName || 'LightTicket',
      siteUrl: siteConfig.siteUrl || null,
    },
  });

  // 5. Optionally create a default server
  if (input.mc?.defaultServerName) {
    const crypto = await import('crypto');
    const apiKey = `lt_${crypto.randomBytes(24).toString('hex')}`;
    await prisma.server.create({
      data: {
        name: input.mc.defaultServerName,
        apiKey,
      },
    });
  }

  const tokens = generateTokens(admin.id, admin.role);
  return {
    setup: setupRecord,
    admin: { id: admin.id, email: admin.email, username: admin.username, role: admin.role },
    ...tokens,
  };
}
