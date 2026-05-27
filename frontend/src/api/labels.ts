import { apiFetch } from './client'
import type { Label } from '@/types/ticket'

export function apiGetLabels() {
  return apiFetch<Label[]>('/labels')
}

export function apiCreateLabel(data: { name: string; color: string; description?: string }) {
  return apiFetch<Label>('/labels', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function apiUpdateLabel(id: string, data: { name?: string; color?: string; description?: string }) {
  return apiFetch<Label>(`/labels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function apiDeleteLabel(id: string) {
  return apiFetch<void>(`/labels/${id}`, { method: 'DELETE' })
}

export function apiAddTicketLabel(ticketId: number, labelId: string) {
  return apiFetch<void>(`/tickets/${ticketId}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labelId }),
  })
}

export function apiRemoveTicketLabel(ticketId: number, labelId: string) {
  return apiFetch<void>(`/tickets/${ticketId}/labels/${labelId}`, { method: 'DELETE' })
}
