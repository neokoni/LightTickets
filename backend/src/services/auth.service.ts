import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError, UnauthorizedError, ValidationError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function register(email: string, password: string, username: string) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    throw new AppError(409, existing.email === email ? 'Email already registered' : 'Username taken');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, username },
  });

  const tokens = generateTokens(user.id, user.role);
  return { user: sanitizeUser(user), ...tokens };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const tokens = generateTokens(user.id, user.role);
  return { user: sanitizeUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  try {
    const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as { userId: string; role: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new UnauthorizedError();

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      config.jwtSecret,
      { expiresIn: config.accessTokenExpiry },
    );
    return { accessToken, user: sanitizeUser(user) };
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
}

export async function linkMinecraft(userId: string, code: string) {
  const linkCode = await prisma.linkCode.findFirst({
    where: { code, used: false, expiresAt: { gt: new Date() } },
  });
  if (!linkCode) throw new ValidationError('Invalid or expired link code');

  await prisma.user.update({
    where: { id: userId },
    data: { minecraftUuid: linkCode.minecraftUuid, minecraftName: linkCode.minecraftName },
  });

  await prisma.linkCode.update({ where: { id: linkCode.id }, data: { used: true } });
  return { uuid: linkCode.minecraftUuid, name: linkCode.minecraftName };
}

function generateTokens(userId: string, role: string) {
  const accessToken = jwt.sign({ userId, role }, config.jwtSecret, { expiresIn: config.accessTokenExpiry });
  const refreshToken = jwt.sign({ userId, role }, config.jwtRefreshSecret, { expiresIn: config.refreshTokenExpiry });
  return { accessToken, refreshToken };
}

function sanitizeUser(user: any) {
  const { passwordHash, ...safe } = user;
  return safe;
}
