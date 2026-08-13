import { ApiError } from '@/types/api';
import { frontendConfig } from '@/config';

type ApiEnvelope<T> = { success: true; data: T };

function getBaseUrl(): string {
  return frontendConfig.serverUrl;
}

let accessToken: string | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;
const activeRequestControllers = new Set<AbortController>();

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function clearApiSession() {
  accessToken = null;
  for (const controller of activeRequestControllers) controller.abort();
  activeRequestControllers.clear();
}

export function setApiRefreshHandler(handler: (() => Promise<boolean>) | null) {
  refreshHandler = handler;
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

async function apiFetchInternal<T>(
  path: string,
  options: RequestInit,
  retried: boolean,
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    abortFromCaller();
  } else {
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  activeRequestControllers.add(controller);

  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });

    if (res.status === 401 && accessToken && path !== '/auth/refresh') {
      if (!retried) {
        try {
          if (refreshHandler && (await refreshHandler())) {
            return apiFetchInternal<T>(path, options, true);
          }
        } catch {
          // The original 401 is reported below after the refresh attempt fails.
        }
      }
      // Reaching here means either we already retried (and still got a 401) or
      // the refresh handler failed — either way the session is gone. Clear the
      // token and notify listeners so the UI can drop the dead session.
      accessToken = null;
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth:session-expired'));
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
  } finally {
    activeRequestControllers.delete(controller);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return apiFetchInternal(path, options, false);
}
