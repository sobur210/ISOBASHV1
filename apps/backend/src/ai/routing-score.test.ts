import { describe, expect, it } from '@jest/globals';
import { parseSelection, scoreCandidate } from './ai-router.service';
import { RouteCandidate } from './routing.types';

function candidate(overrides: Partial<RouteCandidate>): RouteCandidate {
  return {
    provider: 'stub',
    model: 'stub-model',
    capabilities: ['image-generation'],
    modes: ['online', 'hybrid'],
    health: 'healthy',
    circuit: 'closed',
    avgLatencyMs: null,
    successRate: 1,
    priority: 0,
    score: 0,
    eligible: true,
    reasons: [],
    ...overrides,
  };
}

describe('scoreCandidate', () => {
  it('leaves the score untouched when no operator preference is set', () => {
    expect(scoreCandidate(candidate({}), 'offline', 1)).toBe(115);
  });

  /**
   * Regression: health is derived from one capability but applied to all of them.
   * A Gemini image model scored while Gemini's *text* check is degraded must not
   * lose routing to a key-less renderer that always reports itself healthy.
   */
  it('lets an operator preference outweigh a degraded health signal', () => {
    const degraded = candidate({ provider: 'gemini', health: 'unavailable', priority: 50 });
    const healthy = candidate({ provider: 'pollinations', health: 'healthy' });

    expect(scoreCandidate(degraded, 'offline', 1)).toBeGreaterThan(scoreCandidate(healthy, 'offline', 1));
  });

  /**
   * The preference must not be a licence to ignore a renderer that is genuinely
   * broken: a real success-rate collapse still overtakes it, so failover works.
   */
  it('is still overtaken by a genuinely failing renderer', () => {
    const preferred = candidate({ provider: 'gemini', priority: 50 });
    const failing = candidate({ provider: 'pollinations' });

    expect(scoreCandidate(preferred, 'offline', 0)).toBeLessThan(scoreCandidate(failing, 'offline', 1));
  });
});

describe('parseSelection', () => {
  it('treats a registered provider name as a provider pin', () => {
    expect(parseSelection('openrouter', ['openrouter'])).toEqual({
      provider: 'openrouter',
      model: null,
    });
  });

  it('treats a slash-delimited model id as a model pin', () => {
    expect(parseSelection('openai/gpt-image-1', ['openrouter'])).toEqual({
      provider: null,
      model: 'openai/gpt-image-1',
    });
  });

  it('keeps explicit provider-prefixed model pins intact', () => {
    expect(parseSelection('openrouter:openai/gpt-image-1', ['openrouter'])).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-image-1',
    });
  });
});
