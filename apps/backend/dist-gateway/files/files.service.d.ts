import { Prisma } from '@prisma/client';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../shared/storage/storage.service';
import { EmbeddingService } from './embedding.service';
import { FileProcessorService } from './file-processor.service';
export type FileListQuery = {
    status?: string;
    kind?: string;
    projectId?: number;
    limit?: number;
};
/**
 * Phase 12 files service.
 *
 * Every read is owner-scoped and answers 404 for someone else's file, never 403:
 * the existence of another user's upload is not this caller's business. The
 * absolute path of a stored file never leaves the process.
 */
export declare class FilesService {
    private readonly prisma;
    private readonly storage;
    private readonly processor;
    private readonly embeddings;
    private readonly config;
    constructor(prisma: PrismaService, storage: StorageService, processor: FileProcessorService, embeddings: EmbeddingService, config: AppConfig);
    capabilities(): Promise<{
        upload: {
            maxBytes: number;
            maxFilesPerUser: number;
            maxTotalBytesPerUser: number;
            types: readonly {
                extension: string;
                kind: import("./file-kinds").FileKind;
                mimeType: string;
                extractable: boolean;
            }[];
            detail: string;
        };
        extraction: {
            text: boolean;
            markdown: boolean;
            csv: boolean;
            json: boolean;
            html: boolean;
            pdf: boolean;
            images: boolean;
            officeAndArchives: boolean;
            maxExtractedCharacters: number;
            maxChunksPerFile: number;
            chunkSize: number;
            chunkOverlap: number;
            detail: string;
        };
        embeddings: import("./embedding.service").EmbeddingAvailability;
        knowledge: {
            chunkCount: number;
            embeddedChunks: number;
            storedFiles: number;
            searchCandidateLimit: number;
            detail: string;
        };
    }>;
    list(userId: number, query?: FileListQuery): Prisma.PrismaPromise<{
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.FileStatus;
        createdAt: Date;
        kind: string;
        projectId: number | null;
        mimeType: string;
        sizeBytes: number;
        characters: number;
        chunkCount: number;
        truncated: boolean;
        originalName: string;
        extension: string;
        warning: string | null;
        extractable: boolean;
        embeddingModel: string | null;
        embeddedAt: Date | null;
        processedAt: Date | null;
    }[]>;
    get(userId: number, id: string): Promise<{
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
    }>;
    /** The extracted text, capped. The full text is never shipped unprompted. */
    text(userId: number, id: string, limit?: number): Promise<{
        id: string;
        originalName: string;
        kind: string;
        status: import(".prisma/client").$Enums.FileStatus;
        characters: number;
        truncated: boolean;
        warning: string | null;
        error: string | null;
        text: string;
        chunkCount: number;
    }>;
    download(userId: number, id: string): Promise<{
        file: {
            name: string;
            bytes: Buffer;
            mimeType: string;
        };
    }>;
    remove(userId: number, id: string): Promise<void>;
    /** Re-index a stored file, optionally attaching it to a project. */
    reindex(userId: number, id: string, projectId?: number | null): Promise<{
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
    private require;
}
