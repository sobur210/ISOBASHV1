"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptComposerService = void 0;
const common_1 = require("@nestjs/common");
const ai_router_service_1 = require("../ai/ai-router.service");
const image_styles_1 = require("./image-styles");
/** Keeps the composed prompt inside the storage column and the provider URL. */
const MAX_COMPOSED_CHARS = 2000;
const SYSTEM_INSTRUCTIONS = [
    'You rewrite a short user description into a single dense text-to-image prompt.',
    'Rules:',
    '- Preserve the user intent, the subject and every named entity exactly.',
    '- Add only visual detail (medium, light, lens, texture, mood, composition) that does not contradict the request.',
    '- Never introduce a subject the user did not ask for, especially people or faces.',
    '- Never add text, lettering, captions, watermarks, signatures, logos or borders to the scene description.',
    '- Return strict JSON only, in the form {"prompt":"..."}. No prose, no markdown fence.',
].join('\n');
/**
 * Phase 13 image follow-up: prompt composition and optional enhancement.
 *
 * The caller's words are never thrown away. This service only ever *appends* to
 * them: the style fragment, the no-text clause, and (when enabled and a text
 * model answers) a model rewrite that is explicitly told to preserve intent. If
 * the rewrite fails, is not JSON, or the deployment has no text provider at all,
 * the original words plus the style fragment are still what the renderer sees, and
 * the run records that the rewrite was skipped and why.
 */
let PromptComposerService = class PromptComposerService {
    ai;
    log = new common_1.Logger('PromptComposer');
    constructor(ai) {
        this.ai = ai;
    }
    /**
     * Build the text to send. `enhance` asks a routed text model to rewrite the
     * description; it is best-effort by design and never blocks a render.
     */
    async compose(input) {
        const original = input.prompt.trim();
        const styleId = (0, image_styles_1.normaliseStyleId)(input.style);
        const style = (0, image_styles_1.findImageStyle)(styleId);
        let body = original;
        let enhancerModel = null;
        let enhancerNote = null;
        if (input.enhance === true) {
            const rewrite = await this.rewrite(original, styleId);
            if (rewrite.prompt) {
                body = rewrite.prompt;
                enhancerModel = rewrite.model;
            }
            else {
                enhancerNote = rewrite.note;
            }
        }
        // Compose: rewritten (or original) text, then the style fragment, then the
        // standing no-text clause. The clause is dropped if composition would
        // overflow, because a truncated clause is worse than none.
        let composed = body;
        if (style)
            composed = `${composed}, ${style.fragment}`;
        composed = `${composed}, ${image_styles_1.NO_TEXT_CLAUSE}`;
        if (composed.length > MAX_COMPOSED_CHARS) {
            // Truncate the *body* only, and keep the server-owned tail whole: the style
            // fragment and the no-text clause are the instructions, so cutting them in
            // half would leave a dangling fragment like ", cinematic, chiaroscuro" and
            // render something the caller never asked for. Reserve the full tail, then
            // give whatever is left to the description.
            const tail = [style ? style.fragment : '', image_styles_1.NO_TEXT_CLAUSE].filter(Boolean).join(', ');
            const room = Math.max(0, MAX_COMPOSED_CHARS - tail.length - 2);
            composed = tail ? `${body.slice(0, room).trimEnd()}, ${tail}` : body.slice(0, MAX_COMPOSED_CHARS);
        }
        // If the composed prompt ended up identical to the original (no style, no
        // rewrite survived) there is nothing meaningful to record as "enhanced".
        const enhanced = composed.trim() === original ? null : composed;
        return { original, enhanced, styleId, enhancerModel, enhancerNote };
    }
    /**
     * Ask the routed text model for a rewrite. Returns `{ prompt: null, note }` on
     * any failure. This never throws: a missing or busy text provider must not stop
     * an image from being rendered from the user's own words.
     */
    async rewrite(original, styleId) {
        const style = (0, image_styles_1.findImageStyle)(styleId);
        const userBlock = [
            `User description: ${original}`,
            style ? `The chosen style is "${style.label}". Favour visual detail consistent with that style, but do not repeat the style name.` : '',
        ]
            .filter(Boolean)
            .join('\n');
        try {
            const response = await this.ai.execute({
                capability: 'language',
                input: `${SYSTEM_INSTRUCTIONS}\n\n${userBlock}`,
                responseFormat: 'json',
            });
            const parsed = parseRewrittenPrompt(response.output);
            if (parsed) {
                return { prompt: parsed, model: `${response.provider}:${response.model}`, note: null };
            }
            this.log.warn('Prompt enhancement returned text that was not a usable JSON prompt; using the original.');
            return {
                prompt: null,
                model: null,
                note: 'The prompt enhancer did not return a usable rewrite, so the original words were used.',
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            this.log.warn(`Prompt enhancement unavailable (${message}); using the original prompt.`);
            return {
                prompt: null,
                model: null,
                note: 'The prompt enhancer was unavailable, so the original words were used unchanged.',
            };
        }
    }
};
exports.PromptComposerService = PromptComposerService;
exports.PromptComposerService = PromptComposerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ai_router_service_1.AiRouterService])
], PromptComposerService);
/** Pull the `prompt` string out of a model reply, tolerating stray fences. */
function parseRewrittenPrompt(output) {
    const cleaned = output.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
        const value = JSON.parse(cleaned);
        if (value && typeof value === 'object' && typeof value.prompt === 'string') {
            const prompt = value.prompt.trim();
            return prompt.length > 0 ? prompt : null;
        }
    }
    catch {
        // fall through to the loose extraction below
    }
    // Some providers strip the JSON envelope even when asked for JSON. A single
    // quoted line is a reasonable last resort, but only if it is clearly the answer.
    const match = /"prompt"\s*:\s*"([^"]{3,})"/.exec(cleaned);
    if (match)
        return match[1].trim();
    return null;
}
//# sourceMappingURL=prompt-composer.service.js.map