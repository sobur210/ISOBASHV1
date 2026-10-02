"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAILOVER_BLOCKED_CODES = exports.FAILOVER_ALLOWED_CODES = void 0;
exports.isFailoverAllowed = isFailoverAllowed;
exports.isMediaFailoverAllowed = isMediaFailoverAllowed;
/**
 * Provider error codes that justify trying the next eligible candidate.
 *
 * Failover is deliberately conservative. A rate limit, a rejected key, a retired
 * model or an overloaded provider are all *real answers from the provider*: the
 * router must surface them instead of quietly producing a different answer from
 * a different vendor. Only transport-level failures and empty responses are
 * treated as "this candidate could not answer".
 */
exports.FAILOVER_ALLOWED_CODES = new Set([
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_STREAM_FAILED',
    'EMPTY_PROVIDER_RESPONSE',
    'PROVIDER_TIMEOUT',
    'STREAM_INTERRUPTED',
]);
/** Codes that must be reported to the caller verbatim, without failover. */
exports.FAILOVER_BLOCKED_CODES = new Set([
    'RATE_LIMITED',
    'INVALID_API_KEY',
    'PROVIDER_NOT_CONFIGURED',
    'MODEL_NOT_AVAILABLE',
    'PROVIDER_OVERLOADED',
    'CAPABILITY_UNSUPPORTED',
    'STREAM_ABORTED',
    /**
     * The account has no credits left. Blocked on purpose: every renderer here bills
     * the same shared pool, so failing over would spend credits that do not exist and
     * turn one clear "this month is used up" into a chain of confusing refusals.
     */
    'PROVIDER_INSUFFICIENT_CREDITS',
]);
function isFailoverAllowed(code) {
    if (!code)
        return false;
    return exports.FAILOVER_ALLOWED_CODES.has(code);
}
/**
 * Media generation may leave a blocked provider for another renderer, but only
 * when the caller pinned nothing, and only with the substitution reported.
 *
 * The text path deliberately does not do this: routing around a provider that
 * refused for quota, a bad key or a retired model hides the fact that the one the
 * user chose could not pay. For an unpinned image or video request there is no
 * such choice to hide, because the user asked for "a picture" or "a clip". Refusing
 * outright would mean a deployment with a perfectly good second renderer can never
 * draw anything.
 */
function isMediaFailoverAllowed(code) {
    if (!code)
        return false;
    return isFailoverAllowed(code) || exports.FAILOVER_BLOCKED_CODES.has(code);
}
//# sourceMappingURL=routing.types.js.map