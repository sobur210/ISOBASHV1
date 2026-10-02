import { PrismaService } from '../prisma/prisma.service';
import { AiProviderRegistry } from './provider.registry';
import { VideoProvider } from './video-provider.types';
export type CreditMonthSummary = {
    provider: string;
    /** `YYYY-MM` in UTC. */
    month: string;
    /** The provider's own figure, when it could be read. */
    liveBalance: number | null;
    liveBalanceReadable: boolean;
    /** When the balance was last actually read from the provider. */
    liveBalanceAt: string | null;
    /** Optional operator cap, independent of what the account holds. */
    budgetCap: number | null;
    /** Credits deliberately held back so a long render cannot start and not finish. */
    reserve: number;
    /** Credits the ledger attributes to this month. */
    ledgerEstimated: number;
    ledgerCharged: number;
    ledgerRefunded: number;
    ledgerReleased: number;
    ledgerEntries: number;
    /** What the guard would allow to be spent right now, or null when it cannot tell. */
    spendable: number | null;
    /** Why `spendable` is null, so the admin view can say so out loud. */
    spendableNote: string | null;
    recent: {
        videoGenerationId: string;
        state: string;
        estimatedCredits: number;
        chargedCredits: number | null;
        refundedCredits: number | null;
        model: string | null;
        providerProjectId: string | null;
        note: string | null;
        createdAt: string;
        userId: number;
    }[];
};
type Reservation = {
    videoGenerationId: string;
    userId: number;
    model: string | null;
    estimatedCredits: number;
};
/**
 * Phase 15: the shared credit pool.
 *
 * The problem this solves is specific and worth stating plainly. Magic Hour bills
 * one API key, so every ISOBASH user renders out of the same 400-credit monthly
 * pool. There is no per-user allowance to enforce and no provider-side quota to
 * lean on; if ISOBASH submits four renders at once, they all spend the same money
 * and the first three may complete while the fourth is refused by a provider error
 * the user has already waited for.
 *
 * So the affordability decision is made here, before anything is submitted, from
 * the provider's own balance. The rules:
 *
 *  1. The provider's balance is the authority. A local ledger cannot see renders
 *     started outside ISOBASH, nor anything spent before a reinstall, so it is used
 *     for attribution and reporting, never to decide whether the pool can pay.
 *  2. An unknown balance stops spending. If the provider cannot be read and no
 *     recent snapshot survives, the answer is "refuse", not "assume it is fine".
 *  3. A render that would breach the reserve is refused up front. The reserve exists
 *     because a long render can start with just enough credits left and then fail
 *     part-way through, wasting both the credits and the user's wait.
 *  4. Every reservation is recorded before submission, so a run that spends credits
 *     always has a row saying so, including when it fails afterwards.
 */
export declare class ProviderCreditService {
    private readonly prisma;
    private readonly registry;
    private readonly log;
    constructor(prisma: PrismaService, registry: AiProviderRegistry);
    /**
     * The registered adapter for a provider, as a metered video provider.
     *
     * Resolved here rather than passed in by callers so that the affordability check
     * cannot be made against a pool nobody is actually reading: whoever asks gets the
     * same adapter the router would.
     */
    private adapterFor;
    /** `YYYY-MM` in UTC. Pinned to UTC so the pool boundary is not a timezone guess. */
    month(at?: Date): string;
    /**
     * Price a render before submitting it.
     *
     * Returns null for a model this build has no published cost for, which the caller
     * must treat as "cannot be priced, therefore must not be submitted". A confident
     * wrong number here is the one way to spend a pool that is meant to be protected.
     */
    estimate(params: {
        model: string;
        resolution?: string | null;
        seconds: number;
        withAudio?: boolean;
    }): number | null;
    /**
     * Refuse a render the shared pool cannot pay for.
     *
     * Throws rather than returning a boolean, because every caller has the same
     * obligation when this says no: do not submit, and tell the user why.
     */
    assertAffordable(params: {
        provider: string;
        adapter?: VideoProvider | null;
        model: string;
        resolution?: string | null;
        seconds: number;
        withAudio?: boolean;
    }): Promise<number>;
    /**
     * Record the intent to spend, before the provider is called.
     *
     * Idempotent on `videoGenerationId`: a retried reservation returns the row that
     * already exists instead of creating a second charge.
     */
    reserve(input: Reservation): Promise<void>;
    /**
     * Settle a reservation against what the provider actually reported.
     *
     * `CHARGED` is the only state that is a fact. A refund is recorded as a refund
     * rather than as a zero-cost success, because "this render failed and the
     * provider gave the credits back" and "this render was free" are different
     * stories and the admin view must be able to tell them apart.
     */
    settle(params: {
        videoGenerationId: string;
        state: 'CHARGED' | 'REFUNDED';
        chargedCredits?: number | null;
        refundedCredits?: number | null;
        providerProjectId?: string | null;
        note?: string | null;
    }): Promise<void>;
    /**
     * Give a reservation back without spending it.
     *
     * Used when a run was recorded but never reached the provider, for example when a
     * local check refused it. The row is kept so the attempt is visible in the admin
     * view rather than silently absent.
     */
    release(videoGenerationId: string, note: string): Promise<void>;
    /**
     * The one call a render path needs: decide whether the shared pool can pay, and if
     * so record the reservation before anything is submitted.
     *
     * Returns `null` when the request is not aimed at a metered provider, so a
     * deployment that renders through an unmetered renderer takes no code path here
     * and gets no ledger rows.
     *
     * Throws when the pool cannot pay. Callers treat a throw as a refusal to submit,
     * which is the whole point: the user learns the pool is spent before waiting for
     * a render that would have been rejected anyway.
     */
    reserveIfAffordable(params: {
        provider: string;
        videoGenerationId: string;
        userId: number;
        /** Pinned as `magic-hour` or `magic-hour:<model>`, or null to let the router choose. */
        model: string | null;
        seconds: number;
        withAudio?: boolean;
        resolution?: string | null;
    }): Promise<{
        model: string;
        estimated: number;
    } | null>;
    /** The model an unpinned request will be billed for, or null if the adapter cannot say. */
    private defaultModelFor;
    /**
     * Settle a run that finished, against the provider's own figures.
     *
     * A completed render is charged whatever the provider finally said, which may be
     * more or less than the estimate taken before submission. A failure is refunded,
     * per the provider's documented behaviour -- but only when the provider actually
     * issued a project, because a request refused before a project exists was never
     * billed and calling that a refund would overstate what came back.
     */
    settleRun(params: {
        videoGenerationId: string;
        succeeded: boolean;
        metering?: {
            providerProjectId: string | null;
            creditsCharged: number | null;
            creditsChargedIsEstimate: boolean;
        } | null;
        error?: string | null;
    }): Promise<void>;
    /**
     * Attach a note to an existing entry without changing its state.
     *
     * Used where the truth is "unknown, and deliberately not guessed": a render ISOBASH
     * stopped watching, where recording either a charge or a refund would be fiction.
     */
    annotate(videoGenerationId: string, note: string): Promise<void>;
    /** The whole picture for the admin view, and the basis of the affordability check. */
    summary(provider: string, adapter?: VideoProvider | null): Promise<CreditMonthSummary>;
    /**
     * Read the provider's balance and record it.
     *
     * Falls back to the last recorded snapshot when the provider cannot be reached,
     * but only while that snapshot is young. Past the age limit the caller is told the
     * balance is unknown, because a stale "400" is indistinguishable from a pool that
     * is now empty, and optimistically believing it is how a pool gets drained.
     */
    private refreshBalance;
}
export {};
