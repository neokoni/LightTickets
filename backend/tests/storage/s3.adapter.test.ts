import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { S3StorageAdapter } from '../../src/services/storage/s3.adapter.js';
import type { S3Config } from '../../src/config.js';

const s3Mock = mockClient(S3Client);

const s3Config: S3Config = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'test-bucket',
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
  forcePathStyle: true,
  presignExpiry: 300,
};

beforeEach(() => {
  s3Mock.reset();
});

describe('S3StorageAdapter', () => {
  it('type is s3', () => {
    const adapter = new S3StorageAdapter(s3Config);
    expect(adapter.type).toBe('s3');
  });

  it('save sends PutObjectCommand with correct params', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const adapter = new S3StorageAdapter(s3Config);
    const buf = Buffer.from('s3 content');

    await adapter.save({ buffer: buf, key: 'k.png', mimeType: 'image/png' });

    expect(s3Mock.calls()).toHaveLength(1);
    const command = s3Mock.calls()[0].args[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe('test-bucket');
    expect(command.input.Key).toBe('k.png');
    expect(command.input.Body).toBe(buf);
    expect(command.input.ContentType).toBe('image/png');
  });

  it('delete sends DeleteObjectCommand with correct params', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    const adapter = new S3StorageAdapter(s3Config);

    await adapter.delete('k.png');

    expect(s3Mock.calls()).toHaveLength(1);
    const command = s3Mock.calls()[0].args[0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input.Bucket).toBe('test-bucket');
    expect(command.input.Key).toBe('k.png');
  });

  it('serve redirects to a presigned URL with 302', async () => {
    s3Mock.on(GetObjectCommand).resolves({});
    const adapter = new S3StorageAdapter(s3Config);

    const redirect = vi.fn();
    const res = { redirect } as any;

    await adapter.serve(res, 'k.png', 'file.png');

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect.mock.calls[0][0]).toBe(302);
    expect(typeof redirect.mock.calls[0][1]).toBe('string');
    expect(redirect.mock.calls[0][1].length).toBeGreaterThan(0);
  });
});
