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

const MB = 1024 * 1024;

export const PLANS: readonly PlanDefinition[] = [
  {
    key: 'FREE',
    name: 'Free',
    summary:
      'The default every account starts on. Files and media are capped so one account cannot fill the shared disk.',
    limits: {
      files: 20,
      fileBytes: 50 * MB,
      mediaAssets: 20,
      mediaBytes: 25 * MB,
    },
  },
  {
    key: 'PRO',
    name: 'Pro',
    summary:
      'Raises the per-account storage caps to whatever this deployment is configured to allow. It does not add features, and it does not buy provider credit: providers bill one shared pool.',
    limits: {
      files: null,
      fileBytes: null,
      mediaAssets: null,
      mediaBytes: null,
    },
  },
] as const;

export const DEFAULT_PLAN: PlanKey = 'FREE';

export function planKeyOf(value: string): PlanKey | null {
  const match = PLANS.find((plan) => plan.key === value);
  return match ? match.key : null;
}

export function planDefinition(plan: PlanKey): PlanDefinition {
  // The enum and the catalogue are declared together, so an unknown key is a
  // code bug rather than data. Falling back to FREE keeps a broken row from
  // handing somebody an unlimited entitlement.
  return PLANS.find((entry) => entry.key === plan) ?? PLANS[0];
}

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