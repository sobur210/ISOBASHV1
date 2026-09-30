import { BadRequestException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';
import { ApiError } from '../shared/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { Json2VideoProvider } from '../ai/json2video.provider';
import { AiProviderError } from '../ai/provider.types';
import { sniffVideo } from './video-bytes';
import { CreateAssemblyDto } from './dto/assembly.dto';

/**
 * Assembling an existing document into a finished video, via JSON2Video.
 *
 * This service is intentionally NOT reachable from the AI video generation screen
 * and does not implement anything like `VideoProvider`. JSON2Video composes
 * material the user already has; it does not generate a clip from a prompt. Keeping
 * the two apart is what stops a routing bug from ever substituting an assembled
 * slideshow for a generated clip, or the reverse.
 *
 * WHY THIS AWAITS THE WHOLE RATHER THAN QUEUES
 *
 * Assembly is a single POST that renders for a few minutes and returns one MP4. It
 * is unlike Phase 14 video generation, which starts a run, streams status and
 * keeps a row per attempt, for good reasons: those renders are long, concurrent
 * and expensive per second, and a user leaving the tab must not cancel the billing.
 *
 * An assembly is neither long enough nor expensive enough to justify that
 * machinery, and reusing `VideoGenerationService` would mean pretending it is the
 * same kind of work. So the request is awaited, and if it does not finish the
 * caller gets the provider's reason and no asset is written. A failed assembly
 * leaves nothing behind to clean up.
 *
 * The trade-off is stated plainly: a client that disconnects mid-request does not
 * get to see the result, and JSON2Video keeps rendering and still bills for it.
 * That is acceptable for a one-shot action on a document the user is waiting on,
 * and it is the reason this is not exposed as a background job yet.
 */
@Injectable()
export class VideoAssemblyService {
  private readonly logger = new Logger('VideoAssembly');

  constructor(
    private readonly json2video: Json2VideoProvider,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  /**
   * What the assembly screen needs before anyone clicks anything.
   *
   * Returned as its own block rather than folded into `/media/capabilities`,
   * because it is not a renderer competing for the same work: there is no failover
   * provider for assembly, so reporting it as one capability among several would
   * invite a client to try to fall back to something that cannot compose.
   */
  async capabilities() {
    /**
     * Assembly is opt-in, and the reason is that a render sends a user's own
     * document text to a third party and spends part of a grant that does not
     * refill. `JSON2VIDEO_ENABLED` is checked here rather than by conditionally
     * registering the controller, so the route stays in the table and a disabled
     * deployment answers with a reason instead of a 404 that looks like a typo.
     */
    if (!this.isEnabled()) {
      return {
        available: false,
        provider: this.json2video.name,
        status: 'unconfigured' as const,
        detail:
          'Video assembly is switched off. Set JSON2VIDEO_ENABLED=true to turn it on, and note that rendering sends this ' +
          'report or summary to JSON2Video and spends part of a free grant that does not renew.',
        resolutions: this.json2video.resolutions,
        maxSeconds: this.json2video.maxSeconds,
        remainingSeconds: null,
        remainingReadable: false,
        voiceoverAvailable: false,
        watermarked: true,
        nonRenewing: true,
        maxBytes: this.config.media.video.maxVideoBytes,
      };
    }

    const health = await this.json2video.health();
    const balance = health.status === 'healthy' ? await this.json2video.readCreditBalance() : null;

    return {
      available: health.status === 'healthy',
      provider: this.json2video.name,
      status: health.status,
      detail: health.detail,
      resolutions: this.json2video.resolutions,
      maxSeconds: this.json2video.maxSeconds,
      /**
       * Null when the provider will not say, which is a different thing from zero.
       * Reporting 0 would render the button dead for a reason the user could not
       * act on, when the truth is "we do not know".
       */
      remainingSeconds: balance?.readable ? balance.balance : null,
      remainingReadable: balance?.readable ?? false,
      /**
       * TTS is 0 credits on every current JSON2Video plan, so a narrated video
       * costs the same as a silent one. Flagged because that is unusual enough to
       * change if a plan ever prices voice differently, and a UI that assumed it
       * would then be quietly wrong.
       */
      voiceoverAvailable: true,
      /**
       * The free plan's grant does not renew, and its output is watermarked and
       * non-commercial. Said to the client rather than left in a comment so the
       * button can warn before the user spends a one-off grant on a draft.
       */
      watermarked: true,
      nonRenewing: true,
      maxBytes: this.config.media.video.maxVideoBytes,
    };
  }

  /**
   * The provider's own name, for the audit trail.
   *
   * Exposed rather than hardcoded at the call site so the audit records the
   * provider that actually served the request: if assembly is later routed through
   * a second renderer, the log follows it instead of continuing to claim json2video.
   */
  providerName(): string {
    return this.json2video.name;
  }

  private isEnabled(): boolean {
    return process.env.JSON2VIDEO_ENABLED === 'true';
  }

  async start(userId: number, projectId: number | null, dto: CreateAssemblyDto) {
    if (!this.isEnabled()) {
      throw new BadRequestException(
        'Video assembly is switched off. Set JSON2VIDEO_ENABLED=true to turn it on. Nothing was sent to JSON2Video.',
      );
    }

    /**
     * The total is measured from the recipe the provider will actually receive,
     * not from an estimate made here. `buildRecipe` is the same function the
     * submission path calls, so a scene dropped as empty is dropped from the count
     * too, and the number the guard checks is the number that gets rendered.
     */
    const request = {
      title: dto.title,
      ...(dto.subtitle ? { subtitle: dto.subtitle } : {}),
      scenes: dto.scenes,
      voiceover: dto.voiceover === true,
      ...(dto.outro ? { outro: dto.outro } : {}),
      resolution: dto.resolution,
      source: dto.source,
      ...(dto.sourceId ? { sourceId: dto.sourceId } : {}),
    };
    const recipe = this.json2video.buildRecipe(request);
    const seconds = totalSeconds(recipe);
    if (seconds > this.json2video.maxSeconds) {
      /**
       * A 400, not a 502: the provider has not been contacted and will not be, so
       * reporting this as a bad gateway would send an operator to look at
       * JSON2Video for a document that was refused here.
       */
      throw new ApiError(
        `This is ${seconds} seconds of scenes, over the ${this.json2video.maxSeconds} second limit of the JSON2Video ` +
          `plan, and a single movie cannot be longer. Shorten the source text or split it into more than one video.`,
        HttpStatus.BAD_REQUEST,
        'PROVIDER_REQUEST_FAILED',
      );
    }

    /**
     * The guard reads JSON2Video's own balance rather than the shared
     * `ProviderCreditService` ledger, and that is a deliberate gap rather than an
     * oversight.
     *
     * The ledger records Magic Hour credit spends against a `VideoGenerationId`,
     * because every row so far belongs to a Phase 14 generation run. An assembly is
     * not a generation run and creates no such row, so writing to the ledger here
     * would need a nullable foreign key and a second meaning for the same table.
     * More importantly the units are not the same: that table counts Magic Hour
     * credits, and this feature spends whole seconds out of a 600-credit signup
     * grant that does not renew. A shared column would invite exactly the
     * comparison the two contracts are built to prevent.
     *
     * So the balance is read live from the provider, and the spend is recorded on
     * the asset's note and the provider's own `remaining_quota` rather than being
     * mixed into another provider's pool. Aggregating per-provider usage across
     * all three is the remaining task, and it wants its own table.
     */
    const balance = await this.json2video.readCreditBalance();
    if (balance.readable && seconds > balance.balance) {
      // Also a 400: nothing was submitted, so this is a refusal rather than an
      // upstream failure. The code is kept because it is what a client branches on.
      throw new ApiError(
        `This is ${seconds} seconds of scenes, but only ${balance.balance} seconds remain on the JSON2Video account. ` +
          `The free grant is 600 credits that do not renew, so there is nothing to refill it from and no fallback provider ` +
          `can assemble instead.`,
        HttpStatus.BAD_REQUEST,
        'PROVIDER_INSUFFICIENT_CREDITS',
      );
    }
    if (!balance.readable) {
      // Unreadable is not zero. The render is attempted anyway, because the
      // provider is the authority on its own quota and will refuse it properly if
      // it is genuinely spent. Refusing here would block a working account behind
      // a quota endpoint that simply is not answering.
      this.logger.warn('JSON2Video did not report a readable balance; submitting and letting the provider decide.');
    }

    const assembled = await this.json2video.assemble(request);
    if (assembled.job.status !== 'done' || !assembled.job.url) {
      throw new AiProviderError(
        `JSON2Video finished in status "${assembled.job.status}" instead of done. ${assembled.job.message ?? 'It gave no reason.'}`,
        this.json2video.name,
        'PROVIDER_REQUEST_FAILED',
      );
    }

    const bytes = Buffer.from(assembled.video.data, 'base64');
    if (bytes.byteLength === 0) {
      throw new Error('JSON2Video returned an empty video payload.');
    }
    if (bytes.byteLength > this.config.media.video.maxVideoBytes) {
      throw new Error(`it is ${bytes.byteLength} bytes, over the ${this.config.media.video.maxVideoBytes} byte ceiling.`);
    }

    /**
     * Sniffed, not trusted, for the same reason Phase 14 does it: the provider's
     * claimed duration and size are a claim, and a metadata row repeating what the
     * caller hoped for is not a measurement. The note is kept for the human, and
     * the stored columns come from the container.
     */
    const sniffed = sniffVideo(bytes);
    if (!sniffed) {
      throw new Error(
        `its bytes are not an MP4, MOV or WebM video with a video track, so nothing claimed they were ` +
          `(provider said ${assembled.video.mimeType}).`,
      );
    }

    const relativePath = this.relativePathFor(userId, sniffed.extension);
    await this.storage.write('media', relativePath, bytes);

    /**
     * The recipe goes in `prompt`, which is the existing "how this was made" column
     * rather than a new one. It is the honest thing to record: the text that became
     * this video is the recipe, and a generated clip's equivalent is its prompt.
     */
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
        note: [
          `assembled by json2video from a ${dto.source} piece`,
          dto.sourceId ? `(${dto.sourceId})` : null,
          `${dto.resolution}`,
          assembled.job.remainingQuotaSeconds !== null ? `${assembled.job.remainingQuotaSeconds}s of quota left` : null,
          'watermarked: the JSON2Video plan watermarks its output',
        ]
          .filter(Boolean)
          .join('; '),
        prompt: JSON.stringify(recipe).slice(0, 4000),
        provider: this.json2video.name,
        model: null,
        userId,
        projectId,
      },
    });

    this.logger.log(
      `assembled asset ${asset.id} for user ${userId}: ${sniffed.durationMs ?? '?'}ms, ${sniffed.width}x${sniffed.height}, ` +
        `${bytes.byteLength} bytes, ${sniffed.hasAudio ? 'with' : 'no'} audio`,
    );

    return {
      asset: {
        id: asset.id,
        kind: asset.kind,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        width: sniffed.width,
        height: sniffed.height,
        durationMs: sniffed.durationMs,
        hasAudio: sniffed.hasAudio,
        provider: asset.provider,
        note: asset.note,
        createdAt: asset.createdAt,
      },
      projectId: assembled.job.id,
      durationSeconds: assembled.job.durationSeconds,
      remainingSeconds: assembled.job.remainingQuotaSeconds,
      recipe,
    };
  }

  private relativePathFor(userId: number, extension: string): string {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return `user-${userId}/${month}/${randomUUID()}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  }
}

/**
 * Sum the durations of every element in a built recipe.
 *
 * Read off the recipe rather than recomputed from the DTO, so the guard measures
 * the document that will actually be submitted. Scenes with a video element are
 * measured by that element: JSON2Video honours the longer of the element and the
 * scene, and using the scene's nominal length would under-count.
 */
function totalSeconds(recipe: Record<string, unknown>): number {
  const scenes = Array.isArray(recipe.scenes) ? recipe.scenes : [];
  let total = 0;
  for (const scene of scenes) {
    if (!scene || typeof scene !== 'object') continue;
    const elements = Array.isArray((scene as { elements?: unknown }).elements)
      ? ((scene as { elements: unknown[] }).elements as Array<{ duration?: unknown; type?: unknown }>)
      : [];
    let sceneSeconds = 0;
    for (const element of elements) {
      const duration = typeof element?.duration === 'number' && Number.isFinite(element.duration) ? element.duration : 0;
      /**
       * The longest element sets the scene's length, not the sum. JSON2Video plays a
       * scene's elements concurrently rather than one after another, so adding
       * durations would over-count a scene holding a voice line beside its text, and
       * a document of ordinary scenes would then be refused for being too long when
       * it renders fine.
       */
      sceneSeconds = Math.max(sceneSeconds, duration);
    }
    total += sceneSeconds;
  }
  return total;
}
