export declare class StartResearchDto {
    question: string;
    /** URLs the caller already trusts. Retrieved for real, with the same SSRF guards. */
    urls?: string[];
    projectId?: number;
    /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
    model?: string;
}
