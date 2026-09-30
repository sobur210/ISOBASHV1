import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiError } from '../shared/errors/api-error';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

export type KnowledgeHit = {
  chunkId: string;
  ordinal: number;
  fileId: string;
  fileName: string;
  kind: string;
  score: number;
  keywordScore: number | null;
  vectorScore: number | null;
  matchedBy: 'keyword' | 'vector' | 'hybrid';
  characters: number;
  snippet: string;
};

export type KnowledgeSearchResult = {
  query: string;
  terms: string[];
  mode: 'keyword' | 'vector' | 'hybrid';
  detail: string;
  hits: KnowledgeHit[];
  candidatesConsidered: number;
  tookMs: number;
};

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
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async search(userId: number, rawQuery: string, options: { limit?: number; kind?: string; projectId?: number } = {}): Promise<KnowledgeSearchResult> {
    const started = Date.now();
    const query = (rawQuery ?? '').trim();
    if (!query) {
      throw new ApiError('A search query is required.', 400, 'VALIDATION_FAILED');
    }
    if (query.length > MAX_QUERY) {
      throw new ApiError(`The query exceeds ${MAX_QUERY} characters.`, 400, 'VALIDATION_FAILED');
    }
    const limit = Math.min(Math.max(options.limit ?? 8, 1), MAX_HITS);
    const terms = tokenise(query);
    const scope = {
      userId,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.projectId !== undefined ? { projectId: options.projectId } : {}),
    };

    if (query.replace(/[^\p{L}\p{N}]+/gu, '').length === 0) {
      throw new ApiError('The query has no searchable terms.', 400, 'VALIDATION_FAILED');
    }

    const keyword = terms.length > 0 ? await this.keywordSearch(scope, terms, limit) : [];
    const vectorOutcome = await this.vectorSearch(scope, query, limit);
    const vector = vectorOutcome.hits;
    const vectorNote = vectorOutcome.note;

    const combined = combine(keyword, vector);
    const mode: KnowledgeSearchResult['mode'] = keyword.length > 0 && vector.length > 0 ? 'hybrid' : vector.length > 0 ? 'vector' : 'keyword';
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

  async stats(userId: number) {
    const [files, chunks, embedded, characters, byKind, byStatus] = await Promise.all([
      this.prisma.storedFile.count({ where: { userId } }),
      this.prisma.fileChunk.count({ where: { file: { userId } } }),
      this.prisma.fileChunk.count({ where: { file: { userId }, embedding: { not: Prisma.DbNull } } }),
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

  private async keywordSearch(
    scope: { userId: number; kind?: string; projectId?: number },
    terms: string[],
    limit: number,
  ): Promise<KnowledgeHit[]> {
    const where = {
      file: {
        userId: scope.userId,
        status: 'READY' as const,
        ...(scope.kind ? { kind: scope.kind } : {}),
        ...(scope.projectId !== undefined ? { projectId: scope.projectId } : {}),
      },
    };

    const totalChunks = await this.prisma.fileChunk.count({ where });
    if (totalChunks === 0) return [];

    const frequencies = await Promise.all(
      terms.map((term) =>
        this.prisma.fileChunk.count({ where: { ...where, content: { contains: term, mode: 'insensitive' as const } } }),
      ),
    );
    const averageLength = (
      await this.prisma.fileChunk.aggregate({ where, _avg: { characters: true } })
    )._avg.characters ?? 1;

    // BM25 constants: k1 controls term-frequency saturation, b the length penalty.
    const k1 = 1.2;
    const b = 0.75;
    const idf = frequencies.map((count) => Math.log(1 + (totalChunks - count + 0.5) / (count + 0.5)));

    const candidates = await this.prisma.fileChunk.findMany({
      where: {
        ...where,
        OR: terms.map((term) => ({ content: { contains: term, mode: 'insensitive' as const } })),
      },
      include: { file: { select: { id: true, originalName: true, kind: true } } },
      take: this.config.files.searchCandidateLimit,
      orderBy: { fileId: 'asc' },
    });

    return candidates
      .map((chunk) => {
        const tokens = tokenise(chunk.content);
        const counts = new Map<string, number>();
        for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
        let score = 0;
        const matched: string[] = [];
        terms.forEach((term, index) => {
          const frequency = counts.get(term) ?? 0;
          if (frequency > 0) matched.push(term);
          if (frequency === 0) return;
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

  private async vectorSearch(
    scope: { userId: number; kind?: string; projectId?: number },
    query: string,
    limit: number,
  ): Promise<{ hits: KnowledgeHit[]; note: string }> {
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
          status: 'READY' as const,
          ...(scope.kind ? { kind: scope.kind } : {}),
          ...(scope.projectId !== undefined ? { projectId: scope.projectId } : {}),
        },
        embedding: { not: Prisma.DbNull },
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
        const stored = Array.isArray(chunk.embedding) ? (chunk.embedding as unknown[]).map(Number) : [];
        const similarity = stored.length === vector.length ? cosine(vector, stored) : null;
        return { chunk, similarity };
      })
      .filter((row): row is { chunk: (typeof chunks)[number]; similarity: number } => row.similarity !== null)
      .sort((a, b) => b.similarity - a.similarity);

    const best = scored[0]?.similarity ?? 0;
    const floor = Math.max(this.config.files.minVectorSimilarity, best - this.config.files.minVectorMargin);
    const relevant = scored.filter((row) => row.similarity >= floor).slice(0, limit);
    const aboveFloor = relevant.length;

    return {
      hits: relevant.map((row) => this.toHit(row.chunk, row.similarity, [], 'vector')),
      note:
        aboveFloor === 0
          ? `Vector similarity ran over ${scored.length} embedded chunk(s) but nothing scored above the relevance floor (${floor.toFixed(3)}), so it returned no hits rather than its least irrelevant chunk.`
          : `Vector similarity ran over ${scored.length} embedded chunk(s) and ${aboveFloor} cleared the relevance floor (${floor.toFixed(3)}).`,
    };
  }

  private toHit(
    chunk: { id: string; ordinal: number; characters: number; content: string } & { file: { id: string; originalName: string; kind: string } },
    score: number,
    matched: string[],
    matchedBy: KnowledgeHit['matchedBy'] = 'keyword',
  ): KnowledgeHit {
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
}

function combine(keyword: KnowledgeHit[], vector: KnowledgeHit[]): KnowledgeHit[] {
  if (vector.length === 0) return keyword;
  if (keyword.length === 0) return vector;
  const keywordMax = Math.max(...keyword.map((hit) => hit.score), Number.EPSILON);
  const vectorMax = Math.max(...vector.map((hit) => hit.score), Number.EPSILON);
  const byChunk = new Map<string, KnowledgeHit>();

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

export function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.replace(/^-+|-+$/g, ''))
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
    .slice(0, 24);
}

function snippet(content: string, matched: string[]): string {
  const limit = 320;
  if (content.length <= limit) return content;
  if (matched.length === 0) return `${content.slice(0, limit)}…`;
  const lower = content.toLowerCase();
  let at = -1;
  for (const term of matched) {
    const index = lower.indexOf(term);
    if (index >= 0 && (at < 0 || index < at)) at = index;
  }
  if (at < 0) return `${content.slice(0, limit)}…`;
  const start = Math.max(0, at - Math.floor(limit / 3));
  return `${start > 0 ? '…' : ''}${content.slice(start, start + limit)}…`;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
