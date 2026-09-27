import { Injectable, NotFoundException } from '@nestjs/common';
import { AiRouterService } from '../ai/ai-router.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ChatStreamRequestDto } from './dto/chat-stream-request.dto';

export type ChatStreamEvent =
  | { type: 'meta'; conversationId: string; conversationTitle: string; userMessageId: string; routing?: { provider: string; model: string; mode: string; strict: boolean; candidates: number; explanation: string } }
  | { type: 'delta'; text: string }
  | { type: 'done'; messageId: string; conversationId: string; provider: string; model: string; usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: 'error'; code: string; message: string; messageId?: string };

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiRouterService,
    private readonly realtime: RealtimeService,
  ) {}

  static frame(event: ChatStreamEvent): string {
    return `${JSON.stringify(event)}\n`;
  }

  listConversations(session: string) {
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

  async getConversation(session: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, clientSessionId: session },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    const messages = await this.prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, provider: true, model: true, error: true, createdAt: true },
    });
    return { conversation, messages };
  }

  async removeConversation(session: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, clientSessionId: session },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    await this.prisma.conversation.delete({ where: { id } });
  }

  async *streamConversation(
    session: string,
    request: ChatStreamRequestDto,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
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

    yield ChatService.frame({
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
    let assistantId: string | undefined;

    try {
      for await (const chunk of this.ai.stream({ capability: 'language', input: request.input, model: request.model }, signal)) {
        if (chunk.type === 'delta') {
          captured += chunk.text;
          yield ChatService.frame({ type: 'delta', text: chunk.text });
        } else if (chunk.type === 'done') {
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
          yield ChatService.frame({
            type: 'done',
            messageId: saved.id,
            conversationId: conversation.id,
            provider: chunk.provider,
            model: chunk.model,
            usage: chunk.usage,
          });
        } else {
          const saved = await this.prisma.message.create({
            data: { conversationId: conversation.id, role: 'assistant', content: captured, error: chunk.message },
          });
          assistantId = saved.id;
          yield ChatService.frame({ type: 'error', code: chunk.code, message: chunk.message, messageId: saved.id });
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        yield ChatService.frame({ type: 'error', code: 'STREAM_ABORTED', message: 'Generation stopped.' });
        return;
      }
      const message = error instanceof Error ? error.message : 'Conversation generation failed.';
      const saved = await this.prisma.message.create({
        data: { conversationId: conversation.id, role: 'assistant', content: captured, error: message },
      });
      assistantId = saved.id;
      yield ChatService.frame({ type: 'error', code: 'STREAM_FAILED', message, messageId: saved.id });
    }

    if (assistantId) {
      this.realtime.emitToSession(session, 'chat:updated', {
        conversationId: conversation.id,
        messageId: assistantId,
        role: 'assistant',
      });
    }
  }

  private async ownedConversation(session: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, clientSessionId: session },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    return conversation;
  }
}