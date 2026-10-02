/**
 * Magic Hour credit costs, transcribed from the published pricing table.
 *
 *   https://docs.magichour.ai/api-reference/models
 *
 * This exists so ISOBASH can answer "what will this render cost" *before* spending
 * anything. The shared free pool is small enough (400 credits, and a 4 second clip
 * is 96 of them) that a request which cannot be afforded must be refused up front
 * rather than discovered as a provider error after the fact.
 *
 * The numbers here are an ESTIMATE and are labelled as such everywhere they are
 * used. They are never added to the ledger as if they were the truth: the
 * authoritative figure is the `credits_charged` the provider reports, which it
 * revises once the real output frame rate is known, and which is refunded in full
 * when a render fails.
 */
export type MagicHourModelCost = {
    /** Null when the model/resolution combination is not in the published table. */
    creditsPerSecond: number | null;
    /** Per-second cost times the clip length, before any audio surcharge. */
    estimated: number | null;
    /** True when the estimate covers audio, false when audio is not supported. */
    audioSupported: boolean;
    audioSurcharge: number | null;
};
/**
 * Models the free plan can actually use. Sending a paid-only model id on a free
 * key returns a provider error, so the UI must not offer one.
 */
export declare const MAGIC_HOUR_FREE_MODELS: readonly ["ltx-2.5", "minimax-h3"];
/** Every model the API accepts, free and paid, for validation and the admin view. */
export declare const MAGIC_HOUR_MODELS: readonly ["ltx-2.5", "minimax-h3", "kling-3.0", "kling-2.6", "veo3.1", "veo3.1-lite", "wan-2.2", "gemini-omni-1.1", "seedance-1.5", "seedance-2.0", "seedance-2.0-mini", "seedance-2.5", "sora-2", "ltx-2.3"];
/** The highest resolution the free plan is allowed to ask for. */
export declare const MAGIC_HOUR_FREE_MAX_RESOLUTION = "480p";
export declare function isMagicHourModel(value: string): boolean;
/**
 * Estimate a render's cost. Returns nulls rather than a guess when the combination
 * is not in the table: an unknown combination must not be turned into a confident
 * number that lets an unaffordable render through.
 */
export declare function estimateMagicHourCredits(params: {
    model: string;
    resolution: string;
    seconds: number;
    withAudio: boolean;
}): MagicHourModelCost;
