// Shared validation patterns for player groups so schema and service layers stay in sync.
export const PLAYER_GROUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
