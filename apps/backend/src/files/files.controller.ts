import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionUser } from '../auth/session.model';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard';
import { AuditService } from '../security/audit.service';
import { FilesService } from './files.service';
import { SUPPORTED_EXTENSIONS } from './file-kinds';

/**
 * Multipart uploads arrive as one file field named `file` plus optional plain
 * fields. `projectId` is a string on the wire, so it is validated here instead
 * of being coerced by the global pipe.
 */
type UploadFields = { projectId?: string };

@Controller('files')
@UseGuards(AuthGuard)
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  @Get('capabilities')
  capabilities() {
    return this.files.capabilities();
  }

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('projectId') projectId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.files.list(user.id, {
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
      ...(projectId !== undefined ? { projectId: Number(projectId) } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
    });
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.files.get(user.id, id);
  }

  @Get(':id/text')
  text(@CurrentUser() user: SessionUser, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.files.text(user.id, id, limit ? Number(limit) : undefined);
  }

  @Get(':id/download')
  async download(@CurrentUser() user: SessionUser, @Param('id') id: string, @Res() res: Response) {
    const { file } = await this.files.download(user.id, id);
    res.setHeader('content-type', file.mimeType);
    res.setHeader('content-length', String(file.bytes.byteLength));
    res.setHeader('content-disposition', `attachment; filename="${asciiFileName(file.name)}"`);
    res.setHeader('x-content-type-options', 'nosniff');
    res.end(file.bytes);
  }

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 15 * 60 * 1000 })
  @UseInterceptors(
    FileInterceptor('file', {
      // Bytes are buffered in memory, so the ceiling is enforced while the body is
      // still being read rather than after it has been fully received. Nest
      // translates multer's LIMIT_FILE_SIZE into a 413.
      limits: { files: 1, fields: 10, fileSize: uploadCeiling() },
    }),
  )
  async upload(
    @CurrentUser() user: SessionUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadFields,
  ) {
    if (!file) {
      throw new BadRequestException('A file field named "file" is required.');
    }
    const projectId = parseProjectId(body.projectId);
    const stored = await this.files.accept(user.id, {
      originalName: file.originalname,
      declaredMimeType: file.mimetype,
      bytes: file.buffer,
      projectId,
    });
    await this.audit.log({
      category: 'SECURITY',
      action: 'file_uploaded',
      actorId: user.id,
      actorEmail: user.email,
      metadata: {
        fileId: stored?.id,
        name: file.originalname,
        bytes: file.size,
        kind: stored?.kind,
        status: stored?.status,
      },
    });
    return stored;
  }

  @Post(':id/reindex')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 15 * 60 * 1000 })
  async reindex(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: { projectId?: number | null }) {
    return this.files.reindex(user.id, id, body?.projectId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    await this.files.remove(user.id, id);
    await this.audit.log({
      category: 'SECURITY',
      action: 'file_deleted',
      actorId: user.id,
      actorEmail: user.email,
      metadata: { fileId: id },
    });
  }
}

/**
 * The interceptor is configured at decoration time, before dependency injection
 * exists, so the ceiling is read from the environment the same way the
 * configuration loader reads it. The service re-checks the real configured
 * value; this is only the early stop.
 */
function uploadCeiling(): number {
  const configured = Number(process.env.FILES_MAX_BYTES);
  if (Number.isInteger(configured) && configured >= 1024) {
    return configured;
  }
  return 10 * 1024 * 1024;
}

function parseProjectId(value?: string): number | null {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException('projectId must be a positive integer.');
  }
  return parsed;
}

/**
 * `content-disposition` only accepts a plain token safely, so anything exotic is
 * quoted out rather than trusted to the client's parser.
 */
function asciiFileName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return ascii.length > 0 ? ascii : 'download';
}

export const ACCEPTED_UPLOAD_TYPES = SUPPORTED_EXTENSIONS;
