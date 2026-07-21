import type { Response } from 'express';
import { FEDERATED_AUTH_COOKIE, FEDERATED_AUTH_TTL } from '../constants/federatedauth.js';

const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

export function setFederatedAuthFlowCookie(res: Response, value: string): void {
  res.cookie(FEDERATED_AUTH_COOKIE.FLOW, value, {
    ...options,
    path: '/api',
    maxAge: FEDERATED_AUTH_TTL.FLOW,
  });
}

export function clearFederatedAuthFlowCookie(res: Response): void {
  res.clearCookie(FEDERATED_AUTH_COOKIE.FLOW, { ...options, path: '/api' });
}

export function setFederatedAuthRegistrationCookie(res: Response, value: string): void {
  res.cookie(FEDERATED_AUTH_COOKIE.REGISTRATION, value, {
    ...options,
    path: '/api/auth/federatedauth',
    maxAge: FEDERATED_AUTH_TTL.REGISTRATION,
  });
}

export function clearFederatedAuthRegistrationCookie(res: Response): void {
  res.clearCookie(FEDERATED_AUTH_COOKIE.REGISTRATION, {
    ...options,
    path: '/api/auth/federatedauth',
  });
}
