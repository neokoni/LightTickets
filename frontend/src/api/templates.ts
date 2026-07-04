import { apiFetch } from './client'

export interface AdminTemplate {
  name: string
  nameI18n: string
  description: string
  titlePrefix: string | null
  labels: string
  body: string
  completionHooks: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export function apiGetAdminTemplates() {
  return apiFetch<AdminTemplate[]>('/admin/templates')
}

export function apiGetAdminTemplate(name: string) {
  return apiFetch<AdminTemplate>(`/admin/templates/${encodeURIComponent(name)}`)
}

export function apiCreateAdminTemplate(data: {
  name: string
  nameI18n: string
  description: string
  titlePrefix?: string
  labels?: string
  body: string
  completionHooks?: string
  enabled?: boolean
}) {
  return apiFetch<AdminTemplate>('/admin/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function apiUpdateAdminTemplate(name: string, data: {
  nameI18n?: string
  description?: string
  titlePrefix?: string
  labels?: string
  body?: string
  completionHooks?: string
  enabled?: boolean
}) {
  return apiFetch<AdminTemplate>(`/admin/templates/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function apiDeleteAdminTemplate(name: string) {
  return apiFetch<void>(`/admin/templates/${encodeURIComponent(name)}`, { method: 'DELETE' })
}
