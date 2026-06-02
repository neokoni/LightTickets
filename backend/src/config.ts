import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';

const CONFIG_PATH = path.resolve('data/config.yml');

interface DbConfig {
  provider: 'sqlite' | 'mysql';
  databaseUrl: string;
}

interface AppConfig {
  port: number;
  jwtSecret: string;
  jwtRefreshSecret: string;
  db: DbConfig;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  linkCodeExpiry: number;
  uploadDir: string;
}

export function loadConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`配置文件不存在: ${CONFIG_PATH}`);
  }

  const raw = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, any>;

  const db = raw.db || {};
  if (!db.provider || !db.databaseUrl) {
    throw new Error('config.yml 缺少 db.provider 或 db.databaseUrl');
  }

  // Build DATABASE_URL for Prisma
  let databaseUrl = db.databaseUrl;
  if (db.provider === 'sqlite') {
    // Resolve relative file path against data/ directory
    if (databaseUrl.startsWith('file:')) {
      const relPath = databaseUrl.slice(5); // remove 'file:'
      const absPath = path.resolve('data', relPath);
      databaseUrl = `file:${absPath}`;
    }
  }
  process.env.DATABASE_URL = databaseUrl;

  // Auto-generate JWT secrets if empty
  let jwtSecret = raw.jwtSecret || '';
  let jwtRefreshSecret = raw.jwtRefreshSecret || '';
  let secretsChanged = false;

  if (!jwtSecret) {
    jwtSecret = crypto.randomBytes(32).toString('hex');
    secretsChanged = true;
  }
  if (!jwtRefreshSecret) {
    jwtRefreshSecret = crypto.randomBytes(32).toString('hex');
    secretsChanged = true;
  }

  if (secretsChanged) {
    const updated = yaml.dump({
      ...raw,
      jwtSecret,
      jwtRefreshSecret,
    }, { lineWidth: -1 });
    fs.writeFileSync(CONFIG_PATH, updated, 'utf-8');
  }

  return {
    port: parseInt(raw.port || '3000', 10),
    jwtSecret,
    jwtRefreshSecret,
    db: { provider: db.provider, databaseUrl: db.databaseUrl },
    accessTokenExpiry: '2h',
    refreshTokenExpiry: '7d',
    linkCodeExpiry: 5 * 60 * 1000,
    uploadDir: path.resolve('data', 'uploads'),
  };
}

// Singleton
let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

// Backward-compatible export
export const config = new Proxy({} as AppConfig, {
  get(_, prop) {
    return (getConfig() as any)[prop];
  },
});
