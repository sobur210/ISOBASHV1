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
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const node_stream_1 = require("node:stream");
const chat_service_1 = require("./chat.service");
const chat_stream_request_dto_1 = require("./dto/chat-stream-request.dto");
function requireSession(session) {
    if (!session || !session.trim()) {
        throw new common_1.BadRequestException('Missing x-client-session header.');
    }
    return session.trim();
}
let ChatController = class ChatController {
    chat;
    constructor(chat) {
        this.chat = chat;
    }
    listConversations(session) {
        return this.chat.listConversations(requireSession(session));
    }
    getConversation(id, session) {
        return this.chat.getConversation(requireSession(session), id);
    }
    removeConversation(id, session) {
        return this.chat.removeConversation(requireSession(session), id);
    }
    stream(req, res, body, session) {
        const clientSession = requireSession(session);
        res.setHeader('content-type', 'text/event-stream');
        res.setHeader('cache-control', 'no-cache, no-transform');
        res.setHeader('connection', 'keep-alive');
        res.setHeader('x-accel-buffering', 'no');
        res.flushHeaders();
        const controller = new AbortController();
        req.on('close', () => controller.abort());
        const readable = node_stream_1.Readable.from(this.chat.streamConversation(clientSession, body, controller.signal));
        readable.on('error', (error) => {
            if (!res.writableEnded) {
                res.write(chat_service_1.ChatService.frame({ type: 'error', code: 'STREAM_FAILED', message: error instanceof Error ? error.message : 'Conversation generation failed.', messageId: undefined }));
            }
            res.end();
        });
        readable.pipe(res);
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Get)('conversations'),
    __param(0, (0, common_1.Headers)('x-client-session')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "listConversations", null);
__decorate([
    (0, common_1.Get)('conversations/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Headers)('x-client-session')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "getConversation", null);
__decorate([
    (0, common_1.Delete)('conversations/:id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Headers)('x-client-session')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "removeConversation", null);
__decorate([
    (0, common_1.Post)('stream'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-client-session')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, chat_stream_request_dto_1.ChatStreamRequestDto, String]),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "stream", null);
exports.ChatController = ChatController = __decorate([
    (0, common_1.Controller)('chat'),
    __metadata("design:paramtypes", [chat_service_1.ChatService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map