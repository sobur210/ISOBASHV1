import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { ChatStreamRequestDto } from './dto/chat-stream-request.dto';

function requireSession(session?: string): string {
  if (!session || !session.trim()) {
    throw new BadRequestException('Missing x-client-session header.');
  }
  return session.trim();
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  listConversations(@Headers('x-client-session') session?: string) {
    return this.chat.listConversations(requireSession(session));
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string, @Headers('x-client-session') session?: string) {
    return this.chat.getConversation(requireSession(session), id);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  removeConversation(@Param('id') id: string, @Headers('x-client-session') session?: string) {
    return this.chat.removeConversation(requireSession(session), id);
  }

  @Post('stream')
  @HttpCode(200)
  stream(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: ChatStreamRequestDto,
    @Headers('x-client-session') session?: string,
  ) {
    const clientSession = requireSession(session);

    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const readable = Readable.from(this.chat.streamConversation(clientSession, body, controller.signal));
    readable.on('error', (error) => {
      if (!res.writableEnded) {
        res.write(ChatService.frame({ type: 'error', code: 'STREAM_FAILED', message: error instanceof Error ? error.message : 'Conversation generation failed.', messageId: undefined }));
      }
      res.end();
    });
    readable.pipe(res);
  }
}