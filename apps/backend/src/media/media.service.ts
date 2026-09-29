import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ApiError } from '../shared/errors/api-error';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { AiModelRegistry } from '../ai/model.registry';
import { AiProviderRegistry } from '../ai/provider.registry';
import { ProviderHealthService } from '../ai/provider-health.service';
import { SessionUser } from '../auth/session.model';
import { ImageGenerationService, StartImageGeneration } from './image-generation.service';

export type GenerationListQuery = { status?: string; projectId?: number; limit?: number };
export type AssetListQuery = { kind?: string; generationId?: string; projectId?: number; limit?: number };

type AssetSummary = Prisma.MediaAssetGetPayload<{ select: typeof ASSET_SELECT }>;

const GENERATION_SELECT = {
  id: true,
  prompt: true,
  aspectRatio: true,
  requestedCount: true,
  status: true,
  error: true,
  errorCode: true,
  warning: true,
  finishReason: true,
  provider: true,
  model: true,
  inputTokens: true,
  outputTokens: true,
  cancelRequestedAt: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  projectId: true,
} as const;

const ASSET_SELECT = {
  id: true,
  kind: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  sha256: true,
  note: true,
  prompt: true,
  aspectRatio: true,
  provider: true,
  model: true,
  generationId: true,
  projectId: true,
  createdAt: true,
} as const;

/**
 * Phase 13 media service.
 *
 * Every read is owner-scoped and answers 404 for someone else's generation or
 * asset, never 403: the existence of another account's media is not this caller's
 * business. The absolute path of a stored file never leaves the process, and bytes
 * are served only through an authenticated, integrity-checked route.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly models: AiModelRegistry,
    private readonly providers: AiProviderRegistry,
    private readonly health: ProviderHealthService,
    private readonly generation: ImageGenerationService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  /**
   * What image generation can actually do right now.
   *
   * "Available" here means a provider is registered and healthy. It is *not* a
   * claim that the key can pay: a free-tier key can be healthy and still be
   * refused with a zero image quota, so the most recent real failure for this
   * account is reported next to the capability rather than hidden behind it.
   */
  async capabilities(userId: number) {
    const imageProviders = [...this.providers.capabilities().entries()]
      .filter(([, capabilities]) => capabilities.includes('image-generation'))
      .map(([provider]) => provider);

    const providers = await Promise.all(
      imageProviders.map(async (provider) => {
        const status = await this.health.status(provider);
        return {
          provider,
          status: status.status,
          healthDetail: status.detail ?? null,
          circuit: this.health.circuit(provider),
          stats: this.health.stats(provider),
        };
      }),
    );

    const models = this.models
      .list()
      .filter((model) => model.capabilities.includes('image-generation'))
      .map((model) => ({
        id: model.id,
        provider: model.provider,
        /** Aliases stay selectable by hand but are never chosen automatically. */
        autoSelectable: model.enabled !== false,
        aliasOf: model.aliasOf ?? null,
      }));

    const [assetCount, storedBytes, generationCount, lastFailure] = await Promise.all([
      this.prisma.mediaAsset.count({ where: { userId } }),
      this.prisma.mediaAsset.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
      this.prisma.imageGeneration.count({ where: { userId } }),
      this.prisma.imageGeneration.findFirst({
        where: { userId, status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, errorCode: true, error: true, finishReason: true, createdAt: true },
      }),
    ]);

    const available = models.length > 0 && providers.some((entry) => entry.status !== 'unconfigured');
    const allHealthy = available && providers.every((entry) => entry.status === 'healthy');

    return {
      generation: {
        available,
        /**
         * Provider health is per provider and each adapter derives it from the
         * capability it was written for, so a healthy Gemini here is a statement
         * about its *text* model. It is reported separately for exactly that
         * reason and is never used to promise that an image can be rendered.
         */
        allProvidersHealthy: allHealthy,
        providers,
        models,
        aspectRatios: this.config.media.aspectRatios,
        maxPromptCharacters: this.config.media.maxPromptCharacters,
        maxImagesPerRequest: this.config.media.maxImagesPerRequest,
        maxImageBytes: this.config.media.maxImageBytes,
        maxAssetsPerUser: this.config.media.maxAssetsPerUser,
        maxTotalBytesPerUser: this.config.media.maxTotalBytesPerUser,
        generationsPerHour: this.config.media.generationsPerHour,
        detail: available
          ? 'Images come from a provider that really renders them. A run is only reported as completed when the bytes were stored, and a refusal, a quota error or a missing model is reported as the failure it is. Being registered is not proof the key can pay: read lastFailure for what this account actually got back.'
          : 'No configured provider can generate images. Nothing is substituted or synthesised locally.',
      },
      moderation: {
        enforced: 'provider-reported',
        detail:
          "A blocked prompt is recorded with the provider's own finish reason (for example IMAGE_SAFETY or PROHIBITED_CONTENT) as a failed run. ISOBASH runs no classifier of its own, so it does not claim to have screened anything itself.",
      },
      video: {
        available: false,
        detail: 'Text-to-video, image-to-video and animation are not wired to a provider yet. Nothing here renders a video.',
      },
      lastFailure,
      usage: {
        assets: assetCount,
        storedBytes: storedBytes._sum.sizeBytes ?? 0,
        generations: generationCount,
      },
    };
  }

  listGenerations(userId: number, query: GenerationListQuery = {}) {
    return this.prisma.imageGeneration.findMany({
      where: {
        userId,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: clamp(query.limit ?? 50, 1, 200),
      select: {
        ...GENERATION_SELECT,
        assets: { orderBy: { id: 'asc' }, select: ASSET_SELECT },
        _count: { select: { assets: true } },
      },
    });
  }

  async getGeneration(userId: number, id: string) {
    return this.requireGeneration(userId, id);
  }

  async start(user: SessionUser, input: { prompt: string; aspectRatio?: string; count?: number; projectId?: number | null; model?: string }) {
    const prompt = input.prompt.trim();
    if (prompt.length === 0) {
      throw new ApiError('A prompt is required.', 400, 'VALIDATION_FAILED');
    }
    if (prompt.length > this.config.media.maxPromptCharacters) {
      throw new ApiError(
        `The prompt is ${prompt.length} characters, over the ${this.config.media.maxPromptCharacters} character limit.`,
        400,
        'VALIDATION_FAILED',
      );
    }
    const aspectRatio = input.aspectRatio ?? null;
    if (aspectRatio && !this.config.media.aspectRatios.includes(aspectRatio)) {
      throw new ApiError(
        `Aspect ratio "${aspectRatio}" is not offered. Accepted: ${this.config.media.aspectRatios.join(', ')}.`,
        400,
        'VALIDATION_FAILED',
      );
    }
    const count = input.count ?? 1;
    if (input.projectId !== undefined && input.projectId !== null) {
      const owned = await this.prisma.project.findFirst({
        where: { id: input.projectId, ownerId: user.id },
        select: { id: true },
      });
      if (!owned) {
        throw new ApiError('Project not found.', 400, 'VALIDATION_FAILED');
      }
    }

    const request: StartImageGeneration = {
      prompt,
      aspectRatio,
      count,
      projectId: input.projectId ?? null,
      model: input.model ?? null,
    };
    const created = await this.generation.start(user.id, request);
    return this.requireGeneration(user.id, created.id);
  }

  listAssets(userId: number, query: AssetListQuery = {}) {
    return this.prisma.mediaAsset.findMany({
      where: {
        userId,
        ...(query.kind ? { kind: query.kind as never } : {}),
        ...(query.generationId ? { generationId: query.generationId } : {}),
        ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: clamp(query.limit ?? 60, 1, 200),
      select: ASSET_SELECT,
    });
  }

  async getAsset(userId: number, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, userId }, select: ASSET_SELECT });
    if (!asset) {
      throw new NotFoundException('Media asset not found.');
    }
    return asset;
  }

  /**
   * Read the stored bytes. The SHA-256 recorded when the image was written is
   * checked on the way out, so a file damaged on disk is reported instead of being
   * served as though it were the image that was generated.
   */
  async readAsset(userId: number, id: string): Promise<{ asset: AssetSummary; bytes: Buffer }> {
    const row = await this.requireAssetRow(userId, id);
    const bytes = await this.storage.read('media', row.relativePath);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== row.sha256) {
      throw new ApiError(
        'The stored bytes for this asset no longer match the checksum recorded when it was generated. The file on disk is damaged.',
        500,
        'ASSET_CORRUPT',
      );
    }
    return { asset: await this.assetSummary(id), bytes };
  }

  async removeAsset(userId: number, id: string) {
    const asset = await this.requireAssetRow(userId, id);
    await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
    // The row is the source of truth; a leftover blob must not keep the space.
    await this.storage.remove('media', asset.relativePath);
  }

  async removeGeneration(userId: number, id: string) {
    const generation = await this.requireGeneration(userId, id);
    const stored = await this.prisma.mediaAsset.findMany({
      where: { generationId: id, userId },
      select: { relativePath: true },
    });
    for (const asset of stored) {
      await this.storage.remove('media', asset.relativePath);
    }
    await this.prisma.imageGeneration.delete({ where: { id: generation.id } });
  }

  private async requireAssetRow(userId: number, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, userId } });
    if (!asset) {
      throw new NotFoundException('Media asset not found.');
    }
    return asset;
  }

  private async assetSummary(id: string): Promise<AssetSummary> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id }, select: ASSET_SELECT });
    if (!asset) {
      throw new NotFoundException('Media asset not found.');
    }
    return asset;
  }

  private async requireGeneration(userId: number, id: string) {
    const generation = await this.prisma.imageGeneration.findFirst({
      where: { id, userId },
      select: {
        ...GENERATION_SELECT,
        assets: { orderBy: { id: 'asc' }, select: ASSET_SELECT },
        _count: { select: { assets: true } },
      },
    });
    if (!generation) {
      throw new NotFoundException('Image generation not found.');
    }
    return generation;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}
