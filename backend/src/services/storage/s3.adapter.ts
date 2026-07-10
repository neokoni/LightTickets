import type { Response } from 'express';
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IStorageAdapter, SaveInput } from './types.js';
import type { S3Config } from '../../config.js';
import { createS3Client } from './s3-client.js';
import { StorageDriver } from '../../constants/storage-driver.js';

export class S3StorageAdapter implements IStorageAdapter {
  readonly type = StorageDriver.S3;

  private client: ReturnType<typeof createS3Client>;
  private bucket: string;
  private presignExpiry: number;

  constructor(s3Config: S3Config) {
    this.bucket = s3Config.bucket;
    this.presignExpiry = s3Config.presignExpiry;
    this.client = createS3Client(s3Config);
  }

  async save(input: SaveInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async serve(res: Response, key: string, _filename?: string): Promise<void> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.presignExpiry,
    });
    res.redirect(302, url);
  }
}
