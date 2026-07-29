import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import net from 'node:net';

export function normalizeIpAddress(address: string | undefined): string | null {
  if (!address) return null;
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return net.isIP(normalized) === 0 ? null : normalized;
}

function toTrustedSet(addresses: readonly string[]): Set<string> {
  return new Set(
    addresses.map((address) => {
      const normalized = normalizeIpAddress(address.trim());
      if (!normalized) throw new Error(`Invalid trusted proxy IP address: ${address}`);
      return normalized;
    }),
  );
}

export function trustFrontendProxy(
  app: Express,
  configuredAddresses: readonly string[] | null,
  persistDiscoveredAddress: (address: string) => readonly string[],
): RequestHandler {
  let pendingDiscovery = configuredAddresses === null;
  let trusted = toTrustedSet(configuredAddresses ?? []);
  app.set('trust proxy', (address: string) => {
    const normalized = normalizeIpAddress(address);
    return normalized !== null && trusted.has(normalized);
  });

  return (req: Request, _res: Response, next: NextFunction) => {
    if (!pendingDiscovery || req.headers['x-forwarded-for'] === undefined) {
      next();
      return;
    }

    const remoteAddress = normalizeIpAddress(req.socket.remoteAddress);
    if (!remoteAddress) {
      next();
      return;
    }

    try {
      trusted = toTrustedSet(persistDiscoveredAddress(remoteAddress));
      pendingDiscovery = false;
      next();
    } catch (error) {
      next(error);
    }
  };
}
