import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import type { IStorageAdapter, SaveInput } from './types.js';
import { NotFoundError } from '../../utils/errors.js';

export class LocalStorageAdapter implements IStorageAdapter {
  readonly type = 'local' as const;

  constructor(private uploadDir: string) {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }

  async save(input: SaveInput): Promise<void> {
    const filePath = path.resolve(this.uploadDir, input.key);
    await fs.promises.writeFile(filePath, input.buffer);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.resolve(this.uploadDir, key);
    try {
      await fs.promises.unlink(filePath);
    } catch (err: unknown) {
      if (!(err instanceof Error) || !('code' in err) || err.code !== 'ENOENT') throw err;
    }
  }

  async serve(res: Response, key: string, _filename?: string): Promise<void> {
    const filePath = path.resolve(this.uploadDir, key);
    try {
      await fs.promises.access(filePath);
    } catch {
      throw new NotFoundError('附件文件不存在');
    }
    res.sendFile(filePath);
  }
}
