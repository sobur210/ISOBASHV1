import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  emitToSession(session: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`session:${session}`).emit(event, payload);
  }

  /** Phase 10: user-scoped room for agent run progress and notifications. */
  emitToUser(userId: number, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
