import { apiFetch } from './client';

export interface SetupStatus {
  isSetup: boolean;
  siteName: string;
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

export async function getSetupStatus(): Promise<SetupStatus> {
  return apiFetch<SetupStatus>('/setup/status', { method: 'GET' });
}

export async function completeSetup(payload: SetupPayload): Promise<SetupResult> {
  return apiFetch<SetupResult>('/setup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
