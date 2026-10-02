import { AiRouterService } from '../ai/ai-router.service';
/**
 * The result of composing the text actually sent to a renderer, plus the
 * provenance the run stores so the caller can see what happened to their words.
 */
export type ComposedPrompt = {
    /** The original text, trimmed. Always stored on the run as `prompt`. */
    original: string;
    /** The full string sent to the provider, or null when nothing was appended. */
    enhanced: string | null;
    /** The style preset that was applied, or null. */
    styleId: string | null;
    /** The text model that rewrote the prompt, or null when no model was used. */
    enhancerModel: string | null;
    /** Why enhancement was skipped, when it was. Null on a clean success. */
    enhancerNote: string | null;
};
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
export declare class PromptComposerService {
    private readonly ai;
    private readonly log;
    constructor(ai: AiRouterService);
    /**
     * Build the text to send. `enhance` asks a routed text model to rewrite the
     * description; it is best-effort by design and never blocks a render.
     */
    compose(input: {
        prompt: string;
        style?: string | null;
        enhance?: boolean;
    }): Promise<ComposedPrompt>;
    /**
     * Ask the routed text model for a rewrite. Returns `{ prompt: null, note }` on
     * any failure. This never throws: a missing or busy text provider must not stop
     * an image from being rendered from the user's own words.
     */
    private rewrite;
}
