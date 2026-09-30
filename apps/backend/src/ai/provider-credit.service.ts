import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderError } from './provider.types';
import { AiProviderRegistry } from './provider.registry';
import { estimateMagicHourCredits, isMagicHourModel, MAGIC_HOUR_FREE_MODELS } from './magic-hour.pricing';
import { ProviderCreditBalance, VideoProvider } from './video-provider.types';

/** The one provider that bills a shared pool today. Named so the check is explicit. */
const METERED_PROVIDER = 'magic-hour';
const MAGIC_HOUR_DEFAULT_MODEL = MAGIC_HOUR_FREE_MODELS[0];

/** How long a recorded balance may be trusted when the provider cannot be reached. */
const SNAPSHOT_MAX_AGE_MS = Number(process.env.MAGICHOUR_CREDIT_SNAPSHOT_MAX_AGE_MS || 15 * 60 * 1000);

/** True when a failure means "stopped waiting", not "the provider said no". */
function isTimeout(text: string | null | undefined): boolean {
  return typeof text === 'string' && /\btimeout|timed out|has not finished/i.test(text);
}

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
@Injectable()
export class ProviderCreditService {
  private readonly log = new Logger(ProviderCreditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiProviderRegistry,
  ) {}

  /**
   * The registered adapter for a provider, as a metered video provider.
   *
   * Resolved here rather than passed in by callers so that the affordability check
   * cannot be made against a pool nobody is actually reading: whoever asks gets the
   * same adapter the router would.
   */
  private adapterFor(provider: string, override?: VideoProvider | null): VideoProvider | null {
    if (override !== undefined) return override;
    const instance = this.registry.instance(provider);
    return instance && typeof (instance as Partial<VideoProvider>).readCreditBalance === 'function'
      ? (instance as unknown as VideoProvider)
      : null;
  }

  /** `YYYY-MM` in UTC. Pinned to UTC so the pool boundary is not a timezone guess. */
  month(at: Date = new Date()): string {
    return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Price a render before submitting it.
   *
   * Returns null for a model this build has no published cost for, which the caller
   * must treat as "cannot be priced, therefore must not be submitted". A confident
   * wrong number here is the one way to spend a pool that is meant to be protected.
   */
  estimate(params: { model: string; resolution?: string | null; seconds: number; withAudio?: boolean }): number | null {
    if (!isMagicHourModel(params.model)) return null;
    return estimateMagicHourCredits({
      model: params.model,
      resolution: params.resolution || process.env.MAGICHOUR_VIDEO_RESOLUTION || '480p',
      seconds: params.seconds,
      withAudio: params.withAudio === true,
    }).estimated;
  }

  /**
   * Refuse a render the shared pool cannot pay for.
   *
   * Throws rather than returning a boolean, because every caller has the same
   * obligation when this says no: do not submit, and tell the user why.
   */
  async assertAffordable(params: {
    provider: string;
    adapter?: VideoProvider | null;
    model: string;
    resolution?: string | null;
    seconds: number;
    withAudio?: boolean;
  }): Promise<number> {
    const adapter = this.adapterFor(params.provider, params.adapter);
    const estimated = this.estimate(params);
    if (estimated === null) {
      throw new AiProviderError(
        `ISOBASH has no published credit cost for Magic Hour model "${params.model}", so it will not submit a render it cannot price. ` +
          `Set MAGICHOUR_VIDEO_ALLOWED_MODELS to a model whose per-second cost is known.`,
        params.provider,
        'MODEL_NOT_AVAILABLE',
      );
    }
    const summary = await this.summary(params.provider, adapter);
    if (summary.spendable === null) {
      throw new AiProviderError(
        `Video generation is paused because the shared Magic Hour credit pool cannot be read: ${summary.spendableNote} ` +
          `A render is not submitted without knowing what is left, because a partial spend is worse than a refusal.`,
        params.provider,
        'PROVIDER_INSUFFICIENT_CREDITS',
      );
    }
    if (estimated > summary.spendable) {
      throw new AiProviderError(
        `This ${params.seconds}s ${params.model} render costs about ${estimated} Magic Hour credits, but only ${summary.spendable} of the ` +
          `shared pool can be spent (${describePool(summary)}). ` +
          `The pool is one budget for every ISOBASH user, so nothing is submitted and no credits are lost.`,
        params.provider,
        'PROVIDER_INSUFFICIENT_CREDITS',
      );
    }
    return estimated;
  }

  /**
   * Record the intent to spend, before the provider is called.
   *
   * Idempotent on `videoGenerationId`: a retried reservation returns the row that
   * already exists instead of creating a second charge.
   */
  async reserve(input: Reservation): Promise<void> {
    const existing = await this.prisma.providerCreditEntry.findUnique({
      where: { videoGenerationId: input.videoGenerationId },
      select: { id: true },
    });
    if (existing) return;
    try {
      await this.prisma.providerCreditEntry.create({
        data: {
          provider: 'magic-hour',
          month: this.month(),
          state: 'RESERVED',
          estimatedCredits: input.estimatedCredits,
          model: input.model,
          userId: input.userId,
          videoGenerationId: input.videoGenerationId,
          note: 'Reserved before submission; the provider had not reported a cost yet.',
        },
      });
    } catch (error) {
      // A concurrent retry can win the race. That is fine as long as exactly one row
      // exists, which the unique constraint guarantees.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  /**
   * Settle a reservation against what the provider actually reported.
   *
   * `CHARGED` is the only state that is a fact. A refund is recorded as a refund
   * rather than as a zero-cost success, because "this render failed and the
   * provider gave the credits back" and "this render was free" are different
   * stories and the admin view must be able to tell them apart.
   */
  async settle(params: {
    videoGenerationId: string;
    state: 'CHARGED' | 'REFUNDED';
    chargedCredits?: number | null;
    refundedCredits?: number | null;
    providerProjectId?: string | null;
    note?: string | null;
  }): Promise<void> {
    const data: Record<string, unknown> = { state: params.state };
    if (params.chargedCredits !== undefined) data.chargedCredits = params.chargedCredits;
    if (params.refundedCredits !== undefined) data.refundedCredits = params.refundedCredits;
    if (params.providerProjectId) data.providerProjectId = params.providerProjectId;
    if (params.note !== undefined) data.note = params.note;
    await this.prisma.providerCreditEntry.updateMany({
      where: { videoGenerationId: params.videoGenerationId },
      data,
    });
  }

  /**
   * Give a reservation back without spending it.
   *
   * Used when a run was recorded but never reached the provider, for example when a
   * local check refused it. The row is kept so the attempt is visible in the admin
   * view rather than silently absent.
   */
  async release(videoGenerationId: string, note: string): Promise<void> {
    await this.prisma.providerCreditEntry.updateMany({
      where: { videoGenerationId },
      data: { state: 'RELEASED', note },
    });
  }

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
  async reserveIfAffordable(params: {
    provider: string;
    videoGenerationId: string;
    userId: number;
    /** Pinned as `magic-hour` or `magic-hour:<model>`, or null to let the router choose. */
    model: string | null;
    seconds: number;
    withAudio?: boolean;
    resolution?: string | null;
  }): Promise<{ model: string; estimated: number } | null> {
    const { provider, model: requested } = params;
    if (provider !== METERED_PROVIDER) return null;
    if (requested !== null && requested !== provider && !requested.startsWith(`${provider}:`)) return null;

    // An unpinned request is only aimed at Magic Hour if Magic Hour is actually
    // registered. Without this a deployment with no Magic Hour key would price every
    // render against a pool that does not exist, find it empty, and refuse all video
    // generation -- the guard would take down the very renderers it exists to protect.
    if (requested === null && !this.registry.instance(provider)) return null;

    const adapter = this.adapterFor(provider);
    const model = requested ? (requested.split(':').slice(1).join(':') || this.defaultModelFor(adapter)) : this.defaultModelFor(adapter);
    const estimated = await this.assertAffordable({
      provider,
      ...(adapter ? { adapter } : {}),
      model,
      ...(params.resolution !== undefined ? { resolution: params.resolution } : {}),
      seconds: params.seconds,
      ...(params.withAudio !== undefined ? { withAudio: params.withAudio } : {}),
    });
    await this.reserve({ videoGenerationId: params.videoGenerationId, userId: params.userId, model, estimatedCredits: estimated });
    return { model, estimated };
  }

  /** The model an unpinned request will be billed for, or null if the adapter cannot say. */
  private defaultModelFor(adapter: VideoProvider | null): string {
    const candidate = (adapter as { defaultModel?: unknown } | null)?.defaultModel;
    if (typeof candidate === 'string' && candidate) return candidate;
    // Without a registered adapter the free plan's first model is the honest guess,
    // and `assertAffordable` will still price it from the published table.
    return MAGIC_HOUR_DEFAULT_MODEL;
  }

  /**
   * Settle a run that finished, against the provider's own figures.
   *
   * A completed render is charged whatever the provider finally said, which may be
   * more or less than the estimate taken before submission. A failure is refunded,
   * per the provider's documented behaviour -- but only when the provider actually
   * issued a project, because a request refused before a project exists was never
   * billed and calling that a refund would overstate what came back.
   */
  async settleRun(params: {
    videoGenerationId: string;
    succeeded: boolean;
    metering?: { providerProjectId: string | null; creditsCharged: number | null; creditsChargedIsEstimate: boolean } | null;
    error?: string | null;
  }): Promise<void> {
    if (params.succeeded) {
      const credits = params.metering?.creditsCharged ?? null;
      await this.settle({
        videoGenerationId: params.videoGenerationId,
        state: 'CHARGED',
        chargedCredits: credits,
        ...(params.metering?.providerProjectId ? { providerProjectId: params.metering.providerProjectId } : {}),
        note:
          credits === null
            ? 'The provider did not report a cost for this completed render, so the opening estimate is kept.'
            : params.metering?.creditsChargedIsEstimate
              ? `The provider reported ${credits} credits, still as an estimate.`
              : `The provider charged ${credits} credits.`,
      });
      return;
    }

    if (!params.metering?.providerProjectId) {
      await this.release(
        params.videoGenerationId,
        params.error
          ? `No provider project was created, so no credits were spent. Refused locally or by the provider: ${params.error}`
          : 'No provider project was created, so no credits were spent.',
      );
      return;
    }

    // A project id exists, so the render was really submitted. Magic Hour does not
    // bill a failed render, so the estimate comes back; a timeout is the exception,
    // because a timed-out render may still finish on the provider's side and be
    // charged after ISOBASH has given up on it.
    if (isTimeout(params.error)) {
      await this.annotate(
        params.videoGenerationId,
        `Project ${params.metering.providerProjectId} was submitted and ISOBASH stopped waiting. ` +
          `Magic Hour may still finish and charge it, so the estimate is kept rather than refunded.`,
      );
      return;
    }
    await this.settle({
      videoGenerationId: params.videoGenerationId,
      state: 'REFUNDED',
      refundedCredits: null,
      providerProjectId: params.metering.providerProjectId,
      note: params.error ? `The render failed and Magic Hour refunded the estimate: ${params.error}` : 'The render failed and Magic Hour refunded the estimate.',
    });
  }

  /**
   * Attach a note to an existing entry without changing its state.
   *
   * Used where the truth is "unknown, and deliberately not guessed": a render ISOBASH
   * stopped watching, where recording either a charge or a refund would be fiction.
   */
  async annotate(videoGenerationId: string, note: string): Promise<void> {
    await this.prisma.providerCreditEntry.updateMany({ where: { videoGenerationId }, data: { note } });
  }

  /** The whole picture for the admin view, and the basis of the affordability check. */
  async summary(provider: string, adapter?: VideoProvider | null): Promise<CreditMonthSummary> {
    const month = this.month();
    const live = await this.refreshBalance(provider, this.adapterFor(provider, adapter));

    // Totals are aggregated by the database over the whole month, and only the recent
    // slice is loaded for display. Summing the recent page instead would quietly
    // understate a busy month's spend, which is the one number the admin view exists
    // to be honest about.
    //
    // A row without the provider's own figure falls back to the estimate taken before
    // submission, so those rows are counted separately rather than summed as zero.
    const scope = { provider, month };
    const [entries, all, charged, chargedWithoutFigure, refunded, refundedWithoutFigure, released] = await Promise.all([
      this.prisma.providerCreditEntry.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          videoGenerationId: true,
          state: true,
          estimatedCredits: true,
          chargedCredits: true,
          refundedCredits: true,
          model: true,
          providerProjectId: true,
          note: true,
          createdAt: true,
          userId: true,
        },
      }),
      this.prisma.providerCreditEntry.aggregate({ where: scope, _count: { _all: true }, _sum: { estimatedCredits: true } }),
      this.prisma.providerCreditEntry.aggregate({ where: { ...scope, state: 'CHARGED' }, _sum: { chargedCredits: true } }),
      this.prisma.providerCreditEntry.aggregate({
        where: { ...scope, state: 'CHARGED', chargedCredits: null },
        _sum: { estimatedCredits: true },
      }),
      this.prisma.providerCreditEntry.aggregate({ where: { ...scope, state: 'REFUNDED' }, _sum: { refundedCredits: true } }),
      this.prisma.providerCreditEntry.aggregate({
        where: { ...scope, state: 'REFUNDED', refundedCredits: null },
        _sum: { estimatedCredits: true },
      }),
      this.prisma.providerCreditEntry.aggregate({ where: { ...scope, state: 'RELEASED' }, _sum: { estimatedCredits: true } }),
    ]);

    const totals = {
      entries: all._count._all,
      estimated: all._sum.estimatedCredits ?? 0,
      charged: (charged._sum.chargedCredits ?? 0) + (chargedWithoutFigure._sum.estimatedCredits ?? 0),
      refunded: (refunded._sum.refundedCredits ?? 0) + (refundedWithoutFigure._sum.estimatedCredits ?? 0),
      released: released._sum.estimatedCredits ?? 0,
    };

    const budgetCap = parsePositiveInt(process.env.MAGICHOUR_MONTHLY_CREDIT_BUDGET);
    const reserve = parsePositiveInt(process.env.MAGICHOUR_CREDIT_RESERVE) ?? 0;
    const { spendable, note } = spendableFrom(live, budgetCap, reserve);

    return {
      provider,
      month,
      liveBalance: live.readable ? live.balance : null,
      liveBalanceReadable: live.readable,
      liveBalanceAt: live.recordedAt ? live.recordedAt.toISOString() : null,
      budgetCap,
      reserve,
      ledgerEstimated: totals.estimated,
      ledgerCharged: totals.charged,
      ledgerRefunded: totals.refunded,
      ledgerReleased: totals.released,
      ledgerEntries: totals.entries,
      spendable,
      spendableNote: note,
      recent: entries.map((entry) => ({
        videoGenerationId: entry.videoGenerationId,
        state: entry.state,
        estimatedCredits: entry.estimatedCredits,
        chargedCredits: entry.chargedCredits,
        refundedCredits: entry.refundedCredits,
        model: entry.model,
        providerProjectId: entry.providerProjectId,
        note: entry.note,
        createdAt: entry.createdAt.toISOString(),
        userId: entry.userId,
      })),
    };
  }

  /**
   * Read the provider's balance and record it.
   *
   * Falls back to the last recorded snapshot when the provider cannot be reached,
   * but only while that snapshot is young. Past the age limit the caller is told the
   * balance is unknown, because a stale "400" is indistinguishable from a pool that
   * is now empty, and optimistically believing it is how a pool gets drained.
   */
  private async refreshBalance(
    provider: string,
    adapter: VideoProvider | null,
  ): Promise<{ balance: number; readable: boolean; recordedAt: Date | null; reason: string }> {
    const month = this.month();
    const snapshot = await this.prisma.providerCreditSnapshot.findUnique({ where: { provider_month: { provider, month } } });

    if (adapter?.readCreditBalance) {
      const live: ProviderCreditBalance = await adapter.readCreditBalance();
      if (live.readable) {
        const record = await this.prisma.providerCreditSnapshot.upsert({
          where: { provider_month: { provider, month } },
          create: { provider, month, balance: live.balance, source: 'provider' },
          update: { balance: live.balance, recordedAt: new Date(), source: 'provider' },
        });
        return { balance: record.balance, readable: true, recordedAt: record.recordedAt, reason: 'live' };
      }
      // The provider is reachable but will not tell us what is left. The snapshot is
      // kept for the admin view and for the refusal message, but it is reported as
      // unreadable: this pool is shared, it moves on every render, and spending
      // against a number that is minutes old is how a pool gets drained by renders
      // that all believed the same stale "400".
      this.log.warn(`Could not read the ${provider} credit balance; spending is held until it can be read again.`);
      if (!snapshot) return { balance: 0, readable: false, recordedAt: null, reason: 'unreadable' };
      return { balance: snapshot.balance, readable: false, recordedAt: snapshot.recordedAt, reason: 'unreadable' };
    }

    if (!snapshot) {
      // No reader and no snapshot means this provider's pool is simply not managed.
      // That is different from an unreadable pool, and the caller tells them apart.
      return { balance: 0, readable: true, recordedAt: null, reason: 'unmanaged' };
    }
    // No live reader exists, so the snapshot is the only account of this pool and
    // there is nothing to confirm it against. It is still bounded by age, because a
    // month-long-old number is worse than no number.
    const age = Date.now() - snapshot.recordedAt.getTime();
    if (age > SNAPSHOT_MAX_AGE_MS) {
      return { balance: snapshot.balance, readable: false, recordedAt: snapshot.recordedAt, reason: 'stale' };
    }
    return { balance: snapshot.balance, readable: true, recordedAt: snapshot.recordedAt, reason: 'snapshot' };
  }
}

type Spendable = { spendable: number | null; note: string | null };

function spendableFrom(
  live: { balance: number; readable: boolean; recordedAt: Date | null; reason: string },
  budgetCap: number | null,
  reserve: number,
): Spendable {
  if (!live.readable) {
    if (live.reason === 'stale') {
      const age = `${Math.round((Date.now() - (live.recordedAt as Date).getTime()) / 60_000)} minutes`;
      return {
        spendable: null,
        note: `the last known balance is ${live.balance} credits but was read ${age} ago, which is past the ${Math.round(
          SNAPSHOT_MAX_AGE_MS / 60_000,
        )} minute limit this deployment trusts`,
      };
    }
    return {
      spendable: null,
      note: `the last known balance is ${live.balance} credits but the provider would not confirm it, and this pool is shared, ` +
        'so ISOBASH stops spending rather than act on a number that may already be spent',
    };
  }
  const ceiling = budgetCap === null ? live.balance : Math.min(live.balance, budgetCap);
  return { spendable: Math.max(0, ceiling - reserve), note: null };
}

function describePool(summary: CreditMonthSummary): string {
  const parts: string[] = [];
  if (summary.liveBalance !== null) parts.push(`${summary.liveBalance} credits reported by the provider`);
  if (summary.budgetCap !== null) parts.push(`capped at ${summary.budgetCap} by MAGICHOUR_MONTHLY_CREDIT_BUDGET`);
  parts.push(`${summary.reserve} held back as MAGICHOUR_CREDIT_RESERVE`);
  parts.push(`${summary.ledgerCharged} already charged to ISOBASH renders this month`);
  return parts.join(', ');
}

function parsePositiveInt(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}
