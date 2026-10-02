"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileProcessorService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const api_error_1 = require("../shared/errors/api-error");
const inject_config_1 = require("../shared/config/inject-config");
const prisma_service_1 = require("../prisma/prisma.service");
const storage_service_1 = require("../shared/storage/storage.service");
const realtime_service_1 = require("../realtime/realtime.service");
const document_extractor_service_1 = require("./document-extractor.service");
const entitlements_service_1 = require("../billing/entitlements.service");
const embedding_service_1 = require("./embedding.service");
const text_chunker_1 = require("./text-chunker");
const file_kinds_1 = require("./file-kinds");
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
let FileProcessorService = class FileProcessorService {
    prisma;
    storage;
    extractor;
    embeddings;
    realtime;
    entitlements;
    config;
    log = new common_1.Logger('FileProcessor');
    running = new Map();
    constructor(prisma, storage, extractor, embeddings, realtime, entitlements, config) {
        this.prisma = prisma;
        this.storage = storage;
        this.extractor = extractor;
        this.embeddings = embeddings;
        this.realtime = realtime;
        this.entitlements = entitlements;
        this.config = config;
    }
    onModuleDestroy() {
        for (const controller of this.running.values())
            controller.abort();
        this.running.clear();
    }
    /** Store the bytes, then index them in the background. */
    async accept(userId, input) {
        if (input.bytes.byteLength > this.config.files.maxBytes) {
            throw new api_error_1.ApiError(`The file is ${input.bytes.byteLength} bytes, over the ${this.config.files.maxBytes} byte ceiling.`, 413, 'FILE_TOO_LARGE');
        }
        const classified = (0, file_kinds_1.classifyUpload)(input.originalName, input.declaredMimeType, input.bytes);
        await this.assertQuota(userId, input.bytes.byteLength);
        const duplicate = await this.prisma.storedFile.findFirst({
            where: { userId, sha256: sha256(input.bytes) },
            select: { id: true, originalName: true },
        });
        if (duplicate) {
            throw new api_error_1.ApiError(`These exact bytes are already stored as "${duplicate.originalName}".`, 409, 'DUPLICATE_FILE', { fileId: duplicate.id });
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
    async reprocess(userId, file) {
        await this.prisma.storedFile.update({ where: { id: file.id }, data: { status: 'PENDING', error: null, warning: null } });
        this.emit(userId, file.id, { status: 'PENDING' });
        this.track(this.process(file.id, userId));
    }
    track(promise) {
        promise.catch((error) => {
            this.log.error(`File processing crashed: ${error instanceof Error ? error.message : String(error)}`);
        });
    }
    async process(fileId, userId) {
        const controller = new AbortController();
        this.running.set(fileId, controller);
        try {
            const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
            if (!file)
                return;
            await this.prisma.storedFile.update({ where: { id: fileId }, data: { status: 'PROCESSING', error: null, warning: null } });
            this.emit(userId, fileId, { status: 'PROCESSING' });
            const bytes = await this.storage.read('upload', file.relativePath);
            if (controller.signal.aborted) {
                await this.fail(fileId, userId, 'Processing was cancelled.');
                return;
            }
            const extraction = await this.extractor.extract((0, file_kinds_1.asFileKind)(file.kind), bytes);
            if (controller.signal.aborted) {
                await this.fail(fileId, userId, 'Processing was cancelled.');
                return;
            }
            const chunks = (0, text_chunker_1.chunkText)(extraction.text, {
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
            let warning = null;
            let embedded = false;
            let embeddingModel = null;
            if (chunks.length > 0) {
                const outcome = await this.embedChunks(fileId, chunks.map((chunk) => chunk.content));
                if (outcome.embedded) {
                    embedded = true;
                    embeddingModel = outcome.model;
                }
                else if (outcome.error) {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'The file could not be processed.';
            await this.fail(fileId, userId, message);
            this.log.warn(`File ${fileId} FAILED: ${message}`);
        }
        finally {
            this.running.delete(fileId);
        }
    }
    async embedChunks(fileId, contents) {
        let model = null;
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
                    data: { embedding: vector, embeddingModel: outcome.batch.model, embeddedAt: new Date() },
                });
            }
        }
        return model
            ? { embedded: true, model }
            : { embedded: false, error: 'No chunks were submitted for embedding.' };
    }
    async fail(fileId, userId, message) {
        await this.prisma.storedFile.update({
            where: { id: fileId },
            data: { status: 'FAILED', error: message.slice(0, 500), processedAt: new Date() },
        });
        this.emit(userId, fileId, { status: 'FAILED', error: message });
    }
    async assertQuota(userId, incoming) {
        // Phase 16: the ceiling is this account's entitlement, which is the plan limit
        // clamped to the deployment maximum. The deployment value is still what
        // decides the hard cap; a plan can only lower it.
        const entitlements = await this.entitlements.forUser(userId);
        const [count, aggregate] = await Promise.all([
            this.prisma.storedFile.count({ where: { userId } }),
            this.prisma.storedFile.aggregate({ where: { userId }, _sum: { sizeBytes: true } }),
        ]);
        const maxFiles = entitlements.limits.files.value;
        if (count >= maxFiles) {
            throw new api_error_1.ApiError(`This account already stores ${count} files (limit ${maxFiles} on the ${entitlements.plan} plan). Delete one before uploading another.`, 413, 'FILE_QUOTA_EXCEEDED');
        }
        const maxBytes = entitlements.limits.fileBytes.value;
        const used = aggregate._sum.sizeBytes ?? 0;
        if (used + incoming > maxBytes) {
            throw new api_error_1.ApiError(`This account stores ${used} bytes and the new file is ${incoming} bytes, over the ${maxBytes} byte quota on the ${entitlements.plan} plan.`, 413, 'FILE_QUOTA_EXCEEDED');
        }
    }
    /** A server-generated path: the uploader's name never reaches the filesystem. */
    relativePathFor(userId, extension) {
        const now = new Date();
        const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const suffix = extension ? `.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}` : '';
        return `user-${userId}/${month}/${(0, node_crypto_1.randomUUID)()}${suffix}`;
    }
    emit(userId, fileId, payload) {
        this.realtime.emitToUser(userId, 'file:update', { fileId, ...payload });
    }
};
exports.FileProcessorService = FileProcessorService;
exports.FileProcessorService = FileProcessorService = __decorate([
    (0, common_1.Injectable)(),
    __param(6, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        storage_service_1.StorageService,
        document_extractor_service_1.DocumentExtractorService,
        embedding_service_1.EmbeddingService,
        realtime_service_1.RealtimeService,
        entitlements_service_1.EntitlementsService, Object])
], FileProcessorService);
function sha256(bytes) {
    return (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex');
}
//# sourceMappingURL=file-processor.service.js.map