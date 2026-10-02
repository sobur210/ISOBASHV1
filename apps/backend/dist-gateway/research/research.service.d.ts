import { OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../shared/config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { AiRouterService } from '../ai/ai-router.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MemoryService } from '../memory/memory.service';
import { SessionUser } from '../auth/session.model';
import { SearchService } from './search.service';
import { WebRetrievalService } from './web-retrieval.service';
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
export declare class ResearchService implements OnModuleDestroy {
    private readonly prisma;
    private readonly ai;
    private readonly search;
    private readonly retrieval;
    private readonly realtime;
    private readonly memory;
    private readonly config;
    private readonly log;
    private readonly active;
    constructor(prisma: PrismaService, ai: AiRouterService, search: SearchService, retrieval: WebRetrievalService, realtime: RealtimeService, memory: MemoryService, config: AppConfig);
    onModuleDestroy(): void;
    capabilities(): {
        search: {
            available: boolean;
            provider: string | null;
            detail: string;
        };
        retrieval: {
            available: boolean;
            privateHostsAllowed: boolean;
            maxSources: number;
            maxCharactersPerSource: number;
            fetchTimeoutMs: number;
            detail: string;
        };
    };
    list(userId: number): import(".prisma/client").Prisma.PrismaPromise<({
        _count: {
            sources: number;
            citations: number;
        };
        sources: {
            host: string | null;
            id: string;
            status: import(".prisma/client").$Enums.ResearchSourceStatus;
            detail: string | null;
            title: string | null;
            url: string;
            characters: number;
            finalUrl: string | null;
            httpStatus: number | null;
            origin: string;
            fetchedAt: Date | null;
        }[];
        citations: ({
            source: {
                host: string | null;
                title: string | null;
                url: string;
            };
        } & {
            id: string;
            sourceId: string;
            sessionId: string;
            marker: string;
            quote: string;
            verified: boolean;
        })[];
    } & {
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.ResearchStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: number;
        projectId: number | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        question: string;
        answer: string | null;
        noEvidence: boolean;
        retrieval: string;
        queries: string[];
        searchedAt: Date | null;
    })[]>;
    get(userId: number, id: string): Promise<{
        sources: {
            host: string | null;
            id: string;
            status: import(".prisma/client").$Enums.ResearchSourceStatus;
            detail: string | null;
            content: string;
            title: string | null;
            url: string;
            characters: number;
            finalUrl: string | null;
            httpStatus: number | null;
            origin: string;
            fetchedAt: Date | null;
            sessionId: string;
        }[];
        citations: ({
            source: {
                host: string | null;
                id: string;
                title: string | null;
                url: string;
            };
        } & {
            id: string;
            sourceId: string;
            sessionId: string;
            marker: string;
            quote: string;
            verified: boolean;
        })[];
    } & {
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.ResearchStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: number;
        projectId: number | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        question: string;
        answer: string | null;
        noEvidence: boolean;
        retrieval: string;
        queries: string[];
        searchedAt: Date | null;
    }>;
    remove(userId: number, id: string): Promise<void>;
    /** Start a session and run it in the background, returning real initial state. */
    start(user: SessionUser, input: {
        question: string;
        urls?: string[];
        projectId?: number | null;
        model?: string;
    }): Promise<{
        sources: {
            host: string | null;
            id: string;
            status: import(".prisma/client").$Enums.ResearchSourceStatus;
            detail: string | null;
            content: string;
            title: string | null;
            url: string;
            characters: number;
            finalUrl: string | null;
            httpStatus: number | null;
            origin: string;
            fetchedAt: Date | null;
            sessionId: string;
        }[];
        citations: ({
            source: {
                host: string | null;
                id: string;
                title: string | null;
                url: string;
            };
        } & {
            id: string;
            sourceId: string;
            sessionId: string;
            marker: string;
            quote: string;
            verified: boolean;
        })[];
    } & {
        error: string | null;
        id: string;
        status: import(".prisma/client").$Enums.ResearchStatus;
        provider: string | null;
        model: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: number;
        projectId: number | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        question: string;
        answer: string | null;
        noEvidence: boolean;
        retrieval: string;
        queries: string[];
        searchedAt: Date | null;
    }>;
    private track;
    private execute;
    private transition;
    private synthesize;
    /** Keep one claim per marker: a repeated marker would violate the unique index. */
    private collectClaims;
    private emit;
}
