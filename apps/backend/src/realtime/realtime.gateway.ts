import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_COOKIE_NAME } from '../auth/session.model';

type SocketIdentity = { userId: number | null; email: string | null };

type JoinRoomResult = { room: string; joined: boolean; reason?: string };

@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Realtime');

  constructor(
    private readonly realtime: RealtimeService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @WebSocketServer()
  server!: Server;

  afterInit(server: Server) {
    this.realtime.attach(server);
  }

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
  async handleConnection(client: Socket) {
    client.data.identityReady = this.identify(client).then((identity: SocketIdentity) => {
      client.data.identity = identity;
      return identity;
    });
    const identity = await client.data.identityReady;
    this.logger.log(
      JSON.stringify({ event: 'connect', socketId: client.id, userId: identity.userId }),
    );
  }

  handleDisconnect(client: Socket) {
    this.logger.log(
      JSON.stringify({ event: 'disconnect', socketId: client.id, userId: this.identity(client).userId }),
    );
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: unknown): { event: string; data: unknown } {
    return { event: 'pong', data: data ?? 'pong' };
  }

  /**
   * Room membership is an authorization decision, so the client is told the outcome
   * instead of being left to assume it joined. Note the `{ event, data }` shape:
   * the Socket.IO adapter emits `event` with `data` as the payload and ignores the
   * ack callback, so the decision has to travel inside `data`.
   */
  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ): Promise<{ event: string; data: JoinRoomResult }> {
    if (typeof room !== 'string' || room.length > 200) {
      return { event: 'joined-room', data: { room: String(room), joined: false, reason: 'INVALID_ROOM' } };
    }
    const allowed = await this.mayJoin(client, room);
    if (!allowed) {
      this.logger.warn(
        JSON.stringify({ event: 'join-room-denied', socketId: client.id, room, userId: (await this.resolvedIdentity(client)).userId }),
      );
      return { event: 'joined-room', data: { room, joined: false, reason: 'FORBIDDEN' } };
    }
    await client.join(room);
    return { event: 'joined-room', data: { room, joined: true } };
  }

  /**
   * `user:<id>` requires the socket to be that user. `session:<clientSessionId>`
   * is allowed unless another account already owns conversations under that id,
   * which is what stops a guessed id from being used to tail someone else's chat.
   */
  private async mayJoin(client: Socket, room: string): Promise<boolean> {
    const { userId } = await this.resolvedIdentity(client);
    if (room.startsWith('user:')) {
      if (userId === null) return false;
      return room === `user:${userId}`;
    }
    if (room.startsWith('session:')) {
      const clientSessionId = room.slice('session:'.length);
      if (!clientSessionId || clientSessionId.length > 200) return false;
      const foreign = await this.prisma.conversation.findFirst({
        where: { clientSessionId, ...(userId === null ? {} : { userId: { not: userId } }) },
        select: { id: true },
      });
      return foreign === null;
    }
    return false;
  }

  /** Never authorizes on a half-resolved identity: an unset identity means denied. */
  private async resolvedIdentity(client: Socket): Promise<SocketIdentity> {
    const pending = client.data?.identityReady as Promise<SocketIdentity> | undefined;
    if (pending) {
      try {
        return await pending;
      } catch {
        return { userId: null, email: null };
      }
    }
    return this.identity(client);
  }

  private identity(client: Socket): SocketIdentity {
    const identity = client.data?.identity as SocketIdentity | undefined;
    return identity ?? { userId: null, email: null };
  }

  private async identify(client: Socket): Promise<SocketIdentity> {
    const header = client.handshake?.headers?.cookie;
    if (typeof header !== 'string' || !header) {
      return { userId: null, email: null };
    }
    const match = new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`).exec(header);
    if (!match) {
      return { userId: null, email: null };
    }
    try {
      const user = await this.auth.resolveUser(decodeURIComponent(match[1]));
      return user ? { userId: user.id, email: user.email } : { userId: null, email: null };
    } catch {
      return { userId: null, email: null };
    }
  }

  @SubscribeMessage('task-created')
  handleTaskCreated(@MessageBody() payload: unknown): { event: string; data: unknown } {
    this.server.emit('task-created', payload);
    return { event: 'task-created', data: payload };
  }

  @SubscribeMessage('notification')
  handleNotification(@MessageBody() payload: unknown): { event: string; data: unknown } {
    this.server.emit('notification', payload);
    return { event: 'notification', data: payload };
  }
}
