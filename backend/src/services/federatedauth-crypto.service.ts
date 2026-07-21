import crypto from 'crypto';
import { getConfig } from '../config.js';
import { ValidationError } from '../utils/errors.js';

const VERSION = 'v1';

function encryptionKey(): Buffer {
  return Buffer.from(getConfig().security.externalEncryptionKey, 'hex');
}

export function encryptFederatedAuth(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptFederatedAuth(value: string): string {
  const [version, ivValue, tagValue, encryptedValue, extra] = value.split('.');
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue || extra) {
    throw new ValidationError('外部登录加密数据无效');
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ValidationError('外部登录加密数据无法解密');
  }
}
