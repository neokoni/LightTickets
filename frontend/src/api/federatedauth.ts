import { apiFetch } from './client';
import type {
  FederatedAuthIdentity,
  FederatedAuthProvider,
  FederatedAuthProviderPayload,
  FederatedAuthProviderUnlinkResponse,
  FederatedAuthRegistrationResponse,
  FederatedAuthRegistrationSession,
} from '@/types/federatedauth';

export function apiStartFederatedAuth(slug: string, returnTo = '/') {
  return apiFetch<{ authorizationUrl: string }>(`/auth/federatedauth/${slug}/start`, {
    method: 'POST',
    body: JSON.stringify({ returnTo }),
  });
}

export function apiGetFederatedAuthRegistration() {
  return apiFetch<FederatedAuthRegistrationSession>('/auth/federatedauth/registration/session', {
    method: 'GET',
  });
}

export function apiRequestFederatedAuthVerification(email: string, turnstileToken?: string) {
  return apiFetch<{ accepted: true; retryAfterSeconds: number }>(
    '/auth/federatedauth/registration/verification-code',
    {
      method: 'POST',
      body: JSON.stringify({ email, turnstileToken }),
    },
  );
}

export function apiCompleteFederatedAuthRegistration(data: {
  email: string;
  username: string;
  password: string;
  emailVerificationCode?: string;
  turnstileToken?: string;
}) {
  return apiFetch<FederatedAuthRegistrationResponse>('/auth/federatedauth/registration/complete', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function apiListFederatedAuthIdentities() {
  return apiFetch<FederatedAuthIdentity[]>('/users/me/federatedauth', { method: 'GET' });
}

export function apiStartFederatedAuthLink(slug: string) {
  return apiFetch<{ authorizationUrl: string }>(`/users/me/federatedauth/${slug}/start`, {
    method: 'POST',
    body: JSON.stringify({ returnTo: '/profile?section=federatedauth' }),
  });
}

export function apiUnlinkFederatedAuth(identityId: string, currentPassword: string) {
  return apiFetch<void>(`/users/me/federatedauth/${identityId}`, {
    method: 'DELETE',
    body: JSON.stringify({ currentPassword }),
  });
}

export function apiListFederatedAuthProviders() {
  return apiFetch<FederatedAuthProvider[]>('/admin/federatedauth/providers', { method: 'GET' });
}

export function apiCreateFederatedAuthProvider(data: FederatedAuthProviderPayload) {
  return apiFetch<FederatedAuthProvider>('/admin/federatedauth/providers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function apiUpdateFederatedAuthProvider(
  id: string,
  data: Partial<FederatedAuthProviderPayload>,
) {
  return apiFetch<FederatedAuthProvider>(`/admin/federatedauth/providers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function apiDeleteFederatedAuthProvider(id: string) {
  return apiFetch<void>(`/admin/federatedauth/providers/${id}`, { method: 'DELETE' });
}

export function apiUnlinkFederatedAuthProvider(id: string) {
  return apiFetch<FederatedAuthProviderUnlinkResponse>(
    `/admin/federatedauth/providers/${id}/identities`,
    { method: 'DELETE' },
  );
}

export function apiTestFederatedAuthProvider(id: string) {
  return apiFetch<{ reachable: boolean }>(`/admin/federatedauth/providers/${id}/test`, {
    method: 'POST',
  });
}
