import { Body, Controller, Get, Module, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionUser } from '../auth/session.model';
import { AuditService } from '../security/audit.service';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard';
import { Json2VideoProvider } from '../ai/json2video.provider';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { ConfigModule } from '../shared/config/config.module';
import { StorageModule } from '../shared/storage/storage.module';
import { CreateAssemblyDto } from './dto/assembly.dto';
import { VideoAssemblyService } from './video-assembly.service';

/**
 * `POST /media/assembly`, mounted on its own path.
 *
 * Deliberately a different route from `/media/video-generations`. Sharing a
 * controller and a path prefix would have been less code, and it would also have
 * made an assembled slideshow and a generated clip indistinguishable to any client
 * that guessed the URL. Separate routes mean the UI can offer them as the two
 * different things they are, and neither can be reached by replaying the other's
 * request body.
 *
 * The controller stays thin: validate, call the service, audit. The rate limit is
 * 6 per hour per account rather than the 20 per 15 minutes video generation allows,
 * because each assembly is minutes of provider time against a grant of 600 seconds
 * that does not refill, so the ceiling is a budget question and not a load one.
 */
@Controller('media/assembly')
@UseGuards(AuthGuard)
export class VideoAssemblyController {
  constructor(
    private readonly assembly: VideoAssemblyService,
    private readonly audit: AuditService,
  ) {}

  @Get('capabilities')
  async capabilities() {
    return this.assembly.capabilities();
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 6, windowMs: 60 * 60 * 1000 })
  async start(@CurrentUser() user: SessionUser, @Body() body: CreateAssemblyDto) {
    const result = await this.assembly.start(user.id, body.projectId ?? null, body);
    await this.audit.log({
      category: 'SECURITY',
      action: 'video_assembly_requested',
      actorId: user.id,
      actorEmail: user.email,
      /**
       * The title is included because the audit trail has to be able to answer
       * "what did this account turn into a video, and when", but the scenes are
       * not: the body of a report is the user's private content and the assembly
       * row already holds the recipe that made it.
       */
      metadata: {
        provider: this.assembly.providerName(),
        source: body.source,
        sourceId: body.sourceId ?? null,
        title: body.title,
        resolution: body.resolution,
        voiceover: body.voiceover === true,
        durationMs: result.asset.durationMs,
        assetId: result.asset.id,
        projectId: result.projectId,
      },
    });
    return result;
  }
}

/**
 * A separate module, for the same reason the route is separate.
 *
 * `JSON2VIDEO_ENABLED` gates whether the provider can do anything at all, so this
 * module being imported by the app root does not mean assembly is on. Gating the
 * controller rather than the module keeps the wiring visible: an operator sees the
 * endpoint in the route table and gets a clear refusal, instead of a 404 that looks
 * like a typo. The provider reports `unconfigured` with an explanatory detail when
 * no key is set, which the UI shows as the reason the button is unavailable.
 */
@Module({
  imports: [AuthModule, ConfigModule, SecurityModule, StorageModule],
  controllers: [VideoAssemblyController],
  providers: [VideoAssemblyService, Json2VideoProvider],
  exports: [VideoAssemblyService],
})
export class VideoAssemblyModule {}
