import type { Server as HttpServer } from 'http';
import type { Socket } from 'socket.io';
import { Server } from 'socket.io';
import { prisma } from '../db.js';
import { resolveSocketServerKey } from '../utils/socket-auth.js';

let io: Server;
let hookRetryTimer: NodeJS.Timeout | undefined;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  const mcNamespace = io.of('/mc');

  mcNamespace.use(async (socket: Socket, next) => {
    const apiKey = resolveSocketServerKey(socket.handshake);
    if (!apiKey) return next(new Error('Missing server key'));

    const server = await prisma().server.findUnique({ where: { apiKey } });
    if (!server) return next(new Error('Invalid server key'));

    socket.data.serverId = server.id;
    socket.data.serverName = server.name;
    next();
  });

  mcNamespace.on('connection', (socket: Socket) => {
    const serverId = String(socket.data.serverId);
    socket.join(`server:${serverId}`);
    console.log(
      `[socket] Minecraft server connected: ${socket.data.serverName} (${socket.data.serverId})`,
    );

    void import('../services/minecraft-hook-delivery.service.js')
      .then((service) => service.dispatchPendingForServer(serverId))
      .catch((error: unknown) => {
        console.error('[socket] Failed to dispatch pending Minecraft hooks', error);
      });

    socket.on('hook:ack', (deliveryId: unknown) => {
      if (typeof deliveryId !== 'string' || deliveryId.length > 128) return;
      void import('../services/minecraft-hook-delivery.service.js')
        .then((service) => service.acknowledge(serverId, deliveryId))
        .catch((error: unknown) => {
          console.error('[socket] Failed to acknowledge Minecraft hook', error);
        });
    });

    socket.on('disconnect', () => {
      console.log(
        `[socket] Minecraft server disconnected: ${socket.data.serverName} (${socket.data.serverId})`,
      );
    });
  });

  if (hookRetryTimer) clearInterval(hookRetryTimer);
  hookRetryTimer = setInterval(() => {
    const connectedServerIds = new Set(
      Array.from(mcNamespace.sockets.values(), (socket) => String(socket.data.serverId)),
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
