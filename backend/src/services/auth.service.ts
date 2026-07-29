import { prisma } from '../db.js';
import bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { generateAccessToken } from '../utils/token.js';
import { USER_PUBLIC_SELECT } from './constants.js';
import * as mailConfigService from './mail-config.service.js';
import * as registrationEmailVerificationService from './registration-email-verification.service.js';
import { generateMinecraftSecret, hashMinecraftSecret } from '../utils/minecraft-credential.js';
import * as refreshSessionService from './refresh-session.service.js';

export async function register(
  email: string,
  password: string,
  username: string,
  emailVerificationCode?: string,
) {
  const normalizedEmail = registrationEmailVerificationService.normalizeEmail(email);
  const existing = await prisma().user.findFirst({
    where: { OR: [{ email: normalizedEmail }, { username }] },
  });
  if (existing) {
    throw new AppError(
      409,
      existing.email === normalizedEmail ? '该邮箱已被注册' : '该用户名已被占用',
    );
  }

  const mailConfig = await mailConfigService.getFullMailConfig();
  const verificationRequired = mailConfigService.canSendPasswordResetMail(mailConfig);
  if (verificationRequired && !emailVerificationCode) {
    throw new ValidationError('请输入邮箱验证码');
  }
  const verificationCodeHash = verificationRequired
    ? await registrationEmailVerificationService.verifyRegistrationCode(
        normalizedEmail,
        emailVerificationCode!,
      )
    : null;

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await prisma().$transaction(async (tx) => {
    const conflictingUser = await tx.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { username }] },
    });
    if (conflictingUser) {
      throw new AppError(
        409,
        conflictingUser.email === normalizedEmail ? '该邮箱已被注册' : '该用户名已被占用',
      );
    }
    if (verificationCodeHash) {
      await registrationEmailVerificationService.consumeRegistrationCode(
        tx,
        normalizedEmail,
        verificationCodeHash,
      );
    }
    const user = await tx.user.create({
      data: { email: normalizedEmail, passwordHash, username },
    });
    const refreshToken = await refreshSessionService.createRefreshSession(user.id, tx);
    return { user, refreshToken };
  });

  return {
    user: sanitizeUser(result.user),
    accessToken: generateAccessToken(result.user.id, result.user.role),
    refreshToken: result.refreshToken,
  };
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
  const playerCredential = generateMinecraftSecret();
  const user = await prisma().$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, passwordHash, username, minecraftUuid, minecraftName },
    });
    await tx.minecraftPlayerCredential.create({
      data: {
        userId: created.id,
        minecraftUuid,
        credentialHash: hashMinecraftSecret(playerCredential),
      },
    });
    return created;
  });

  return { user: sanitizeUser(user), playerCredential };
}

export async function login(emailOrUsername: string, password: string) {
  const isEmail = emailOrUsername.includes('@');
  const user = await prisma().user.findUnique({
    where: isEmail ? { email: emailOrUsername } : { username: emailOrUsername },
  });
  if (!user) throw new UnauthorizedError('邮箱/用户名或密码错误');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('邮箱/用户名或密码错误');

  const refreshToken = await refreshSessionService.createRefreshSession(user.id);
  return {
    user: sanitizeUser(user),
    accessToken: generateAccessToken(user.id, user.role),
    refreshToken,
  };
}

export async function refresh(refreshToken: string) {
  const rotated = await refreshSessionService.rotateRefreshSession(refreshToken);
  if (!rotated) throw new UnauthorizedError('刷新令牌无效或已过期');

  const user = await prisma().user.findUnique({ where: { id: rotated.userId } });
  if (!user) throw new UnauthorizedError('刷新令牌无效或已过期');

  return {
    accessToken: generateAccessToken(user.id, user.role),
    refreshToken: rotated.refreshToken,
    user: sanitizeUser(user),
  };
}

export async function linkMinecraft(userId: number, code: string) {
  return prisma().$transaction(async (tx) => {
    const linkCode = await tx.linkCode.findFirst({
      where: { code, used: false, expiresAt: { gt: new Date() } },
    });
    if (!linkCode?.playerCredentialHash) throw new ValidationError('无效或已过期的绑定码');

    const consumed = await tx.linkCode.updateMany({
      where: { id: linkCode.id, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });
    if (consumed.count !== 1) throw new ValidationError('无效或已过期的绑定码');

    await tx.user.update({
      where: { id: userId },
      data: { minecraftUuid: linkCode.minecraftUuid, minecraftName: linkCode.minecraftName },
    });
    await tx.minecraftPlayerCredential.deleteMany({ where: { userId } });
    await tx.minecraftPlayerCredential.create({
      data: {
        userId,
        minecraftUuid: linkCode.minecraftUuid,
        credentialHash: linkCode.playerCredentialHash,
      },
    });
    return { uuid: linkCode.minecraftUuid, name: linkCode.minecraftName };
  });
}

export async function unlinkMinecraft(userId: number) {
  const user = await prisma().user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');
  if (!user.minecraftUuid) throw new ValidationError('当前账户未绑定Minecraft账号');

  return prisma().$transaction(async (tx) => {
    await tx.minecraftPlayerCredential.deleteMany({ where: { userId } });
    return tx.user.update({
      where: { id: userId },
      data: { minecraftUuid: null, minecraftName: null },
      select: USER_PUBLIC_SELECT,
    });
  });
}

function sanitizeUser(user: User) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}
