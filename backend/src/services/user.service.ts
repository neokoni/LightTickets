import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { getPrisma } from '../db.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';

const prisma = () => getPrisma();

export async function listUsers(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const [users, total] = await Promise.all([
    prisma().user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        minecraftUuid: true,
        minecraftName: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma().user.count(),
  ]);
  return { users, total, page, pageSize };
}

export async function listAssignableUsers() {
  return prisma().user.findMany({
    where: {
      role: { in: ['player', 'staff', 'admin'] },
    },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      role: true,
    },
    orderBy: { username: 'asc' },
  });
}

export async function changeRole(userId: number, role: Role) {
  const user = await prisma().user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');

  return prisma().user.update({
    where: { id: userId },
    data: { role },
    select: {
      id: true,
      email: true,
      username: true,
      minecraftUuid: true,
      minecraftName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function deleteUser(userId: number, currentUserId: number) {
  if (userId === currentUserId) {
    throw new ValidationError('不能删除自己的账户');
  }

  const user = await prisma().user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');

  await prisma().user.delete({ where: { id: userId } });
}

export async function updateUsername(userId: number, username: string) {
  const existing = await prisma().user.findFirst({
    where: { username, id: { not: userId } },
  });
  if (existing) throw new AppError(409, '该用户名已被占用');

  return prisma().user.update({
    where: { id: userId },
    data: { username },
    select: {
      id: true,
      email: true,
      username: true,
      minecraftUuid: true,
      minecraftName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateAvatar(userId: number, avatarUrl: string | null) {
  const user = await prisma().user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');

  return prisma().user.update({
    where: { id: userId },
    data: { avatarUrl: avatarUrl || null },
    select: {
      id: true,
      email: true,
      username: true,
      minecraftUuid: true,
      minecraftName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const user = await prisma().user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new ValidationError('当前密码错误');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma().user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function updateEmail(userId: number, email: string) {
  const existing = await prisma().user.findFirst({
    where: { email, id: { not: userId } },
  });
  if (existing) throw new AppError(409, '该邮箱已被注册');

  return prisma().user.update({
    where: { id: userId },
    data: { email },
    select: {
      id: true,
      email: true,
      username: true,
      minecraftUuid: true,
      minecraftName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
