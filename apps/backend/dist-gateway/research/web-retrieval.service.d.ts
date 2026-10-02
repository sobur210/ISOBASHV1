import { AppConfig } from '../shared/config/configuration';
export type RetrievedSource = {
    url: string;
    finalUrl: string;
    title: string | null;
    host: string;
    status: number;
    text: string;
    characters: number;
    truncated: boolean;
};
export type RetrievalFailure = {
    url: string;
    code: string;
    detail: string;
};
export type RetrievalResult = {
    sources: RetrievedSource[];
    failures: RetrievalFailure[];
};
/**
 * Phase 11 web retrieval.
 *
 * Every fetch is a server-side request, so the interesting part is what it refuses.
 * Before a single byte is read the hostname is resolved and every returned address is
 * checked against loopback, private, link-local, unique-local and reserved ranges, and
 * redirects are re-checked at each hop. A research answer that reads
 * `http://169.254.169.254/` or `file://` is an exfiltration bug, not a feature.
 *
 * `RESEARCH_ALLOW_PRIVATE_HOSTS=true` lifts the private-range block. It exists for
 * local verification against a fixture server and is off everywhere else.
 */
export declare class WebRetrievalService {
    private readonly config;
    private readonly log;
    constructor(config: AppConfig);
    get privateHostsAllowed(): boolean;
    retrieveMany(urls: string[]): Promise<RetrievalResult>;
    retrieve(rawUrl: string): Promise<RetrievedSource>;
    /** DNS-resolve and reject anything that is not a public unicast address. */
    private assertPublicHost;
    private isBlockedAddress;
    private request;
    private readBody;
}
export declare class RetrievalError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
