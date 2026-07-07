import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;
let configPath: string;

vi.mock('../src/config.js', () => ({
  get CONFIG_PATH() {
    return configPath;
  },
  isDatabaseConfigured: vi.fn(() => false),
  validateS3Config: vi.fn((s3: Record<string, unknown>) => {
    for (const key of ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey']) {
      if (!s3[key]) throw new Error(`storage.s3 缺少必填字段: ${key}`);
    }
  }),
  reloadConfig: vi.fn(() => ({
    security: { jwtSecret: 'jwt', jwtRefreshSecret: 'refresh' },
    accessTokenExpiry: '2h',
    refreshTokenExpiry: '7d',
  })),
}));

vi.mock('../src/migrate.js', () => ({
  runMigrations: vi.fn(),
}));

vi.mock('../src/db.js', () => {
  const prisma = {
    user: {
      findFirst: vi.fn(() => null),
      create: vi.fn(() =>
        Promise.resolve({
          id: 1,
          email: 'admin@example.com',
          username: 'admin',
          role: 'admin',
        }),
      ),
    },
    setupStatus: {
      create: vi.fn(() =>
        Promise.resolve({
          id: 'setup',
          isSetup: true,
          siteName: 'LightTickets',
          siteUrl: null,
        }),
      ),
    },
    appConfig: {
      create: vi.fn(() => Promise.resolve({ id: 'config' })),
    },
    server: {
      create: vi.fn(),
    },
  };

  return {
    initPrisma: vi.fn(),
    getPrisma: vi.fn(() => prisma),
  };
});

vi.mock('../src/services/template.service.js', () => ({
  initTemplates: vi.fn(),
}));

vi.mock('../src/utils/token.js', () => ({
  generateTokens: vi.fn(() => ({ accessToken: 'access', refreshToken: 'refresh' })),
}));

describe('setup.service', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttickets-setup-test-'));
    configPath = path.join(tempDir, 'missing-data-dir', 'config.yml');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('creates the config directory before writing config.yml', async () => {
    const { completeSetup } = await import('../src/services/setup.service.js');

    const result = await completeSetup({
      db: { provider: 'sqlite' },
      admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
    });

    expect(result.accessToken).toBe('access');
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, 'utf-8')).toContain('provider: sqlite');
  });
});
