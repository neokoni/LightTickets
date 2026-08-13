import type { Role } from './ticket';
import type { StorageDriver } from './storage';
import type { FederatedAuthPublicProvider } from './federatedauth';

export const DatabaseProvider = {
  SQLITE: 'sqlite',
  MYSQL: 'mysql',
} as const;

export type DatabaseProvider = (typeof DatabaseProvider)[keyof typeof DatabaseProvider];

export interface SiteConfig {
  isSetup: boolean;
  requireLogin: boolean;
  allowWebRegister: boolean;
  allowMcRegister: boolean;
  passwordResetEnabled: boolean;
  registrationEmailVerificationEnabled: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
  defaultLanguage: string;
  turnstile: TurnstilePublicConfig;
  federatedAuthProviders: FederatedAuthPublicProvider[];
}

export interface SetupPayload {
  db: {
    provider: DatabaseProvider;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    args?: string;
  };
  admin: {
    email: string;
    password: string;
    username: string;
  };
  site?: {
    siteName?: string;
    siteUrl?: string;
    defaultLanguage?: string;
  };
  mc?: {
    defaultServerName?: string;
  };
  storage?: {
    driver: StorageDriver;
    s3?: {
      endpoint?: string;
      bucket?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      forcePathStyle: boolean;
      presignExpiry: number;
    };
  };
}

export interface SetupResult {
  setup: {
    id: number;
    isSetup: boolean;
    siteName: string;
    siteUrl: string | null;
    defaultLanguage: string;
    createdAt: string;
    updatedAt: string;
  };
  admin: {
    id: number;
    email: string;
    username: string;
    role: Role;
    minecraftUuid?: string;
    minecraftName?: string;
    avatarUrl?: string | null;
    receiveEmailNotifications: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
  accessToken: string;
}

export interface SettingsResult {
  requireLogin: boolean;
  allowWebRegister: boolean;
  allowMcRegister: boolean;
  passwordResetEnabled: boolean;
  registrationEmailVerificationEnabled: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
  defaultLanguage: string;
  sendEmailNotifications: boolean;
  mail: MailSettings;
  turnstile: TurnstileSettings;
  rateLimit: RateLimitConfig;
  rateLimitDefaults: RateLimitConfig;
  attachment: AttachmentConfig;
  attachmentDefaults: AttachmentConfig;
  federatedAuthProviders: FederatedAuthPublicProvider[];
}

export interface SettingsPayload {
  requireLogin?: boolean;
  allowWebRegister?: boolean;
  allowMcRegister?: boolean;
  siteName?: string;
  siteUrl?: string | null;
  footerContent?: string | null;
  defaultLanguage?: string;
  sendEmailNotifications?: boolean;
  mail?: MailSettingsPayload;
  turnstile?: TurnstileSettingsPayload;
  rateLimit?: RateLimitConfigPayload;
  attachment?: Partial<AttachmentConfig>;
}

export interface AttachmentConfig {
  pendingQuotaMiB: number;
  pendingExpirationEnabled: boolean;
  pendingTtlDays: number;
}

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

export interface RateLimitConfigPayload {
  global?: Partial<RequestRateLimitRule>;
  auth?: Partial<RequestRateLimitRule>;
  loginPassword?: Partial<ToggleableRequestRateLimitRule>;
  email?: Partial<EmailRateLimitRule>;
  minecraftLink?: Partial<MinecraftLinkRateLimitRule>;
}

export interface MailSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  passwordSet: boolean;
  fromName: string;
  fromAddress: string;
}

export interface MailSettingsPayload {
  enabled?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string | null;
  password?: string | null;
  fromName?: string;
  fromAddress?: string;
}

export interface TurnstilePublicConfig {
  enabled: boolean;
  siteKey: string;
}

export interface TurnstileSettings extends TurnstilePublicConfig {
  secretKeySet: boolean;
}

export interface TurnstileSettingsPayload {
  enabled?: boolean;
  siteKey?: string;
  secretKey?: string | null;
}
