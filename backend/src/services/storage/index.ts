import { prisma } from '../../db.js';
import type { S3Config } from '../../config.js';
import { resolveUploadDir } from '../../paths.js';
import type { IStorageAdapter } from './types.js';
import { LocalStorageAdapter } from './local.adapter.js';
import { S3StorageAdapter } from './s3.adapter.js';
import { StorageDriver } from '../../constants/storage-driver.js';
import { AppError } from '../../utils/errors.js';

const adapters = new Map<StorageDriver, IStorageAdapter>();

async function loadStorageConfig() {
  const config = await prisma().appConfig.findFirst();
  if (!config) {
    return {
      driver: StorageDriver.LOCAL,
      uploadDir: 'data/uploads',
      s3: undefined as S3Config | undefined,
    };
  }
  const s3 = config.s3Config ? (JSON.parse(config.s3Config) as S3Config) : undefined;
  return {
    driver: config.storageDriver as StorageDriver,
    uploadDir: config.uploadDir,
    s3,
  };
}

function parseStorageDriver(value: string): StorageDriver {
  if (value === StorageDriver.LOCAL || value === StorageDriver.S3) return value;
  throw new AppError(503, '附件存储类型不可用');
}

export async function getStorageAdapter(storageType?: string): Promise<IStorageAdapter> {
  const config = await loadStorageConfig();
  const driver = parseStorageDriver(storageType ?? config.driver);
  const cached = adapters.get(driver);
  if (cached) return cached;

  let adapter: IStorageAdapter;
  if (driver === StorageDriver.S3) {
    if (!config.s3) throw new AppError(503, 'S3 附件存储配置不可用');
    adapter = new S3StorageAdapter(config.s3);
  } else {
    adapter = new LocalStorageAdapter(resolveUploadDir(config.uploadDir));
  }
  adapters.set(driver, adapter);
  return adapter;
}

export function reinitStorageAdapter(): void {
  adapters.clear();
}
