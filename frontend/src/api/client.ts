import { ApiError } from '@/types/api';
import { frontendConfig } from '@/config';

type ApiEnvelope<T> = { success: true; data: T };

function getBaseUrl(): string {
  return frontendConfig.backendUrl;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && accessToken) {
    accessToken = null;
  }

  if (!res.ok) {
    const err: { error?: string; message?: string } = await res
      .json()
      .catch(() => ({ error: 'Request failed' }));
    throw new ApiError(res.status, err.message || err.error || 'Request failed');
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
  const payload = (await res.json()) as T | ApiEnvelope<T>;
  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    (payload as { success?: unknown }).success === true &&
    'data' in payload
  ) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}
