import { apiFetch } from './client'

export interface Attachment {
  id: string
  ticketId: number
  filename: string
  url: string
  mimeType: string
  size: number
  createdAt: string
}

export function apiGetAttachments(ticketId: number) {
  return apiFetch<Attachment[]>(`/tickets/${ticketId}/attachments`)
}

export function apiUploadAttachment(ticketId: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<Attachment>(`/tickets/${ticketId}/attachments`, {
    method: 'POST',
    body: form,
  })
}

export function apiDeleteAttachment(ticketId: number, attachmentId: string) {
  return apiFetch<void>(`/tickets/${ticketId}/attachments/${attachmentId}`, { method: 'DELETE' })
}
