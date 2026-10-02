import { SessionUser } from '../auth/session.model';
import { StartResearchDto } from './dto/research.dto';
import { ResearchService } from './research.service';
export declare class ResearchController {
    private readonly research;
    constructor(research: ResearchService);
    /** What research can actually do right now, reported honestly. */
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
    list(user: SessionUser): import(".prisma/client").Prisma.PrismaPromise<({
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
    get(user: SessionUser, id: string): Promise<{
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
    start(user: SessionUser, body: StartResearchDto): Promise<{
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
    remove(user: SessionUser, id: string): Promise<void>;
}
