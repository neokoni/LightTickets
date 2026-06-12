import { apiFetch } from './client';

export interface SiteConfig {
  isSetup: boolean;
  requireLogin: boolean;
  allowWebRegister: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
}

export interface SetupPayload {
  db: {
    provider: 'sqlite' | 'mysql';
    databaseUrl: string;
  };
  admin: {
    email: string;
    password: string;
    username: string;
  };
  site?: {
    siteName?: string;
    siteUrl?: string;
  };
  mc?: {
    defaultServerName?: string;
  };
}

export interface SetupResult {
  setup: {
    id: number;
    isSetup: boolean;
    siteName: string;
    siteUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  admin: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface SettingsResult {
  requireLogin: boolean;
  allowWebRegister: boolean;
  siteName: string;
  siteUrl: string | null;
  footerContent: string | null;
}

export async function getSiteConfig(): Promise<SiteConfig> {
  return apiFetch<SiteConfig>('/setup/site-config', { method: 'GET' });
}

export async function completeSetup(payload: SetupPayload): Promise<SetupResult> {
  return apiFetch<SetupResult>('/setup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSettings(data: {
  requireLogin?: boolean;
  allowWebRegister?: boolean;
  siteName?: string;
  siteUrl?: string | null;
  footerContent?: string | null;
}): Promise<SettingsResult> {
  return apiFetch<SettingsResult>('/setup/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function waitForServerReady(maxAttempts = 30, intervalMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}
