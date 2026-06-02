import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const configPath = path.resolve('data/config.yml');

describe('config', () => {
  const originalContent = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, 'utf-8')
    : null;

  beforeEach(() => {
    vi.resetModules();
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
  databaseUrl: "file:../data/data.db"
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.jwtSecret).toBe('existing-secret-value-1234567890');
    expect(config.jwtRefreshSecret).toBe('existing-refresh-value-1234567890');
  });
});
