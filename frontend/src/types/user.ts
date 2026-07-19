import type { Role } from './ticket';

export const ROLE = {
  PLAYER: 'player',
  STAFF: 'staff',
  ADMIN: 'admin',
} as const;

export const ROLE_META: Record<Role, { labelKey: string }> = {
  [ROLE.PLAYER]: { labelKey: 'role.player' },
  [ROLE.STAFF]: { labelKey: 'role.staff' },
  [ROLE.ADMIN]: { labelKey: 'role.admin' },
};

export function isStaffRole(role: Role): boolean {
  return role === ROLE.STAFF || role === ROLE.ADMIN;
}

export function isAdminRole(role: Role): boolean {
  return role === ROLE.ADMIN;
}

export interface User {
  id: number;
  email: string;
  username: string;
  minecraftUuid?: string;
  minecraftName?: string;
  avatarUrl?: string | null;
  receiveEmailNotifications: boolean;
  role: Role;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  /** Deprecated: kept during refresh-cookie migration compatibility. */
  refreshToken: string;
}

export interface RefreshResponse {
  user: User;
  accessToken: string;
}

export interface RegistrationVerificationResponse {
  accepted: true;
  retryAfterSeconds: number;
}

export interface Server {
  id: string;
  name: string;
  apiKey: string;
  address?: string;
  description?: string;
  createdAt: string;
}

export interface AssignableUser {
  id: number;
  username: string;
  avatarUrl?: string | null;
  role: string;
}
