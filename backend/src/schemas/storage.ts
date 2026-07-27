import { z } from 'zod';
import { StorageDriver } from '../constants/storage-driver.js';

export const storageS3Schema = z.object({
  endpoint: z.string().optional(),
  region: z.string().optional(),
  bucket: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
  presignExpiry: z.number().int().positive().optional(),
});

export const storageUpdateSchema = z
  .object({
    driver: z.enum([StorageDriver.LOCAL, StorageDriver.S3]),
    uploadDir: z.string().optional(),
    s3: storageS3Schema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.driver === StorageDriver.S3 && !data.s3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'driver 为 s3 时必须提供 s3 配置',
        path: ['s3'],
      });
    }
  });
