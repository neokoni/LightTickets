import { apiClient } from './client';

export interface SetupStatus {
  isSetup: boolean;
  siteName: string;
  accentColor: string;
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
    accentColor?: string;
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
    accentColor: string;
    createdAt: string;
    updatedAt: string;
  };
  admin: {
    id: number;
    email: string;
    username: string;
    role: string;
  };
  token: string;
  refreshToken: string;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const { data } = await apiClient.get<SetupStatus>('/setup/status');
  return data;
}

export async function completeSetup(payload: SetupPayload): Promise<SetupResult> {
  const { data } = await apiClient.post<SetupResult>('/setup', payload);
  return data;
}
