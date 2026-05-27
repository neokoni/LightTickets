import { apiFetch } from './client'

export interface AdminTemplate {
  id: number
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

export function apiGetAdminTemplate(id: number) {
  return apiFetch<AdminTemplate>(`/admin/templates/${id}`)
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

export function apiUpdateAdminTemplate(id: number, data: {
  nameI18n?: string
  description?: string
  titlePrefix?: string
  labels?: string
  body?: string
  completionHooks?: string
  enabled?: boolean
}) {
  return apiFetch<AdminTemplate>(`/admin/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function apiDeleteAdminTemplate(id: number) {
  return apiFetch<void>(`/admin/templates/${id}`, { method: 'DELETE' })
}
