import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionUser } from '../auth/session.model';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard';
import { AuditService } from '../security/audit.service';
import { strictBooleanValue } from '../shared/dto/strict-boolean.decorator';
import { CreateImageGenerationDto, CreateVideoGenerationDto } from './dto/media.dto';
import { ImageGenerationService } from './image-generation.service';
import { VideoGenerationService } from './video-generation.service';
import { MediaService } from './media.service';

@Controller('media')
@UseGuards(AuthGuard)
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly generation: ImageGenerationService,
    private readonly videoGeneration: VideoGenerationService,
    private readonly audit: AuditService,
  ) {}

  /** What image generation can actually do right now, including the last real failure. */
  @Get('capabilities')
  capabilities(@CurrentUser() user: SessionUser) {
    return this.media.capabilities(user.id);
  }

  @Get('generations')
  listGenerations(
    @CurrentUser() user: SessionUser,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.listGenerations(user.id, {
      ...(status ? { status } : {}),
      ...(projectId !== undefined ? { projectId: Number(projectId) } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }

  @Post('generations')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 15 * 60 * 1000 })
  async start(@CurrentUser() user: SessionUser, @Body() body: CreateImageGenerationDto) {
    const generation = await this.media.start(user, {
      prompt: body.prompt,
      ...(body.style ? { style: body.style } : {}),
      ...(strictBooleanValue(body.enhance) !== undefined
        ? { enhance: strictBooleanValue(body.enhance) }
        : {}),
      ...(body.aspectRatio ? { aspectRatio: body.aspectRatio } : {}),
      ...(body.count !== undefined ? { count: body.count } : {}),
      ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
      ...(body.model ? { model: body.model } : {}),
    });
    await this.audit.log({
      category: 'SECURITY',
      action: 'image_generation_requested',
      actorId: user.id,
      actorEmail: user.email,
      metadata: {
        generationId: generation.id,
        aspectRatio: generation.aspectRatio,
        count: generation.requestedCount,
        ...(generation.style ? { style: generation.style } : {}),
        ...(body.enhance ? { enhanced: true } : {}),
      },
    });
    return generation;
  }

  @Get('generations/:id')
  getGeneration(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.media.getGeneration(user.id, id);
  }

  @Post('generations/:id/cancel')
  cancel(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.generation.cancel(user.id, id);
  }

  @Delete('generations/:id')
  @HttpCode(204)
  async removeGeneration(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    await this.media.removeGeneration(user.id, id);
  }

  @Get('video-generations')
  listVideoGenerations(
    @CurrentUser() user: SessionUser,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.listVideoGenerations(user.id, {
      ...(status ? { status } : {}),
      ...(projectId !== undefined ? { projectId: Number(projectId) } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }

  /**
   * One clip per request. The rate limit is far lower than the image route's
   * because a render holds a provider connection open for minutes: twenty at once
   * would be twenty of them, not twenty quick answers.
   */
  @Post('video-generations')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 6, windowMs: 15 * 60 * 1000 })
  async startVideo(@CurrentUser() user: SessionUser, @Body() body: CreateVideoGenerationDto) {
    const generation = await this.media.startVideo(user, {
      prompt: body.prompt,
      ...(body.aspectRatio ? { aspectRatio: body.aspectRatio } : {}),
      ...(body.seconds !== undefined ? { seconds: body.seconds } : {}),
      ...(strictBooleanValue(body.audio) !== undefined
        ? { audio: strictBooleanValue(body.audio) }
        : {}),
      ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
      ...(body.model ? { model: body.model } : {}),
      ...(body.sourceAssetId ? { sourceAssetId: body.sourceAssetId } : {}),
    });
    await this.audit.log({
      category: 'SECURITY',
      action: 'video_generation_requested',
      actorId: user.id,
      actorEmail: user.email,
      metadata: {
        generationId: generation.id,
        seconds: generation.requestedSeconds,
        aspectRatio: generation.aspectRatio,
        // The first frame is named, not uploaded: knowing a frame left the app
        // matters when reading the audit trail.
        imageToVideo: generation.sourceAssetId !== null,
      },
    });
    return generation;
  }

  @Get('video-generations/:id')
  getVideoGeneration(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.media.getVideoGeneration(user.id, id);
  }

  @Post('video-generations/:id/cancel')
  cancelVideo(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.videoGeneration.cancel(user.id, id);
  }

  @Delete('video-generations/:id')
  @HttpCode(204)
  async removeVideoGeneration(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    await this.media.removeVideoGeneration(user.id, id);
  }

  @Get('assets')
  listAssets(
    @CurrentUser() user: SessionUser,
    @Query('kind') kind?: string,
    @Query('generationId') generationId?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.media.listAssets(user.id, {
      ...(kind ? { kind } : {}),
      ...(generationId ? { generationId } : {}),
      ...(projectId !== undefined ? { projectId: Number(projectId) } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }

  @Get('assets/:id')
  getAsset(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.media.getAsset(user.id, id);
  }

  /**
   * The bytes. Authenticated, owner-scoped and checksum-verified, and served with
   * `nosniff` so the browser cannot be talked into treating a clip as a document.
   *
   * Range requests are answered for real: a `<video>` element that gets a 200 with
   * the whole file cannot seek, and a clip the user cannot scrub through is a worse
   * deliverable than the bytes on disk.
   */
  @Get('assets/:id/file')
  async file(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('download') download?: string,
    @Headers('range') range?: string,
  ) {
    const { asset, bytes } = await this.media.readAsset(user.id, id);
    const extension = extensionForMime(asset.mimeType);

    res.setHeader('content-type', asset.mimeType);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'private, max-age=0, no-store');
    /**
     * The app renders these bytes from its own origin, which is a different port
     * and therefore cross-origin, so the global `same-origin` resource policy
     * would block every thumbnail and every clip. `same-site` keeps the route
     * unreachable from anywhere else, and the session cookie is what authorises it.
     */
    res.setHeader('cross-origin-resource-policy', 'same-site');
    const disposition = download !== undefined ? 'attachment' : 'inline';
    res.setHeader('content-disposition', `${disposition}; filename="${asciiFileName(`${id}.${extension}`)}"`);

    const window = range ? parseRange(range, bytes.byteLength) : null;
    if (range && !window) {
      res.setHeader('content-range', `bytes */${bytes.byteLength}`);
      res.status(416).end();
      return;
    }
    if (window) {
      res.status(206);
      res.setHeader('content-range', `bytes ${window.start}-${window.end}/${bytes.byteLength}`);
      res.setHeader('content-length', String(window.end - window.start + 1));
      res.setHeader('accept-ranges', 'bytes');
      res.end(bytes.subarray(window.start, window.end + 1));
      return;
    }

    res.setHeader('content-length', String(bytes.byteLength));
    if (asset.kind === 'VIDEO') res.setHeader('accept-ranges', 'bytes');
    res.end(bytes);
  }

  @Delete('assets/:id')
  @HttpCode(204)
  async removeAsset(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    await this.media.removeAsset(user.id, id);
    await this.audit.log({
      category: 'SECURITY',
      action: 'media_deleted',
      actorId: user.id,
      actorEmail: user.email,
      metadata: { assetId: id },
    });
  }
}

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'video/mp4':
      return 'mp4';
    case 'video/quicktime':
      return 'mov';
    case 'video/webm':
      return 'webm';
    case 'video/x-matroska':
      return 'mkv';
    default:
      return 'png';
  }
}

/**
 * Parse a single `bytes=start-end` range against a known length.
 *
 * Only the one-range form is honoured. A multi-range request answers with the whole
 * file rather than a `multipart/byteranges` body, which is a legal response and one
 * this route has no reason to build; a malformed or unsatisfiable range returns null
 * so the caller can answer 416 instead of quietly sending the wrong slice.
 */
function parseRange(header: string, total: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  let start: number;
  let end: number;
  if (rawStart === '') {
    // `-N` asks for the last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? total - 1 : Number(rawEnd);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= total || end < start) return null;
  return { start, end: Math.min(end, total - 1) };
}

/**
 * `content-disposition` only accepts a plain token safely, so the name is built
 * from the server-generated id and quoted out rather than trusted to the client.
 */
function asciiFileName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return ascii.length > 0 ? ascii : 'image';
}
