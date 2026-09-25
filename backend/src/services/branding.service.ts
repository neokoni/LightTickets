import fs from 'fs';
import type { Response } from 'express';
import {
  BRANDING_CONTENT_SECURITY_POLICY,
  BRANDING_EXTENSION_BY_MIME,
  BRANDING_EXTENSIONS,
  BRANDING_MIME_BY_EXTENSION,
  BRANDING_MAX_FILE_BYTES,
  type BrandingSlot,
} from '../constants/branding.js';
import { dataPath } from '../paths.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { validateMagicBytes } from '../utils/magic-bytes.js';

export interface BrandingFile {
  filePath: string;
  mimeType: string;
  version: string;
}

export interface BrandingState {
  faviconUrl: string | null;
  faviconDarkUrl: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
}

export interface BrandingUploadInput {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

function brandingFilePath(slot: BrandingSlot, extension: string): string {
  return dataPath(`${slot}.${extension}`);
}

export function findBrandingFile(slot: BrandingSlot): BrandingFile | null {
  for (const extension of BRANDING_EXTENSIONS) {
    const filePath = brandingFilePath(slot, extension);
    if (!fs.existsSync(filePath)) continue;
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) continue;
    return {
      filePath,
      mimeType: BRANDING_MIME_BY_EXTENSION[extension],
      version: String(Math.trunc(stats.mtimeMs)),
    };
  }
  return null;
}

function toUrl(slot: BrandingSlot, file: BrandingFile | null): string | null {
  if (!file) return null;
  return `/api/branding/${slot}?v=${file.version}`;
}

export function getBrandingUrl(slot: BrandingSlot): string | null {
  return toUrl(slot, findBrandingFile(slot));
}

export function getBrandingState(): BrandingState {
  return {
    faviconUrl: getBrandingUrl('favicon'),
    faviconDarkUrl: getBrandingUrl('favicon-dark'),
    logoUrl: getBrandingUrl('logo'),
    logoDarkUrl: getBrandingUrl('logo-dark'),
  };
}

function validateSvgContent(buffer: Buffer): void {
  const content = buffer
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trim();
  const normalized = content
    .replace(/^(?:<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*/i, '')
    .trimStart();
  if (!normalized.toLowerCase().startsWith('<svg')) {
    throw new ValidationError('文件内容与声明类型不匹配');
  }
  if (/<script|javascript:/i.test(content)) {
    throw new ValidationError('SVG 不允许包含脚本内容');
  }
}

export function validateBrandingFile(input: BrandingUploadInput): string {
  const extension = BRANDING_EXTENSION_BY_MIME[input.mimetype];
  if (!extension) throw new ValidationError('不支持的文件类型');
  if (input.buffer.length === 0) throw new ValidationError('文件内容为空');
  if (input.buffer.length > BRANDING_MAX_FILE_BYTES || input.size > BRANDING_MAX_FILE_BYTES) {
    throw new ValidationError('文件大小超过限制 (2MB)');
  }
  if (input.mimetype === 'image/svg+xml') {
    validateSvgContent(input.buffer);
  } else {
    validateMagicBytes(input.buffer, input.mimetype);
  }
  return extension;
}

export function saveBranding(slot: BrandingSlot, input: BrandingUploadInput): void {
  const extension = validateBrandingFile(input);
  const tempPath = dataPath(`.${slot}.${extension}.tmp`);
  fs.writeFileSync(tempPath, input.buffer);
  fs.renameSync(tempPath, brandingFilePath(slot, extension));
  for (const stale of BRANDING_EXTENSIONS) {
    if (stale === extension) continue;
    const stalePath = brandingFilePath(slot, stale);
    if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
  }
}

export function deleteBranding(slot: BrandingSlot): void {
  for (const extension of BRANDING_EXTENSIONS) {
    const filePath = brandingFilePath(slot, extension);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

export function serveBranding(slot: BrandingSlot, res: Response): void {
  const file = findBrandingFile(slot);
  if (!file) throw new NotFoundError('站点图标不存在');
  const headers: Record<string, string> = {
    'Content-Type': file.mimeType,
    'Content-Disposition': 'inline',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  };
  if (file.mimeType === 'image/svg+xml') {
    headers['Content-Security-Policy'] = BRANDING_CONTENT_SECURITY_POLICY;
  }
  res.sendFile(file.filePath, { headers });
}
