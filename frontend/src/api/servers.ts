import { apiFetch } from './client';
import type { Server } from '@/types/user';

export function apiGetServers() {
  return apiFetch<Server[]>('/servers');
}

export function apiCreateServer(data: { name: string; address?: string; description?: string }) {
  return apiFetch<Server>('/servers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function apiRegenerateKey(id: string) {
  return apiFetch<{ apiKey: string }>(`/servers/${id}/regenerate-key`, { method: 'POST' });
}

export function apiUpdateServer(
  id: string,
  data: { name?: string; address?: string | null; description?: string | null },
) {
  return apiFetch<Server>(`/servers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function apiDeleteServer(id: string) {
  return apiFetch<void>(`/servers/${id}`, { method: 'DELETE' });
}
