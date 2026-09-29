import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '../shared/errors/api-error';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DocumentExtractorService } from './document-extractor.service';
import { EmbeddingService } from './embedding.service';
import { chunkText } from './text-chunker';
import { asFileKind, classifyUpload, ClassifiedUpload } from './file-kinds';

export type ProcessedFile = {
  id: string;
  status: 'READY' | 'FAILED';
  chunkCount: number;
  characters: number;
  embedded: boolean;
  note: string | null;
};

const EMBED_BATCH = 32;

/**
 * Phase 12 ingestion.
 *
 * `PENDING → PROCESSING → READY|FAILED`, and the state is written as it happens
 * so a client polling the file sees real progress instead of a spinner that
 * resolves to nothing. Two rules hold throughout:
 *  - the bytes are written to storage before any row claims they exist;
 *  - a file is only `READY` when its chunks are really stored. If embeddings are
 *    unavailable the file is still READY *and* says so in `warning`, because a
 *    keyword-searchable document is a true result, not a failure.
 */
@Injectable()
export class FileProcessorService implements OnModuleDestroy {
  private readonly log = new Logger('FileProcessor');
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly extractor: DocumentExtractorService,
    private readonly embeddings: EmbeddingService,
    private readonly realtime: RealtimeService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  onModuleDestroy() {
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
  }

  /** Store the bytes, then index them in the background. */
  async accept(userId: number, input: { originalName: string; declaredMimeType: string; bytes: Buffer; projectId: number | null }) {
    if (input.bytes.byteLength > this.config.files.maxBytes) {
      throw new ApiError(
        `The file is ${input.bytes.byteLength} bytes, over the ${this.config.files.maxBytes} byte ceiling.`,
        413,
        'FILE_TOO_LARGE',
      );
    }
    const classified: ClassifiedUpload = classifyUpload(input.originalName, input.declaredMimeType, input.bytes);
    await this.assertQuota(userId, input.bytes.byteLength);

    const duplicate = await this.prisma.storedFile.findFirst({
      where: { userId, sha256: sha256(input.bytes) },
      select: { id: true, originalName: true },
    });
    if (duplicate) {
      throw new ApiError(`These exact bytes are already stored as "${duplicate.originalName}".`, 409, 'DUPLICATE_FILE', { fileId: duplicate.id });
    }

    const relativePath = this.relativePathFor(userId, classified.extension);
    await this.storage.write('upload', relativePath, input.bytes);

    const file = await this.prisma.storedFile.create({
      data: {
        userId,
        originalName: classified.originalName,
        relativePath,
        extension: classified.extension,
        kind: classified.kind,
        mimeType: classified.mimeType,
        sizeBytes: input.bytes.byteLength,
        sha256: sha256(input.bytes),
        status: 'PENDING',
        extractable: classified.extractable,
        projectId: input.projectId,
      },
    });

    this.emit(userId, file.id, { status: 'PENDING' });
    this.track(this.process(file.id, userId));
    return this.prisma.storedFile.findUnique({ where: { id: file.id } });
  }

  /** Re-run extraction and indexing for a file that is already stored. */
  async reprocess(userId: number, file: { id: string }) {
    await this.prisma.storedFile.update({ where: { id: file.id }, data: { status: 'PENDING', error: null, warning: null } });
    this.emit(userId, file.id, { status: 'PENDING' });
    this.track(this.process(file.id, userId));
  }

  private track(promise: Promise<void>) {
    promise.catch((error: unknown) => {
      this.log.error(`File processing crashed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async process(fileId: string, userId: number): Promise<void> {
    const controller = new AbortController();
    this.running.set(fileId, controller);
    try {
      const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
      if (!file) return;

      await this.prisma.storedFile.update({ where: { id: fileId }, data: { status: 'PROCESSING', error: null, warning: null } });
      this.emit(userId, fileId, { status: 'PROCESSING' });

      const bytes = await this.storage.read('upload', file.relativePath);
      if (controller.signal.aborted) {
        await this.fail(fileId, userId, 'Processing was cancelled.');
        return;
      }

      const extraction = await this.extractor.extract(asFileKind(file.kind), bytes);
      if (controller.signal.aborted) {
        await this.fail(fileId, userId, 'Processing was cancelled.');
        return;
      }

      const chunks = chunkText(extraction.text, {
        size: this.config.files.chunkSize,
        overlap: this.config.files.chunkOverlap,
        maxChunks: this.config.files.maxChunksPerFile,
      });

      // Replace the old index atomically enough for a single user: the row is only
      // marked READY once the new chunks are committed.
      await this.prisma.fileChunk.deleteMany({ where: { fileId } });
      if (chunks.length > 0) {
        await this.prisma.fileChunk.createMany({
          data: chunks.map((chunk) => ({
            fileId,
            ordinal: chunk.ordinal,
            content: chunk.content,
            characters: chunk.characters,
            tokenEstimate: chunk.tokenEstimate,
          })),
        });
      }

      let warning: string | null = null;
      let embedded = false;
      let embeddingModel: string | null = null;
      if (chunks.length > 0) {
        const outcome = await this.embedChunks(fileId, chunks.map((chunk) => chunk.content));
        if (outcome.embedded) {
          embedded = true;
          embeddingModel = outcome.model;
        } else if (outcome.error) {
          warning = `Indexed for keyword search only: ${outcome.error}`;
        }
      }
      if (extraction.note) {
        warning = warning ? `${warning} ${extraction.note}` : extraction.note;
      }
      if (chunks.length === 0 && !extraction.note) {
        warning = 'No text could be extracted, so the file has no knowledge chunks.';
      }
      if (chunks.length >= this.config.files.maxChunksPerFile) {
        const note = `Only the first ${this.config.files.maxChunksPerFile} chunks were indexed (FILES_MAX_CHUNKS_PER_FILE).`;
        warning = warning ? `${warning} ${note}` : note;
      }

      await this.prisma.storedFile.update({
        where: { id: fileId },
        data: {
          status: 'READY',
          error: null,
          warning,
          extractedText: extraction.text,
          characters: extraction.characters,
          truncated: extraction.truncated,
          chunkCount: chunks.length,
          embeddedAt: embedded ? new Date() : null,
          embeddingModel,
          processedAt: new Date(),
        },
      });
      this.emit(userId, fileId, { status: 'READY', chunks: chunks.length, embedded, characters: extraction.characters });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The file could not be processed.';
      await this.fail(fileId, userId, message);
      this.log.warn(`File ${fileId} FAILED: ${message}`);
    } finally {
      this.running.delete(fileId);
    }
  }

  private async embedChunks(fileId: string, contents: string[]): Promise<{ embedded: true; model: string } | { embedded: false; error: string | null }> {
    let model: string | null = null;
    for (let index = 0; index < contents.length; index += EMBED_BATCH) {
      const batch = contents.slice(index, index + EMBED_BATCH);
      const outcome = await this.embeddings.tryEmbed(batch, 'RETRIEVAL_DOCUMENT');
      if ('error' in outcome) {
        return { embedded: false, error: outcome.error };
      }
      model = model ?? outcome.batch.model;
      if (outcome.batch.dimensions === 0) {
        return { embedded: false, error: `${outcome.batch.provider}:${outcome.batch.model} returned zero-dimensional vectors.` };
      }
      for (const [offset, vector] of outcome.batch.vectors.entries()) {
        await this.prisma.fileChunk.updateMany({
          where: { fileId, ordinal: index + offset + 1 },
          data: { embedding: vector as unknown as object, embeddingModel: outcome.batch.model, embeddedAt: new Date() },
        });
      }
    }
    return model
      ? { embedded: true, model }
      : { embedded: false, error: 'No chunks were submitted for embedding.' };
  }

  private async fail(fileId: string, userId: number, message: string) {
    await this.prisma.storedFile.update({
      where: { id: fileId },
      data: { status: 'FAILED', error: message.slice(0, 500), processedAt: new Date() },
    });
    this.emit(userId, fileId, { status: 'FAILED', error: message });
  }

  private async assertQuota(userId: number, incoming: number) {
    const [count, aggregate] = await Promise.all([
      this.prisma.storedFile.count({ where: { userId } }),
      this.prisma.storedFile.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
    ]);
    if (count >= this.config.files.maxFilesPerUser) {
      throw new ApiError(
        `This account already stores ${count} files (limit ${this.config.files.maxFilesPerUser}). Delete one before uploading another.`,
        413,
        'FILE_QUOTA_EXCEEDED',
      );
    }
    const used = aggregate._sum.sizeBytes ?? 0;
    if (used + incoming > this.config.files.maxTotalBytesPerUser) {
      throw new ApiError(
        `This account stores ${used} bytes and the new file is ${incoming} bytes, over the ${this.config.files.maxTotalBytesPerUser} byte quota.`,
        413,
        'FILE_QUOTA_EXCEEDED',
      );
    }
  }

  /** A server-generated path: the uploader's name never reaches the filesystem. */
  private relativePathFor(userId: number, extension: string): string {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const suffix = extension ? `.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}` : '';
    return `user-${userId}/${month}/${randomUUID()}${suffix}`;
  }

  private emit(userId: number, fileId: string, payload: Record<string, unknown>) {
    this.realtime.emitToUser(userId, 'file:update', { fileId, ...payload });
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
