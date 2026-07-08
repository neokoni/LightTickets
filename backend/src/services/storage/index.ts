import { prisma } from '../../db.js';
import type { S3Config } from '../../config.js';
import { resolveUploadDir } from '../../paths.js';
import type { IStorageAdapter } from './types.js';
import { LocalStorageAdapter } from './local.adapter.js';
import { S3StorageAdapter } from './s3.adapter.js';

let _adapter: IStorageAdapter | null = null;

async function loadStorageConfig() {
  const config = await prisma().appConfig.findFirst();
  if (!config) {
    return { driver: 'local', uploadDir: 'data/uploads', s3: undefined as S3Config | undefined };
  }
  const s3 = config.s3Config ? (JSON.parse(config.s3Config) as S3Config) : undefined;
  return {
    driver: config.storageDriver as 'local' | 's3',
    uploadDir: config.uploadDir,
    s3,
  };
}

export async function getStorageAdapter(): Promise<IStorageAdapter> {
  if (!_adapter) {
    const config = await loadStorageConfig();
    if (config.driver === 's3' && config.s3) {
      _adapter = new S3StorageAdapter(config.s3);
    } else {
      _adapter = new LocalStorageAdapter(resolveUploadDir(config.uploadDir));
    }
  }
  return _adapter;
}

export function reinitStorageAdapter(): void {
  _adapter = null;
}
