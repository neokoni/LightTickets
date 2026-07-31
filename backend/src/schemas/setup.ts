import { z } from 'zod';
import { DatabaseProvider } from '../constants/database-provider.js';
import { StorageDriver } from '../constants/storage-driver.js';
import { mailConfigInputSchema } from './mail.js';
import { rateLimitConfigInputSchema } from './rate-limit.js';
import { siteUrlInputSchema } from './site.js';
import { storageS3Schema } from './storage.js';
import { attachmentConfigInputSchema } from './attachment.js';

export const setupSchema = z
  .object({
    db: z
      .object({
        provider: z.enum([DatabaseProvider.SQLITE, DatabaseProvider.MYSQL]),
        host: z.string().optional(),
        port: z.number().int().positive().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        database: z.string().optional(),
        args: z.string().optional(),
      })
      .strict()
      .superRefine((db, ctx) => {
        if (db.provider !== DatabaseProvider.MYSQL) return;

        for (const field of ['host', 'username', 'database'] as const) {
          if (!db[field]?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'MySQL 配置必填',
              path: [field],
            });
          }
        }
      }),
    admin: z.object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(6),
      username: z.string().min(2).max(30),
    }),
    site: z
      .object({
        siteName: z.string().optional(),
        siteUrl: siteUrlInputSchema.optional(),
        defaultLanguage: z.string().optional(),
      })
      .optional(),
    mc: z.object({ defaultServerName: z.string().optional() }).optional(),
    storage: z
      .object({
        driver: z.enum([StorageDriver.LOCAL, StorageDriver.S3]),
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
      })
      .optional(),
  })
  .strict();

export const settingsUpdateSchema = z.object({
  requireLogin: z.boolean().optional(),
  allowWebRegister: z.boolean().optional(),
  allowMcRegister: z.boolean().optional(),
  siteName: z.string().max(100).optional(),
  siteUrl: siteUrlInputSchema.nullable().optional(),
  footerContent: z.string().max(2000).nullable().optional(),
  defaultLanguage: z.string().optional(),
  sendEmailNotifications: z.boolean().optional(),
  mail: mailConfigInputSchema.optional(),
  turnstile: z
    .object({
      enabled: z.boolean().optional(),
      siteKey: z.string().optional(),
      secretKey: z.string().nullable().optional(),
    })
    .optional(),
  rateLimit: rateLimitConfigInputSchema.optional(),
  attachment: attachmentConfigInputSchema.optional(),
});
