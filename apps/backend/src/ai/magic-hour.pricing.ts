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

/** Credits per second of output, keyed by model then resolution. */
const PER_SECOND: Record<string, Record<string, number>> = {
  'ltx-2.5': { '480p': 24, '720p': 48, '1080p': 72 },
  'ltx-2.3': { '480p': 24, '720p': 48, '1080p': 72 },
  'minimax-h3': { '480p': 24, '720p': 48, '1080p': 72 },
  'wan-2.2': { '480p': 24, '720p': 48, '1080p': 72 },
  'kling-2.6': { '720p': 36, '1080p': 72 },
  'kling-3.0': { '720p': 48, '1080p': 72, '4k': 240 },
  'veo3.1-lite': { '720p': 48, '1080p': 72 },
  'veo3.1': { '720p': 96, '1080p': 120 },
  'gemini-omni-1.1': { '360p': 48, '720p': 144, '1080p': 192, '4k': 384 },
  'seedance-1.5': { '480p': 30, '720p': 60, '1080p': 90 },
  'seedance-2.0-mini': { '480p': 96, '720p': 192 },
  'seedance-2.0': { '480p': 144, '720p': 288 },
  'seedance-2.5': { '480p': 288, '720p': 576 },
  'sora-2': { '720p': 120 },
};

/** Flat extra credits for enabling audio, where the model charges for it. */
const AUDIO_SURCHARGE: Record<string, Record<string, number>> = {
  'kling-3.0': { '720p': 24, '1080p': 24, '4k': 48 },
  'veo3.1-lite': { '720p': 24, '1080p': 24 },
  'veo3.1': { '720p': 24, '1080p': 24 },
  // "2x the base rate" rather than a flat fee.
  'seedance-1.5': {},
};

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
export const MAGIC_HOUR_FREE_MODELS = ['ltx-2.5', 'minimax-h3'] as const;

/** Every model the API accepts, free and paid, for validation and the admin view. */
export const MAGIC_HOUR_MODELS = [
  ...MAGIC_HOUR_FREE_MODELS,
  'kling-3.0',
  'kling-2.6',
  'veo3.1',
  'veo3.1-lite',
  'wan-2.2',
  'gemini-omni-1.1',
  'seedance-1.5',
  'seedance-2.0',
  'seedance-2.0-mini',
  'seedance-2.5',
  'sora-2',
  'ltx-2.3',
] as const;

/** The highest resolution the free plan is allowed to ask for. */
export const MAGIC_HOUR_FREE_MAX_RESOLUTION = '480p';

export function isMagicHourModel(value: string): boolean {
  return (MAGIC_HOUR_MODELS as readonly string[]).includes(value);
}

/**
 * Estimate a render's cost. Returns nulls rather than a guess when the combination
 * is not in the table: an unknown combination must not be turned into a confident
 * number that lets an unaffordable render through.
 */
export function estimateMagicHourCredits(params: {
  model: string;
  resolution: string;
  seconds: number;
  withAudio: boolean;
}): MagicHourModelCost {
  const byResolution = PER_SECOND[params.model];
  const perSecond = byResolution?.[params.resolution] ?? null;
  const supported = byResolution !== undefined && params.resolution in byResolution;

  // A model that is simply absent from the table is treated as audio-capable,
  // because "unknown" must not be reported as "will not work".
  const audioSupported = supported ? params.model !== 'wan-2.2' && params.model !== 'kling-2.6' && params.model !== 'gemini-omni-1.1' : true;

  // Zero unless audio was asked for. `null` is reserved for a genuinely unknown
  // surcharge, and it must not be the default: a render with no audio track costs
  // exactly its per-second rate, and defaulting this to null would price every
  // silent render as unpriceable and refuse to submit it.
  let surcharge: number | null = 0;
  if (params.withAudio) {
    if (!audioSupported) {
      surcharge = 0;
    } else if (params.model === 'seedance-1.5') {
      // "2x the base rate" rather than a flat fee, so it needs the per-second cost.
      surcharge = perSecond === null ? null : perSecond * params.seconds;
    } else {
      surcharge = AUDIO_SURCHARGE[params.model]?.[params.resolution] ?? 0;
    }
  }

  const base = perSecond === null ? null : perSecond * params.seconds;
  const estimated = base === null || surcharge === null ? null : base + surcharge;
  return { creditsPerSecond: perSecond, estimated, audioSupported, audioSurcharge: surcharge };
}
