import type { AuthResponse } from './user';

export type FederatedAuthProtocol = 'oidc' | 'oauth';
export type FederatedAuthSecretMode = 'basic' | 'post' | 'bcrypt';

export interface FederatedAuthPublicProvider {
  slug: string;
  name: string;
  iconUrl: string | null;
  allowRegistration: boolean;
}

export interface FederatedAuthProvider extends FederatedAuthPublicProvider {
  id: string;
  protocol: FederatedAuthProtocol;
  issuer: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  userInfoEndpoint: string | null;
  redirectUri: string;
  clientId: string;
  scope: string;
  subjectPath: string;
  usernamePath: string | null;
  emailPath: string | null;
  avatarPath: string | null;
  authorizationParams: Record<string, string>;
  pkce: boolean;
  secretMode: FederatedAuthSecretMode;
  accessTokenPath: string;
  enabled: boolean;
  clientSecretSet: boolean;
  identityCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FederatedAuthProviderPayload {
  slug: string;
  name: string;
  iconUrl: string | null;
  protocol: FederatedAuthProtocol;
  issuer: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  userInfoEndpoint: string | null;
  redirectUri: string;
  clientId: string;
  clientSecret?: string | null;
  scope: string;
  subjectPath: string;
  usernamePath: string | null;
  emailPath: string | null;
  avatarPath: string | null;
  authorizationParams: Record<string, string>;
  pkce: boolean;
  secretMode: FederatedAuthSecretMode;
  accessTokenPath: string;
  enabled: boolean;
  allowRegistration: boolean;
}

export interface FederatedAuthIdentity {
  id: string;
  usernameHint: string | null;
  emailHint: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  provider: Pick<FederatedAuthPublicProvider, 'slug' | 'name' | 'iconUrl'>;
}

export interface FederatedAuthRegistrationSession {
  provider: Pick<FederatedAuthPublicProvider, 'name' | 'iconUrl'>;
  usernameHint: string | null;
  emailHint: string | null;
}

export interface FederatedAuthProviderUnlinkResponse {
  unlinked: number;
}

export type FederatedAuthRegistrationResponse = AuthResponse;
