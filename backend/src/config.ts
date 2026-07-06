import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import crypto from 'crypto';

export const CONFIG_PATH = path.resolve('data/config.yml');

interface DbConfig {
  provider: 'sqlite' | 'mysql';
  databaseUrl: string;
}

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  presignExpiry: number;
}

interface StorageConfig {
  driver: 'local' | 's3';
  uploadDir: string;
  s3?: S3Config;
}

export type { StorageConfig };

interface AppConfig {
  port: number;
  jwtSecret: string;
  jwtRefreshSecret: string;
  db: DbConfig;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  linkCodeExpiry: number;
  storage: StorageConfig;
}

const S3_REQUIRED_FIELDS = ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'] as const;

export function validateS3Config(s3: Partial<S3Config>): void {
  const missing = S3_REQUIRED_FIELDS.filter((k) => !s3[k]);
  if (missing.length) {
    throw new Error(`storage.s3 缺少必填字段: ${missing.join(', ')}`);
  }
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

  // Parse storage config
  const rawStorage = (raw.storage || {}) as Record<string, any>;
  const driver: 'local' | 's3' = rawStorage.driver === 's3' ? 's3' : 'local';
  const uploadDir = rawStorage.uploadDir
    ? path.resolve(rawStorage.uploadDir)
    : path.resolve('data', 'uploads');

  let s3: S3Config | undefined;
  if (driver === 's3') {
    const rawS3 = rawStorage.s3 || {};
    const parsed: S3Config = {
      endpoint: rawS3.endpoint,
      region: rawS3.region || 'us-east-1',
      bucket: rawS3.bucket,
      accessKeyId: rawS3.accessKeyId,
      secretAccessKey: rawS3.secretAccessKey,
      forcePathStyle: rawS3.forcePathStyle !== false,
      presignExpiry: Number(rawS3.presignExpiry) || 300,
    };
    validateS3Config(parsed);
    s3 = parsed;
  }

  const storage: StorageConfig = { driver, uploadDir, s3 };

  return {
    port: parseInt(raw.port || '3000', 10),
    jwtSecret,
    jwtRefreshSecret,
    db: { provider: db.provider, databaseUrl: db.databaseUrl },
    accessTokenExpiry: '2h',
    refreshTokenExpiry: '7d',
    linkCodeExpiry: 5 * 60 * 1000,
    storage,
  };
}

// Singleton
let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

export function reloadConfig(): AppConfig {
  _config = loadConfig();
  return _config;
}

// Backward-compatible export
export const config = new Proxy({} as AppConfig, {
  get(_, prop) {
    return (getConfig() as any)[prop];
  },
});
