import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let io: Server;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  const mcNamespace = io.of('/mc');

  mcNamespace.use(async (socket: Socket, next) => {
    const apiKey = socket.handshake.auth.serverKey as string;
    if (!apiKey) return next(new Error('Missing server key'));

    const server = await prisma.server.findUnique({ where: { apiKey } });
    if (!server) return next(new Error('Invalid server key'));

    socket.data.serverId = server.id;
    socket.data.serverName = server.name;
    next();
  });

  mcNamespace.on('connection', (socket: Socket) => {
    socket.join(`server:${socket.data.serverId}`);

    socket.on('disconnect', () => {
      // cleanup if needed
    });
  });

  return io;
}

export function getIO() {
  return io;
}
