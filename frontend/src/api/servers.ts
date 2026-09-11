import { apiFetch } from './client';
import type { Server, ServerApiKey, ServerApiKeyType } from '@/types/user';

export function apiGetServers() {
  return apiFetch<Server[]>('/servers');
}

export function apiCreateServer(data: { serverId: string; identifyId?: string; alias?: string }) {
  return apiFetch<Server>('/servers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function apiUpdateServer(
  id: string,
  data: { serverId?: string; identifyId?: string | null; alias?: string | null },
) {
  return apiFetch<Server>(`/servers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function apiDeleteServer(id: string) {
  return apiFetch<void>(`/servers/${id}`, { method: 'DELETE' });
}

export function apiGetServerApiKeys() {
  return apiFetch<ServerApiKey[]>('/servers/api-keys');
}

export function apiCreateServerApiKey(data: {
  title?: string | null;
  type: ServerApiKeyType;
  serverIds: string[];
}) {
  return apiFetch<ServerApiKey & { apiKey: string }>('/servers/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function apiUpdateServerApiKey(
  id: string,
  data: { title?: string | null; type: ServerApiKeyType; serverIds: string[] },
) {
  return apiFetch<ServerApiKey>(`/servers/api-keys/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function apiRegenerateServerApiKey(id: string) {
  return apiFetch<{ apiKey: string }>(`/servers/api-keys/${id}/regenerate`, {
    method: 'POST',
  });
}

export function apiDeleteServerApiKey(id: string) {
  return apiFetch<void>(`/servers/api-keys/${id}`, { method: 'DELETE' });
}
