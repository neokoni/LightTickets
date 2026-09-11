import type { Server as HttpServer } from 'http';
import type { Socket } from 'socket.io';
import { Server } from 'socket.io';
import { getConfig } from '../config.js';
import { SERVER_API_KEY_TYPE } from '../constants/server-api-key.js';
import { resolveSocketServerKey } from '../utils/socket-auth.js';
import * as serverService from '../services/server.service.js';

let io: Server;
let hookRetryTimer: NodeJS.Timeout | undefined;

export function initSocket(httpServer: HttpServer) {
  const config = getConfig();
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || config.corsOrigins.includes(origin)) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'));
        }
      },
    },
  });

  const mcNamespace = io.of('/mc');

  mcNamespace.use(async (socket: Socket, next) => {
    const apiKey = resolveSocketServerKey(socket.handshake);
    if (!apiKey) return next(new Error('Missing server key'));

    try {
      const authenticatedKey = await serverService.authenticateApiKey(apiKey);
      if (authenticatedKey.servers.length === 0) return next(new Error('API Key has no servers'));
      socket.data.serverIds = authenticatedKey.servers.map((server) => server.id);
      // Logs identify the API key itself; the bound servers are an implementation detail.
      socket.data.apiKeyLabel =
        authenticatedKey.title ??
        `${authenticatedKey.type === SERVER_API_KEY_TYPE.VELOCITY ? 'Velocity' : 'Paper/Folia'} API Key ${authenticatedKey.apiKeyId.slice(0, 8)}`;
      next();
    } catch {
      next(new Error('Invalid server key'));
    }
  });

  mcNamespace.on('connection', (socket: Socket) => {
    const serverIds: string[] = Array.isArray(socket.data.serverIds)
      ? socket.data.serverIds.map(String)
      : [];
    for (const serverId of serverIds) socket.join(`server:${serverId}`);
    console.log(`[socket] Minecraft API key connected: ${socket.data.apiKeyLabel}`);

    void import('../services/minecraft-hook-delivery.service.js')
      .then((service) =>
        Promise.all(serverIds.map((serverId) => service.dispatchPendingForServer(serverId))),
      )
      .catch((error: unknown) => {
        console.error('[socket] Failed to dispatch pending Minecraft hooks', error);
      });

    socket.on('hook:ack', (payload: unknown) => {
      // Legacy clients send a plain deliveryId string; new clients send
      // { deliveryId, results: [{ hookId, success, error? }] }.
      if (typeof payload === 'string' && payload.length <= 128) {
        void import('../services/minecraft-hook-delivery.service.js')
          .then((service) =>
            Promise.all(serverIds.map((serverId) => service.acknowledge(serverId, payload))),
          )
          .catch((error: unknown) => {
            console.error('[socket] Failed to acknowledge Minecraft hook', error);
          });
        return;
      }
      if (payload && typeof payload === 'object') {
        const msg = payload as Record<string, unknown>;
        const deliveryId = typeof msg.deliveryId === 'string' ? msg.deliveryId : '';
        if (!deliveryId || deliveryId.length > 128) return;
        const results = Array.isArray(msg.results)
          ? (msg.results as Array<{ hookId: string; success: boolean; error?: string }>)
          : undefined;
        void import('../services/minecraft-hook-delivery.service.js')
          .then((service) =>
            Promise.all(
              serverIds.map((serverId) => service.acknowledge(serverId, deliveryId, results)),
            ),
          )
          .catch((error: unknown) => {
            console.error('[socket] Failed to acknowledge Minecraft hook', error);
          });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] Minecraft API key disconnected: ${socket.data.apiKeyLabel}`);
    });
  });

  if (hookRetryTimer) clearInterval(hookRetryTimer);
  hookRetryTimer = setInterval(() => {
    const connectedServerIds = new Set(
      Array.from(mcNamespace.sockets.values()).flatMap((socket) =>
        Array.isArray(socket.data.serverIds) ? socket.data.serverIds.map(String) : [],
      ),
    );
    for (const serverId of connectedServerIds) {
      void import('../services/minecraft-hook-delivery.service.js')
        .then((service) => service.dispatchPendingForServer(serverId))
        .catch((error: unknown) => {
          console.error('[socket] Failed to retry pending Minecraft hooks', error);
        });
    }
  }, 30_000);
  hookRetryTimer.unref();

  return io;
}

export function getIO() {
  return io;
}
