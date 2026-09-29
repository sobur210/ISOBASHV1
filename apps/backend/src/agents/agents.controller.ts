import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionUser } from '../auth/session.model';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard';
import { AgentRunnerService } from './agent-runner.service';
import { AgentsService } from './agents.service';
import { CreateAgentDto, StartAgentRunDto, UpdateAgentDto } from './dto/agent.dto';

@Controller('agents')
@UseGuards(AuthGuard)
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly runner: AgentRunnerService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.agents.list(user.id);
  }

  @Get('runs/:runId')
  getRun(@CurrentUser() user: SessionUser, @Param('runId') runId: string) {
    return this.runner.getRun(user.id, runId);
  }

  @Post('runs/:runId/cancel')
  @HttpCode(200)
  cancelRun(@CurrentUser() user: SessionUser, @Param('runId') runId: string) {
    return this.runner.cancel(user, runId);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.agents.get(user.id, id);
  }

  @Get(':id/runs')
  listRuns(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.runner.listRuns(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: CreateAgentDto) {
    return this.agents.create(user.id, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: UpdateAgentDto) {
    return this.agents.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.agents.remove(user.id, id);
  }

  /** Model calls are metered per user so one agent cannot burn the whole quota. */
  @Post(':id/runs')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 15 * 60 * 1000 })
  startRun(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: StartAgentRunDto) {
    return this.runner.start(user, id, body.input);
  }
}
