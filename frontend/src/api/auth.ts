import { apiFetch } from './client';
import type { AuthResponse, RefreshResponse, User } from '@/types/user';

export function apiRegister(email: string, password: string, username: string) {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, username }),
  });
}

export function apiLogin(emailOrUsername: string, password: string) {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername, password }),
  });
}

export function apiRequestPasswordReset(emailOrUsername: string) {
  return apiFetch<{ accepted: boolean }>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername }),
  });
}

export function apiConfirmPasswordReset(token: string, password: string) {
  return apiFetch<{ reset: boolean }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function apiRefresh() {
  return apiFetch<RefreshResponse>('/auth/refresh', {
    method: 'POST',
  });
}

export function apiLogout() {
  return apiFetch<void>('/auth/logout', {
    method: 'POST',
  });
}

export function apiLinkMinecraft(code: string) {
  return apiFetch<{ uuid: string; name: string }>('/auth/link-minecraft', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function apiUnlinkMinecraft() {
  return apiFetch<User>('/auth/link-minecraft', {
    method: 'DELETE',
  });
}

export function apiUpdateAvatar(avatarUrl: string | null) {
  return apiFetch<User>('/users/me/avatar', {
    method: 'PATCH',
    body: JSON.stringify({ avatarUrl }),
  });
}

export function apiUpdateUsername(username: string) {
  return apiFetch<User>('/users/me/username', {
    method: 'PATCH',
    body: JSON.stringify({ username }),
  });
}

export function apiChangePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ message: string }>('/users/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function apiUpdateEmail(email: string) {
  return apiFetch<User>('/users/me/email', {
    method: 'PATCH',
    body: JSON.stringify({ email }),
  });
}
