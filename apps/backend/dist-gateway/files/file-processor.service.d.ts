import { OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DocumentExtractorService } from './document-extractor.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { EmbeddingService } from './embedding.service';
export type ProcessedFile = {
    id: string;
    status: 'READY' | 'FAILED';
    chunkCount: number;
    characters: number;
    embedded: boolean;
    note: string | null;
};
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
export declare class FileProcessorService implements OnModuleDestroy {
    private readonly prisma;
    private readonly storage;
    private readonly extractor;
    private readonly embeddings;
    private readonly realtime;
    private readonly entitlements;
    private readonly config;
    private readonly log;
    private readonly running;
    constructor(prisma: PrismaService, storage: StorageService, extractor: DocumentExtractorService, embeddings: EmbeddingService, realtime: RealtimeService, entitlements: EntitlementsService, config: AppConfig);
    onModuleDestroy(): void;
    /** Store the bytes, then index them in the background. */
    accept(userId: number, input: {
        originalName: string;
        declaredMimeType: string;
        bytes: Buffer;
        projectId: number | null;
    }): Promise<{
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.FileStatus;
        createdAt: Date;
        kind: string;
        updatedAt: Date;
        userId: number;
        projectId: number | null;
        mimeType: string;
        sha256: string;
        sizeBytes: number;
        characters: number;
        chunkCount: number;
        truncated: boolean;
        originalName: string;
        relativePath: string;
        extension: string;
        warning: string | null;
        extractable: boolean;
        extractedText: string;
        embeddingModel: string | null;
        embeddedAt: Date | null;
        processedAt: Date | null;
    } | null>;
    /** Re-run extraction and indexing for a file that is already stored. */
    reprocess(userId: number, file: {
        id: string;
    }): Promise<void>;
    private track;
    private process;
    private embedChunks;
    private fail;
    private assertQuota;
    /** A server-generated path: the uploader's name never reaches the filesystem. */
    private relativePathFor;
    private emit;
}
