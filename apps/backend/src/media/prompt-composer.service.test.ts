import { describe, expect, it } from '@jest/globals';
import { PromptComposerService } from './prompt-composer.service';
import { IMAGE_STYLES, NO_TEXT_CLAUSE } from './image-styles';

/** A router stub that always answers with `output`. */
const routerReturning = (output: string) =>
  ({ execute: async () => ({ provider: 'stub', model: 'stub-text', capability: 'language', output }) }) as never;

/** A router stub that always throws, standing in for "no text provider". */
const routerThrowing = () =>
  ({
    execute: async () => {
      throw new Error('no text provider available');
    },
  }) as never;

describe('PromptComposerService', () => {
  it('appends the style fragment and the no-text clause to the original', async () => {
    const service = new PromptComposerService(routerThrowing());
    const result = await service.compose({ prompt: '  a brass orrery on a dark desk  ', style: 'cinematic' });

    expect(result.original).toBe('a brass orrery on a dark desk');
    expect(result.styleId).toBe('cinematic');
    expect(result.enhanced).toContain('cinematic film still');
    expect(result.enhanced).toContain(NO_TEXT_CLAUSE);
  });

  it('still produces a prompt with no style at all', async () => {
    const service = new PromptComposerService(routerThrowing());
    const result = await service.compose({ prompt: 'a lighthouse at dusk' });
    expect(result.styleId).toBeNull();
    expect(result.enhanced).toContain('a lighthouse at dusk');
  });

  it('ignores an unknown style rather than inventing one', async () => {
    const service = new PromptComposerService(routerThrowing());
    const result = await service.compose({ prompt: 'x', style: 'not-a-style' });
    expect(result.styleId).toBeNull();
  });

  it('uses a good rewrite from the text model and still appends the style', async () => {
    const service = new PromptComposerService(
      routerReturning(JSON.stringify({ prompt: 'an antique brass orrery, warm rim light' })),
    );
    const result = await service.compose({ prompt: 'brass orrery', style: 'photoreal', enhance: true });

    expect(result.enhanced).toContain('antique brass orrery');
    expect(result.enhanced).toContain('photorealistic photograph');
    expect(result.enhancerModel).toBe('stub:stub-text');
  });

  it('falls back to the original words and records why when the text model is down', async () => {
    const service = new PromptComposerService(routerThrowing());
    const result = await service.compose({ prompt: 'brass orrery', style: 'cinematic', enhance: true });

    expect(result.enhancerModel).toBeNull();
    expect(result.enhancerNote).toBeTruthy();
    // The style fragment must survive the failed rewrite.
    expect(result.enhanced).toContain('cinematic film still');
  });

  it('falls back when the text model returns something that is not a prompt', async () => {
    const service = new PromptComposerService(routerReturning('I cannot help with that.'));
    const result = await service.compose({ prompt: 'brass orrery', enhance: true });

    expect(result.enhancerModel).toBeNull();
    expect(result.enhancerNote).toBeTruthy();
    expect(result.enhanced).toContain('brass orrery');
  });

  it('tolerates a fenced JSON reply', async () => {
    const service = new PromptComposerService(
      routerReturning('```json\n{"prompt":"a weathered brass orrery in warm light"}\n```'),
    );
    const result = await service.compose({ prompt: 'brass orrery', enhance: true });
    expect(result.enhanced).toContain('weathered brass orrery');
  });

  it('ships six unique style presets', () => {
    expect(IMAGE_STYLES).toHaveLength(6);
    expect(new Set(IMAGE_STYLES.map((s) => s.id)).size).toBe(6);
  });

  describe('over the 2000 character ceiling', () => {
    const long = (n: number) => 'a lighthouse in a storm '.repeat(Math.ceil(n / 26)).slice(0, n);

    it('keeps the style fragment and the clause whole when it truncates the body', async () => {
      const service = new PromptComposerService(routerThrowing());
      const result = await service.compose({ prompt: long(2000), style: 'cinematic' });

      expect(result.enhanced!.length).toBeLessThanOrEqual(2000);
      // The bug this pins: room was reserved for the style fragment and then the
      // fragment was never appended, so a long prompt silently lost its style.
      expect(result.enhanced).toContain('cinematic film still');
      expect(result.enhanced).toContain(NO_TEXT_CLAUSE);
    });

    it('ends on the clause rather than a cut-off fragment', async () => {
      const service = new PromptComposerService(routerThrowing());
      const result = await service.compose({ prompt: long(2000), style: 'cinematic' });

      expect(result.enhanced!.endsWith(NO_TEXT_CLAUSE)).toBe(true);
      // No dangling separator left behind by the truncation.
      expect(result.enhanced).not.toMatch(/,\s*,\s*/);
      expect(result.enhanced).not.toMatch(/,\s*$/);
    });

    it('still bounds the prompt with no style at all', async () => {
      const service = new PromptComposerService(routerThrowing());
      const result = await service.compose({ prompt: long(2000) });

      expect(result.enhanced!.length).toBeLessThanOrEqual(2000);
      expect(result.enhanced).toContain(NO_TEXT_CLAUSE);
    });

    it('bounds a long rewrite the same way', async () => {
      const service = new PromptComposerService(
        routerReturning(JSON.stringify({ prompt: long(1900) })),
      );
      const result = await service.compose({ prompt: 'a lighthouse', style: 'watercolour', enhance: true });

      expect(result.enhanced!.length).toBeLessThanOrEqual(2000);
      expect(result.enhanced).toContain('watercolour');
      expect(result.enhanced!.endsWith(NO_TEXT_CLAUSE)).toBe(true);
    });

    it('leaves a prompt that is already short enough untouched', async () => {
      const service = new PromptComposerService(routerThrowing());
      const result = await service.compose({ prompt: 'a lighthouse at dusk', style: 'cinematic' });

      expect(result.enhanced!.length).toBeLessThanOrEqual(2000);
      expect(result.enhanced).toContain('a lighthouse at dusk');
      expect(result.enhanced).toContain('cinematic film still');
    });
  });
});
