import { apiFetch } from './client'
import type { AuthResponse, RefreshResponse, User } from '@/types/user'

export function apiRegister(email: string, password: string, username: string) {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, username }),
  })
}

export function apiLogin(emailOrUsername: string, password: string) {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername, password }),
  })
}

export function apiRefresh(refreshToken: string) {
  return apiFetch<RefreshResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  })
}

export function apiLinkMinecraft(code: string) {
  return apiFetch<{ uuid: string; name: string }>('/auth/link-minecraft', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export function apiUpdateAvatar(avatarUrl: string | null) {
  return apiFetch<User>('/users/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ avatarUrl }),
  })
}
