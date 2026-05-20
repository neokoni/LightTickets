import { getIO } from './index.js';

export function emitTicketUpdate(serverId: string, event: string, data: any) {
  const io = getIO();
  if (!io) return;
  io.of('/mc').to(`server:${serverId}`).emit(event, data);
}

export function emitToAllServers(event: string, data: any) {
  const io = getIO();
  if (!io) return;
  io.of('/mc').emit(event, data);
}
