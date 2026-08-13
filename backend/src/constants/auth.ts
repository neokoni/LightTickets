// Authentication session and credential defaults.
export const REFRESH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

// Authentication error response defaults.
export const AUTH_ERROR_MESSAGES = {
  INVALID_CODE_MESSAGE: '无效或已过期的绑定码',
  LOCKED_MESSAGE: '绑定尝试次数过多，请稍后再试',
  REGISTRATION_CONFLICT_MESSAGE: '用户名或邮箱已被使用',
} as const;
