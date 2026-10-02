"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiProviderError = exports.PROVIDER_REFUSAL_REASONS = void 0;
exports.isProviderRefusal = isProviderRefusal;
/** Finish reasons a provider uses to say "I will not produce this", not "I failed". */
exports.PROVIDER_REFUSAL_REASONS = new Set([
    'IMAGE_SAFETY',
    'VIDEO_SAFETY',
    'PROHIBITED_CONTENT',
    'CONTENT_BLOCKED',
    'BLOCKLIST',
    'SAFETY',
    'RECITATION',
]);
function isProviderRefusal(finishReason) {
    return finishReason ? exports.PROVIDER_REFUSAL_REASONS.has(finishReason.toUpperCase()) : false;
}
class AiProviderError extends Error {
    provider;
    code;
    details;
    constructor(message, provider, code, 
    /**
     * Machine-readable context a caller needs to act correctly, kept off the
     * message so it is not shown to a user.
     *
     * This exists for the billing case: a render can fail *after* the provider
     * accepted it, and then the provider's own project id is the only evidence that
     * credits may have been spent. Without it a failed render is indistinguishable
     * from one that was refused before submission, and the credit ledger has to
     * guess which it was.
     */
    details) {
        super(message);
        this.provider = provider;
        this.code = code;
        this.details = details;
        this.name = 'AiProviderError';
    }
    /** The provider's own id for the work, when the error happened after it started. */
    get providerProjectId() {
        const value = this.details?.providerProjectId;
        return typeof value === 'string' && value ? value : null;
    }
}
exports.AiProviderError = AiProviderError;
//# sourceMappingURL=provider.types.js.map