import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { AiRouterService } from '../ai/ai-router.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MemoryService } from '../memory/memory.service';
import { SessionUser } from '../auth/session.model';
import { SearchService } from './search.service';
import { WebRetrievalService } from './web-retrieval.service';

const MAX_QUESTION = 2000;
const MAX_URLS = 6;
const MARKER_IN_ANSWER = /\[\d+\]/;

type CitationClaim = { marker: string; quote: string };

/**
 * Phase 11 research.
 *
 *   PENDING -> SEARCHING -> RETRIEVING -> ANSWERING -> COMPLETED | FAILED
 *
 * The answer is only ever written from text this process actually fetched, and every
 * citation is checked against that text: a citation whose quote cannot be found in its
 * source is stored with `verified: false` rather than silently presented as evidence.
 * When nothing could be retrieved the run fails with the real reason instead of
 * answering from the model's own memory.
 */
@Injectable()
export class ResearchService implements OnModuleDestroy {
  private readonly log = new Logger('Research');
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiRouterService,
    private readonly search: SearchService,
    private readonly retrieval: WebRetrievalService,
    private readonly realtime: RealtimeService,
    private readonly memory: MemoryService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  onModuleDestroy() {
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }

  capabilities() {
    return {
      search: {
        available: this.search.enabled,
        provider: this.search.enabled ? 'brave' : null,
        detail: this.search.enabled
          ? 'Web search is available through Brave.'
          : 'No web search provider is configured (BRAVE_SEARCH_API_KEY is unset); research falls back to URLs the caller supplies.',
      },
      retrieval: {
        available: true,
        privateHostsAllowed: this.retrieval.privateHostsAllowed,
        maxSources: this.config.research.maxSources,
        maxCharactersPerSource: this.config.research.maxCharactersPerSource,
        fetchTimeoutMs: this.config.research.fetchTimeoutMs,
        detail: 'URLs are fetched server-side; private, loopback and link-local addresses are refused unless RESEARCH_ALLOW_PRIVATE_HOSTS=true.',
      },
    };
  }

  list(userId: number) {
    return this.prisma.researchSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        // The extracted page text is deliberately left out of the list: it is the largest
        // field in the schema and the list only needs metadata to render a sidebar.
        sources: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            url: true,
            finalUrl: true,
            title: true,
            host: true,
            status: true,
            detail: true,
            httpStatus: true,
            characters: true,
            origin: true,
            fetchedAt: true,
          },
        },
        citations: { include: { source: { select: { url: true, title: true, host: true } } } },
        _count: { select: { sources: true, citations: true } },
      },
    });
  }

  async get(userId: number, id: string) {
    const session = await this.prisma.researchSession.findFirst({
      where: { id, userId },
      include: {
        sources: { orderBy: { id: 'asc' } },
        citations: { include: { source: { select: { id: true, url: true, title: true, host: true } } } },
      },
    });
    if (!session) {
      throw new NotFoundException('Research session not found.');
    }
    return session;
  }

  async remove(userId: number, id: string) {
    await this.get(userId, id);
    await this.prisma.researchSession.delete({ where: { id } });
  }

  /** Start a session and run it in the background, returning real initial state. */
  async start(user: SessionUser, input: { question: string; urls?: string[]; projectId?: number | null; model?: string }) {
    const question = input.question.trim();
    if (!question) {
      throw new BadRequestException('A research question is required.');
    }
    if (question.length > MAX_QUESTION) {
      throw new BadRequestException(`The question exceeds ${MAX_QUESTION} characters.`);
    }
    const supplied = normaliseUrls(input.urls ?? [], MAX_URLS);
    if (input.projectId !== undefined && input.projectId !== null) {
      const owned = await this.prisma.project.findFirst({
        where: { id: input.projectId, ownerId: user.id },
        select: { id: true },
      });
      if (!owned) {
        throw new BadRequestException('Project not found.');
      }
    }

    const session = await this.prisma.researchSession.create({
      data: {
        question,
        userId: user.id,
        projectId: input.projectId ?? null,
        status: 'PENDING',
        retrieval: supplied.length > 0 ? 'supplied' : 'none',
        ...(supplied.length > 0
          ? {
              sources: {
                create: supplied.map((url) => ({ url, origin: 'supplied', status: 'PENDING' })),
              },
            }
          : {}),
      },
    });

    this.track(this.execute(session.id, user, question, supplied, input.model ?? null, input.projectId ?? null));
    return this.get(user.id, session.id);
  }

  private track(promise: Promise<void>) {
    promise.catch((error: unknown) => {
      this.log.error(`Research run crashed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async execute(
    sessionId: string,
    user: SessionUser,
    question: string,
    supplied: string[],
    model: string | null,
    projectId: number | null,
  ) {
    const controller = new AbortController();
    this.active.set(sessionId, controller);

    try {
      await this.transition(sessionId, user.id, supplied.length > 0 ? 'RETRIEVING' : 'SEARCHING');
      await this.prisma.researchSession.update({ where: { id: sessionId }, data: { startedAt: new Date() } });

      // 1. Search (real provider call, or an honest "not configured").
      const outcome = await this.search.search(question);
      const searched = outcome.hits.map((hit) => hit.url);
      const retrieval = [outcome.available ? 'search' : null, supplied.length > 0 ? 'supplied' : null]
        .filter(Boolean)
        .join('+') || 'none';
      await this.prisma.researchSession.update({
        where: { id: sessionId },
        data: { retrieval, searchedAt: outcome.available ? new Date() : null, queries: [question] },
      });
      this.emit(user.id, sessionId, { status: outcome.available ? 'SEARCHING' : 'RETRIEVING', detail: outcome.detail });

      // 2. Retrieve every distinct URL for real.
      const urls = dedupe([...supplied, ...searched]).slice(0, this.config.research.maxSources);
      const result = await this.retrieval.retrieveMany(urls);
      for (const failure of result.failures) {
        // A refusal or a dead host is recorded on its own row: dropping it would make the
        // run look like it simply had fewer sources than it really tried.
        await this.prisma.researchSource.updateMany({
          where: { sessionId, url: failure.url, status: 'PENDING' },
          data: { status: 'FAILED', detail: `${failure.code}: ${failure.detail}` },
        });
      }

      const persisted = [];
      for (const [index, source] of result.sources.entries()) {
        const row = await this.prisma.researchSource.upsert({
          where: { sessionId_url: { sessionId, url: source.url } },
          create: {
            sessionId,
            url: source.url,
            finalUrl: source.finalUrl === source.url ? null : source.finalUrl,
            title: source.title,
            host: source.host,
            status: 'FETCHED',
            httpStatus: source.status,
            content: source.text,
            characters: source.characters,
            origin: searched.includes(source.url) ? 'search' : 'supplied',
            fetchedAt: new Date(),
          },
          update: {
            finalUrl: source.finalUrl === source.url ? null : source.finalUrl,
            title: source.title,
            host: source.host,
            status: 'FETCHED',
            httpStatus: source.status,
            content: source.text,
            characters: source.characters,
            detail: null,
            fetchedAt: new Date(),
          },
        });
        persisted.push({ ...row, marker: `[${index + 1}]` });
      }
      this.emit(user.id, sessionId, { status: 'RETRIEVING', fetched: persisted.length, failed: result.failures.length });

      if (persisted.length === 0) {
        const detail = result.failures[0]?.detail ?? 'No source could be retrieved.';
        throw new Error(`NO_SOURCES: ${detail}`);
      }

      // 3. Answer only from the retrieved text. A model that answers without citing has not
      //    done research, so the run is repaired once and then fails honestly if it still
      //    produces no citation.
      await this.transition(sessionId, user.id, 'ANSWERING');
      const brief = [
        'You answer strictly from the numbered sources below. You may not use outside knowledge.',
        'Cite every factual claim with the matching source marker, like [1] or [2][3].',
        'Reply with one JSON object and nothing else:',
        '{"verdict":"answered|not_covered","answer":"markdown answer with [n] markers","citations":[{"marker":"[1]","quote":"a sentence copied verbatim from that source"}]}',
        'If the sources really do not answer the question, reply with verdict "not_covered",',
        'answer describing what the sources do cover, and an empty citations array.',
        'Otherwise verdict is "answered", the answer carries the markers, and every marker used has a citation.',
        '',
        `Question: ${question}`,
        '',
        'Sources:',
        ...persisted.map(
          (source) => `${source.marker} url=${source.url} title=${source.title ?? '(none)'}\n${source.content}`,
        ),
      ].join('\n');
      const markers = persisted.map((source) => source.marker);

      let response = await this.synthesize(brief, model);
      let parsed = extractJson(response.output);
      let answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : '';
      let claims = this.collectClaims(parsed, markers);
      // "The sources do not cover this" is a real research result. It is only honoured
      // when the model says so explicitly, so it can never be used to smuggle in an
      // uncited answer.
      const noEvidence = parsed?.verdict === 'not_covered';

      if (!answer) {
        throw new Error(`ANSWER_INVALID: the model did not return an answer. Raw output: ${response.output.slice(0, 500)}`);
      }
      if (!noEvidence && (claims.length === 0 || !MARKER_IN_ANSWER.test(answer))) {
        this.log.warn(`Research ${sessionId}: model produced no complete citation; retrying once.`);
        response = await this.synthesize(
          `${brief}\n\nYour previous reply was rejected${claims.length === 0 ? ' because it carried no usable citation' : ' because the answer text cited no source marker'}.\nYou must use only these markers: ${markers.join(' ')}\nWrite every marker inline in the answer text after the claim it supports, and give at least one citation whose "quote" is copied word for word from that source.`,
          model,
        );
        parsed = extractJson(response.output);
        answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : answer;
        claims = this.collectClaims(parsed, markers);
      }
      if (!noEvidence && claims.length === 0) {
        throw new Error(
          `ANSWER_UNCITED: the model would not cite the retrieved sources, so no answer was stored. Raw output: ${response.output.slice(0, 500)}`,
        );
      }
      if (noEvidence) claims = [];

      await this.prisma.researchCitation.deleteMany({ where: { sessionId } });
      const byMarker = new Map(persisted.map((source) => [source.marker, source]));
      for (const claim of claims) {
        const source = byMarker.get(claim.marker);
        if (!source) continue;
        // A quote that is not in the source is kept, but marked unverified: hiding it
        // would lose information and presenting it as evidence would be a lie.
        const quote = claim.quote.trim().slice(0, 600);
        const verified = containsQuote(source.content, quote);
        await this.prisma.researchCitation.create({
          data: { sessionId, sourceId: source.id, marker: claim.marker, quote, verified },
        });
      }

      await this.prisma.researchSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          answer,
          noEvidence,
          provider: response.provider,
          model: response.model,
          finishedAt: new Date(),
        },
      });
      this.emit(user.id, sessionId, { status: 'COMPLETED', noEvidence });

      await this.memory.create(
        { userId: user.id, ...(projectId !== null ? { projectId } : {}) },
        {
          content: `${noEvidence ? 'Research (no evidence found)' : 'Research'}: ${question}\n${answer}`.slice(0, 2000),
          kind: 'SUMMARY',
          source: 'research',
          sourceId: sessionId,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research failed.';
      await this.prisma.researchSession.update({
        where: { id: sessionId },
        data: { status: 'FAILED', error: message, finishedAt: new Date() },
      });
      this.emit(user.id, sessionId, { status: 'FAILED', error: message });
      this.log.warn(`Research ${sessionId} FAILED: ${message}`);
    } finally {
      this.active.delete(sessionId);
    }
  }

  private async transition(sessionId: string, userId: number, status: 'SEARCHING' | 'RETRIEVING' | 'ANSWERING') {
    await this.prisma.researchSession.update({ where: { id: sessionId }, data: { status } });
    this.emit(userId, sessionId, { status });
  }

  private synthesize(brief: string, model?: string | null) {
    return this.ai.execute({
      capability: 'language',
      input: brief,
      ...(model ? { model } : {}),
      responseFormat: 'json',
    });
  }

  /** Keep one claim per marker: a repeated marker would violate the unique index. */
  private collectClaims(parsed: Record<string, unknown> | null, markers: string[]): CitationClaim[] {
    const claims = (Array.isArray(parsed?.citations) ? parsed.citations : [])
      .filter((claim): claim is CitationClaim => typeof claim?.marker === 'string' && typeof claim?.quote === 'string')
      .map((claim) => ({ marker: claim.marker.trim(), quote: claim.quote.trim() }))
      .filter((claim) => markers.includes(claim.marker) && claim.quote.length > 0);

    const seen = new Set<string>();
    return claims
      .filter((claim) => (seen.has(claim.marker) ? false : seen.add(claim.marker)))
      .slice(0, markers.length);
  }

  private emit(userId: number, sessionId: string, payload: Record<string, unknown>) {
    this.realtime.emitToUser(userId, 'research:update', { sessionId, ...payload });
  }
}

/** Whitespace-tolerant containment: a quote copied with different line breaks still verifies. */
function containsQuote(content: string, quote: string): boolean {
  const flatten = (value: string) => value.replace(/\s+/g, ' ').trim();
  const haystack = flatten(content);
  const needle = flatten(quote);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  if (needle.length > 200) return haystack.includes(needle.slice(0, 200));
  return false;
}

function normaliseUrls(urls: string[], max: number): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const value = raw.trim();
    if (!value) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException(`"${value}" is not a valid absolute URL.`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException(`Refusing the ${parsed.protocol} scheme; only http and https are retrieved.`);
    }
    if (!out.includes(parsed.toString())) out.push(parsed.toString());
    if (out.length >= max) break;
  }
  return out;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
