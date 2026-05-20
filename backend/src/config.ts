import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  accessTokenExpiry: '2h',
  refreshTokenExpiry: '7d',
  linkCodeExpiry: 5 * 60 * 1000,
};
