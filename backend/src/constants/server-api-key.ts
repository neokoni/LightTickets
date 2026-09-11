import { ServerApiKeyType } from '@prisma/client';

export const SERVER_API_KEY_TYPE = {
  PAPER_FOLIA: ServerApiKeyType.paper_folia,
  VELOCITY: ServerApiKeyType.velocity,
} as const;

export const SERVER_API_KEY_TYPES = Object.values(SERVER_API_KEY_TYPE);
