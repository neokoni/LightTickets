import { z } from 'zod';
import { normalizeSiteUrl } from '../utils/site-url.js';

export const siteUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => normalizeSiteUrl(value) !== null, {
    message: '站点地址必须是仅包含 origin 的 HTTP(S) URL',
  })
  .describe('Canonical public HTTP(S) origin without credentials, path, query, or fragment');

export const siteUrlInputSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || normalizeSiteUrl(value) !== null, {
    message: '站点地址必须为空或仅包含 HTTP(S) origin',
  })
  .describe('Canonical public HTTP(S) origin; an empty string clears the optional setting');
