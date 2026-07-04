import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';

export function generateTokens(userId: number, role: string) {
  const accessToken = jwt.sign({ userId, role }, config.jwtSecret, { expiresIn: config.accessTokenExpiry as SignOptions['expiresIn'] });
  const refreshToken = jwt.sign({ userId, role }, config.jwtRefreshSecret, { expiresIn: config.refreshTokenExpiry as SignOptions['expiresIn'] });
  return { accessToken, refreshToken };
}
