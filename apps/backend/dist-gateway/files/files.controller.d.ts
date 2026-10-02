import { Response } from 'express';
import { SessionUser } from '../auth/session.model';
import { AuditService } from '../security/audit.service';
import { FilesService } from './files.service';
/**
 * Multipart uploads arrive as one file field named `file` plus optional plain
 * fields. `projectId` is a string on the wire, so it is validated here instead
 * of being coerced by the global pipe.
 */
type UploadFields = {
    projectId?: string;
};
export declare class FilesController {
    private readonly files;
    private readonly audit;
    constructor(files: FilesService, audit: AuditService);
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
    list(user: SessionUser, status?: string, kind?: string, projectId?: string, limit?: string): import(".prisma/client").Prisma.PrismaPromise<{
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
    get(user: SessionUser, id: string): Promise<{
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
    text(user: SessionUser, id: string, limit?: string): Promise<{
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
    download(user: SessionUser, id: string, res: Response): Promise<void>;
    upload(user: SessionUser, file: Express.Multer.File | undefined, body: UploadFields): Promise<{
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
    reindex(user: SessionUser, id: string, body: {
        projectId?: number | null;
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
    remove(user: SessionUser, id: string): Promise<void>;
}
export declare const ACCEPTED_UPLOAD_TYPES: readonly {
    extension: string;
    kind: import("./file-kinds").FileKind;
    mimeType: string;
    extractable: boolean;
}[];
export {};
