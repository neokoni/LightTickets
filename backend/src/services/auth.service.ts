import { prisma } from '../db.js';
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { getConfig } from '../config.js';
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { generateTokens } from '../utils/token.js';
import { USER_PUBLIC_SELECT } from './constants.js';

export async function register(email: string, password: string, username: string) {
  const existing = await prisma().user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    throw new AppError(409, existing.email === email ? '该邮箱已被注册' : '该用户名已被占用');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma().user.create({
    data: { email, passwordHash, username },
  });

  const tokens = generateTokens(user.id, user.role);
  return { user: sanitizeUser(user), ...tokens };
}

export async function registerFromMinecraft(
  email: string,
  password: string,
  username: string,
  minecraftUuid: string,
  minecraftName: string,
) {
  const existing = await prisma().user.findFirst({
    where: { OR: [{ email }, { username }, { minecraftUuid }] },
  });
  if (existing) {
    if (existing.email === email) throw new AppError(409, '该邮箱已被注册');
    if (existing.username === username) throw new AppError(409, '该用户名已被占用');
    throw new AppError(409, '该Minecraft账号已绑定到其他账户');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma().user.create({
    data: { email, passwordHash, username, minecraftUuid, minecraftName },
  });

  const tokens = generateTokens(user.id, user.role);
  return { user: sanitizeUser(user), ...tokens };
}

export async function login(emailOrUsername: string, password: string) {
  const isEmail = emailOrUsername.includes('@');
  const user = await prisma().user.findUnique({
    where: isEmail ? { email: emailOrUsername } : { username: emailOrUsername },
  });
  if (!user) throw new UnauthorizedError('邮箱/用户名或密码错误');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('邮箱/用户名或密码错误');

  const tokens = generateTokens(user.id, user.role);
  return { user: sanitizeUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  try {
    const config = getConfig();
    const payload = jwt.verify(refreshToken, config.security.jwtRefreshSecret) as {
      userId: number;
      role: string;
    };
    const user = await prisma().user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new UnauthorizedError();

    const accessToken = jwt.sign({ userId: user.id, role: user.role }, config.security.jwtSecret, {
      expiresIn: config.accessTokenExpiry as SignOptions['expiresIn'],
    });
    return { accessToken, user: sanitizeUser(user) };
  } catch {
    throw new UnauthorizedError('刷新令牌无效或已过期');
  }
}

export async function linkMinecraft(userId: number, code: string) {
  const linkCode = await prisma().linkCode.findFirst({
    where: { code, used: false, expiresAt: { gt: new Date() } },
  });
  if (!linkCode) throw new ValidationError('无效或已过期的绑定码');

  await prisma().user.update({
    where: { id: userId },
    data: { minecraftUuid: linkCode.minecraftUuid, minecraftName: linkCode.minecraftName },
  });

  await prisma().linkCode.update({ where: { id: linkCode.id }, data: { used: true } });
  return { uuid: linkCode.minecraftUuid, name: linkCode.minecraftName };
}

export async function unlinkMinecraft(userId: number) {
  const user = await prisma().user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');
  if (!user.minecraftUuid) throw new ValidationError('当前账户未绑定Minecraft账号');

  return prisma().user.update({
    where: { id: userId },
    data: { minecraftUuid: null, minecraftName: null },
    select: USER_PUBLIC_SELECT,
  });
}

export async function unlinkMinecraftByUuid(minecraftUuid: string) {
  const user = await prisma().user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('该 Minecraft 账号未绑定');

  return prisma().user.update({
    where: { id: user.id },
    data: { minecraftUuid: null, minecraftName: null },
    select: USER_PUBLIC_SELECT,
  });
}

function sanitizeUser(user: User) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}
