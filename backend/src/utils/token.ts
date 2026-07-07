import jwt, { type SignOptions } from 'jsonwebtoken';
import { getConfig } from '../config.js';

export function generateTokens(userId: number, role: string) {
  const config = getConfig();
  const accessToken = jwt.sign({ userId, role }, config.security.jwtSecret, {
    expiresIn: config.accessTokenExpiry as SignOptions['expiresIn'],
  });
  const refreshToken = jwt.sign({ userId, role }, config.security.jwtRefreshSecret, {
    expiresIn: config.refreshTokenExpiry as SignOptions['expiresIn'],
  });
  return { accessToken, refreshToken };
}
