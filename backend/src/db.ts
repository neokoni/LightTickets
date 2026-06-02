import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function initPrisma(): void {
  if (prisma) return;
  prisma = new PrismaClient();
}

export function getPrisma(): PrismaClient {
  if (!prisma) throw new Error('PrismaClient not initialized');
  return prisma;
}

export function resetPrisma(): void {
  prisma = null;
}
