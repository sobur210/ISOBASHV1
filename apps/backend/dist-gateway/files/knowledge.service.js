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
exports.KnowledgeService = void 0;
exports.tokenise = tokenise;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const api_error_1 = require("../shared/errors/api-error");
const inject_config_1 = require("../shared/config/inject-config");
const prisma_service_1 = require("../prisma/prisma.service");
const embedding_service_1 = require("./embedding.service");
const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for', 'with', 'as', 'at', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'from', 'what',
    'which', 'who', 'how', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'i', 'you', 'we',
]);
const MAX_QUERY = 300;
const MAX_HITS = 25;
/**
 * How far the best chunk must stand out from the rest to count as relevant.
 * Both bounds are calibrated, not guessed: against nomic-embed-text, a genuine
 * match scored 0.58-0.70 while queries that mean nothing at all ("zzzqqqxx",
 * "quantum chromodynamics") still scored 0.40-0.51 against every chunk. A dense
 * search with no floor therefore always answers, which makes "nothing matches"
 * indistinguishable from "here is the least irrelevant chunk".
 */
const DEFAULT_MIN_VECTOR_SIMILARITY = 0.55;
const DEFAULT_MIN_VECTOR_MARGIN = 0.06;
/**
 * Phase 12 knowledge retrieval.
 *
 * Two real scorers, never one faked as the other:
 *  - keyword: BM25 over the caller's own chunks, with document frequencies read
 *    from PostgreSQL so a term that appears in everything scores nothing;
 *  - vector: cosine similarity between the query embedding and the stored chunk
 *    embeddings, computed in this process because the database has no vector
 *    extension.
 *
 * The response always says which one produced a hit (`matchedBy`) and states in
 * `detail` whether vector search ran at all. A caller must never have to guess
 * whether "no results" means "nothing matches" or "the vector half was missing".
 */
let KnowledgeService = class KnowledgeService {
    prisma;
    embeddings;
    config;
    constructor(prisma, embeddings, config) {
        this.prisma = prisma;
        this.embeddings = embeddings;
        this.config = config;
    }
    async search(userId, rawQuery, options = {}) {
        const started = Date.now();
        const query = (rawQuery ?? '').trim();
        if (!query) {
            throw new api_error_1.ApiError('A search query is required.', 400, 'VALIDATION_FAILED');
        }
        if (query.length > MAX_QUERY) {
            throw new api_error_1.ApiError(`The query exceeds ${MAX_QUERY} characters.`, 400, 'VALIDATION_FAILED');
        }
        const limit = Math.min(Math.max(options.limit ?? 8, 1), MAX_HITS);
        const terms = tokenise(query);
        const scope = {
            userId,
            ...(options.kind ? { kind: options.kind } : {}),
            ...(options.projectId !== undefined ? { projectId: options.projectId } : {}),
        };
        if (query.replace(/[^\p{L}\p{N}]+/gu, '').length === 0) {
            throw new api_error_1.ApiError('The query has no searchable terms.', 400, 'VALIDATION_FAILED');
        }
        const keyword = terms.length > 0 ? await this.keywordSearch(scope, terms, limit) : [];
        const vectorOutcome = await this.vectorSearch(scope, query, limit);
        const vector = vectorOutcome.hits;
        const vectorNote = vectorOutcome.note;
        const combined = combine(keyword, vector);
        const mode = keyword.length > 0 && vector.length > 0 ? 'hybrid' : vector.length > 0 ? 'vector' : 'keyword';
        const detail = [
            keyword.length > 0
                ? `Keyword matching found ${keyword.length} chunk(s).`
                : 'Keyword matching found no matching chunk.',
            vectorNote,
        ]
            .filter((part) => part.length > 0)
            .join(' ');
        return {
            query,
            terms,
            mode,
            detail,
            hits: combined.slice(0, limit),
            candidatesConsidered: keyword.length + vector.length,
            tookMs: Date.now() - started,
        };
    }
    async stats(userId) {
        const [files, chunks, embedded, characters, byKind, byStatus] = await Promise.all([
            this.prisma.storedFile.count({ where: { userId } }),
            this.prisma.fileChunk.count({ where: { file: { userId } } }),
            this.prisma.fileChunk.count({ where: { file: { userId }, embedding: { not: client_1.Prisma.DbNull } } }),
            this.prisma.storedFile.aggregate({ where: { userId }, _sum: { characters: true, sizeBytes: true } }),
            this.prisma.storedFile.groupBy({ by: ['kind'], where: { userId }, _count: { _all: true } }),
            this.prisma.storedFile.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } }),
        ]);
        const embedding = await this.embeddings.availability();
        return {
            files,
            chunks,
            embeddedChunks: embedded,
            characters: characters._sum.characters ?? 0,
            storedBytes: characters._sum.sizeBytes ?? 0,
            filesByKind: Object.fromEntries(byKind.map((row) => [row.kind, row._count._all])),
            filesByStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
            embeddings: embedding,
            searchCandidateLimit: this.config.files.searchCandidateLimit,
        };
    }
    async keywordSearch(scope, terms, limit) {
        const where = {
            file: {
                userId: scope.userId,
                status: 'READY',
                ...(scope.kind ? { kind: scope.kind } : {}),
                ...(scope.projectId !== undefined ? { projectId: scope.projectId } : {}),
            },
        };
        const totalChunks = await this.prisma.fileChunk.count({ where });
        if (totalChunks === 0)
            return [];
        const frequencies = await Promise.all(terms.map((term) => this.prisma.fileChunk.count({ where: { ...where, content: { contains: term, mode: 'insensitive' } } })));
        const averageLength = (await this.prisma.fileChunk.aggregate({ where, _avg: { characters: true } }))._avg.characters ?? 1;
        // BM25 constants: k1 controls term-frequency saturation, b the length penalty.
        const k1 = 1.2;
        const b = 0.75;
        const idf = frequencies.map((count) => Math.log(1 + (totalChunks - count + 0.5) / (count + 0.5)));
        const candidates = await this.prisma.fileChunk.findMany({
            where: {
                ...where,
                OR: terms.map((term) => ({ content: { contains: term, mode: 'insensitive' } })),
            },
            include: { file: { select: { id: true, originalName: true, kind: true } } },
            take: this.config.files.searchCandidateLimit,
            orderBy: { fileId: 'asc' },
        });
        return candidates
            .map((chunk) => {
            const tokens = tokenise(chunk.content);
            const counts = new Map();
            for (const token of tokens)
                counts.set(token, (counts.get(token) ?? 0) + 1);
            let score = 0;
            const matched = [];
            terms.forEach((term, index) => {
                const frequency = counts.get(term) ?? 0;
                if (frequency > 0)
                    matched.push(term);
                if (frequency === 0)
                    return;
                const lengthNorm = 1 - b + b * (chunk.characters / averageLength);
                score += idf[index] * ((frequency * (k1 + 1)) / (frequency + k1 * lengthNorm));
            });
            return { chunk, score, matched };
        })
            .filter((row) => row.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((row) => this.toHit(row.chunk, row.score, row.matched));
    }
    async vectorSearch(scope, query, limit) {
        if (!this.embeddings.enabled) {
            return { hits: [], note: 'Vector similarity did not run: embeddings are switched off (FILES_EMBEDDINGS_ENABLED=false).' };
        }
        const availability = await this.embeddings.availability();
        if (!availability.available) {
            return { hits: [], note: `Vector similarity did not run: ${availability.detail}` };
        }
        const queryOutcome = await this.embeddings.tryEmbed([query], 'RETRIEVAL_QUERY');
        if ('error' in queryOutcome) {
            return { hits: [], note: `Vector similarity did not run: the query could not be embedded (${queryOutcome.error}).` };
        }
        const [vector] = queryOutcome.batch.vectors;
        if (!vector || vector.length === 0) {
            return { hits: [], note: 'Vector similarity did not run: the provider returned an empty query embedding.' };
        }
        const chunks = await this.prisma.fileChunk.findMany({
            where: {
                file: {
                    userId: scope.userId,
                    status: 'READY',
                    ...(scope.kind ? { kind: scope.kind } : {}),
                    ...(scope.projectId !== undefined ? { projectId: scope.projectId } : {}),
                },
                embedding: { not: client_1.Prisma.DbNull },
            },
            include: { file: { select: { id: true, originalName: true, kind: true } } },
            take: this.config.files.searchCandidateLimit,
            orderBy: { fileId: 'asc' },
        });
        // Cosine similarity of unrelated text is not zero (it lands around 0.0-0.3),
        // so a dense search with no floor always returns its top-k, which would make
        // "nothing matches" indistinguishable from "here is the least irrelevant
        // chunk". Only a chunk meaningfully closer than the rest is a real hit, and
        // the margin over the weakest candidate is reported rather than hidden.
        const scored = chunks
            .map((chunk) => {
            const stored = Array.isArray(chunk.embedding) ? chunk.embedding.map(Number) : [];
            const similarity = stored.length === vector.length ? cosine(vector, stored) : null;
            return { chunk, similarity };
        })
            .filter((row) => row.similarity !== null)
            .sort((a, b) => b.similarity - a.similarity);
        const best = scored[0]?.similarity ?? 0;
        const floor = Math.max(this.config.files.minVectorSimilarity, best - this.config.files.minVectorMargin);
        const relevant = scored.filter((row) => row.similarity >= floor).slice(0, limit);
        const aboveFloor = relevant.length;
        return {
            hits: relevant.map((row) => this.toHit(row.chunk, row.similarity, [], 'vector')),
            note: aboveFloor === 0
                ? `Vector similarity ran over ${scored.length} embedded chunk(s) but nothing scored above the relevance floor (${floor.toFixed(3)}), so it returned no hits rather than its least irrelevant chunk.`
                : `Vector similarity ran over ${scored.length} embedded chunk(s) and ${aboveFloor} cleared the relevance floor (${floor.toFixed(3)}).`,
        };
    }
    toHit(chunk, score, matched, matchedBy = 'keyword') {
        return {
            chunkId: chunk.id,
            ordinal: chunk.ordinal,
            fileId: chunk.file.id,
            fileName: chunk.file.originalName,
            kind: chunk.file.kind,
            score: round(score),
            keywordScore: matchedBy === 'vector' ? null : round(score),
            vectorScore: matchedBy === 'keyword' ? null : round(score),
            matchedBy,
            characters: chunk.characters,
            snippet: snippet(chunk.content, matched),
        };
    }
};
exports.KnowledgeService = KnowledgeService;
exports.KnowledgeService = KnowledgeService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        embedding_service_1.EmbeddingService, Object])
], KnowledgeService);
function combine(keyword, vector) {
    if (vector.length === 0)
        return keyword;
    if (keyword.length === 0)
        return vector;
    const keywordMax = Math.max(...keyword.map((hit) => hit.score), Number.EPSILON);
    const vectorMax = Math.max(...vector.map((hit) => hit.score), Number.EPSILON);
    const byChunk = new Map();
    for (const hit of keyword) {
        byChunk.set(hit.chunkId, { ...hit, score: hit.score / keywordMax });
    }
    for (const hit of vector) {
        const existing = byChunk.get(hit.chunkId);
        const normalised = hit.score / vectorMax;
        if (existing) {
            byChunk.set(hit.chunkId, {
                ...existing,
                score: round(existing.score * 0.5 + normalised * 0.5),
                vectorScore: hit.vectorScore,
                matchedBy: 'hybrid',
            });
            continue;
        }
        byChunk.set(hit.chunkId, { ...hit, score: round(normalised * 0.5) });
    }
    return [...byChunk.values()].sort((a, b) => b.score - a.score);
}
function tokenise(value) {
    return value
        .toLowerCase()
        .split(/[^\p{L}\p{N}_-]+/u)
        .map((token) => token.replace(/^-+|-+$/g, ''))
        .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
        .slice(0, 24);
}
function snippet(content, matched) {
    const limit = 320;
    if (content.length <= limit)
        return content;
    if (matched.length === 0)
        return `${content.slice(0, limit)}…`;
    const lower = content.toLowerCase();
    let at = -1;
    for (const term of matched) {
        const index = lower.indexOf(term);
        if (index >= 0 && (at < 0 || index < at))
            at = index;
    }
    if (at < 0)
        return `${content.slice(0, limit)}…`;
    const start = Math.max(0, at - Math.floor(limit / 3));
    return `${start > 0 ? '…' : ''}${content.slice(start, start + limit)}…`;
}
function cosine(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let index = 0; index < a.length; index += 1) {
        dot += a[index] * b[index];
        normA += a[index] * a[index];
        normB += b[index] * b[index];
    }
    if (normA === 0 || normB === 0)
        return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
function round(value) {
    return Math.round(value * 10000) / 10000;
}
//# sourceMappingURL=knowledge.service.js.map