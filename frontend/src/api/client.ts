import { ApiError } from '@/types/api';
import { frontendConfig } from '@/config';

type ApiEnvelope<T> = { success: true; data: T };

function getBaseUrl(): string {
  return frontendConfig.serverUrl;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function readErrorMessage(res: Response): Promise<string> {
  const responseText = await res.text().catch(() => '');
  if (!responseText) return '';

  try {
    const payload = JSON.parse(responseText) as unknown;
    if (payload && typeof payload === 'object') {
      const errorPayload = payload as { error?: unknown; message?: unknown };
      if (typeof errorPayload.message === 'string') return errorPayload.message;
      if (typeof errorPayload.error === 'string') return errorPayload.error;
    }
  } catch {
    // Reverse proxies and CDNs can return HTML error pages. Do not expose that markup in the UI.
  }

  if (res.headers.get('content-type')?.includes('text/plain')) {
    return responseText.trim().slice(0, 300);
  }
  return '';
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
    const message = await readErrorMessage(res);
    const requestId = res.headers.get('cf-ray') ?? undefined;
    const isCloudflareChallenge = res.headers.get('cf-mitigated') === 'challenge';
    throw new ApiError(res.status, message, requestId, isCloudflareChallenge);
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
