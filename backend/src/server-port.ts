export const DEFAULT_SERVER_PORT = 23_320;

function parseServerPort(value: string | number, source: string): number {
  const normalized = String(value);
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${source} must be an integer between 1 and 65535`);
  }

  const port = Number(normalized);
  if (port < 1 || port > 65_535) {
    throw new Error(`${source} must be an integer between 1 and 65535`);
  }
  return port;
}

export function resolveServerPort(configuredPort?: number): number {
  if (process.env.LT_SERVER_PORT !== undefined) {
    return parseServerPort(process.env.LT_SERVER_PORT, 'LT_SERVER_PORT');
  }
  if (process.env.PORT !== undefined) {
    return parseServerPort(process.env.PORT, 'PORT');
  }
  return parseServerPort(configuredPort ?? DEFAULT_SERVER_PORT, 'server.port');
}
