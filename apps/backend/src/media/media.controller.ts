import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateImageGenerationDto } from './dto/media.dto';
import { ImageGenerationService } from './image-generation.service';
import { MediaService } from './media.service';

@Controller('media')
@UseGuards(AuthGuard)
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly generation: ImageGenerationService,
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
      metadata: { generationId: generation.id, aspectRatio: generation.aspectRatio, count: generation.requestedCount },
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
   * `nosniff` so the browser cannot be talked into treating an image as a document.
   */
  @Get('assets/:id/file')
  async file(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('download') download?: string,
  ) {
    const { asset, bytes } = await this.media.readAsset(user.id, id);
    const extension = extensionForMime(asset.mimeType);
    res.setHeader('content-type', asset.mimeType);
    res.setHeader('content-length', String(bytes.byteLength));
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'private, max-age=0, no-store');
    /**
     * The app renders these bytes from its own origin, which is a different port
     * and therefore cross-origin, so the global `same-origin` resource policy
     * would block every thumbnail. `same-site` keeps the route unreachable from
     * anywhere else, and the session cookie is still what authorises the read.
     */
    res.setHeader('cross-origin-resource-policy', 'same-site');
    if (download !== undefined) {
      res.setHeader('content-disposition', `attachment; filename="${asciiFileName(`${id}.${extension}`)}"`);
    } else {
      res.setHeader('content-disposition', `inline; filename="${asciiFileName(`${id}.${extension}`)}"`);
    }
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
    default:
      return 'png';
  }
}

/**
 * `content-disposition` only accepts a plain token safely, so the name is built
 * from the server-generated id and quoted out rather than trusted to the client.
 */
function asciiFileName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return ascii.length > 0 ? ascii : 'image';
}
