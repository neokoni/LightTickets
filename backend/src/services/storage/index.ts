import { getConfig } from '../../config.js';
import type { IStorageAdapter } from './types.js';
import { LocalStorageAdapter } from './local.adapter.js';
import { S3StorageAdapter } from './s3.adapter.js';

let _adapter: IStorageAdapter | null = null;

export function getStorageAdapter(): IStorageAdapter {
  if (!_adapter) {
    const config = getConfig();
    if (config.storage.driver === 's3' && config.storage.s3) {
      _adapter = new S3StorageAdapter(config.storage.s3);
    } else {
      _adapter = new LocalStorageAdapter(config.storage.uploadDir);
    }
  }
  return _adapter;
}

export function reinitStorageAdapter(): void {
  _adapter = null;
}
