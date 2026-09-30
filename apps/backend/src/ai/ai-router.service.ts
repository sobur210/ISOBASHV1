import { Injectable, Logger } from '@nestjs/common';
import {
  AiCapability,
  AiEmbeddingRequest,
  AiEmbeddingResponse,
  AiImageResponse,
  AiMode,
  AiProviderError,
  AiRequest,
  AiResponse,
  AiStreamChunk,
  AiVideoResponse,
} from './provider.types';
import { AiVideoRequest } from './video-provider.types';
import { AiProviderRegistry } from './provider.registry';
import { AiModelRegistry } from './model.registry';
import { ProviderHealthService } from './provider-health.service';
import {
  RouteCandidate,
  RouteOutcome,
  RoutePlan,
  RouteRequest,
  isFailoverAllowed,
  isMediaFailoverAllowed,
} from './routing.types';

const DEFAULT_MODE: AiMode = (process.env.AI_DEFAULT_MODE as AiMode) || 'offline';
const OFFLINE_STRICT = process.env.AI_OFFLINE_STRICT === 'true';

/**
 * Phase 9: AI orchestration and model routing.
 *
 * The router is the single entry point for every model call. It turns a
 * capability request into an explainable, health-aware plan, executes the best
 * eligible candidate and reports exactly what happened (including failover).
 *
 * Honesty rules baked into the design:
 *  - an explicit provider/model selection is *strict*: no cross-provider fallback;
 *  - provider errors that are real answers (rate limit, bad key, retired model,
 *    overload) are surfaced verbatim instead of being masked by another vendor;
 *  - a stream that already emitted tokens is never re-routed, because a second
 *    vendor's tokens cannot be spliced into a reply the user is reading;
 *  - when nothing can serve the request the router fails with a real error.
 */
@Injectable()
export class AiRouterService {
  private readonly log = new Logger(AiRouterService.name);

  constructor(
    private readonly registry: AiProviderRegistry,
    private readonly models: AiModelRegistry,
    private readonly health: ProviderHealthService,
  ) {}

  mode(): AiMode {
    return DEFAULT_MODE;
  }

  /** Build (and probe) the routing plan without executing anything. */
  async plan(request: RouteRequest): Promise<RoutePlan> {
    const mode = request.mode ?? DEFAULT_MODE;
    const selection = parseSelection(request.model);
    const strict = selection.provider !== null;

    const candidates: RouteCandidate[] = [];
    for (const provider of this.registry.names()) {
      const instance = this.registry.instance(provider);
      if (!instance) continue;

      const health = await this.health.status(provider);
      const circuit = this.health.circuit(provider);
      const stats = this.health.stats(provider);
      const circuitAllows = this.health.allowsRequest(provider);

      const providerModels = this.models.modelsFor(provider);
      // A provider that advertises several capabilities must not lend them all to
      // every one of its models: an OR on the provider's capability list made
      // Gemini's text and embedding models eligible for image generation (and its
      // image models eligible for chat), so a run burned a provider call per wrong
      // model before reaching the renderer. A model's own capabilities decide; the
      // provider-level list is only trusted when it has no registered models.
      const providerIsImplicit = providerModels.length === 0 && instance.capabilities.includes(request.capability);
      for (const model of providerModels) {
        const supportsCapability = model.capabilities.includes(request.capability) || providerIsImplicit;
        if (!supportsCapability) {
          candidates.push({
            provider,
            model: model.id,
            capabilities: model.capabilities,
            modes: model.modes,
            health: health.status,
            circuit,
            avgLatencyMs: stats.avgLatencyMs,
            successRate: stats.successRate,
            priority: model.priority ?? 0,
            score: Number.NEGATIVE_INFINITY,
            eligible: false,
            reasons: [`does not support capability "${request.capability}"`],
          });
          continue;
        }

        const candidate: RouteCandidate = {
          provider,
          model: model.id,
          capabilities: model.capabilities,
          modes: model.modes,
          health: health.status,
          circuit,
          avgLatencyMs: stats.avgLatencyMs,
          successRate: stats.successRate,
          priority: model.priority ?? 0,
          score: 0,
          eligible: true,
          reasons: [],
        };

        if (strict && selection.provider !== provider) {
          candidate.eligible = false;
          candidate.reasons.push(`caller pinned provider "${selection.provider}"`);
        } else if (selection.model && selection.model !== model.id) {
          candidate.eligible = false;
          candidate.reasons.push(`caller pinned model "${selection.model}"`);
        }

        if (model.enabled === false && !selection.model) {
          candidate.eligible = false;
          candidate.reasons.push(
            model.aliasOf
              ? `alias model, selectable manually (primary: ${model.aliasOf})`
              : 'not auto-selected, selectable manually',
          );
        }
        if (health.status !== 'healthy') {
          if (request.ignoreProviderHealth) {
            // Recorded, not enforced: see `ignoreProviderHealth` in routing.types.
            candidate.reasons.push(
              `provider health is "${health.status}"${health.detail ? `: ${health.detail}` : ''}. Attempted anyway so the real error is reported`,
            );
          } else {
            candidate.eligible = false;
            candidate.reasons.push(`provider health is "${health.status}"${health.detail ? `: ${health.detail}` : ''}`);
          }
        }
        if (circuit === 'open' || !circuitAllows) {
          candidate.eligible = false;
          candidate.reasons.push(circuit === 'open' ? 'circuit breaker is open after repeated failures' : 'a half-open probe is already in flight');
        }
        if (OFFLINE_STRICT && mode === 'offline' && !model.modes.includes('offline')) {
          candidate.eligible = false;
          candidate.reasons.push('offline mode is strict and this model is not local');
        }

        candidate.score = scoreCandidate(candidate, mode, stats.successRate);
        if (candidate.priority) {
          candidate.reasons.push(`operator preference +${candidate.priority} applied to the score`);
        }
        candidate.reasons.push(...describeMode(candidate, mode));
        candidates.push(candidate);
      }
    }

    const ranked = [...candidates].sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.score - a.score;
    });
    const selected = ranked.find((candidate) => candidate.eligible) ?? null;

    return {
      request: { ...request, mode },
      strict,
      selected,
      candidates: ranked,
      decidedAt: new Date().toISOString(),
      explanation: explain(selected, ranked, mode, strict),
    };
  }

  /**
   * The provider that would serve a video request right now, without calling one.
   *
   * Runs are queued rather than executed in the request, and a queue is a promise
   * that a process with the right renderer will come for the job. So the decision
   * has to be made before the job is enqueued: `null` means no renderer can take
   * this run at all, and the caller must say so now rather than leave a row waiting
   * on a worker that will never arrive.
   *
   * The plan is built exactly as `generateVideo` builds it (`ignoreProviderHealth`,
   * the same request), so the answer is the provider that call will try first rather
   * than a second opinion from a slightly different question.
   */
  async resolveVideoProvider(model?: string | null): Promise<string | null> {
    const plan = await this.plan({
      capability: 'video-generation',
      ...(model ? { model } : {}),
      ignoreProviderHealth: true,
    });
    return plan.selected?.provider ?? null;
  }

  /** Execute a request through the plan, honouring the failover policy. */
  async execute(request: RouteRequest & { input: string }): Promise<AiResponse> {
    const plan = await this.plan(request);
    const attempts: RouteOutcome['attempts'] = [];
    const started = Date.now();
    const ordered = orderCandidates(plan);

    if (ordered.length === 0) {
      throw plan.selected === null && plan.candidates.length > 0
        ? new AiProviderError(plan.explanation, 'router', 'NO_ELIGIBLE_MODEL')
        : new AiProviderError(
            `No configured provider supports ${request.capability}.`,
            'router',
            'NO_PROVIDER_AVAILABLE',
          );
    }

    let lastError: AiProviderError | undefined;
    for (const [index, candidate] of ordered.entries()) {
      const attemptStart = Date.now();
      try {
        const instance = this.registry.instance(candidate.provider);
        if (!instance) {
          throw new AiProviderError('Provider instance disappeared.', candidate.provider, 'PROVIDER_UNAVAILABLE');
        }
        const response = await instance.execute({
          capability: request.capability,
          model: candidate.model,
          input: request.input,
          metadata: request.metadata,
          responseFormat: request.responseFormat,
        });
        this.health.recordSuccess(candidate.provider, Date.now() - attemptStart);
        attempts.push({ provider: candidate.provider, model: candidate.model, outcome: 'success', durationMs: Date.now() - attemptStart });
        this.attachRouting(response, { provider: candidate.provider, model: candidate.model, attempts, failoverUsed: index > 0, durationMs: Date.now() - started });
        return response;
      } catch (error) {
        const providerError = toProviderError(error, candidate.provider);
        this.health.recordFailure(candidate.provider, providerError.code);
        attempts.push({ provider: candidate.provider, model: candidate.model, outcome: 'failed', code: providerError.code, durationMs: Date.now() - attemptStart });

        const hasNext = index < ordered.length - 1;
        if (plan.strict || !hasNext || !isFailoverAllowed(providerError.code)) {
          this.log.warn(
            `Routing stopped on ${candidate.provider}:${candidate.model} (${providerError.code}).` +
              (plan.strict ? ' Selection was pinned by the caller.' : ' Error is not eligible for failover.'),
          );
          throw providerError;
        }
        this.log.warn(`Failing over from ${candidate.provider} (${providerError.code}) to the next eligible model.`);
        lastError = providerError;
      }
    }

    throw lastError ?? new AiProviderError('No eligible model could serve the request.', 'router', 'NO_ELIGIBLE_MODEL');
  }

  /**
   * Phase 12 embeddings.
   *
   * The same plan/eligibility/failover rules as `execute`, because an index built
   * from half-embedded chunks is worse than no index: a provider that answers
   * with a real error (bad key, missing model, rate limit) is surfaced instead
   * of being routed around.
   */
  async embed(request: RouteRequest & AiEmbeddingRequest): Promise<AiEmbeddingResponse> {
    const plan = await this.plan(request);
    const ordered = orderCandidates(plan);

    if (ordered.length === 0) {
      throw plan.selected === null && plan.candidates.length > 0
        ? new AiProviderError(plan.explanation, 'router', 'NO_ELIGIBLE_MODEL')
        : new AiProviderError('No configured provider can produce embeddings.', 'router', 'NO_PROVIDER_AVAILABLE');
    }

    let lastError: AiProviderError | undefined;
    for (const [index, candidate] of ordered.entries()) {
      const instance = this.registry.instance(candidate.provider);
      if (!instance?.embed) {
        lastError = new AiProviderError(
          `Provider ${candidate.provider} does not implement embeddings.`,
          candidate.provider,
          'CAPABILITY_UNSUPPORTED',
        );
        continue;
      }
      const started = Date.now();
      try {
        const response = await instance.embed({
          inputs: request.inputs,
          model: request.model ? request.model.replace(`${candidate.provider}:`, '') : undefined,
          ...(request.taskType ? { taskType: request.taskType } : {}),
        });
        this.health.recordSuccess(candidate.provider, Date.now() - started);
        return response;
      } catch (error) {
        const providerError = toProviderError(error, candidate.provider);
        this.health.recordFailure(candidate.provider, providerError.code);
        const hasNext = index < ordered.length - 1;
        if (plan.strict || !hasNext || !isFailoverAllowed(providerError.code)) {
          this.log.warn(`Embedding on ${candidate.provider}:${candidate.model} failed (${providerError.code}).`);
          throw providerError;
        }
        this.log.warn(`Failing over embeddings from ${candidate.provider} to the next eligible model.`);
        lastError = providerError;
      }
    }

    throw lastError ?? new AiProviderError('No eligible model could produce embeddings.', 'router', 'NO_ELIGIBLE_MODEL');
  }

  /**
   * Phase 13 image generation.
   *
   * The same plan/eligibility rules as `execute`, with one difference and an
   * honesty rule. The difference: when the caller pinned nothing, a provider that
   * refuses (zero quota, a bad key, a retired model) does not end the run if
   * another eligible renderer exists. Refusing would make a deployment with a
   * working second renderer unable to draw anything. The honesty rule: the
   * substitution is reported in `failovers` and shown on the run, and a pinned
   * model is still strict, so nothing is ever swapped behind the user's back.
   */
  async generateImage(request: RouteRequest & { prompt: string; aspectRatio?: string; count?: number }): Promise<AiImageResponse> {
    const plan = await this.plan({ ...request, ignoreProviderHealth: true });
    const ordered = orderCandidates(plan);

    if (ordered.length === 0) {
      throw plan.selected === null && plan.candidates.length > 0
        ? new AiProviderError(plan.explanation, 'router', 'NO_ELIGIBLE_MODEL')
        : new AiProviderError('No configured provider can generate images.', 'router', 'NO_PROVIDER_AVAILABLE');
    }

    let lastError: AiProviderError | undefined;
    const failovers: string[] = [];
    const attempts: string[] = [];
    for (const [index, candidate] of ordered.entries()) {
      const instance = this.registry.instance(candidate.provider);
      if (!instance?.generateImage) {
        lastError = new AiProviderError(
          `Provider ${candidate.provider} does not implement image generation.`,
          candidate.provider,
          'CAPABILITY_UNSUPPORTED',
        );
        attempts.push(`${candidate.provider}:${candidate.model} cannot generate images`);
        continue;
      }
      const started = Date.now();
      try {
        const response = await instance.generateImage({
          prompt: request.prompt,
          model: request.model ? request.model.replace(`${candidate.provider}:`, '') || undefined : undefined,
          ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
          ...(request.count !== undefined ? { count: request.count } : {}),
        });
        this.health.recordSuccess(candidate.provider, Date.now() - started);
        return failovers.length > 0 ? { ...response, failovers } : response;
      } catch (error) {
        const providerError = toProviderError(error, candidate.provider);
        this.health.recordFailure(candidate.provider, providerError.code);
        attempts.push(`${candidate.provider}:${candidate.model} refused (${providerError.code})`);
        const hasNext = index < ordered.length - 1;
        if (plan.strict || !hasNext || !isMediaFailoverAllowed(providerError.code)) {
          this.log.warn(`Image generation on ${candidate.provider}:${candidate.model} failed (${providerError.code}).`);
          // A failed run must name every renderer that was tried, not only the last
          // one: with two providers, "Gemini is rate limited" alone would hide that
          // the key-less renderer was tried and refused too.
          if (attempts.length > 1) {
            throw new AiProviderError(
              `${providerError.message} Every eligible renderer was tried: ${attempts.join('; ')}.`,
              providerError.provider,
              providerError.code,
            );
          }
          throw providerError;
        }
        this.log.warn(`Failing over image generation from ${candidate.provider} to the next eligible model.`);
        failovers.push(
          `${candidate.provider}:${candidate.model} could not render this image (${providerError.code}); it was rendered by another provider instead.`,
        );
        lastError = providerError;
      }
    }

    if (lastError && attempts.length > 1) {
      throw new AiProviderError(
        `${lastError.message} Every eligible renderer was tried: ${attempts.join('; ')}.`,
        lastError.provider,
        lastError.code,
      );
    }
    throw lastError ?? new AiProviderError('No eligible model could generate an image.', 'router', 'NO_ELIGIBLE_MODEL');
  }

  /**
   * Phase 14 video generation.
   *
   * The same rules as `generateImage`, and for the same reasons: provider health
   * is per provider and each adapter derives it from the capability it was written
   * for, so a healthy text model must not stand between a clip and the renderer
   * that can actually produce one; and a pinned `provider:model` is still strict.
   * The one difference that matters is that a video call can legitimately run for
   * minutes, so the timeout belongs to the adapter and is not a routing concern.
   */
  async generateVideo(
    request: RouteRequest & {
      prompt: string;
      aspectRatio?: string;
      durationSeconds?: number;
      image?: { mimeType: string; data: string };
      withAudio?: boolean;
      signal?: AbortSignal;
      // Async-render contract: when provided, the call is pinned to a provider
      // project that was already created for this run (a retry must resume it
      // rather than create a second one), and progress updates are reported to
      // whoever asked instead of being inferred after the fact.
      providerJobId?: AiVideoRequest['providerJobId'];
      onJobProgress?: AiVideoRequest['onJobProgress'];
    },
  ): Promise<AiVideoResponse> {
    const plan = await this.plan({ ...request, ignoreProviderHealth: true });
    const ordered = orderCandidates(plan);

    if (ordered.length === 0) {
      throw plan.selected === null && plan.candidates.length > 0
        ? new AiProviderError(plan.explanation, 'router', 'NO_ELIGIBLE_MODEL')
        : new AiProviderError('No configured provider can generate video.', 'router', 'NO_PROVIDER_AVAILABLE');
    }

    let lastError: AiProviderError | undefined;
    const failovers: string[] = [];
    const attempts: string[] = [];
    for (const [index, candidate] of ordered.entries()) {
      const instance = this.registry.instance(candidate.provider);
      if (!instance?.generateVideo) {
        lastError = new AiProviderError(
          `Provider ${candidate.provider} does not implement video generation.`,
          candidate.provider,
          'CAPABILITY_UNSUPPORTED',
        );
        attempts.push(`${candidate.provider}:${candidate.model} cannot generate video`);
        continue;
      }
      const started = Date.now();
      try {
        const response = await instance.generateVideo({
          prompt: request.prompt,
          model: request.model ? request.model.replace(`${candidate.provider}:`, '') || undefined : undefined,
          ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
          ...(request.durationSeconds !== undefined ? { durationSeconds: request.durationSeconds } : {}),
          ...(request.image ? { image: request.image } : {}),
          ...(request.withAudio !== undefined ? { withAudio: request.withAudio } : {}),
          ...(request.signal ? { signal: request.signal } : {}),
          ...(request.providerJobId ? { providerJobId: request.providerJobId } : {}),
          ...(request.onJobProgress ? { onJobProgress: request.onJobProgress } : {}),
        });
        this.health.recordSuccess(candidate.provider, Date.now() - started);
        // The spread preserves `metering` untouched, which is what the credit ledger
        // settles against: it names the provider that was actually billed, so a
        // failover must not quietly restate who spent the credits.
        return failovers.length > 0 ? { ...response, failovers } : response;
      } catch (error) {
        const providerError = toProviderError(error, candidate.provider);
        this.health.recordFailure(candidate.provider, providerError.code);
        attempts.push(`${candidate.provider}:${candidate.model} refused (${providerError.code})`);
        const hasNext = index < ordered.length - 1;
        if (plan.strict || !hasNext || !isMediaFailoverAllowed(providerError.code)) {
            this.log.warn(`Video generation on ${candidate.provider}:${candidate.model} failed (${providerError.code}).`);
            // A failed run names every renderer that was tried. With one renderer the
            // message is already the whole story; with two, "the model is rate limited"
            // alone would hide that the other one was tried and refused too.
            if (attempts.length > 1) {
              throw new AiProviderError(
                `${providerError.message} Every eligible renderer was tried: ${attempts.join('; ')}.`,
                providerError.provider,
                providerError.code,
                // Carried through the rewrite: a failure after the provider accepted the
                // render still names the project that may have been billed.
                providerError.details,
              );
            }
          throw providerError;
        }
        this.log.warn(`Failing over video generation from ${candidate.provider} to the next eligible model.`);
        failovers.push(
          `${candidate.provider}:${candidate.model} could not render this clip (${providerError.code}); it was rendered by another provider instead.`,
        );
        lastError = providerError;
      }
    }

    if (lastError && attempts.length > 1) {
      throw new AiProviderError(
        `${lastError.message} Every eligible renderer was tried: ${attempts.join('; ')}.`,
        lastError.provider,
        lastError.code,
      );
    }
    throw lastError ?? new AiProviderError('No eligible model could generate a video.', 'router', 'NO_ELIGIBLE_MODEL');
  }

  /**
   * Stream a request. Failover is only possible while nothing has been emitted
   * to the caller; once the first token is on the wire the stream is committed.
   */
  async *stream(request: RouteRequest & { input: string }, signal?: AbortSignal): AsyncGenerator<AiStreamChunk> {
    const plan = await this.plan(request);
    const ordered = orderCandidates(plan);

    if (ordered.length === 0) {
      yield {
        type: 'error',
        code: plan.candidates.length > 0 ? 'NO_ELIGIBLE_MODEL' : 'NO_PROVIDER_AVAILABLE',
        message: plan.explanation,
      };
      return;
    }

    for (const [index, candidate] of ordered.entries()) {
      const instance = this.registry.instance(candidate.provider);
      if (!instance) {
        if (index === ordered.length - 1) {
          yield { type: 'error', code: 'PROVIDER_UNAVAILABLE', message: 'Provider instance disappeared.' };
          return;
        }
        continue;
      }

      const started = Date.now();
      let emitted = false;
      try {
        if (!instance.stream) {
          const response = await instance.execute({
            capability: request.capability,
            model: candidate.model,
            input: request.input,
          });
          this.health.recordSuccess(candidate.provider, Date.now() - started);
          yield { type: 'delta', text: response.output };
          yield { type: 'done', provider: response.provider, model: response.model, usage: response.usage };
          return;
        }

        for await (const chunk of instance.stream(
          { capability: request.capability, model: candidate.model, input: request.input, metadata: request.metadata },
          signal,
        )) {
          if (chunk.type !== 'error') emitted = true;
          if (chunk.type === 'done') {
            this.health.recordSuccess(candidate.provider, Date.now() - started);
          }
          yield chunk;
        }
        if (!emitted) {
          this.health.recordFailure(candidate.provider, 'EMPTY_PROVIDER_RESPONSE');
        }
        return;
      } catch (error) {
        const providerError = toProviderError(error, candidate.provider);
        this.health.recordFailure(candidate.provider, providerError.code);
        const hasNext = index < ordered.length - 1;
        const canFailover = !emitted && !plan.strict && hasNext && isFailoverAllowed(providerError.code);
        this.log.warn(
          `Stream from ${candidate.provider}:${candidate.model} failed (${providerError.code}).` +
            (emitted ? ' Tokens were already emitted, so the stream is committed to this provider.' : ''),
        );
        if (canFailover) continue;
        yield { type: 'error', code: providerError.code, message: providerError.message };
        return;
      }
    }
  }

  private attachRouting(response: AiResponse, routing: RouteOutcome) {
    (response as AiResponse & { routing?: RouteOutcome }).routing = routing;
  }
}

function parseSelection(model?: string): { provider: string | null; model: string | null } {
  if (!model) return { provider: null, model: null };
  const separator = model.indexOf(':');
  if (separator <= 0) return { provider: model, model: null };
  return { provider: model.slice(0, separator), model: model.slice(separator + 1) || null };
}

function orderCandidates(plan: RoutePlan): RouteCandidate[] {
  if (plan.selected) {
    return [plan.selected, ...plan.candidates.filter((c) => c.eligible && c !== plan.selected)];
  }
  return [];
}

export function scoreCandidate(candidate: RouteCandidate, mode: AiMode, successRate: number): number {
  let score = 100;

  // Reliability first: a provider that has been answering is worth more than a
  // marginally faster one that keeps failing.
  score += (successRate - 0.9) * 100;

  // Local-first, cloud-ready: honour the mode without hiding the alternative.
  if (candidate.modes.includes('offline') && candidate.modes.includes('online')) {
    score += 0;
  } else if (mode === 'offline' && candidate.modes.includes('offline')) {
    score += 45;
  } else if (mode === 'online' && candidate.modes.includes('online')) {
    score += 45;
  } else if (mode === 'offline' && candidate.modes.includes('online')) {
    score -= 15;
  } else if (mode === 'online' && candidate.modes.includes('offline')) {
    score -= 30;
  } else if (mode === 'hybrid' && candidate.modes.includes('offline')) {
    score += 10;
  }

  if (candidate.health === 'healthy') score += 20;
  if (candidate.avgLatencyMs !== null) score -= Math.min(25, candidate.avgLatencyMs / 200);
  if (candidate.circuit === 'half-open') score -= 20;

  // An explicit operator preference, applied last so it settles the decision
  // rather than being one more signal competing with a per-capability health
  // check it has nothing to do with.
  if (candidate.priority) score += candidate.priority;

  return Math.round(score * 100) / 100;
}

function describeMode(candidate: RouteCandidate, mode: AiMode): string[] {
  const reasons: string[] = [];
  if (candidate.modes.includes('offline')) reasons.push('available offline');
  if (candidate.modes.includes('online')) reasons.push('cloud capable');
  if (mode === 'offline' && candidate.modes.includes('offline')) reasons.push('local-first preference applied');
  if (mode === 'online' && candidate.modes.includes('online')) reasons.push('cloud preference applied');
  return reasons;
}

function explain(selected: RouteCandidate | null, ranked: RouteCandidate[], mode: AiMode, strict: boolean): string {
  if (!selected) {
    if (ranked.length === 0) return `No provider is registered for capability routing in ${mode} mode.`;
    const reasons = ranked.slice(0, 4).map((candidate) => `${candidate.provider}:${candidate.model} (${candidate.reasons.join('; ') || 'not eligible'})`);
    return `No eligible model in ${mode} mode. Rejected: ${reasons.join(' | ')}`;
  }
  const basis = [
    `mode ${mode}`,
    `health ${selected.health}`,
    `circuit ${selected.circuit}`,
    `success rate ${Math.round(selected.successRate * 100)}%`,
    selected.avgLatencyMs === null ? 'latency unknown' : `avg latency ${selected.avgLatencyMs}ms`,
    ...(selected.priority ? [`operator preference +${selected.priority}`] : []),
    `score ${selected.score}`,
  ];
  return `${strict ? 'Pinned' : 'Routed'} to ${selected.provider}:${selected.model} (${basis.join(', ')}).`;
}

function toProviderError(error: unknown, provider: string): AiProviderError {
  if (error instanceof AiProviderError) return error;
  return new AiProviderError(error instanceof Error ? error.message : 'Provider call failed.', provider, 'PROVIDER_UNAVAILABLE');
}
