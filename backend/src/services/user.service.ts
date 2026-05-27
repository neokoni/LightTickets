import { PrismaClient, Role } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function listUsers(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        minecraftUuid: true,
        minecraftName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.user.count(),
  ]);
  return { users, total, page, pageSize };
}

export async function changeRole(userId: string, role: Role) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');

  return prisma.user.update({
    where: { id: userId },
    data: { role },
    select: {
      id: true,
      email: true,
      username: true,
      minecraftUuid: true,
      minecraftName: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function deleteUser(userId: string, currentUserId: string) {
  if (userId === currentUserId) {
    throw new ValidationError('不能删除自己的账户');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');

  await prisma.user.delete({ where: { id: userId } });
}
