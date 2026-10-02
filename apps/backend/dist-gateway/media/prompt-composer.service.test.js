"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const prompt_composer_service_1 = require("./prompt-composer.service");
const image_styles_1 = require("./image-styles");
/** A router stub that always answers with `output`. */
const routerReturning = (output) => ({ execute: async () => ({ provider: 'stub', model: 'stub-text', capability: 'language', output }) });
/** A router stub that always throws, standing in for "no text provider". */
const routerThrowing = () => ({
    execute: async () => {
        throw new Error('no text provider available');
    },
});
(0, globals_1.describe)('PromptComposerService', () => {
    (0, globals_1.it)('appends the style fragment and the no-text clause to the original', async () => {
        const service = new prompt_composer_service_1.PromptComposerService(routerThrowing());
        const result = await service.compose({ prompt: '  a brass orrery on a dark desk  ', style: 'cinematic' });
        (0, globals_1.expect)(result.original).toBe('a brass orrery on a dark desk');
        (0, globals_1.expect)(result.styleId).toBe('cinematic');
        (0, globals_1.expect)(result.enhanced).toContain('cinematic film still');
        (0, globals_1.expect)(result.enhanced).toContain(image_styles_1.NO_TEXT_CLAUSE);
    });
    (0, globals_1.it)('still produces a prompt with no style at all', async () => {
        const service = new prompt_composer_service_1.PromptComposerService(routerThrowing());
        const result = await service.compose({ prompt: 'a lighthouse at dusk' });
        (0, globals_1.expect)(result.styleId).toBeNull();
        (0, globals_1.expect)(result.enhanced).toContain('a lighthouse at dusk');
    });
    (0, globals_1.it)('ignores an unknown style rather than inventing one', async () => {
        const service = new prompt_composer_service_1.PromptComposerService(routerThrowing());
        const result = await service.compose({ prompt: 'x', style: 'not-a-style' });
        (0, globals_1.expect)(result.styleId).toBeNull();
    });
    (0, globals_1.it)('uses a good rewrite from the text model and still appends the style', async () => {
        const service = new prompt_composer_service_1.PromptComposerService(routerReturning(JSON.stringify({ prompt: 'an antique brass orrery, warm rim light' })));
        const result = await service.compose({ prompt: 'brass orrery', style: 'photoreal', enhance: true });
        (0, globals_1.expect)(result.enhanced).toContain('antique brass orrery');
        (0, globals_1.expect)(result.enhanced).toContain('photorealistic photograph');
        (0, globals_1.expect)(result.enhancerModel).toBe('stub:stub-text');
    });
    (0, globals_1.it)('falls back to the original words and records why when the text model is down', async () => {
        const service = new prompt_composer_service_1.PromptComposerService(routerThrowing());
        const result = await service.compose({ prompt: 'brass orrery', style: 'cinematic', enhance: true });
        (0, globals_1.expect)(result.enhancerModel).toBeNull();
        (0, globals_1.expect)(result.enhancerNote).toBeTruthy();
        // The style fragment must survive the failed rewrite.
        (0, globals_1.expect)(result.enhanced).toContain('cinematic film still');
    });
    (0, globals_1.it)('falls back when the text model returns something that is not a prompt', async () => {
        const service = new prompt_composer_service_1.PromptComposerService(routerReturning('I cannot help with that.'));
        const result = await service.compose({ prompt: 'brass orrery', enhance: true });
        (0, globals_1.expect)(result.enhancerModel).toBeNull();
        (0, globals_1.expect)(result.enhancerNote).toBeTruthy();
        (0, globals_1.expect)(result.enhanced).toContain('brass orrery');
    });
    (0, globals_1.it)('tolerates a fenced JSON reply', async () => {
        const service = new prompt_composer_service_1.PromptComposerService(routerReturning('```json\n{"prompt":"a weathered brass orrery in warm light"}\n```'));
        const result = await service.compose({ prompt: 'brass orrery', enhance: true });
        (0, globals_1.expect)(result.enhanced).toContain('weathered brass orrery');
    });
    (0, globals_1.it)('ships six unique style presets', () => {
        (0, globals_1.expect)(image_styles_1.IMAGE_STYLES).toHaveLength(6);
        (0, globals_1.expect)(new Set(image_styles_1.IMAGE_STYLES.map((s) => s.id)).size).toBe(6);
    });
    (0, globals_1.describe)('over the 2000 character ceiling', () => {
        const long = (n) => 'a lighthouse in a storm '.repeat(Math.ceil(n / 26)).slice(0, n);
        (0, globals_1.it)('keeps the style fragment and the clause whole when it truncates the body', async () => {
            const service = new prompt_composer_service_1.PromptComposerService(routerThrowing());
            const result = await service.compose({ prompt: long(2000), style: 'cinematic' });
            (0, globals_1.expect)(result.enhanced.length).toBeLessThanOrEqual(2000);
            // The bug this pins: room was reserved for the style fragment and then the
            // fragment was never appended, so a long prompt silently lost its style.
            (0, globals_1.expect)(result.enhanced).toContain('cinematic film still');
            (0, globals_1.expect)(result.enhanced).toContain(image_styles_1.NO_TEXT_CLAUSE);
        });
        (0, globals_1.it)('ends on the clause rather than a cut-off fragment', async () => {
            const service = new prompt_composer_service_1.PromptComposerService(routerThrowing());
            const result = await service.compose({ prompt: long(2000), style: 'cinematic' });
            (0, globals_1.expect)(result.enhanced.endsWith(image_styles_1.NO_TEXT_CLAUSE)).toBe(true);
            // No dangling separator left behind by the truncation.
            (0, globals_1.expect)(result.enhanced).not.toMatch(/,\s*,\s*/);
            (0, globals_1.expect)(result.enhanced).not.toMatch(/,\s*$/);
        });
        (0, globals_1.it)('still bounds the prompt with no style at all', async () => {
            const service = new prompt_composer_service_1.PromptComposerService(routerThrowing());
            const result = await service.compose({ prompt: long(2000) });
            (0, globals_1.expect)(result.enhanced.length).toBeLessThanOrEqual(2000);
            (0, globals_1.expect)(result.enhanced).toContain(image_styles_1.NO_TEXT_CLAUSE);
        });
        (0, globals_1.it)('bounds a long rewrite the same way', async () => {
            const service = new prompt_composer_service_1.PromptComposerService(routerReturning(JSON.stringify({ prompt: long(1900) })));
            const result = await service.compose({ prompt: 'a lighthouse', style: 'watercolour', enhance: true });
            (0, globals_1.expect)(result.enhanced.length).toBeLessThanOrEqual(2000);
            (0, globals_1.expect)(result.enhanced).toContain('watercolour');
            (0, globals_1.expect)(result.enhanced.endsWith(image_styles_1.NO_TEXT_CLAUSE)).toBe(true);
        });
        (0, globals_1.it)('leaves a prompt that is already short enough untouched', async () => {
            const service = new prompt_composer_service_1.PromptComposerService(routerThrowing());
            const result = await service.compose({ prompt: 'a lighthouse at dusk', style: 'cinematic' });
            (0, globals_1.expect)(result.enhanced.length).toBeLessThanOrEqual(2000);
            (0, globals_1.expect)(result.enhanced).toContain('a lighthouse at dusk');
            (0, globals_1.expect)(result.enhanced).toContain('cinematic film still');
        });
    });
});
//# sourceMappingURL=prompt-composer.service.test.js.map