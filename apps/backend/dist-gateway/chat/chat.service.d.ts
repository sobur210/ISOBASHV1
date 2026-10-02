import { AiRouterService } from '../ai/ai-router.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ChatStreamRequestDto } from './dto/chat-stream-request.dto';
export type ChatStreamEvent = {
    type: 'meta';
    conversationId: string;
    conversationTitle: string;
    userMessageId: string;
    routing?: {
        provider: string;
        model: string;
        mode: string;
        strict: boolean;
        candidates: number;
        explanation: string;
    };
} | {
    type: 'delta';
    text: string;
} | {
    type: 'done';
    messageId: string;
    conversationId: string;
    provider: string;
    model: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
} | {
    type: 'error';
    code: string;
    message: string;
    messageId?: string;
};
export declare class ChatService {
    private readonly prisma;
    private readonly ai;
    private readonly realtime;
    constructor(prisma: PrismaService, ai: AiRouterService, realtime: RealtimeService);
    static frame(event: ChatStreamEvent): string;
    listConversations(session: string): import(".prisma/client").Prisma.PrismaPromise<({
        messages: {
            createdAt: Date;
            content: string;
            role: string;
        }[];
    } & {
        id: string;
        status: string;
        createdAt: Date;
        title: string;
        updatedAt: Date;
        userId: number | null;
        projectId: number | null;
        clientSessionId: string;
    })[]>;
    getConversation(session: string, id: string): Promise<{
        conversation: {
            id: string;
            status: string;
            createdAt: Date;
            title: string;
            updatedAt: Date;
            userId: number | null;
            projectId: number | null;
            clientSessionId: string;
        };
        messages: {
            error: string | null;
            id: string;
            provider: string | null;
            model: string | null;
            createdAt: Date;
            content: string;
            role: string;
        }[];
    }>;
    removeConversation(session: string, id: string): Promise<void>;
    streamConversation(session: string, request: ChatStreamRequestDto, signal?: AbortSignal): AsyncGenerator<string>;
    private ownedConversation;
}
