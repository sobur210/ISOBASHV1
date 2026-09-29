import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionUser } from '../auth/session.model';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
@UseGuards(AuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('search')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowMs: 15 * 60 * 1000 })
  search(
    @CurrentUser() user: SessionUser,
    @Query('q') query = '',
    @Query('limit') limit?: string,
    @Query('kind') kind?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.knowledge.search(user.id, query, {
      ...(limit ? { limit: Number(limit) } : {}),
      ...(kind ? { kind } : {}),
      ...(projectId !== undefined ? { projectId: Number(projectId) } : {}),
    });
  }

  @Get('stats')
  stats(@CurrentUser() user: SessionUser) {
    return this.knowledge.stats(user.id);
  }
}
