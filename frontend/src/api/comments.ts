import { apiFetch } from './client';
import type { Comment } from '@/types/ticket';

export function apiGetComments(ticketId: number) {
  return apiFetch<Comment[]>(`/tickets/${ticketId}/comments`);
}

export function apiCreateComment(ticketId: number, body: string) {
  return apiFetch<Comment>(`/tickets/${ticketId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function apiUpdateCommentBody(ticketId: number, commentId: string, body: string) {
  return apiFetch<Comment>(`/tickets/${ticketId}/comments/${commentId}/body`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}
