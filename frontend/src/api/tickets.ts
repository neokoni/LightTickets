import { apiFetch } from './client';
import type {
  Ticket,
  TicketStatus,
  TemplateSummary,
  TemplateDefinition,
  TicketFilters,
} from '@/types/ticket';
import type { PaginatedResponse } from '@/types/api';

export function apiGetTickets(filters: TicketFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val === undefined || val === '') return;
    if (Array.isArray(val)) {
      val.forEach((v) => params.append(key, String(v)));
    } else {
      params.set(key, String(val));
    }
  });
  const qs = params.toString();
  return apiFetch<PaginatedResponse<Ticket>>(`/tickets${qs ? '?' + qs : ''}`);
}

export function apiGetTicket(id: number) {
  return apiFetch<Ticket>(`/tickets/${id}`);
}

export function apiCreateTicket(data: {
  title: string;
  template: string;
  formData: Record<string, string>;
  serverId?: string;
}) {
  return apiFetch<Ticket>('/tickets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function apiUpdateTicket(id: number, data: { status?: TicketStatus; assigneeId?: string }) {
  return apiFetch<Ticket>(`/tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function apiSetAssignees(id: number, assigneeIds: number[]) {
  return apiFetch<Ticket>(`/tickets/${id}/assignees`, {
    method: 'PUT',
    body: JSON.stringify({ assigneeIds }),
  });
}

export function apiCloseTicket(id: number) {
  return apiFetch<Ticket>(`/tickets/${id}/close`, { method: 'POST' });
}

export function apiReopenTicket(id: number) {
  return apiFetch<Ticket>(`/tickets/${id}/reopen`, { method: 'POST' });
}

export function apiGetTemplates() {
  return apiFetch<TemplateSummary[]>('/templates');
}

export function apiGetTemplate(name: string) {
  return apiFetch<TemplateDefinition>(`/templates/${name}`);
}

export function apiUpdateTicketBody(id: number, body: string) {
  return apiFetch<Ticket>(`/tickets/${id}/body`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export function apiUpdateTicketTitle(id: number, title: string) {
  return apiFetch<Ticket>(`/tickets/${id}/title`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}
