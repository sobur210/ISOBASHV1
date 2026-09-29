import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionUser } from '../auth/session.model';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryService } from './memory.service';

@Controller('memory')
@UseGuards(AuthGuard)
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query('agentId') agentId?: string,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    return this.memory.list(
      { userId: user.id, ...(agentId ? { agentId } : {}) },
      { ...(query ? { query } : {}), ...(limit ? { limit: Number(limit) } : {}) },
    );
  }

  @Get('stats')
  stats(@CurrentUser() user: SessionUser) {
    return this.memory.stats(user.id);
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 120, windowMs: 15 * 60 * 1000 })
  create(@CurrentUser() user: SessionUser, @Body() body: CreateMemoryDto) {
    return this.memory.create(
      { userId: user.id, ...(body.agentId ? { agentId: body.agentId } : {}) },
      { content: body.content, ...(body.kind ? { kind: body.kind } : {}) },
    );
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.memory.remove({ userId: user.id }, id);
  }
}
