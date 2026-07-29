import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LocalStorageAdapter } from '../../src/services/storage/local.adapter.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-local-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('LocalStorageAdapter', () => {
  it('save writes file to uploadDir with correct content', async () => {
    const adapter = new LocalStorageAdapter(tmpDir);
    const buf = Buffer.from('hello world');
    await adapter.save({ buffer: buf, key: 'abc.png', mimeType: 'image/png' });

    const filePath = path.resolve(tmpDir, 'abc.png');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath)).toEqual(buf);
  });

  it('delete removes the file', async () => {
    const adapter = new LocalStorageAdapter(tmpDir);
    await adapter.save({ buffer: Buffer.from('x'), key: 'del.png', mimeType: 'image/png' });
    const filePath = path.resolve(tmpDir, 'del.png');
    expect(fs.existsSync(filePath)).toBe(true);

    await adapter.delete('del.png');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('delete does not throw when file does not exist', async () => {
    const adapter = new LocalStorageAdapter(tmpDir);
    await expect(adapter.delete('never-existed.png')).resolves.toBeUndefined();
  });

  it('serves using explicit trusted response headers instead of the key extension', async () => {
    const adapter = new LocalStorageAdapter(tmpDir);
    await adapter.save({
      buffer: Buffer.from('<html>'),
      key: 'legacy.html',
      mimeType: 'text/plain',
    });
    const sendFile = vi.fn();
    const res = { sendFile } as unknown as Parameters<typeof adapter.serve>[0];

    await adapter.serve(res, {
      key: 'legacy.html',
      mimeType: 'text/plain',
      contentDisposition: "attachment; filename*=UTF-8''legacy.txt",
    });

    expect(sendFile).toHaveBeenCalledWith(path.resolve(tmpDir, 'legacy.html'), {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': "attachment; filename*=UTF-8''legacy.txt",
      },
    });
  });

  it('type is local', () => {
    const adapter = new LocalStorageAdapter(tmpDir);
    expect(adapter.type).toBe('local');
  });
});
