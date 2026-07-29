const MAX_SERVER_KEY_LENGTH = 128;

interface SocketHandshake {
  auth: unknown;
}

export function resolveSocketServerKey(handshake: SocketHandshake): string | undefined {
  if (
    typeof handshake.auth !== 'object' ||
    handshake.auth === null ||
    Array.isArray(handshake.auth)
  ) {
    return undefined;
  }

  const serverKey = (handshake.auth as Record<string, unknown>).serverKey;
  if (typeof serverKey !== 'string' || serverKey.length === 0) return undefined;
  if (serverKey.length > MAX_SERVER_KEY_LENGTH) return undefined;

  return serverKey;
}
