import { apiFetch } from './client';
import type { CreateLabelPayload, Label, UpdateLabelPayload } from '@/types/label';

export function apiGetLabels() {
  return apiFetch<Label[]>('/labels');
}

export function apiCreateLabel(data: CreateLabelPayload) {
  return apiFetch<Label>('/labels', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function apiUpdateLabel(id: string, data: UpdateLabelPayload) {
  return apiFetch<Label>(`/labels/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function apiDeleteLabel(id: string) {
  return apiFetch<void>(`/labels/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function apiAddTicketLabel(ticketId: number, labelId: string) {
  return apiFetch<void>(`/tickets/${ticketId}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labelId }),
  });
}

export function apiRemoveTicketLabel(ticketId: number, labelId: string) {
  return apiFetch<void>(`/tickets/${ticketId}/labels/${encodeURIComponent(labelId)}`, {
    method: 'DELETE',
  });
}
