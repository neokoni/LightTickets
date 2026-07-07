import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const configPath = path.resolve('data/config.yml');

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
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.security.jwtSecret).toBe('existing-secret-value-1234567890');
    expect(config.security.jwtRefreshSecret).toBe('existing-refresh-value-1234567890');
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
  jwtRefreshSecret: "test"
`;
    fs.writeFileSync(configPath, testConfig, 'utf-8');

    const { loadConfig } = await import('../src/config.js');
    loadConfig();
    expect(process.env.DATABASE_URL).toBe('mysql://root:secret@localhost:3306/lighttickets');
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
