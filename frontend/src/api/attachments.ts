import { apiFetch } from './client';
import type { Attachment } from '@/types/attachment';

export function apiGetAttachments(ticketId: number) {
  return apiFetch<Attachment[]>(`/tickets/${ticketId}/attachments`);
}

export function apiUploadAttachment(file: File, opts?: { ticketId?: number; commentId?: string }) {
  const form = new FormData();
  form.append('file', file);
  if (opts?.ticketId) form.append('ticketId', String(opts.ticketId));
  if (opts?.commentId) form.append('commentId', opts.commentId);
  return apiFetch<Attachment>('/attachments/upload', {
    method: 'POST',
    body: form,
  });
}

export function apiDeleteAttachment(attachmentId: string) {
  return apiFetch<void>(`/attachments/${attachmentId}`, { method: 'DELETE' });
}
