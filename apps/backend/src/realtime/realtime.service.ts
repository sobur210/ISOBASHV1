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
}