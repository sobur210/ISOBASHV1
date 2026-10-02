import type { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ChatStreamRequestDto } from './dto/chat-stream-request.dto';
export declare class ChatController {
    private readonly chat;
    constructor(chat: ChatService);
    listConversations(session?: string): import(".prisma/client").Prisma.PrismaPromise<({
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
    getConversation(id: string, session?: string): Promise<{
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
    removeConversation(id: string, session?: string): Promise<void>;
    stream(req: Request, res: Response, body: ChatStreamRequestDto, session?: string): void;
}
