import { PlanKey } from '@prisma/client';
/**
 * The plan catalogue. Code, not rows in a table, because these are two static
 * entitlements whose numbers are known when the API is built. A `Subscription`
 * row can only ever hold a key defined here (see `planKeyOf`).
 *
 * Every limit is a *ceiling the plan applies*, never a promise the deployment
 * makes. `EntitlementsService` clamps each one against the configured maximum,
 * so a plan can lower a limit but can never raise one above what the operator
 * configured. Nothing here is invented at runtime.
 */
export type PlanDefinition = {
    key: PlanKey;
    name: string;
    /** What the plan actually changes. Written as fact, never as marketing. */
    summary: string;
    /** Free-tier limits. `null` means "the deployment ceiling applies". */
    limits: {
        files: number | null;
        fileBytes: number | null;
        mediaAssets: number | null;
        mediaBytes: number | null;
    };
};
export declare const PLANS: readonly PlanDefinition[];
export declare const DEFAULT_PLAN: PlanKey;
export declare function planKeyOf(value: string): PlanKey | null;
export declare function planDefinition(plan: PlanKey): PlanDefinition;
/**
 * How a limit is actually resolved.
 *
 * `null` in the catalogue means "inherit the deployment ceiling", and the
 * resolved value carries where it came from so the API never presents a number
 * as if the plan invented it.
 */
export type ResolvedLimit = {
    value: number;
    source: 'plan' | 'deployment';
};
