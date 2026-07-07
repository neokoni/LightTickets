import { PrismaClient } from '@prisma/client';

let _client: PrismaClient | null = null;

export function initPrisma(): void {
  if (_client) return;
  _client = new PrismaClient();
}

export function getPrisma(): PrismaClient {
  if (!_client) throw new Error('PrismaClient not initialized');
  return _client;
}

export function resetPrisma(): void {
  _client = null;
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
}

export const prisma = getPrisma;
