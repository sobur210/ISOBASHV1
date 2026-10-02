import { AppConfig } from '../shared/config/configuration';
export type SearchHit = {
    url: string;
    title: string | null;
    snippet: string | null;
};
export type SearchOutcome = {
    available: boolean;
    provider: string | null;
    /** The exact reason retrieval-by-search is unavailable, surfaced instead of hidden. */
    detail: string;
    hits: SearchHit[];
};
/**
 * Phase 11 web search.
 *
 * Search is a real HTTP call to a real provider, so it is only ever available when a
 * key is configured. With no key this reports `available: false` with the reason, and
 * research falls back to the sources the caller supplied. It never invents results.
 */
export declare class SearchService {
    private readonly config;
    private readonly log;
    constructor(config: AppConfig);
    get enabled(): boolean;
    search(query: string): Promise<SearchOutcome>;
}
