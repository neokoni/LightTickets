export interface RequestRateLimitRule {
  windowSeconds: number;
  maxRequests: number;
}

export interface ToggleableRequestRateLimitRule extends RequestRateLimitRule {
  enabled: boolean;
}

export interface EmailRateLimitRule {
  cooldownSeconds: number;
}

export interface MinecraftLinkRateLimitRule {
  maxAttempts: number;
  lockSeconds: number;
}

export interface RateLimitConfig {
  global: RequestRateLimitRule;
  auth: RequestRateLimitRule;
  loginPassword: ToggleableRequestRateLimitRule;
  email: EmailRateLimitRule;
  minecraftLink: MinecraftLinkRateLimitRule;
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
  loginPassword: {
    enabled: true,
    windowSeconds: 15 * 60,
    maxRequests: 5,
  },
  email: {
    cooldownSeconds: 60,
  },
  minecraftLink: {
    maxAttempts: 5,
    lockSeconds: 15 * 60,
  },
};
