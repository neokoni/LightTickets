import { apiFetch } from './client'

export interface AssignableUser {
  id: number
  username: string
  avatarUrl?: string | null
  role: string
}

export function apiGetAssignableUsers() {
  return apiFetch<AssignableUser[]>('/users/assignable')
}
