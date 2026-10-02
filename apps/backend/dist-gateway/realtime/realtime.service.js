"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeService = void 0;
const common_1 = require("@nestjs/common");
let RealtimeService = class RealtimeService {
    server = null;
    attach(server) {
        this.server = server;
    }
    emitToSession(session, event, payload) {
        if (!this.server)
            return;
        this.server.to(`session:${session}`).emit(event, payload);
    }
    /** Phase 10: user-scoped room for agent run progress and notifications. */
    emitToUser(userId, event, payload) {
        if (!this.server)
            return;
        this.server.to(`user:${userId}`).emit(event, payload);
    }
};
exports.RealtimeService = RealtimeService;
exports.RealtimeService = RealtimeService = __decorate([
    (0, common_1.Injectable)()
], RealtimeService);
//# sourceMappingURL=realtime.service.js.map