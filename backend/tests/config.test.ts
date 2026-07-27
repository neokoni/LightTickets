import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import { dataPath } from '../src/paths.js';

const configPath = dataPath('config.yml');
const unsubscribeSecret = 'a'.repeat(64);

const minimalConfig = `server:
  port: 3000
  corsOrigins:
    - http://localhost:5173
database:
  provider: sqlite
security:
  jwtSecret: "test-jwt-secret"
  jwtRefreshSecret: "test-refresh-secret"
`;

describe('config', () => {
  const originalContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : null;

  beforeEach(() => {
    vi.resetModules();
    fs.writeFileSync(configPath, minimalConfig, 'utf-8');
  });

  afterEach(() => {
    if (originalContent !== null) {
      fs.writeFileSync(configPath, originalContent, 'utf-8');
    }
  });

  it('loadConfig reads default config.yml', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.port).toBe(3000);
    expect(config.security.jwtSecret).toBe('test-jwt-secret');
    expect(config.database.provider).toBe('sqlite');
    expect(config.security.jwtUnsubscribeSecret).toMatch(/^[a-f\d]{64}$/);
    expect(config.security.jwtUnsubscribeSecret).not.toBe(config.security.jwtSecret);
    expect(
      new Set([
        config.security.jwtSecret,
        config.security.jwtRefreshSecret,
        config.security.jwtUnsubscribeSecret,
      ]).size,
    ).toBe(3);
    expect(config.security.legacyJwtCutoff).toBeGreaterThan(0);
    expect(config.security.legacyJwtCutoff).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(config.security.externalEncryptionKey).toMatch(/^[a-f\d]{64}$/);
  });

  it('loadConfig persists a missing FederatedAuth encryption key with restricted permissions', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    const persisted = fs.readFileSync(configPath, 'utf-8');
    expect(persisted).toContain(config.security.externalEncryptionKey);
    expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
  });

  it('persists a stable unsubscribe key and legacy migration cutoff', async () => {
    const { loadConfig } = await import('../src/config.js');
    const first = loadConfig();
    const persisted = fs.readFileSync(configPath, 'utf-8');
    const second = loadConfig();

    expect(persisted).toContain(first.security.jwtUnsubscribeSecret);
    expect(persisted).toContain(`legacyJwtCutoff: ${first.security.legacyJwtCutoff}`);
    expect(second.security.jwtUnsubscribeSecret).toBe(first.security.jwtUnsubscribeSecret);
    expect(second.security.legacyJwtCutoff).toBe(first.security.legacyJwtCutoff);
    expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
  });

  it('loadConfig rejects an invalid FederatedAuth encryption key', async () => {
    fs.writeFileSync(
      configPath,
      `${minimalConfig.trim()}\n  externalEncryptionKey: "invalid"\n`,
      'utf-8',
    );
    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow(/externalEncryptionKey/);
  });

  it('loadConfig rejects an invalid unsubscribe signing key', async () => {
    fs.writeFileSync(
      configPath,
      `${minimalConfig.trim()}\n  jwtUnsubscribeSecret: "invalid"\n`,
      'utf-8',
    );
    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow(/jwtUnsubscribeSecret/);
  });

  it('loadConfig sets process.env.DATABASE_URL', async () => {
    const { loadConfig } = await import('../src/config.js');
    loadConfig();
    expect(process.env.DATABASE_URL).toBeDefined();
    expect(process.env.DATABASE_URL).toContain('data.db');
  });

  it('loadConfig rejects empty JWT secrets', async () => {
    fs.writeFileSync(
      configPath,
      `server:
  port: 3000
database:
  provider: sqlite
security:
  jwtSecret: ""
  jwtRefreshSecret: ""
`,
      'utf-8',
    );
    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow(/security\.jwtSecret/);
  });

  it('loadConfig preserves existing JWT secrets', async () => {
    const testConfig = `server:
  port: 3000
  corsOrigins:
    - http://localhost:5173
database:
  provider: sqlite
security:
  jwtSecret: "existing-secret-value-1234567890"
  jwtRefreshSecret: "existing-refresh-value-1234567890"
  jwtUnsubscribeSecret: "${unsubscribeSecret}"
  legacyJwtCutoff: 0
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.security.jwtSecret).toBe('existing-secret-value-1234567890');
    expect(config.security.jwtRefreshSecret).toBe('existing-refresh-value-1234567890');
    expect(config.security.jwtUnsubscribeSecret).toBe(unsubscribeSecret);
    expect(config.security.legacyJwtCutoff).toBe(0);
  });

  it('loadConfig rejects reused JWT signing keys', async () => {
    fs.writeFileSync(
      configPath,
      minimalConfig.replace('test-refresh-secret', 'test-jwt-secret'),
      'utf-8',
    );
    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow(/必须各不相同/);
  });

  it('loadConfig rejects an invalid legacy JWT cutoff', async () => {
    fs.writeFileSync(configPath, `${minimalConfig.trim()}\n  legacyJwtCutoff: -1\n`, 'utf-8');
    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow(/legacyJwtCutoff/);
  });

  it('loadConfig rejects millisecond and far-future legacy JWT cutoffs', async () => {
    const { loadConfig } = await import('../src/config.js');
    for (const cutoff of [Date.now(), Math.floor(Date.now() / 1000) + 3600]) {
      fs.writeFileSync(
        configPath,
        `${minimalConfig.trim()}\n  legacyJwtCutoff: ${cutoff}\n`,
        'utf-8',
      );
      expect(() => loadConfig()).toThrow(/legacyJwtCutoff/);
    }
  });

  it('loadConfig resolves mysql database URL from fields', async () => {
    const testConfig = `server:
  port: 3000
database:
  provider: mysql
  host: localhost
  port: 3306
  username: root
  password: secret
  database: lighttickets
security:
  jwtSecret: "test"
  jwtRefreshSecret: "refresh-test"
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    loadConfig();
    expect(process.env.DATABASE_URL).toBe('mysql://root:secret@localhost:3306/lighttickets');
  });

  it('loadConfig appends mysql args when provided', async () => {
    const testConfig = `server:
  port: 3000
database:
  provider: mysql
  host: db.internal
  port: 3307
  username: app
  password: secret
  database: lighttickets
  args: sslaccept=strict&connect_timeout=10
security:
  jwtSecret: "test"
  jwtRefreshSecret: "refresh-test"
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    loadConfig();
    expect(process.env.DATABASE_URL).toBe(
      'mysql://app:secret@db.internal:3307/lighttickets?sslaccept=strict&connect_timeout=10',
    );
  });

  it('loadConfig rejects incomplete mysql fields', async () => {
    const testConfig = `server:
  port: 3000
database:
  provider: mysql
  username: root
security:
  jwtSecret: "test"
  jwtRefreshSecret: "refresh-test"
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow(/mysql 配置缺少必填字段/);
  });

  it('loadConfig rejects mysql user alias', async () => {
    const testConfig = `server:
  port: 3000
database:
  provider: mysql
  host: db.internal
  port: 3307
  user: app
  password: secret
  database: lighttickets
security:
  jwtSecret: "test"
  jwtRefreshSecret: "refresh-test"
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow(/mysql 配置缺少必填字段: username/);
  });

  it('loadConfig throws when database.provider missing', async () => {
    const testConfig = `server:
  port: 3000
security:
  jwtSecret: "test"
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow(/database\.provider/);
  });
});
