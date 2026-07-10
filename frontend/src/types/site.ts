import type { Role } from './ticket';

export interface SiteConfig {
  isSetup: boolean;
  requireLogin: boolean;
  allowWebRegister: boolean;
  allowMcRegister: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
  defaultLanguage: string;
}

export interface SetupPayload {
  db: {
    provider: 'sqlite' | 'mysql';
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
    driver: 'local' | 's3';
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
    createdAt?: string;
    updatedAt?: string;
  };
  accessToken: string;
  /** Deprecated: kept during refresh-cookie migration compatibility. */
  refreshToken: string;
}

export interface SettingsResult {
  requireLogin: boolean;
  allowWebRegister: boolean;
  allowMcRegister: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
  defaultLanguage: string;
  mail: MailSettings;
}

export interface SettingsPayload {
  requireLogin?: boolean;
  allowWebRegister?: boolean;
  allowMcRegister?: boolean;
  siteName?: string;
  siteUrl?: string | null;
  footerContent?: string | null;
  defaultLanguage?: string;
  mail?: MailSettingsPayload;
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
