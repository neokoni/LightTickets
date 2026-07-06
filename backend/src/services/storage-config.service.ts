import fs from 'fs';
import yaml from 'js-yaml';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import {
  CONFIG_PATH,
  getConfig,
  reloadConfig,
  validateS3Config,
  type S3Config,
  type StorageConfig,
} from '../config.js';
import { createS3Client } from './storage/s3-client.js';
import { ValidationError } from '../utils/errors.js';

export type { StorageConfig };

const SECRET_MASK = '••••••••';

export async function getStorageConfig(): Promise<StorageConfig & { s3?: Partial<S3Config> }> {
  const config = getConfig();
  const resp: StorageConfig & { s3?: Partial<S3Config> } = {
    driver: config.storage.driver,
    uploadDir: config.storage.uploadDir,
  };
  if (config.storage.s3) {
    resp.s3 = {
      ...config.storage.s3,
      secretAccessKey: SECRET_MASK,
    };
  }
  return resp;
}

export async function updateStorageConfig(input: {
  driver: 'local' | 's3';
  uploadDir?: string;
  s3?: Partial<S3Config>;
}): Promise<StorageConfig & { s3?: Partial<S3Config> }> {
  const raw = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, any>;
  const existing = (raw.storage || {}) as Record<string, any>;
  const existingS3 = (existing.s3 || {}) as Record<string, any>;

  const newStorage: Record<string, any> = {
    driver: input.driver,
    uploadDir: input.uploadDir || existing.uploadDir || 'data/uploads',
  };

  if (input.driver === 's3') {
    const s3: Record<string, any> = { ...existingS3 };
    if (input.s3) {
      if (input.s3.endpoint !== undefined) s3.endpoint = input.s3.endpoint;
      if (input.s3.region !== undefined) s3.region = input.s3.region;
      if (input.s3.bucket !== undefined) s3.bucket = input.s3.bucket;
      if (input.s3.accessKeyId) s3.accessKeyId = input.s3.accessKeyId;
      if (input.s3.secretAccessKey) s3.secretAccessKey = input.s3.secretAccessKey;
      if (input.s3.forcePathStyle !== undefined) s3.forcePathStyle = input.s3.forcePathStyle;
      if (input.s3.presignExpiry !== undefined) s3.presignExpiry = input.s3.presignExpiry;
    }

    const parsed: Partial<S3Config> = {
      endpoint: s3.endpoint,
      region: s3.region || 'us-east-1',
      bucket: s3.bucket,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      forcePathStyle: s3.forcePathStyle !== false,
      presignExpiry: Number(s3.presignExpiry) || 300,
    };
    try {
      validateS3Config(parsed);
    } catch (err: any) {
      throw new ValidationError(err.message);
    }
    newStorage.s3 = parsed;
  }

  raw.storage = newStorage;
  fs.writeFileSync(CONFIG_PATH, yaml.dump(raw, { lineWidth: -1 }), 'utf-8');

  reloadConfig();
  return getStorageConfig();
}

export async function testS3Connection(): Promise<{ success: boolean; message: string }> {
  const config = getConfig();
  const s3 = config.storage.s3;
  if (!s3) {
    return { success: false, message: '尚未配置 S3 存储后端' };
  }

  const client = createS3Client(s3);
  try {
    await client.send(new HeadBucketCommand({ Bucket: s3.bucket }));
    return { success: true, message: '连接成功' };
  } catch (err: any) {
    return { success: false, message: err.message || '连接失败' };
  }
}
