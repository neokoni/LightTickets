export interface RequestRateLimitRule {
  windowSeconds: number;
  maxRequests: number;
}

export interface EmailRateLimitRule {
  cooldownSeconds: number;
}

export interface RateLimitConfig {
  global: RequestRateLimitRule;
  auth: RequestRateLimitRule;
  email: EmailRateLimitRule;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  global: {
    windowSeconds: 60,
    maxRequests: 100,
  },
  auth: {
    windowSeconds: 60,
    maxRequests: 10,
  },
  email: {
    cooldownSeconds: 60,
  },
};
