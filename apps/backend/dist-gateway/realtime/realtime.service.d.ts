import { Server } from 'socket.io';
export declare class RealtimeService {
    private server;
    attach(server: Server): void;
    emitToSession(session: string, event: string, payload: unknown): void;
    /** Phase 10: user-scoped room for agent run progress and notifications. */
    emitToUser(userId: number, event: string, payload: unknown): void;
}
