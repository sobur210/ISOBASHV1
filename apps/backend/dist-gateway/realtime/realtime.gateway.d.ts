import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
type JoinRoomResult = {
    room: string;
    joined: boolean;
    reason?: string;
};
export declare class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly realtime;
    private readonly auth;
    private readonly prisma;
    private readonly logger;
    constructor(realtime: RealtimeService, auth: AuthService, prisma: PrismaService);
    server: Server;
    afterInit(server: Server): void;
    /**
     * Identify the socket from its session cookie.
     *
     * Room membership is an authorization decision, so it cannot be left to the
     * client: before Phase 10 any socket could `join-room` any id and read another
     * user's chat stream or (once user rooms existed) another user's agent runs.
     * The identity is resolved once here and the cookie is never trusted again.
     *
     * The lookup is asynchronous, and a client can emit a message before it settles,
     * so the in-flight promise is published immediately: every authorization check
     * awaits it. Without that, a legitimate owner racing its own first message is
     * treated as anonymous and silently denied its own room.
     */
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): void;
    handlePing(data: unknown): {
        event: string;
        data: unknown;
    };
    /**
     * Room membership is an authorization decision, so the client is told the outcome
     * instead of being left to assume it joined. Note the `{ event, data }` shape:
     * the Socket.IO adapter emits `event` with `data` as the payload and ignores the
     * ack callback, so the decision has to travel inside `data`.
     */
    handleJoinRoom(room: string, client: Socket): Promise<{
        event: string;
        data: JoinRoomResult;
    }>;
    /**
     * `user:<id>` requires the socket to be that user. `session:<clientSessionId>`
     * is allowed unless another account already owns conversations under that id,
     * which is what stops a guessed id from being used to tail someone else's chat.
     */
    private mayJoin;
    /** Never authorizes on a half-resolved identity: an unset identity means denied. */
    private resolvedIdentity;
    private identity;
    private identify;
    handleTaskCreated(payload: unknown): {
        event: string;
        data: unknown;
    };
    handleNotification(payload: unknown): {
        event: string;
        data: unknown;
    };
}
export {};
