import fs from 'fs';
import yaml from 'js-yaml';
import { dataPath } from './paths.js';
import { DatabaseProvider } from './constants/database-provider.js';
import type { StorageDriver } from './constants/storage-driver.js';
import { resolveServerPort } from './server-port.js';

export const CONFIG_PATH = dataPath('config.yml');

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  presignExpiry: number;
}

export interface StorageConfig {
  driver: StorageDriver;
  uploadDir: string;
  s3?: S3Config;
}

interface ConfigFile {
  server?: Partial<ServerConfig>;
  database?: Partial<DatabaseConfig>;
  security?: Partial<SecurityConfig>;
}

interface ServerConfig {
  port: number;
  corsOrigins: string[];
}

interface DatabaseConfig {
  provider: DatabaseProvider;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  args?: string;
}

interface SecurityConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
}

export interface AppConfig {
  port: number;
  corsOrigins: string[];
  database: DatabaseConfig;
  security: SecurityConfig;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  linkCodeExpiry: number;
}

const S3_REQUIRED_FIELDS = ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'] as const;

export function validateS3Config(s3: Partial<S3Config>): void {
  const missing = S3_REQUIRED_FIELDS.filter((k) => !s3[k]);
  if (missing.length) {
    throw new Error(`storage.s3 缺少必填字段: ${missing.join(', ')}`);
  }
}

export function isDatabaseConfigured(): boolean {
  if (!fs.existsSync(CONFIG_PATH)) return false;
  try {
    const raw = (yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as ConfigFile | null) ?? {};
    return !!raw.database?.provider;
  } catch {
    return false;
  }
}

function resolveDatabaseUrl(db: DatabaseConfig): string {
  if (db.provider === DatabaseProvider.SQLITE) {
    return `file:${dataPath('data.db')}`;
  }

  const missing: string[] = [];
  if (!db.host?.trim()) missing.push('host');
  const username = db.username?.trim();
  if (!username) missing.push('username');
  if (!db.database?.trim()) missing.push('database');
  if (missing.length) {
    throw new Error(`mysql 配置缺少必填字段: ${missing.join(', ')}`);
  }

  const port = db.port ?? 3306;
  const args = db.args?.trim().replace(/^\?/, '');
  const base = `mysql://${encodeURIComponent(username!)}:${encodeURIComponent(db.password ?? '')}@${db.host!.trim()}:${port}/${encodeURIComponent(db.database!.trim())}`;
  return args ? `${base}?${args}` : base;
}

export function loadConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`配置文件不存在: ${CONFIG_PATH}`);
  }

  const raw = (yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as ConfigFile | null) ?? {};

  const server = raw.server || {};
  const database = raw.database || {};
  const security = raw.security || {};

  if (!database.provider) {
    throw new Error('config.yml 缺少 database.provider');
  }

  process.env.DATABASE_URL = resolveDatabaseUrl(database as DatabaseConfig);

  const jwtSecret = security.jwtSecret || '';
  const jwtRefreshSecret = security.jwtRefreshSecret || '';

  if (!jwtSecret || !jwtRefreshSecret) {
    throw new Error('config.yml 缺少 security.jwtSecret 或 security.jwtRefreshSecret');
  }

  return {
    port: resolveServerPort(server.port),
    corsOrigins: server.corsOrigins || ['http://localhost:23310'],
    database: {
      provider: database.provider,
      host: database.host,
      port: database.port,
      username: database.username,
      password: database.password,
      database: database.database,
      args: database.args,
    },
    security: { jwtSecret, jwtRefreshSecret },
    accessTokenExpiry: '2h',
    refreshTokenExpiry: '7d',
    linkCodeExpiry: 5 * 60 * 1000,
  };
}

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

export function reloadConfig(): AppConfig {
  _config = loadConfig();
  return _config;
}
