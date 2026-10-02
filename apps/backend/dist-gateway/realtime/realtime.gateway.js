"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGateway = void 0;
const common_1 = require("@nestjs/common");
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const realtime_service_1 = require("./realtime.service");
const auth_service_1 = require("../auth/auth.service");
const prisma_service_1 = require("../prisma/prisma.service");
const session_model_1 = require("../auth/session.model");
let RealtimeGateway = class RealtimeGateway {
    realtime;
    auth;
    prisma;
    logger = new common_1.Logger('Realtime');
    constructor(realtime, auth, prisma) {
        this.realtime = realtime;
        this.auth = auth;
        this.prisma = prisma;
    }
    server;
    afterInit(server) {
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
    async handleConnection(client) {
        client.data.identityReady = this.identify(client).then((identity) => {
            client.data.identity = identity;
            return identity;
        });
        const identity = await client.data.identityReady;
        this.logger.log(JSON.stringify({ event: 'connect', socketId: client.id, userId: identity.userId }));
    }
    handleDisconnect(client) {
        this.logger.log(JSON.stringify({ event: 'disconnect', socketId: client.id, userId: this.identity(client).userId }));
    }
    handlePing(data) {
        return { event: 'pong', data: data ?? 'pong' };
    }
    /**
     * Room membership is an authorization decision, so the client is told the outcome
     * instead of being left to assume it joined. Note the `{ event, data }` shape:
     * the Socket.IO adapter emits `event` with `data` as the payload and ignores the
     * ack callback, so the decision has to travel inside `data`.
     */
    async handleJoinRoom(room, client) {
        if (typeof room !== 'string' || room.length > 200) {
            return { event: 'joined-room', data: { room: String(room), joined: false, reason: 'INVALID_ROOM' } };
        }
        const allowed = await this.mayJoin(client, room);
        if (!allowed) {
            this.logger.warn(JSON.stringify({ event: 'join-room-denied', socketId: client.id, room, userId: (await this.resolvedIdentity(client)).userId }));
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
    async mayJoin(client, room) {
        const { userId } = await this.resolvedIdentity(client);
        if (room.startsWith('user:')) {
            if (userId === null)
                return false;
            return room === `user:${userId}`;
        }
        if (room.startsWith('session:')) {
            const clientSessionId = room.slice('session:'.length);
            if (!clientSessionId || clientSessionId.length > 200)
                return false;
            const foreign = await this.prisma.conversation.findFirst({
                where: { clientSessionId, ...(userId === null ? {} : { userId: { not: userId } }) },
                select: { id: true },
            });
            return foreign === null;
        }
        return false;
    }
    /** Never authorizes on a half-resolved identity: an unset identity means denied. */
    async resolvedIdentity(client) {
        const pending = client.data?.identityReady;
        if (pending) {
            try {
                return await pending;
            }
            catch {
                return { userId: null, email: null };
            }
        }
        return this.identity(client);
    }
    identity(client) {
        const identity = client.data?.identity;
        return identity ?? { userId: null, email: null };
    }
    async identify(client) {
        const header = client.handshake?.headers?.cookie;
        if (typeof header !== 'string' || !header) {
            return { userId: null, email: null };
        }
        const match = new RegExp(`(?:^|;\\s*)${session_model_1.AUTH_COOKIE_NAME}=([^;]+)`).exec(header);
        if (!match) {
            return { userId: null, email: null };
        }
        try {
            const user = await this.auth.resolveUser(decodeURIComponent(match[1]));
            return user ? { userId: user.id, email: user.email } : { userId: null, email: null };
        }
        catch {
            return { userId: null, email: null };
        }
    }
    handleTaskCreated(payload) {
        this.server.emit('task-created', payload);
        return { event: 'task-created', data: payload };
    }
    handleNotification(payload) {
        this.server.emit('notification', payload);
        return { event: 'notification', data: payload };
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('ping'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], RealtimeGateway.prototype, "handlePing", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('join-room'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "handleJoinRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('task-created'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], RealtimeGateway.prototype, "handleTaskCreated", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('notification'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], RealtimeGateway.prototype, "handleNotification", null);
exports.RealtimeGateway = RealtimeGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: true }),
    __metadata("design:paramtypes", [realtime_service_1.RealtimeService,
        auth_service_1.AuthService,
        prisma_service_1.PrismaService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map