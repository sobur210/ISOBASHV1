import { Injectable, Logger } from '@nestjs/common';
import { InjectConfig } from '../shared/config/inject-config';
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

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Phase 11 web search.
 *
 * Search is a real HTTP call to a real provider, so it is only ever available when a
 * key is configured. With no key this reports `available: false` with the reason, and
 * research falls back to the sources the caller supplied. It never invents results.
 */
@Injectable()
export class SearchService {
  private readonly log = new Logger('WebSearch');

  constructor(@InjectConfig() private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.research.braveApiKey);
  }

  async search(query: string): Promise<SearchOutcome> {
    if (!this.enabled) {
      return {
        available: false,
        provider: null,
        detail: 'No web search provider is configured (BRAVE_SEARCH_API_KEY is unset), so only supplied URLs are retrieved.',
        hits: [],
      };
    }
    try {
      const response = await fetch(`${ENDPOINT}?q=${encodeURIComponent(query)}&count=${this.config.research.maxSources}`, {
        headers: {
          accept: 'application/json',
          'x-subscription-token': this.config.research.braveApiKey as string,
        },
        signal: AbortSignal.timeout(this.config.research.fetchTimeoutMs),
      });
      if (!response.ok) {
        throw new Error(`the search provider answered ${response.status}`);
      }
      const body = (await response.json()) as {
        web?: { results?: Array<{ url?: string; title?: string; description?: string }> };
      };
      const hits = (body.web?.results ?? [])
        .filter((row): row is { url: string; title?: string; description?: string } => typeof row.url === 'string')
        .map((row) => ({ url: row.url, title: row.title ?? null, snippet: row.description ?? null }));
      return { available: true, provider: 'brave', detail: `Brave returned ${hits.length} result(s).`, hits };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'the search call failed.';
      this.log.warn(`Web search failed: ${detail}`);
      return { available: false, provider: 'brave', detail: `Web search failed: ${detail}`, hits: [] };
    }
  }
}
