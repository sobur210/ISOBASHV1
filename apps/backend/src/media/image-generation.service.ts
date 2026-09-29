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
import { sniffImage } from './media-images';

export type StartImageGeneration = {
  prompt: string;
  aspectRatio: string | null;
  count: number;
  projectId: number | null;
  model: string | null;
};

/** Provider error text is stored verbatim but bounded; the API returns it as-is. */
const MAX_ERROR_CHARS = 1000;

/**
 * Phase 13 image generation.
 *
 *   PENDING -> RUNNING -> COMPLETED | FAILED | CANCELLED
 *
 * The state is written as it happens so a client polling the run sees real
 * progress. Three rules hold throughout:
 *  - an asset row is only created after its bytes are on disk, and the type and
 *    dimensions recorded are read from those bytes, not from the provider's claim;
 *  - a run is COMPLETED only when at least one image was really produced. A
 *    provider refusal (its own `IMAGE_SAFETY` verdict), a quota refusal and a
 *    genuine failure are all recorded as FAILED with the provider's code, never
 *    as an empty success;
 *  - a run that produced fewer images than were asked for is COMPLETED *and* says
 *    so in `warning`, so a partial result is never read as a full one.
 *
 * Runs execute in this process. Moving them onto the BullMQ worker is Phase 15,
 * and is the reason `cancel` is honoured at checkpoints rather than by aborting a
 * provider call that is already in flight.
 */
@Injectable()
export class ImageGenerationService implements OnModuleDestroy {
  private readonly log = new Logger('ImageGeneration');
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiRouterService,
    private readonly realtime: RealtimeService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  onModuleDestroy() {
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
  }

  async start(userId: number, input: StartImageGeneration) {
    await this.assertQuota(userId, input.count);
    const generation = await this.prisma.imageGeneration.create({
      data: {
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        requestedCount: input.count,
        userId,
        projectId: input.projectId,
        status: 'PENDING',
      },
    });
    this.track(this.execute(generation.id, userId, input));
    return generation;
  }

  /** Request a cancel. The run stops at its next checkpoint and is never revived. */
  async cancel(userId: number, id: string) {
    const generation = await this.require(userId, id);
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(generation.status)) {
      return this.prisma.imageGeneration.findUnique({ where: { id } });
    }
    await this.prisma.imageGeneration.update({
      where: { id },
      data: { cancelRequestedAt: new Date() },
    });
    this.emit(userId, id, { status: generation.status, cancelRequested: true });
    this.running.get(id)?.abort();
    return this.prisma.imageGeneration.findUnique({ where: { id } });
  }

  private track(promise: Promise<void>) {
    promise.catch((error: unknown) => {
      this.log.error(`Image generation crashed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async execute(generationId: string, userId: number, input: StartImageGeneration) {
    const controller = new AbortController();
    this.running.set(generationId, controller);

    try {
      if (await this.isCancelled(generationId)) {
        await this.finishCancelled(generationId, userId);
        return;
      }

      await this.prisma.imageGeneration.update({
        where: { id: generationId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      this.emit(userId, generationId, { status: 'RUNNING' });

      let response;
      try {
        response = await this.ai.generateImage({
          capability: 'image-generation',
          prompt: input.prompt,
          ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
          count: input.count,
          ...(input.model ? { model: input.model } : {}),
        });
      } catch (error) {
        const providerError =
          error instanceof AiProviderError
            ? error
            : new AiProviderError(
                error instanceof Error ? error.message : 'Image generation failed.',
                'router',
                'PROVIDER_UNAVAILABLE',
              );
        await this.fail(generationId, userId, providerError.code, providerError.message);
        this.log.warn(`Image generation ${generationId} FAILED (${providerError.code}): ${providerError.message}`);
        return;
      }

      if (await this.isCancelled(generationId)) {
        await this.finishCancelled(generationId, userId);
        return;
      }

      if (response.images.length === 0) {
        const reason = response.finishReason ?? 'UNKNOWN';
        await this.fail(
          generationId,
          userId,
          'PROVIDER_REFUSED',
          isProviderRefusal(response.finishReason)
            ? `${response.provider} declined to generate this image. Its own finish reason was ${reason}. This is the provider's verdict, not a filter ISOBASH ran.`
            : `${response.provider} returned no image data. Finish reason: ${reason}.`,
          reason,
          { provider: response.provider, model: response.model },
        );
        return;
      }

      const stored: string[] = [];
      const skipped: string[] = [];
      for (const [index, image] of response.images.entries()) {
        if (await this.isCancelled(generationId)) {
          await this.finishCancelled(generationId, userId);
          return;
        }
        try {
          stored.push(await this.store(generationId, userId, input, image));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'An image could not be stored.';
          skipped.push(`image ${index + 1}: ${message}`);
          this.log.warn(`Image ${index + 1} of generation ${generationId} was not stored — ${message}`);
        }
      }

      if (stored.length === 0) {
        await this.fail(
          generationId,
          userId,
          'EMPTY_PROVIDER_RESPONSE',
          `${response.provider} returned ${response.images.length} image(s) but none could be stored. ${skipped.join(' ')}`.trim(),
          response.finishReason,
          { provider: response.provider, model: response.model },
        );
        return;
      }

      const providerFailures = (response.failures ?? []).map((failure) => `${failure.code}: ${failure.message}`);
      const shortfall: string[] = [];
      // A renderer that was skipped is reported on the run, so an image produced
      // by a second provider is never passed off as the one that was picked.
      if (response.failovers && response.failovers.length > 0) shortfall.push(...response.failovers);
      if (skipped.length > 0) shortfall.push(...skipped);
      if (providerFailures.length > 0) shortfall.push(...providerFailures);
      const warning =
        shortfall.length > 0
          ? `${stored.length} of ${response.requested} requested image(s) were stored. ${shortfall.join(' ')}`.slice(0, MAX_ERROR_CHARS)
          : null;

      await this.prisma.imageGeneration.update({
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
      this.emit(userId, generationId, { status: 'COMPLETED', assets: stored.length, warning });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image generation failed.';
      await this.fail(generationId, userId, 'GENERATION_FAILED', message);
      this.log.error(`Image generation ${generationId} crashed: ${message}`);
    } finally {
      this.running.delete(generationId);
    }
  }

  /**
   * Write the bytes first, then describe them. A row that claims an image which
   * is not on disk would be a lie the gallery would happily render.
   */
  private async store(
    generationId: string,
    userId: number,
    input: StartImageGeneration,
    image: { mimeType: string; data: string; note?: string },
  ): Promise<string> {
    const bytes = Buffer.from(image.data, 'base64');
    if (bytes.byteLength === 0) {
      throw new Error('the provider returned an empty image payload.');
    }
    if (bytes.byteLength > this.config.media.maxImageBytes) {
      throw new Error(`it is ${bytes.byteLength} bytes, over the ${this.config.media.maxImageBytes} byte ceiling.`);
    }
    const sniffed = sniffImage(bytes);
    if (!sniffed) {
      throw new Error(
        `its bytes are not a PNG, JPEG, GIF or WebP image, so nothing claimed they were (provider said ${image.mimeType}).`,
      );
    }

    const relativePath = this.relativePathFor(userId, sniffed.extension);
    await this.storage.write('media', relativePath, bytes);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        kind: 'IMAGE',
        relativePath,
        mimeType: sniffed.mimeType,
        sizeBytes: bytes.byteLength,
        width: sniffed.width,
        height: sniffed.height,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        note: image.note ?? null,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        userId,
        projectId: input.projectId,
        generationId,
      },
    });
    this.emit(userId, generationId, { status: 'RUNNING', assetId: asset.id });
    return asset.id;
  }

  /** A server-generated path; nothing a provider or caller supplied reaches the disk. */
  private relativePathFor(userId: number, extension: string): string {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return `user-${userId}/${month}/${randomUUID()}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  }

  private async isCancelled(generationId: string): Promise<boolean> {
    if (this.running.get(generationId)?.signal.aborted) return true;
    const row = await this.prisma.imageGeneration.findUnique({
      where: { id: generationId },
      select: { cancelRequestedAt: true },
    });
    return row?.cancelRequestedAt != null;
  }

  private async finishCancelled(generationId: string, userId: number) {
    await this.prisma.imageGeneration.update({
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
    await this.prisma.imageGeneration.update({
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

  private async assertQuota(userId: number, count: number) {
    if (count > this.config.media.maxImagesPerRequest) {
      throw new ApiError(
        `A single generation is limited to ${this.config.media.maxImagesPerRequest} image(s), got ${count}.`,
        400,
        'VALIDATION_FAILED',
      );
    }
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recent, assets, aggregate] = await Promise.all([
      this.prisma.imageGeneration.count({ where: { userId, createdAt: { gte: hourAgo } } }),
      this.prisma.mediaAsset.count({ where: { userId } }),
      this.prisma.mediaAsset.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
    ]);
    if (recent >= this.config.media.generationsPerHour) {
      throw new ApiError(
        `This account started ${recent} generation(s) in the last hour (limit ${this.config.media.generationsPerHour}). Try again later.`,
        429,
        'RATE_LIMITED',
      );
    }
    if (assets >= this.config.media.maxAssetsPerUser) {
      throw new ApiError(
        `This account already stores ${assets} media file(s) (limit ${this.config.media.maxAssetsPerUser}). Delete one before generating another.`,
        413,
        'MEDIA_QUOTA_EXCEEDED',
      );
    }
    const used = aggregate._sum.sizeBytes ?? 0;
    if (used >= this.config.media.maxTotalBytesPerUser) {
      throw new ApiError(
        `This account stores ${used} bytes of media, at the ${this.config.media.maxTotalBytesPerUser} byte quota.`,
        413,
        'MEDIA_QUOTA_EXCEEDED',
      );
    }
  }

  private async require(userId: number, id: string) {
    const generation = await this.prisma.imageGeneration.findFirst({ where: { id, userId } });
    if (!generation) {
      throw new NotFoundException('Image generation not found.');
    }
    return generation;
  }

  private emit(userId: number, generationId: string, payload: Record<string, unknown>) {
    this.realtime.emitToUser(userId, 'media:generation', { generationId, ...payload });
  }
}
