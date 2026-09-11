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
  pendingEmail?: string | null;
  username: string;
  minecraftUuid?: string;
  minecraftName?: string;
  avatarUrl?: string | null;
  receiveEmailNotifications: boolean;
  role: Role;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface RefreshResponse {
  user: User;
  accessToken: string;
}

export interface RegistrationVerificationResponse {
  accepted: true;
  retryAfterSeconds: number;
}

export interface EmailChangeRequestResponse {
  accepted: true;
  pendingEmail: string;
  retryAfterSeconds: number;
}

export interface Server {
  id: string;
  serverId: string;
  identifyId?: string | null;
  alias?: string | null;
  name: string;
  address?: string | null;
  description?: string | null;
  createdAt: string;
}

export const ServerApiKeyType = {
  PAPER_FOLIA: 'paper_folia',
  VELOCITY: 'velocity',
} as const;

export type ServerApiKeyType = (typeof ServerApiKeyType)[keyof typeof ServerApiKeyType];

export interface ServerApiKey {
  id: string;
  title?: string | null;
  type: ServerApiKeyType;
  servers: Server[];
  createdAt: string;
  apiKey?: string;
}

export interface AssignableUser {
  id: number;
  username: string;
  avatarUrl?: string | null;
  role: string;
}
