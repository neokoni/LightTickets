import { describe, it, expect, afterEach } from 'vitest';
import { initPrisma, getPrisma, resetPrisma } from '../src/db.js';

const DB_URL = process.env.DATABASE_URL || 'file:./dev.db';

describe('db', () => {
  afterEach(() => {
    // Restore shared client so the global setup.ts beforeEach keeps working
    process.env.DATABASE_URL = DB_URL;
    initPrisma();
  });

  it('getPrisma throws if initPrisma not called', () => {
    resetPrisma();
    expect(() => getPrisma()).toThrow('PrismaClient not initialized');
  });

  it('getPrisma returns PrismaClient after initPrisma', () => {
    resetPrisma();
    process.env.DATABASE_URL = DB_URL;
    initPrisma();
    const prisma = getPrisma();
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe('function');
  });

  it('getPrisma returns same instance on multiple calls', () => {
    resetPrisma();
    process.env.DATABASE_URL = DB_URL;
    initPrisma();
    const a = getPrisma();
    const b = getPrisma();
    expect(a).toBe(b);
  });
});
