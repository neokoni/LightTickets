import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { prisma } from '../db.js';
import { createS3Client } from './storage/s3-client.js';
import { validateS3Config, type S3Config, type StorageConfig } from '../config.js';
import { reinitStorageAdapter } from './storage/index.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { StorageDriver } from '../constants/storage-driver.js';
import { resolveUploadDir } from '../paths.js';
import { Prisma } from '@prisma/client';

export type { StorageConfig };

const SECRET_MASK = '••••••••';
const APP_CONFIG_ID = 'default';

async function ensureAppConfig() {
  const existing = await prisma().appConfig.findFirst();
  if (!existing) {
    return prisma().appConfig.create({ data: { id: APP_CONFIG_ID } });
  }
  return existing;
}

export async function getStorageConfig(): Promise<StorageConfig & { s3?: Partial<S3Config> }> {
  const config = await ensureAppConfig();
  const resp: StorageConfig & { s3?: Partial<S3Config> } = {
    driver: config.storageDriver as StorageDriver,
    uploadDir: config.uploadDir,
  };
  if (config.s3Config) {
    const s3 = JSON.parse(config.s3Config) as S3Config;
    resp.s3 = { ...s3, secretAccessKey: SECRET_MASK };
  }
  return resp;
}

export async function updateStorageConfig(input: {
  driver: StorageDriver;
  uploadDir?: string;
  s3?: Partial<S3Config>;
}): Promise<StorageConfig & { s3?: Partial<S3Config> }> {
  const existing = await ensureAppConfig();
  const existingS3 = existing.s3Config ? (JSON.parse(existing.s3Config) as S3Config) : undefined;

  const newS3: Partial<S3Config> = { ...existingS3 };
  if (input.s3) {
    if (input.s3.endpoint !== undefined) newS3.endpoint = input.s3.endpoint;
    if (input.s3.region !== undefined) newS3.region = input.s3.region;
    if (input.s3.bucket !== undefined) newS3.bucket = input.s3.bucket;
    if (input.s3.accessKeyId) newS3.accessKeyId = input.s3.accessKeyId;
    if (input.s3.secretAccessKey) newS3.secretAccessKey = input.s3.secretAccessKey;
    if (input.s3.forcePathStyle !== undefined) newS3.forcePathStyle = input.s3.forcePathStyle;
    if (input.s3.presignExpiry !== undefined) newS3.presignExpiry = input.s3.presignExpiry;
  }

  let s3ConfigJson = existing.s3Config;
  if (input.driver === StorageDriver.S3 || input.s3) {
    const parsed: Partial<S3Config> = {
      endpoint: newS3.endpoint,
      region: newS3.region || 'us-east-1',
      bucket: newS3.bucket,
      accessKeyId: newS3.accessKeyId,
      secretAccessKey: newS3.secretAccessKey,
      forcePathStyle: newS3.forcePathStyle !== false,
      presignExpiry: Number(newS3.presignExpiry) || 300,
    };
    try {
      validateS3Config(parsed);
    } catch (err: unknown) {
      throw new ValidationError(err instanceof Error ? err.message : 'S3 配置无效');
    }
    s3ConfigJson = JSON.stringify(parsed);
  }

  const nextUploadDir = input.uploadDir || existing.uploadDir;
  const localLocationChanged =
    resolveUploadDir(nextUploadDir) !== resolveUploadDir(existing.uploadDir);
  const parsedS3 = s3ConfigJson ? (JSON.parse(s3ConfigJson) as S3Config) : undefined;
  const s3LocationChanged =
    !!existingS3 &&
    !!parsedS3 &&
    (parsedS3.endpoint !== existingS3.endpoint ||
      parsedS3.region !== existingS3.region ||
      parsedS3.bucket !== existingS3.bucket ||
      parsedS3.forcePathStyle !== existingS3.forcePathStyle);

  await prisma().$transaction(
    async (tx) => {
      if (localLocationChanged) {
        const localAttachments = await tx.attachment.count({
          where: { storageType: StorageDriver.LOCAL },
        });
        if (localAttachments > 0) {
          throw new AppError(409, '存在本地附件时不能修改上传目录，请先迁移附件');
        }
      }
      if (s3LocationChanged) {
        const s3Attachments = await tx.attachment.count({
          where: { storageType: StorageDriver.S3 },
        });
        if (s3Attachments > 0) {
          throw new AppError(409, '存在 S3 附件时不能修改存储位置，请先迁移附件');
        }
      }

      await tx.appConfig.update({
        where: { id: existing.id },
        data: {
          storageDriver: input.driver,
          uploadDir: nextUploadDir,
          s3Config: s3ConfigJson,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  reinitStorageAdapter();
  return getStorageConfig();
}

export async function testS3Connection(): Promise<{ message: string }> {
  const config = await getStorageConfig();
  if (!config.s3) {
    throw new ValidationError('尚未配置 S3 存储后端');
  }

  const s3 = config.s3 as S3Config;
  if (s3.secretAccessKey === SECRET_MASK) {
    const full = await ensureAppConfig();
    if (full.s3Config) {
      const fullS3 = JSON.parse(full.s3Config) as S3Config;
      s3.secretAccessKey = fullS3.secretAccessKey;
    }
  }

  const client = createS3Client(s3);
  try {
    await client.send(new HeadBucketCommand({ Bucket: s3.bucket }));
    return { message: '连接成功' };
  } catch {
    throw new AppError(502, 'S3 连接失败');
  }
}
