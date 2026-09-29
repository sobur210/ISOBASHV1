import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionUser } from '../auth/session.model';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard';
import { StartResearchDto } from './dto/research.dto';
import { ResearchService } from './research.service';

@Controller('research')
@UseGuards(AuthGuard)
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  /** What research can actually do right now, reported honestly. */
  @Get('capabilities')
  capabilities() {
    return this.research.capabilities();
  }

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.research.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.research.get(user.id, id);
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 15 * 60 * 1000 })
  start(@CurrentUser() user: SessionUser, @Body() body: StartResearchDto) {
    return this.research.start(user, {
      question: body.question,
      ...(body.urls ? { urls: body.urls } : {}),
      ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
      ...(body.model ? { model: body.model } : {}),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.research.remove(user.id, id);
  }
}
