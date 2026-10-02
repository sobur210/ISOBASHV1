"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const ai_router_service_1 = require("./ai-router.service");
function candidate(overrides) {
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
(0, globals_1.describe)('scoreCandidate', () => {
    (0, globals_1.it)('leaves the score untouched when no operator preference is set', () => {
        (0, globals_1.expect)((0, ai_router_service_1.scoreCandidate)(candidate({}), 'offline', 1)).toBe(115);
    });
    /**
     * Regression: health is derived from one capability but applied to all of them.
     * A Gemini image model scored while Gemini's *text* check is degraded must not
     * lose routing to a key-less renderer that always reports itself healthy.
     */
    (0, globals_1.it)('lets an operator preference outweigh a degraded health signal', () => {
        const degraded = candidate({ provider: 'gemini', health: 'unavailable', priority: 50 });
        const healthy = candidate({ provider: 'pollinations', health: 'healthy' });
        (0, globals_1.expect)((0, ai_router_service_1.scoreCandidate)(degraded, 'offline', 1)).toBeGreaterThan((0, ai_router_service_1.scoreCandidate)(healthy, 'offline', 1));
    });
    /**
     * The preference must not be a licence to ignore a renderer that is genuinely
     * broken: a real success-rate collapse still overtakes it, so failover works.
     */
    (0, globals_1.it)('is still overtaken by a genuinely failing renderer', () => {
        const preferred = candidate({ provider: 'gemini', priority: 50 });
        const failing = candidate({ provider: 'pollinations' });
        (0, globals_1.expect)((0, ai_router_service_1.scoreCandidate)(preferred, 'offline', 0)).toBeLessThan((0, ai_router_service_1.scoreCandidate)(failing, 'offline', 1));
    });
});
//# sourceMappingURL=routing-score.test.js.map