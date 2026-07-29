import fs from 'fs';
import crypto from 'crypto';
import yaml from 'js-yaml';
import { dataPath } from './paths.js';
import { DatabaseProvider } from './constants/database-provider.js';
import type { StorageDriver } from './constants/storage-driver.js';
import { resolveServerPort } from './server-port.js';
import { normalizeIpAddress } from './trusted-proxy.js';

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
  trustedProxyIps: string[];
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
  jwtUnsubscribeSecret: string;
  legacyJwtCutoff: number;
  externalEncryptionKey: string;
}

export interface AppConfig {
  port: number;
  corsOrigins: string[];
  trustedProxyIps: string[] | null;
  database: DatabaseConfig;
  security: SecurityConfig;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  linkCodeExpiry: number;
}

type GeneratedSecurityKey = 'jwtUnsubscribeSecret' | 'externalEncryptionKey';
const LEGACY_JWT_CUTOFF_CLOCK_SKEW_SECONDS = 5 * 60;

function resolveGeneratedSecurityKey(
  raw: ConfigFile,
  key: GeneratedSecurityKey,
): { value: string; generated: boolean } {
  const configured = raw.security?.[key];
  if (configured !== undefined && typeof configured !== 'string') {
    throw new Error(`config.yml security.${key} 必须是 32 字节十六进制密钥`);
  }

  const existing = configured?.trim();
  if (existing) {
    if (!/^[a-f\d]{64}$/i.test(existing)) {
      throw new Error(`config.yml security.${key} 必须是 32 字节十六进制密钥`);
    }
    return { value: existing, generated: false };
  }

  const value = crypto.randomBytes(32).toString('hex');
  raw.security = { ...raw.security, [key]: value };
  return { value, generated: true };
}

function ensureGeneratedSecurityConfig(
  raw: ConfigFile,
): Pick<SecurityConfig, 'jwtUnsubscribeSecret' | 'legacyJwtCutoff' | 'externalEncryptionKey'> {
  const configuredUnsubscribeSecret = raw.security?.jwtUnsubscribeSecret;
  const hadUnsubscribeSecret =
    typeof configuredUnsubscribeSecret === 'string' && configuredUnsubscribeSecret.trim() !== '';
  const unsubscribe = resolveGeneratedSecurityKey(raw, 'jwtUnsubscribeSecret');
  const externalEncryption = resolveGeneratedSecurityKey(raw, 'externalEncryptionKey');
  const configuredCutoff = raw.security?.legacyJwtCutoff;
  const maxLegacyJwtCutoff = Math.floor(Date.now() / 1000) + LEGACY_JWT_CUTOFF_CLOCK_SKEW_SECONDS;
  if (
    configuredCutoff !== undefined &&
    (!Number.isSafeInteger(configuredCutoff) ||
      configuredCutoff < 0 ||
      configuredCutoff > maxLegacyJwtCutoff)
  ) {
    throw new Error(
      'config.yml security.legacyJwtCutoff 必须是非负 Unix 秒级时间戳，且不得超过允许的当前时钟偏差',
    );
  }

  // Existing installations get a bounded compatibility window for tokens issued
  // before this upgrade. Fresh installations never enable the legacy verifier.
  const legacyJwtCutoff =
    configuredCutoff ?? (hadUnsubscribeSecret ? 0 : Math.floor(Date.now() / 1000));
  const cutoffGenerated = configuredCutoff === undefined;
  if (cutoffGenerated) {
    raw.security = { ...raw.security, legacyJwtCutoff };
  }

  if (unsubscribe.generated || externalEncryption.generated || cutoffGenerated) {
    fs.writeFileSync(CONFIG_PATH, yaml.dump(raw, { lineWidth: -1 }), { mode: 0o600 });
  }
  fs.chmodSync(CONFIG_PATH, 0o600);
  return {
    jwtUnsubscribeSecret: unsubscribe.value,
    legacyJwtCutoff,
    externalEncryptionKey: externalEncryption.value,
  };
}

const S3_REQUIRED_FIELDS = ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'] as const;

function resolveTrustedProxyIps(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) {
    throw new Error('config.yml server.trustedProxyIps 必须是 IP 地址数组');
  }

  const addresses = value.map((address) => {
    if (typeof address !== 'string') {
      throw new Error('config.yml server.trustedProxyIps 必须是 IP 地址数组');
    }
    const normalized = normalizeIpAddress(address.trim());
    if (!normalized) {
      throw new Error(`config.yml server.trustedProxyIps 包含无效 IP 地址: ${address}`);
    }
    return normalized;
  });
  return [...new Set(addresses)];
}

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
  const generatedSecurity = ensureGeneratedSecurityConfig(raw);
  const jwtSecrets = [jwtSecret, jwtRefreshSecret, generatedSecurity.jwtUnsubscribeSecret];
  if (new Set(jwtSecrets).size !== jwtSecrets.length) {
    throw new Error(
      'config.yml security.jwtSecret、jwtRefreshSecret 与 jwtUnsubscribeSecret 必须各不相同',
    );
  }

  return {
    port: resolveServerPort(server.port),
    corsOrigins: server.corsOrigins || ['http://localhost:23310'],
    trustedProxyIps: resolveTrustedProxyIps(server.trustedProxyIps),
    database: {
      provider: database.provider,
      host: database.host,
      port: database.port,
      username: database.username,
      password: database.password,
      database: database.database,
      args: database.args,
    },
    security: { jwtSecret, jwtRefreshSecret, ...generatedSecurity },
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

export function persistDiscoveredTrustedProxyIp(address: string): string[] {
  const normalized = normalizeIpAddress(address);
  if (!normalized) throw new Error('无法保存无效的可信代理 IP 地址');

  const raw = (yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as ConfigFile | null) ?? {};
  const existing = resolveTrustedProxyIps(raw.server?.trustedProxyIps);
  if (existing !== null) return existing;

  raw.server = { ...raw.server, trustedProxyIps: [normalized] };
  fs.writeFileSync(CONFIG_PATH, yaml.dump(raw, { lineWidth: -1 }), { mode: 0o600 });
  fs.chmodSync(CONFIG_PATH, 0o600);
  _config = loadConfig();
  return _config.trustedProxyIps ?? [];
}
