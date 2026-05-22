import type { Server as IOServer } from 'socket.io';

declare global {
  // server.js sets globalThis.__socketIo
  // eslint-disable-next-line no-var
  var __socketIo: IOServer | undefined;
}

/**
 * Get the Socket.IO server instance set up in server.js.
 * Returns undefined if running in a context where it isn't available
 * (e.g., scripts, unit tests).
 */
export function getIO(): IOServer | undefined {
  return globalThis.__socketIo;
}

export function emitToTournament(tournamentId: string, event: string, payload: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(`tournament:${tournamentId}`).emit(event, payload);
}
