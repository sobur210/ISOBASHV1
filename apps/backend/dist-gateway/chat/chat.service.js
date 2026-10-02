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
var ChatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const ai_router_service_1 = require("../ai/ai-router.service");
const prisma_service_1 = require("../prisma/prisma.service");
const realtime_service_1 = require("../realtime/realtime.service");
let ChatService = ChatService_1 = class ChatService {
    prisma;
    ai;
    realtime;
    constructor(prisma, ai, realtime) {
        this.prisma = prisma;
        this.ai = ai;
        this.realtime = realtime;
    }
    static frame(event) {
        return `${JSON.stringify(event)}\n`;
    }
    listConversations(session) {
        return this.prisma.conversation.findMany({
            where: { clientSessionId: session },
            orderBy: { updatedAt: 'desc' },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { role: true, content: true, createdAt: true },
                },
            },
        });
    }
    async getConversation(session, id) {
        const conversation = await this.prisma.conversation.findFirst({
            where: { id, clientSessionId: session },
        });
        if (!conversation) {
            throw new common_1.NotFoundException('Conversation not found.');
        }
        const messages = await this.prisma.message.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'asc' },
            select: { id: true, role: true, content: true, provider: true, model: true, error: true, createdAt: true },
        });
        return { conversation, messages };
    }
    async removeConversation(session, id) {
        const conversation = await this.prisma.conversation.findFirst({
            where: { id, clientSessionId: session },
        });
        if (!conversation) {
            throw new common_1.NotFoundException('Conversation not found.');
        }
        await this.prisma.conversation.delete({ where: { id } });
    }
    async *streamConversation(session, request, signal) {
        const isNew = !request.conversationId;
        let conversation = request.conversationId
            ? await this.ownedConversation(session, request.conversationId)
            : await this.prisma.conversation.create({ data: { clientSessionId: session } });
        const userMessage = await this.prisma.message.create({
            data: { conversationId: conversation.id, role: 'user', content: request.input },
        });
        if (isNew || conversation.title === 'New conversation') {
            const title = request.input.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New conversation';
            conversation = await this.prisma.conversation.update({
                where: { id: conversation.id },
                data: { title },
            });
        }
        // Phase 9: the routing decision is part of the stream so the UI can show
        // which model answered and why, instead of guessing from the provider name.
        const plan = await this.ai.plan({ capability: 'language', model: request.model });
        yield ChatService_1.frame({
            type: 'meta',
            conversationId: conversation.id,
            conversationTitle: conversation.title,
            userMessageId: userMessage.id,
            routing: {
                provider: plan.selected?.provider ?? 'none',
                model: plan.selected?.model ?? 'none',
                mode: plan.request.mode ?? this.ai.mode(),
                strict: plan.strict,
                candidates: plan.candidates.filter((candidate) => candidate.eligible).length,
                explanation: plan.explanation,
            },
        });
        let captured = '';
        let assistantId;
        try {
            for await (const chunk of this.ai.stream({ capability: 'language', input: request.input, model: request.model }, signal)) {
                if (chunk.type === 'delta') {
                    captured += chunk.text;
                    yield ChatService_1.frame({ type: 'delta', text: chunk.text });
                }
                else if (chunk.type === 'done') {
                    const saved = await this.prisma.message.create({
                        data: {
                            conversationId: conversation.id,
                            role: 'assistant',
                            content: captured,
                            provider: chunk.provider,
                            model: chunk.model,
                            inputTokens: chunk.usage?.inputTokens,
                            outputTokens: chunk.usage?.outputTokens,
                        },
                    });
                    assistantId = saved.id;
                    yield ChatService_1.frame({
                        type: 'done',
                        messageId: saved.id,
                        conversationId: conversation.id,
                        provider: chunk.provider,
                        model: chunk.model,
                        usage: chunk.usage,
                    });
                }
                else {
                    const saved = await this.prisma.message.create({
                        data: { conversationId: conversation.id, role: 'assistant', content: captured, error: chunk.message },
                    });
                    assistantId = saved.id;
                    yield ChatService_1.frame({ type: 'error', code: chunk.code, message: chunk.message, messageId: saved.id });
                }
            }
        }
        catch (error) {
            if (signal?.aborted) {
                yield ChatService_1.frame({ type: 'error', code: 'STREAM_ABORTED', message: 'Generation stopped.' });
                return;
            }
            const message = error instanceof Error ? error.message : 'Conversation generation failed.';
            const saved = await this.prisma.message.create({
                data: { conversationId: conversation.id, role: 'assistant', content: captured, error: message },
            });
            assistantId = saved.id;
            yield ChatService_1.frame({ type: 'error', code: 'STREAM_FAILED', message, messageId: saved.id });
        }
        if (assistantId) {
            this.realtime.emitToSession(session, 'chat:updated', {
                conversationId: conversation.id,
                messageId: assistantId,
                role: 'assistant',
            });
        }
    }
    async ownedConversation(session, id) {
        const conversation = await this.prisma.conversation.findFirst({
            where: { id, clientSessionId: session },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
        });
        if (!conversation) {
            throw new common_1.NotFoundException('Conversation not found.');
        }
        return conversation;
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = ChatService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_router_service_1.AiRouterService,
        realtime_service_1.RealtimeService])
], ChatService);
//# sourceMappingURL=chat.service.js.map