import { apiFetch } from './client';
import type { SiteConfig, SetupPayload, SetupResult, SettingsResult } from '@/types/site';

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
  allowMcRegister?: boolean;
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
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
