import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';

let tempDir: string;
let configPath: string;
let databaseConfigured = false;
let setupStatusFindFirst: ReturnType<typeof vi.fn>;
let setupStatusCreate: ReturnType<typeof vi.fn>;
let setupStatusUpdate: ReturnType<typeof vi.fn>;
let setupStatusFindUnique: ReturnType<typeof vi.fn>;
let setupStatusFindUniqueOrThrow: ReturnType<typeof vi.fn>;
let setupStatusUpsert: ReturnType<typeof vi.fn>;
let setupStatusUpdateMany: ReturnType<typeof vi.fn>;
let userCount: ReturnType<typeof vi.fn>;
let userCreate: ReturnType<typeof vi.fn>;
let appConfigFindFirst: ReturnType<typeof vi.fn>;
let appConfigCreate: ReturnType<typeof vi.fn>;
let appConfigUpsert: ReturnType<typeof vi.fn>;

vi.mock('../src/config.js', () => ({
  get CONFIG_PATH() {
    return configPath;
  },
  isDatabaseConfigured: vi.fn(() => databaseConfigured || fs.existsSync(configPath)),
  validateS3Config: vi.fn((s3: Record<string, unknown>) => {
    for (const key of ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey']) {
      if (!s3[key]) throw new Error(`storage.s3 缺少必填字段: ${key}`);
    }
  }),
  reloadConfig: vi.fn(() => ({
    security: {
      jwtSecret: 'jwt',
      jwtRefreshSecret: 'refresh',
      jwtUnsubscribeSecret: 'unsubscribe',
      legacyJwtCutoff: 0,
      externalEncryptionKey: 'encryption',
    },
    accessTokenExpiry: '2h',
    refreshTokenExpiry: '7d',
  })),
  resetConfig: vi.fn(),
}));

vi.mock('../src/migrate.js', () => ({
  runMigrations: vi.fn(),
}));

vi.mock('../src/db.js', () => {
  setupStatusFindFirst = vi.fn(() => null);
  setupStatusCreate = vi.fn(() =>
    Promise.resolve({
      id: 'setup',
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    }),
  );
  setupStatusUpdate = vi.fn(() =>
    Promise.resolve({
      id: 'setup',
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    }),
  );
  setupStatusFindUnique = vi.fn(() => null);
  setupStatusFindUniqueOrThrow = vi.fn(() =>
    Promise.resolve({
      id: 'setup',
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    }),
  );
  setupStatusUpsert = vi.fn(() =>
    Promise.resolve({
      id: 'setup',
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    }),
  );
  setupStatusUpdateMany = vi.fn(() => Promise.resolve({ count: 1 }));
  userCount = vi.fn(() => 0);
  userCreate = vi.fn(() =>
    Promise.resolve({
      id: 1,
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin',
      tokenEpoch: 0,
    }),
  );
  appConfigFindFirst = vi.fn(() => Promise.resolve({ id: 'config' }));
  appConfigCreate = vi.fn(() => Promise.resolve({ id: 'config' }));
  appConfigUpsert = vi.fn(() => Promise.resolve({ id: 'default' }));
  const prisma = {
    user: {
      count: userCount,
      findFirst: vi.fn(() => null),
      create: userCreate,
    },
    setupStatus: {
      findFirst: setupStatusFindFirst,
      findUnique: setupStatusFindUnique,
      findUniqueOrThrow: setupStatusFindUniqueOrThrow,
      update: setupStatusUpdate,
      updateMany: setupStatusUpdateMany,
      upsert: setupStatusUpsert,
      create: vi.fn((args?: unknown) => {
        if (args) return setupStatusCreate(args);
        return Promise.resolve({
          id: 'setup',
          isSetup: true,
          siteName: 'LightTickets',
          siteUrl: null,
        });
      }),
    },
    appConfig: {
      findFirst: appConfigFindFirst,
      upsert: appConfigUpsert,
      create: vi.fn((args?: unknown) => {
        if (args) return appConfigCreate(args);
        return Promise.resolve({ id: 'config' });
      }),
    },
    server: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
  };

  return {
    initPrisma: vi.fn(),
    disconnectPrisma: vi.fn(),
    getPrisma: vi.fn(() => prisma),
    prisma: vi.fn(() => prisma),
  };
});

vi.mock('../src/services/template.service.js', () => ({
  initTemplates: vi.fn(),
}));

vi.mock('../src/services/federatedauth-provider.service.js', () => ({
  listPublicProviders: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../src/utils/token.js', () => ({
  generateAccessToken: vi.fn(() => 'access'),
}));

vi.mock('../src/services/refresh-session.service.js', () => ({
  createRefreshSession: vi.fn(() => Promise.resolve('refresh')),
}));

describe('setup.service', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttickets-setup-test-'));
    configPath = path.join(tempDir, 'missing-data-dir', 'config.yml');
    databaseConfigured = false;
    setupStatusFindFirst?.mockResolvedValue(null);
    setupStatusCreate?.mockResolvedValue({
      id: 'setup',
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    });
    setupStatusUpdate?.mockResolvedValue({
      id: 'setup',
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    });
    setupStatusFindUnique?.mockResolvedValue(null);
    setupStatusFindUniqueOrThrow?.mockResolvedValue({
      id: 'setup',
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    });
    setupStatusUpsert?.mockResolvedValue({
      id: 'setup',
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    });
    setupStatusUpdateMany?.mockResolvedValue({ count: 1 });
    userCount?.mockResolvedValue(0);
    userCreate?.mockResolvedValue({
      id: 1,
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin',
      tokenEpoch: 0,
    });
    appConfigFindFirst?.mockResolvedValue({ id: 'config' });
    appConfigCreate?.mockResolvedValue({ id: 'config' });
    appConfigUpsert?.mockResolvedValue({ id: 'default' });
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
      trustedProxyIp: '::ffff:172.18.0.5',
    });

    expect(result.accessToken).toBe('access');
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, 'utf-8')).toContain('provider: sqlite');
    expect(fs.readFileSync(configPath, 'utf-8')).toContain('jwtUnsubscribeSecret');
    expect(fs.readFileSync(configPath, 'utf-8')).toContain('legacyJwtCutoff: 0');
    expect(fs.readFileSync(configPath, 'utf-8')).toContain('externalEncryptionKey');
    expect(fs.readFileSync(configPath, 'utf-8')).toContain('trustedProxyIps:');
    expect(fs.readFileSync(configPath, 'utf-8')).toContain('172.18.0.5');
  });

  it('uses the real access origin for corsOrigins when provided', async () => {
    const { completeSetup } = await import('../src/services/setup.service.js');

    await completeSetup({
      db: { provider: 'sqlite' },
      admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
      accessOrigin: 'https://tickets.example.com/setup',
    });

    const config = fs.readFileSync(configPath, 'utf-8');
    expect(config).toContain('https://tickets.example.com');
    expect(config).not.toContain('http://localhost:23310');
  });

  it('falls back to localhost corsOrigins when access origin is missing or invalid', async () => {
    const { completeSetup } = await import('../src/services/setup.service.js');

    await completeSetup({
      db: { provider: 'sqlite' },
      admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
      accessOrigin: 'not-a-url',
    });

    expect(fs.readFileSync(configPath, 'utf-8')).toContain('http://localhost:23310');
  });

  it('writes explicit mysql fields without hardcoded host or database defaults', async () => {
    const { completeSetup } = await import('../src/services/setup.service.js');

    await completeSetup({
      db: {
        provider: 'mysql',
        host: 'db.internal',
        username: 'app',
        password: 'secret',
        database: 'lighttickets_prod',
        args: 'sslaccept=strict&connect_timeout=10',
      },
      admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
    });

    const config = fs.readFileSync(configPath, 'utf-8');
    expect(config).toContain('host: db.internal');
    expect(config).toContain('port: 3306');
    expect(config).toContain('username: app');
    expect(config).toContain('database: lighttickets_prod');
    expect(config).toContain('args: sslaccept=strict&connect_timeout=10');
    expect(config).not.toContain('host: localhost');
    expect(config).not.toContain('databaseUrl');
  });

  it('rejects mysql setup without required fields', async () => {
    const { completeSetup } = await import('../src/services/setup.service.js');

    await expect(
      completeSetup({
        db: { provider: 'mysql', username: 'app' },
        admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
      }),
    ).rejects.toThrow(/MySQL 配置缺少必填字段: host/);

    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('rejects setup admin passwords shorter than 8 characters', async () => {
    const { completeSetup } = await import('../src/services/setup.service.js');

    await expect(
      completeSetup({
        db: { provider: 'sqlite' },
        admin: { email: 'admin@example.com', password: '1234567', username: 'admin' },
      }),
    ).rejects.toThrow('管理员密码长度不能低于 8 位');

    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('keeps generated secrets in a pending config and reuses them after migration failure', async () => {
    const [{ completeSetup }, { runMigrations }] = await Promise.all([
      import('../src/services/setup.service.js'),
      import('../src/migrate.js'),
    ]);
    vi.mocked(runMigrations).mockImplementationOnce(() => {
      throw new Error('migration failed');
    });

    await expect(
      completeSetup({
        db: { provider: 'sqlite' },
        admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
      }),
    ).rejects.toThrow('migration failed');

    const pendingPath = `${configPath}.setup`;
    expect(fs.existsSync(configPath)).toBe(false);
    expect(fs.existsSync(pendingPath)).toBe(true);
    expect(fs.statSync(pendingPath).mode & 0o777).toBe(0o600);
    const pending = yaml.load(fs.readFileSync(pendingPath, 'utf-8')) as {
      security: Record<string, string>;
    };

    await completeSetup({
      db: { provider: 'sqlite' },
      admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
    });

    const persisted = yaml.load(fs.readFileSync(configPath, 'utf-8')) as {
      security: Record<string, string>;
    };
    expect(persisted.security).toEqual(pending.security);
    expect(fs.existsSync(pendingPath)).toBe(false);
    expect(userCreate).toHaveBeenCalledOnce();
  });

  it('serializes concurrent setup attempts and creates only one admin', async () => {
    let setupCompleted = false;
    setupStatusFindFirst.mockImplementation(() =>
      Promise.resolve(
        setupCompleted
          ? {
              id: 'setup',
              isSetup: true,
              requireLogin: false,
              allowWebRegister: true,
              allowMcRegister: true,
              siteName: 'LightTickets',
              siteUrl: null,
              footerContent: null,
            }
          : null,
      ),
    );
    setupStatusUpdateMany.mockImplementation(async () => {
      setupCompleted = true;
      return { count: 1 };
    });
    const [{ completeSetup }, { runMigrations }] = await Promise.all([
      import('../src/services/setup.service.js'),
      import('../src/migrate.js'),
    ]);

    const results = await Promise.allSettled([
      completeSetup({
        db: { provider: 'sqlite' },
        admin: { email: 'first@example.com', password: 'admin123', username: 'first' },
      }),
      completeSetup({
        db: { provider: 'sqlite' },
        admin: { email: 'second@example.com', password: 'admin123', username: 'second' },
      }),
    ]);

    expect(results[0]).toMatchObject({ status: 'fulfilled', value: { accessToken: 'access' } });
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: { statusCode: 409, message: '站点已完成初始化，无法重复设置' },
    });
    expect(userCreate).toHaveBeenCalledOnce();
    expect(runMigrations).toHaveBeenCalledOnce();
  });

  it('throws site-config errors when database is configured but setup status cannot be queried', async () => {
    databaseConfigured = true;
    setupStatusFindFirst.mockRejectedValueOnce(new Error('database unavailable'));

    const { getSiteConfig } = await import('../src/services/setup.service.js');

    await expect(getSiteConfig()).rejects.toThrow('database unavailable');
  });

  it('recovers missing setup status when users already exist', async () => {
    databaseConfigured = true;
    setupStatusFindFirst.mockResolvedValueOnce(null);
    userCount.mockResolvedValueOnce(1);
    appConfigFindFirst.mockResolvedValueOnce(null);

    const { getSiteConfig } = await import('../src/services/setup.service.js');
    const config = await getSiteConfig();

    expect(config.isSetup).toBe(true);
    expect(setupStatusCreate).toHaveBeenCalledWith({ data: { isSetup: true } });
    expect(appConfigCreate).toHaveBeenCalledWith({ data: {} });
  });

  it('recovers false setup status when users already exist', async () => {
    databaseConfigured = true;
    setupStatusFindFirst.mockResolvedValueOnce({
      id: 'setup',
      isSetup: false,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: 'LightTickets',
      siteUrl: null,
      footerContent: null,
    });
    userCount.mockResolvedValueOnce(1);

    const { getSiteConfig } = await import('../src/services/setup.service.js');
    const config = await getSiteConfig();

    expect(config.isSetup).toBe(true);
    expect(setupStatusUpdate).toHaveBeenCalledWith({
      where: { id: 'setup' },
      data: { isSetup: true },
    });
  });

  it('blocks duplicate setup when configured database has users but no setup status', async () => {
    databaseConfigured = true;
    setupStatusFindFirst.mockResolvedValueOnce(null);
    userCount.mockResolvedValueOnce(1);
    appConfigFindFirst.mockResolvedValueOnce(null);

    const { completeSetup } = await import('../src/services/setup.service.js');

    await expect(
      completeSetup({
        db: { provider: 'sqlite' },
        admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
      }),
    ).rejects.toThrow('站点已完成初始化，无法重复设置');

    expect(setupStatusCreate).toHaveBeenCalledWith({ data: { isSetup: true } });
    expect(appConfigCreate).toHaveBeenCalledWith({ data: {} });
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it('fails closed without changing config when the configured database is unavailable', async () => {
    databaseConfigured = true;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const originalConfig = 'database:\n  provider: mysql\n';
    fs.writeFileSync(configPath, originalConfig, 'utf-8');
    setupStatusFindFirst.mockRejectedValueOnce(new Error('database unavailable'));

    const [{ completeSetup }, { runMigrations }] = await Promise.all([
      import('../src/services/setup.service.js'),
      import('../src/migrate.js'),
    ]);

    await expect(
      completeSetup({
        db: { provider: 'sqlite' },
        admin: { email: 'attacker@example.com', password: 'admin123', username: 'attacker' },
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: '数据库暂时不可用，无法确认初始化状态',
    });

    expect(fs.readFileSync(configPath, 'utf-8')).toBe(originalConfig);
    expect(userCount).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
  });
});
