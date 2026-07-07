import type { Server as HttpServer } from 'http';
import type { Socket } from 'socket.io';
import { Server } from 'socket.io';
import { prisma } from '../db.js';

let io: Server;

function firstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveServerKey(socket: Socket) {
  return (
    firstString(socket.handshake.auth.serverKey as string | string[] | undefined) ||
    firstString(socket.handshake.query.serverKey as string | string[] | undefined) ||
    firstString(socket.handshake.headers['x-server-key'] as string | string[] | undefined)
  );
}

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  const mcNamespace = io.of('/mc');

  mcNamespace.use(async (socket: Socket, next) => {
    const apiKey = resolveServerKey(socket);
    if (!apiKey) return next(new Error('Missing server key'));

    const server = await prisma().server.findUnique({ where: { apiKey } });
    if (!server) return next(new Error('Invalid server key'));

    socket.data.serverId = server.id;
    socket.data.serverName = server.name;
    next();
  });

  mcNamespace.on('connection', (socket: Socket) => {
    socket.join(`server:${socket.data.serverId}`);
    console.log(
      `[socket] Minecraft server connected: ${socket.data.serverName} (${socket.data.serverId})`,
    );

    socket.on('disconnect', () => {
      console.log(
        `[socket] Minecraft server disconnected: ${socket.data.serverName} (${socket.data.serverId})`,
      );
    });
  });

  return io;
}

export function getIO() {
  return io;
}
