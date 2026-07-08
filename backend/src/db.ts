import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { getConfig } from './config.js';

let _client: PrismaClient | null = null;

function createAdapter() {
  const { database } = getConfig();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  if (database.provider === 'mysql') {
    return new PrismaMariaDb(url);
  }
  return new PrismaBetterSqlite3({ url });
}

export function initPrisma(): void {
  if (_client) return;
  _client = new PrismaClient({ adapter: createAdapter() });
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
