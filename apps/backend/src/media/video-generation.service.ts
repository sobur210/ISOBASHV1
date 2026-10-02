import { EntitlementsService } from '../billing/entitlements.service';
import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '../shared/errors/api-error';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AiProviderError, isProviderRefusal } from '../ai/provider.types';
import { AiRouterService } from '../ai/ai-router.service';
import { ProviderCreditService } from '../ai/provider-credit.service';
import { sniffVideo } from './video-bytes';
import { QueueService } from '../queues/queue.service';
import { VIDEO_RENDER_JOB, videoRenderQueueName } from './video-render-job';
import type { VideoRenderJobData } from './video-render-job';

export type StartVideoGeneration = {
  prompt: string;
  aspectRatio: string | null;
  durationSeconds: number;
  withAudio: boolean;
  projectId: number | null;
  model: string | null;
  /** A stored IMAGE asset of this account to use as the first frame. */
  sourceAssetId: string | null;
};

/** Provider error text is stored verbatim but bounded; the API returns it as-is. */
const MAX_ERROR_CHARS = 1000;

/**
 * Phase 14 video generation.
 *
 *   PENDING -> RUNNING -> COMPLETED | FAILED | CANCELLED
 *
 * The image phase's rules hold unchanged, because they were never about images:
 *  - an asset row exists only after its bytes are on disk, and the container,
 *    frame size, duration and audio flag recorded are read from those bytes, not
 *    from the provider's claim and not from the length that was requested;
 *  - a run is COMPLETED only when a real video container was decoded out of the
 *    payload. A refusal, a quota wall and a crash are all FAILED carrying the
 *    provider's own code and message;
 *  - a clip that came back shorter than was asked for is COMPLETED *and* says so
 *    in `warning`, so a truncated render is never read as the requested one.
 *
 * Two things differ from a still, both because a clip is not a still:
 *  - `MEDIA_VIDEO_MAX_CONCURRENT` renders may be in flight at once. A video model
 *    can hold a connection open for minutes, so an unbounded queue would turn one
 *    account's requests into a stall for everybody else;
 *  - a first frame has to be read out of storage and handed to the provider,
 *    which means an image-to-video run sends those bytes to a third party. That
 *    is disclosed in the asset's note rather than done quietly.
 *
 * A run is queued the moment it is accepted and executed by a worker, so a restart
 * mid-render cannot lose it, and `MEDIA_VIDEO_MAX_CONCURRENT` now bounds the worker
 * rather than this process. The inline path below is the fallback for a deployment
 * with no Redis, and the path a run takes when no renderer can be queued for it.
 */
@Injectable()
export class VideoGenerationService implements OnModuleDestroy {
  private readonly log = new Logger('VideoGeneration');
  private readonly running = new Map<string, AbortController>();
  private inFlight = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiRouterService,
    private readonly realtime: RealtimeService,
    private readonly credits: ProviderCreditService,
    private readonly queue: QueueService,
    private readonly entitlements: EntitlementsService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  onModuleDestroy() {
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
    // Anything still queued will never start; release the waiters so the process
    // can exit instead of hanging on a promise nobody will ever resolve.
    while (this.waiters.length > 0) this.waiters.shift()?.();
  }

  async start(userId: number, input: StartVideoGeneration) {
    await this.assertQuota(userId);
    const generation = await this.prisma.videoGeneration.create({
      data: {
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        requestedSeconds: input.durationSeconds,
        userId,
        projectId: input.projectId,
        sourceAssetId: input.sourceAssetId,
        status: 'PENDING',
      },
    });

    // Queued first, rendered by the worker, with one run always resolving to one
    // provider project. The queue is the normal path; the fallback keeps video
    // generation up when Redis is down, which is the difference between a degraded
    // deployment and a broken one.
    const data: VideoRenderJobData = {
      videoGenerationId: generation.id,
      userId,
      input,
      submittedAt: new Date().toISOString(),
    };
    // The renderer is chosen before the job is enqueued, because a job is only run by
    // a process that has that renderer: enqueueing a run nothing can serve would leave
    // it PENDING for ever, which reads as a render that is about to start. When no
    // renderer can take it, this process runs it inline instead, so the run fails with
    // the router's own reason rather than waiting on a worker that never comes.
    const renderer = await this.ai.resolveVideoProvider(input.model).catch((error: unknown) => {
      this.log.warn(`Could not resolve a video renderer for ${generation.id}: ${String(error)}`);
      return null;
    });
    const enqueued = renderer ? await this.enqueueRender(renderer, data).catch((error: unknown) => {
      this.log.warn(`Could not enqueue video render ${generation.id}: ${String(error)}`);
      return false;
    }) : false;
    if (!enqueued) {
      this.log.warn(`Video render ${generation.id} will run inline (no queue available).`);
      this.track(this.execute(generation.id, userId, input));
    }
    return generation;
  }

  /** Enqueue a render, refusing to queue the same run twice (`jobId` dedupes). */
  private async enqueueRender(provider: string, data: VideoRenderJobData): Promise<boolean> {
    if (!this.queue.isReady()) return false;
    await this.queue.addJob(
      VIDEO_RENDER_JOB,
      data as unknown as Record<string, unknown>,
      {
        // BullMQ forbids ":" in custom job ids (they clash with its key layout), so
        // the run's id is the dedupe key with a plain separator.
        jobId: `video-${data.videoGenerationId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 7 * 86400,
      },
      videoRenderQueueName(provider),
    );
    return true;
  }

  /** Request a cancel. The run stops at its next checkpoint and is never revived. */
  async cancel(userId: number, id: string) {
    const generation = await this.require(userId, id);
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(generation.status)) {
      return this.prisma.videoGeneration.findUnique({ where: { id } });
    }
    await this.prisma.videoGeneration.update({
      where: { id },
      data: { cancelRequestedAt: new Date() },
    });
    this.emit(userId, id, { status: generation.status, cancelRequested: true });
    this.running.get(id)?.abort();
    return this.prisma.videoGeneration.findUnique({ where: { id } });
  }

  private track(promise: Promise<void>) {
    promise.catch((error: unknown) => {
      this.log.error(`Video generation crashed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /**
   * Run one render to its terminal state.
   *
   * Runnable from the request process (inline fallback) and the worker (the normal
   * path), and idempotent against a retry: a run that already ended returns without
   * touching anything, and a run whose provider project already exists resumes it
   * instead of creating a second one.
   */
  async execute(generationId: string, userId: number, input: StartVideoGeneration) {
    const controller = new AbortController();
    this.running.set(generationId, controller);

    try {
      const existing = await this.prisma.videoGeneration.findUnique({
        where: { id: generationId },
        select: { status: true, providerProjectId: true },
      });
      if (existing && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(existing.status)) {
        this.log.warn(`Video render ${generationId} is already ${existing.status}; the retry does nothing.`);
        return;
      }
      // A queued job retried after a worker restart must not create a fresh provider
      // project for a render one already exists for: on a metered pool that is paying
      // twice for one clip. Read once here so the whole run below shares the decision.
      const resumedJobId = existing?.providerProjectId ?? undefined;
      if (resumedJobId) {
        this.log.log(`Resuming provider project ${resumedJobId} for ${generationId} rather than starting a new render.`);
      }
      if (await this.isCancelled(generationId)) {
        await this.finishCancelled(generationId, userId);
        return;
      }

      await this.prisma.videoGeneration.update({
        where: { id: generationId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      this.emit(userId, generationId, { status: 'RUNNING' });

      // The first frame is read before the provider is called so a missing or
      // corrupt asset fails the run with a real reason instead of after a render.
      let image: { mimeType: string; data: string } | undefined;
      if (input.sourceAssetId) {
        image = await this.loadSourceImage(userId, input.sourceAssetId);
      }

      if (await this.isCancelled(generationId)) {
        await this.finishCancelled(generationId, userId);
        return;
      }

      let response;
      let reservation: { model: string; estimated: number } | null = null;
      try {
        await this.acquireSlot();
        // Phase 15: priced and reserved against the shared provider pool *before*
        // anything is submitted. A render that cannot be paid for fails here, with
        // the reason, rather than after a multi-minute wait for a provider refusal.
        reservation = await this.credits.reserveIfAffordable({
          provider: 'magic-hour',
          videoGenerationId: generationId,
          userId,
          model: input.model,
          seconds: input.durationSeconds,
          withAudio: input.withAudio,
        });
        response = await this.ai.generateVideo({
          capability: 'video-generation',
          prompt: input.prompt,
          ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
          durationSeconds: input.durationSeconds,
          ...(input.model ? { model: input.model } : {}),
          ...(image ? { image } : {}),
          withAudio: input.withAudio,
          // Cancellation is honoured mid-render rather than only between runs, which
          // matters when a single render holds the user for minutes.
          signal: controller.signal,
          // A retried job resumes the render the provider already has instead of
          // paying to create a second one for the same clip.
          ...(resumedJobId ? { providerJobId: resumedJobId } : {}),
          onJobProgress: (update) => {
            this.recordProgress(generationId, userId, update);
          },
        });
      } catch (error) {
        const providerError =
          error instanceof AiProviderError
            ? error
            : new AiProviderError(
                error instanceof Error ? error.message : 'Video generation failed.',
                'router',
                'PROVIDER_UNAVAILABLE',
              );
        await this.fail(generationId, userId, providerError.code, providerError.message);
        // Only runs that reserved credits have a ledger row to settle. A refusal by
        // the pool guard happens before the reservation, so there is nothing to write
        // and nothing was spent.
        if (reservation) {
          // The provider's own project id, when the failure happened after Magic Hour
          // accepted the render. Without it a failed render is indistinguishable from
          // one refused before submission, and the ledger would have to guess whether
          // credits were actually spent.
          const projectId = providerError.providerProjectId;
          await this.credits
            .settleRun({
              videoGenerationId: generationId,
              succeeded: false,
              metering: projectId
                ? { providerProjectId: projectId, creditsCharged: null, creditsChargedIsEstimate: true }
                : null,
              error: providerError.message,
            })
            .catch((settleError: unknown) => {
              this.log.error(`Could not settle credits for ${generationId}: ${String(settleError)}`);
            });
        }
        this.log.warn(`Video generation ${generationId} FAILED (${providerError.code}): ${providerError.message}`);
        return;
      } finally {
        this.releaseSlot();
      }

      if (await this.isCancelled(generationId)) {
        await this.finishCancelled(generationId, userId);
        return;
      }

      if (!response.video.data) {
        const reason = response.finishReason ?? 'UNKNOWN';
        await this.fail(
          generationId,
          userId,
          'PROVIDER_REFUSED',
          isProviderRefusal(response.finishReason)
            ? `${response.provider} declined to render this clip. Its own finish reason was ${reason}. This is the provider's verdict, not a filter ISOBASH ran.`
            : `${response.provider} returned no video data. Finish reason: ${reason}.`,
          reason,
          { provider: response.provider, model: response.model },
        );
        return;
      }

      let assetId: string;
      let durationMs: number | null;
      try {
        const stored = await this.store(generationId, userId, input, response);
        assetId = stored.id;
        durationMs = stored.durationMs;
      } catch (error) {
        await this.fail(
          generationId,
          userId,
          'EMPTY_PROVIDER_RESPONSE',
          `${response.provider} answered with ${response.video.mimeType} but the bytes are not a video this can store. ${
            error instanceof Error ? error.message : 'The container could not be read.'
          }`.trim(),
          response.finishReason,
          { provider: response.provider, model: response.model },
        );
        return;
      }

      // A short render is a success with a caveat, not a silent downgrade: the
      // caller asked for N seconds and the header says fewer were produced.
      const notes: string[] = [];
      if (durationMs !== null && durationMs + 500 < input.durationSeconds * 1000) {
        notes.push(
          `The render is ${(durationMs / 1000).toFixed(2)}s, shorter than the ${input.durationSeconds}s requested.`,
        );
      }
      if (response.failovers && response.failovers.length > 0) notes.push(...response.failovers);
      const warning = notes.length > 0 ? notes.join(' ').slice(0, MAX_ERROR_CHARS) : null;

      await this.prisma.videoGeneration.update({
        where: { id: generationId },
        data: {
          status: 'COMPLETED',
          error: null,
          errorCode: null,
          warning,
          provider: response.provider,
          model: response.model,
          finishReason: response.finishReason ?? null,
          inputTokens: response.usage?.inputTokens,
          outputTokens: response.usage?.outputTokens,
          finishedAt: new Date(),
        },
      });
      this.emit(userId, generationId, { status: 'COMPLETED', assetId, warning });

      // Settled last, and only once the clip is on disk, so the ledger records a
      // charge for a render ISOBASH can actually show the user.
      if (reservation) {
        // The reservation was taken against Magic Hour, so only Magic Hour can settle
        // it. A render that failed over to another renderer never spent a single one of
        // those credits, and recording the fallback's free clip as a paid render would
        // overstate the month's spend and understate what is left.
        if (response.provider === 'magic-hour') {
          await this.credits
            .settleRun({ videoGenerationId: generationId, succeeded: true, metering: response.metering ?? null })
            .catch((settleError: unknown) => {
              this.log.error(`Could not settle credits for ${generationId}: ${String(settleError)}`);
            });
        } else {
          await this.credits
            .release(
              generationId,
              `${response.provider} rendered this instead of Magic Hour, so no Magic Hour credits were spent.`,
            )
            .catch((settleError: unknown) => {
              this.log.error(`Could not release credits for ${generationId}: ${String(settleError)}`);
            });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Video generation failed.';
      await this.fail(generationId, userId, 'GENERATION_FAILED', message);
      this.log.error(`Video generation ${generationId} crashed: ${message}`);
    } finally {
      this.running.delete(generationId);
    }
  }

  /**
   * Write the bytes first, then describe them. A row that claims a clip which is
   * not on disk would be a lie the player would happily render as broken.
   */
  private async store(
    generationId: string,
    userId: number,
    input: StartVideoGeneration,
    response: { provider: string; model: string; video: { mimeType: string; data: string; note?: string } },
  ): Promise<{ id: string; durationMs: number | null }> {
    const bytes = Buffer.from(response.video.data, 'base64');
    if (bytes.byteLength === 0) {
      throw new Error('the provider returned an empty video payload.');
    }
    if (bytes.byteLength > this.config.media.video.maxVideoBytes) {
      throw new Error(`it is ${bytes.byteLength} bytes, over the ${this.config.media.video.maxVideoBytes} byte ceiling.`);
    }
    const sniffed = sniffVideo(bytes);
    if (!sniffed) {
      throw new Error(
        `its bytes are not an MP4, MOV or WebM video with a video track, so nothing claimed they were (provider said ${response.video.mimeType}).`,
      );
    }

    const relativePath = this.relativePathFor(userId, sniffed.extension);
    await this.storage.write('media', relativePath, bytes);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        kind: 'VIDEO',
        relativePath,
        mimeType: sniffed.mimeType,
        sizeBytes: bytes.byteLength,
        width: sniffed.width,
        height: sniffed.height,
        durationMs: sniffed.durationMs,
        hasAudio: sniffed.hasAudio,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        note: response.video.note ?? null,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        provider: response.provider,
        model: response.model,
        userId,
        projectId: input.projectId,
        videoGenerationId: generationId,
      },
    });
    this.emit(userId, generationId, { status: 'RUNNING', assetId: asset.id });
    return { id: asset.id, durationMs: sniffed.durationMs };
  }

  /**
   * Read a stored image back out to hand to the provider as the first frame. The
   * asset has to be this account's and has to be an image: an id that names
   * someone else's clip is not a first frame.
   */
  private async loadSourceImage(userId: number, assetId: string): Promise<{ mimeType: string; data: string }> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, userId, kind: 'IMAGE' },
      select: { relativePath: true, mimeType: true, sha256: true },
    });
    if (!asset) {
      throw new ApiError('The first-frame image was not found in your media library.', 400, 'VALIDATION_FAILED');
    }
    const bytes = await this.storage.read('media', asset.relativePath);
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
      throw new ApiError(
        'The first-frame image no longer matches its recorded checksum, so it cannot be used. Delete it and pick another.',
        400,
        'ASSET_CORRUPT',
      );
    }
    return { mimeType: asset.mimeType, data: bytes.toString('base64') };
  }

  /** A server-generated path; nothing a provider or caller supplied reaches the disk. */
  private relativePathFor(userId: number, extension: string): string {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return `user-${userId}/${month}/${randomUUID()}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  }

  private async isCancelled(generationId: string): Promise<boolean> {
    if (this.running.get(generationId)?.signal.aborted) return true;
    const row = await this.prisma.videoGeneration.findUnique({
      where: { id: generationId },
      select: { cancelRequestedAt: true },
    });
    return row?.cancelRequestedAt != null;
  }

  /**
   * Record the provider's own view of a render as it changes.
   *
   * Two things are stored here and they are not the same thing. The provider's
   * project id is written the first time it is seen and never overwritten, because it
   * is what lets a retried job resume rather than pay for a second render. The
   * percentage is written only when the provider actually reports one, so a provider
   * that reports no progress leaves the column null instead of ISOBASH inventing a
   * number it cannot know.
   *
   * Fire-and-forget by design: this runs on the provider's poll callback, and a slow
   * or failed write must not be able to slow down or fail the render it describes.
   */
  private recordProgress(generationId: string, userId: number, update: { id: string; status: string; progressPercent: number | null }): void {
    this.prisma.videoGeneration
      .updateMany({
        where: { id: generationId, providerProjectId: null },
        data: { providerProjectId: update.id },
      })
      .catch((error: unknown) => {
        this.log.error(`Could not record provider project for ${generationId}: ${String(error)}`);
      });
    if (update.progressPercent === null) return;
    this.prisma.videoGeneration
      .updateMany({ where: { id: generationId }, data: { progressPercent: update.progressPercent } })
      .catch((error: unknown) => {
        this.log.error(`Could not record progress for ${generationId}: ${String(error)}`);
      });
    this.emit(userId, generationId, { status: 'RUNNING', progress: update.progressPercent });
  }

  private async finishCancelled(generationId: string, userId: number) {
    await this.prisma.videoGeneration.update({
      where: { id: generationId },
      data: { status: 'CANCELLED', error: null, errorCode: null, finishedAt: new Date() },
    });
    this.emit(userId, generationId, { status: 'CANCELLED' });
  }

  private async fail(
    generationId: string,
    userId: number,
    code: string,
    message: string,
    finishReason?: string,
    provider?: { provider: string; model: string },
  ) {
    await this.prisma.videoGeneration.update({
      where: { id: generationId },
      data: {
        status: 'FAILED',
        error: message.slice(0, MAX_ERROR_CHARS),
        errorCode: code,
        warning: null,
        finishReason: finishReason ?? null,
        ...(provider ?? {}),
        finishedAt: new Date(),
      },
    });
    this.emit(userId, generationId, { status: 'FAILED', code, error: message });
  }

  /**
   * Bound how many video renders this process will have open at once. A clip can
   * hold a provider connection open for minutes; without a ceiling a handful of
   * requests would starve every other feature sharing the event loop.
   */
  private acquireSlot(): Promise<void> {
    if (this.inFlight < this.config.media.video.maxConcurrent) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  private releaseSlot() {
    if (this.inFlight > 0) this.inFlight -= 1;
    this.waiters.shift()?.();
  }

  private async assertQuota(userId: number) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recent, assets, aggregate] = await Promise.all([
      this.prisma.videoGeneration.count({ where: { userId, createdAt: { gte: hourAgo } } }),
      this.prisma.mediaAsset.count({ where: { userId } }),
      this.prisma.mediaAsset.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
    ]);
    if (recent >= this.config.media.video.generationsPerHour) {
      throw new ApiError(
        `This account started ${recent} video generation(s) in the last hour (limit ${this.config.media.video.generationsPerHour}). A render takes minutes, not seconds, so try again later.`,
        429,
        'RATE_LIMITED',
      );
    }
    // Phase 16: the quota is this account's entitlement (plan limit clamped to the
    // deployment ceiling), so a plan change takes effect on the next request.
    const entitlements = await this.entitlements.forUser(userId);
    const maxAssets = entitlements.limits.mediaAssets.value;
    const maxBytes = entitlements.limits.mediaBytes.value;
    if (assets >= maxAssets) {
      throw new ApiError(
        `This account already stores ${assets} media file(s) (limit ${maxAssets} on the ${entitlements.plan} plan). Delete one before rendering another clip.`,
        413,
        'MEDIA_QUOTA_EXCEEDED',
      );
    }
    const used = aggregate._sum.sizeBytes ?? 0;
    if (used >= maxBytes) {
      throw new ApiError(
        `This account stores ${used} bytes of media, at the ${maxBytes} byte quota on the ${entitlements.plan} plan.`,
        413,
        'MEDIA_QUOTA_EXCEEDED',
      );
    }
  }

  private async require(userId: number, id: string) {
    const generation = await this.prisma.videoGeneration.findFirst({ where: { id, userId } });
    if (!generation) {
      throw new NotFoundException('Video generation not found.');
    }
    return generation;
  }

  private emit(userId: number, generationId: string, payload: Record<string, unknown>) {
    this.realtime.emitToUser(userId, 'video:generation', { generationId, ...payload });
  }
}
