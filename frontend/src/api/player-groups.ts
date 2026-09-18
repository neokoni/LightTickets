import { apiFetch } from './client';
import type {
  PlayerGroupItem,
  PlayerGroupItemsPage,
  PlayerGroupItemsQuery,
  PlayerGroupSummary,
} from '@/types/player-group';

export function apiGetPlayerGroups() {
  return apiFetch<PlayerGroupSummary[]>('/admin/player-groups');
}
export function apiGetPlayerGroupItems(id: string, query: PlayerGroupItemsQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) params.set('q', query.q);
  return apiFetch<PlayerGroupItemsPage>(
    `/admin/player-groups/${encodeURIComponent(id)}?${params.toString()}`,
  );
}
export function apiCreatePlayerGroup(data: { id: string; name?: string; note?: string }) {
  return apiFetch<PlayerGroupSummary>('/admin/player-groups', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
export function apiUpdatePlayerGroup(
  id: string,
  data: { name?: string | null; note?: string | null },
) {
  return apiFetch<PlayerGroupSummary>(`/admin/player-groups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
export function apiDeletePlayerGroup(id: string) {
  return apiFetch<void>(`/admin/player-groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function apiAddPlayerGroupItems(id: string, values: string[]) {
  return apiFetch<PlayerGroupSummary>(`/admin/player-groups/${encodeURIComponent(id)}/items`, {
    method: 'POST',
    body: JSON.stringify({ values }),
  });
}
export function apiUpdatePlayerGroupItem(groupId: string, itemId: string, value: string) {
  return apiFetch<PlayerGroupItem>(
    `/admin/player-groups/${encodeURIComponent(groupId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'PATCH', body: JSON.stringify({ value }) },
  );
}
export function apiDeletePlayerGroupItem(groupId: string, itemId: string) {
  return apiFetch<void>(
    `/admin/player-groups/${encodeURIComponent(groupId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
}
export function apiSearchPlayerGroupValues(groupIds: string[], q: string) {
  const params = new URLSearchParams({ groupIds: groupIds.join(','), q });
  return apiFetch<string[]>(`/player-groups/search?${params.toString()}`);
}
