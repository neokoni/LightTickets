import { prisma } from '../db.js';
import bcrypt from 'bcrypt';
import { Prisma, type User } from '@prisma/client';
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { generateAccessToken } from '../utils/token.js';
import { USER_PUBLIC_SELECT } from './constants.js';
import * as mailConfigService from './mail-config.service.js';
import * as registrationEmailVerificationService from './registration-email-verification.service.js';
import { generateMinecraftSecret, hashMinecraftSecret } from '../utils/minecraft-credential.js';
import * as refreshSessionService from './refresh-session.service.js';
import { AUTH_ERROR_MESSAGES } from '../constants/auth.js';
import * as rateLimitConfigService from './rate-limit-config.service.js';

type RegistrationConflictClient = Pick<Prisma.TransactionClient, 'user'>;

async function assertRegistrationFieldsAvailable(
  client: RegistrationConflictClient,
  email: string,
  username: string,
  concealConflict = false,
): Promise<void> {
  const emailConflict = await client.user.findFirst({
    where: {
      OR: [
        { email },
        {
          pendingEmail: email,
          emailChangeRequest: { is: { expiresAt: { gt: new Date() } } },
        },
      ],
    },
    select: { id: true },
  });
  if (emailConflict) {
    if (concealConflict) {
      throw new ValidationError(AUTH_ERROR_MESSAGES.REGISTRATION_CONFLICT_MESSAGE);
    }
    throw new AppError(409, '该邮箱已被注册或正在等待验证');
  }

  const usernameConflict = await client.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (usernameConflict) {
    if (concealConflict) {
      throw new ValidationError(AUTH_ERROR_MESSAGES.REGISTRATION_CONFLICT_MESSAGE);
    }
    throw new AppError(409, '该用户名已被占用');
  }
}

function concealRegistrationUniqueConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ValidationError(AUTH_ERROR_MESSAGES.REGISTRATION_CONFLICT_MESSAGE);
  }
  throw error;
}

export async function register(
  email: string,
  password: string,
  username: string,
  emailVerificationCode?: string,
) {
  const normalizedEmail = registrationEmailVerificationService.normalizeEmail(email);
  await assertRegistrationFieldsAvailable(prisma(), normalizedEmail, username, true);

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
  const result = await prisma()
    .$transaction(async (tx) => {
      await assertRegistrationFieldsAvailable(tx, normalizedEmail, username, true);
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
    })
    .catch(concealRegistrationUniqueConflict);

  return {
    user: sanitizeUser(result.user),
    accessToken: generateAccessToken(result.user.id, result.user.role, result.user.tokenEpoch),
    refreshToken: result.refreshToken,
  };
}

export async function registerFromMinecraft(
  email: string,
  password: string,
  username: string,
  minecraftUuid: string,
  minecraftName: string,
  emailVerificationCode?: string,
) {
  const normalizedEmail = registrationEmailVerificationService.normalizeEmail(email);
  await assertRegistrationFieldsAvailable(prisma(), normalizedEmail, username);
  const minecraftConflict = await prisma().user.findUnique({
    where: { minecraftUuid },
    select: { id: true },
  });
  if (minecraftConflict) throw new AppError(409, '该Minecraft账号已绑定到其他账户');

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
  const playerCredential = generateMinecraftSecret();
  const user = await prisma().$transaction(async (tx) => {
    await assertRegistrationFieldsAvailable(tx, normalizedEmail, username);
    if (verificationCodeHash) {
      await registrationEmailVerificationService.consumeRegistrationCode(
        tx,
        normalizedEmail,
        verificationCodeHash,
      );
    }
    const created = await tx.user.create({
      data: { email: normalizedEmail, passwordHash, username, minecraftUuid, minecraftName },
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
    accessToken: generateAccessToken(user.id, user.role, user.tokenEpoch),
    refreshToken,
  };
}

export async function refresh(refreshToken: string) {
  const rotated = await refreshSessionService.rotateRefreshSession(refreshToken);
  if (!rotated) throw new UnauthorizedError('刷新令牌无效或已过期');

  const user = await prisma().user.findUnique({ where: { id: rotated.userId } });
  if (!user) throw new UnauthorizedError('刷新令牌无效或已过期');

  return {
    accessToken: generateAccessToken(user.id, user.role, user.tokenEpoch),
    refreshToken: rotated.refreshToken,
    user: sanitizeUser(user),
  };
}

export async function linkMinecraft(userId: number, code: string) {
  const outcome = await prisma().$transaction(async (tx) => {
    const now = new Date();
    const { minecraftLink } = await rateLimitConfigService.getRateLimitConfig(tx);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { minecraftLinkFailedAttempts: true, minecraftLinkLockedUntil: true },
    });
    if (!user) throw new NotFoundError('用户不存在');
    if (user.minecraftLinkLockedUntil && user.minecraftLinkLockedUntil > now) {
      return { status: 'locked' } as const;
    }

    const linkCode = await tx.linkCode.findUnique({ where: { code } });
    if (
      !linkCode ||
      linkCode.used ||
      linkCode.expiresAt <= now ||
      linkCode.attempts >= minecraftLink.maxAttempts ||
      !linkCode.playerCredentialHash
    ) {
      if (linkCode && !linkCode.used && linkCode.attempts < minecraftLink.maxAttempts) {
        await tx.linkCode.update({
          where: { id: linkCode.id },
          data: { attempts: { increment: 1 } },
        });
      }
      const locked = await recordLinkCodeFailure(tx, userId, user, now, minecraftLink);
      return { status: locked ? 'locked' : 'invalid' } as const;
    }

    const consumed = await tx.linkCode.updateMany({
      where: {
        id: linkCode.id,
        used: false,
        expiresAt: { gt: now },
        attempts: { lt: minecraftLink.maxAttempts },
      },
      data: { used: true },
    });
    if (consumed.count !== 1) {
      const locked = await recordLinkCodeFailure(tx, userId, user, now, minecraftLink);
      return { status: locked ? 'locked' : 'invalid' } as const;
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        minecraftUuid: linkCode.minecraftUuid,
        minecraftName: linkCode.minecraftName,
        minecraftLinkFailedAttempts: 0,
        minecraftLinkLockedUntil: null,
      },
    });
    await tx.minecraftPlayerCredential.deleteMany({ where: { userId } });
    await tx.minecraftPlayerCredential.create({
      data: {
        userId,
        minecraftUuid: linkCode.minecraftUuid,
        credentialHash: linkCode.playerCredentialHash,
      },
    });
    return {
      status: 'linked',
      value: { uuid: linkCode.minecraftUuid, name: linkCode.minecraftName },
    } as const;
  });

  if (outcome.status === 'locked') throw new ValidationError(AUTH_ERROR_MESSAGES.LOCKED_MESSAGE);
  if (outcome.status === 'invalid')
    throw new ValidationError(AUTH_ERROR_MESSAGES.INVALID_CODE_MESSAGE);
  return outcome.value;
}

async function recordLinkCodeFailure(
  tx: Prisma.TransactionClient,
  userId: number,
  user: { minecraftLinkFailedAttempts: number; minecraftLinkLockedUntil: Date | null },
  now: Date,
  policy: { maxAttempts: number; lockSeconds: number },
): Promise<boolean> {
  const resetExpiredLock = user.minecraftLinkLockedUntil && user.minecraftLinkLockedUntil <= now;
  const updated = await tx.user.update({
    where: { id: userId },
    data: resetExpiredLock
      ? { minecraftLinkFailedAttempts: 1, minecraftLinkLockedUntil: null }
      : { minecraftLinkFailedAttempts: { increment: 1 } },
    select: { minecraftLinkFailedAttempts: true },
  });
  if (updated.minecraftLinkFailedAttempts < policy.maxAttempts) return false;

  await tx.user.update({
    where: { id: userId },
    data: { minecraftLinkLockedUntil: new Date(now.getTime() + policy.lockSeconds * 1_000) },
  });
  return true;
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
  const {
    passwordHash: _passwordHash,
    minecraftLinkFailedAttempts: _minecraftLinkFailedAttempts,
    minecraftLinkLockedUntil: _minecraftLinkLockedUntil,
    ...safe
  } = user;
  return safe;
}
