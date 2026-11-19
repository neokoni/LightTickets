export const FEDERATED_AUTH_PROTOCOL = {
  OIDC: 'oidc',
  OAUTH: 'oauth',
  QQ: 'qq',
} as const;

export const FEDERATED_AUTH_QQ = {
  AUTHORIZATION_ENDPOINT: 'https://graph.qq.com/oauth2.0/authorize',
  TOKEN_ENDPOINT: 'https://graph.qq.com/oauth2.0/token',
  OPENID_ENDPOINT: 'https://graph.qq.com/oauth2.0/me',
  USER_INFO_ENDPOINT: 'https://graph.qq.com/user/get_user_info',
  SCOPE: 'get_user_info',
  SUBJECT_PATH: 'openid',
  USERNAME_PATH: 'nickname',
  AVATAR_PATH: 'figureurl_qq_2',
  ACCESS_TOKEN_PATH: 'access_token',
} as const;

export const FEDERATED_AUTH_INTENT = {
  LOGIN: 'login',
  LINK: 'link',
} as const;

export const FEDERATED_AUTH_SECRET_MODE = {
  BASIC: 'basic',
  POST: 'post',
  BCRYPT: 'bcrypt',
} as const;

export const FEDERATED_AUTH_COOKIE = {
  FLOW: 'lt_federatedauth_flow',
  REGISTRATION: 'lt_federatedauth_registration',
} as const;

export const FEDERATED_AUTH_TTL = {
  FLOW: 10 * 60 * 1000,
  REGISTRATION: 15 * 60 * 1000,
} as const;

export type FederatedAuthProtocol =
  (typeof FEDERATED_AUTH_PROTOCOL)[keyof typeof FEDERATED_AUTH_PROTOCOL];
export type FederatedAuthSecretMode =
  (typeof FEDERATED_AUTH_SECRET_MODE)[keyof typeof FEDERATED_AUTH_SECRET_MODE];
