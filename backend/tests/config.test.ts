import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const configPath = path.resolve('data/config.yml');

const minimalConfig = `port: 3000
jwtSecret: ""
jwtRefreshSecret: ""
db:
  provider: "sqlite"
  databaseUrl: "file:./dev.db"
storage:
  driver: local
  uploadDir: data/uploads
`;

describe('config', () => {
  const originalContent = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, 'utf-8')
    : null;

  beforeEach(() => {
    vi.resetModules();
    // Ensure config has db section for loadConfig tests
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
    expect(config.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.db.provider).toBe('sqlite');
  });

  it('loadConfig sets process.env.DATABASE_URL', async () => {
    const { loadConfig } = await import('../src/config.js');
    loadConfig();
    expect(process.env.DATABASE_URL).toBeDefined();
  });

  it('loadConfig generates JWT secrets when empty', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.jwtRefreshSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('loadConfig preserves existing JWT secrets', async () => {
    const testConfig = `port: 3000
jwtSecret: "existing-secret-value-1234567890"
jwtRefreshSecret: "existing-refresh-value-1234567890"
db:
  provider: "sqlite"
  databaseUrl: "file:./dev.db"
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.jwtSecret).toBe('existing-secret-value-1234567890');
    expect(config.jwtRefreshSecret).toBe('existing-refresh-value-1234567890');
  });

  it('loadConfig defaults storage.driver to local when omitted', async () => {
    const testConfig = `port: 3000
jwtSecret: ""
jwtRefreshSecret: ""
db:
  provider: "sqlite"
  databaseUrl: "file:./dev.db"
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.storage.driver).toBe('local');
    expect(config.storage.uploadDir).toBeDefined();
    expect(config.storage.s3).toBeUndefined();
  });

  it('loadConfig parses s3 driver with full config', async () => {
    const testConfig = `port: 3000
jwtSecret: ""
jwtRefreshSecret: ""
db:
  provider: "sqlite"
  databaseUrl: "file:./dev.db"
storage:
  driver: s3
  uploadDir: data/uploads
  s3:
    endpoint: http://localhost:9000
    region: us-east-1
    bucket: lighttickets
    accessKeyId: minioadmin
    secretAccessKey: minioadmin
    forcePathStyle: true
    presignExpiry: 600
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.storage.driver).toBe('s3');
    expect(config.storage.s3).toBeDefined();
    expect(config.storage.s3!.bucket).toBe('lighttickets');
    expect(config.storage.s3!.forcePathStyle).toBe(true);
    expect(config.storage.s3!.presignExpiry).toBe(600);
  });

  it('loadConfig throws when s3 driver missing required fields', async () => {
    const testConfig = `port: 3000
jwtSecret: ""
jwtRefreshSecret: ""
db:
  provider: "sqlite"
  databaseUrl: "file:./dev.db"
storage:
  driver: s3
  uploadDir: data/uploads
  s3:
    endpoint: http://localhost:9000
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow(/storage\.s3/);
  });
});
