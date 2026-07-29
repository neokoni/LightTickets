import crypto from 'crypto';

export function generateMinecraftSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashMinecraftSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}
