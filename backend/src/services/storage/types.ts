import type { Response } from 'express';
import type { StorageDriver } from '../../constants/storage-driver.js';

export type StorageType = StorageDriver;

export interface SaveInput {
  buffer: Buffer;
  key: string;
  mimeType: string;
}

export interface IStorageAdapter {
  readonly type: StorageType;
  save(input: SaveInput): Promise<void>;
  delete(key: string): Promise<void>;
  serve(res: Response, key: string, filename?: string): Promise<void>;
}
