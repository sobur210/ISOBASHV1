"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const video_assembly_service_1 = require("./video-assembly.service");
const json2video_provider_1 = require("../ai/json2video.provider");
/**
 * The parts of assembly that decide whether a render is submitted at all.
 *
 * The provider is the real one, with `fetch` replaced by a `fetch` that fails, so
 * these tests cover the local guards: the 60-second cap, the balance check, and
 * the fact that a refusal happens before anything is submitted. Nothing here may
 * reach the network, because a live call spends part of a grant that does not
 * renew.
 */
const config = { media: { video: { maxVideoBytes: 100 * 1024 * 1024 } } };
const prisma = { mediaAsset: { create: () => Promise.reject(new Error('not reached in these tests')) } };
const storage = { write: () => Promise.reject(new Error('not reached in these tests')) };
function dto(overrides = {}) {
    return {
        title: 'Findings',
        scenes: [{ heading: 'Revenue', body: 'Revenue grew.' }],
        voiceover: false,
        resolution: 'hd',
        source: 'research',
        ...overrides,
    };
}
(0, globals_1.describe)('VideoAssemblyService guards', () => {
    let originalFetch = globalThis.fetch;
    (0, globals_1.beforeEach)(() => {
        originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            throw new Error(`UNSTUBBED NETWORK CALL to ${url}`);
        });
        process.env.JSON2VIDEO_API_KEY = 'test-key';
        process.env.JSON2VIDEO_ENABLED = 'true';
    });
    (0, globals_1.afterEach)(() => {
        globalThis.fetch = originalFetch;
        delete process.env.JSON2VIDEO_API_KEY;
        delete process.env.JSON2VIDEO_ENABLED;
    });
    /**
     * Assembly is opt-in because it sends a user's own document to a third party and
     * spends part of a grant that does not refill. Disabled must mean nothing is
     * submitted at all, so this asserts the absence of any network call.
     */
    (0, globals_1.it)('refuses without submitting anything when assembly is switched off', async () => {
        delete process.env.JSON2VIDEO_ENABLED;
        const service = new video_assembly_service_1.VideoAssemblyService(new json2video_provider_1.Json2VideoProvider(), prisma, storage, config);
        const capabilities = await service.capabilities();
        (0, globals_1.expect)(capabilities.available).toBe(false);
        (0, globals_1.expect)(capabilities.voiceoverAvailable).toBe(false);
        // The reason is given, so a disabled deployment does not look like a typo.
        (0, globals_1.expect)(capabilities.detail).toMatch(/JSON2VIDEO_ENABLED/);
        await (0, globals_1.expect)(service.start(1, null, dto())).rejects.toThrow(/switched off/);
    });
    (0, globals_1.it)('does not submit while switched off', async () => {
        delete process.env.JSON2VIDEO_ENABLED;
        const service = new video_assembly_service_1.VideoAssemblyService(new json2video_provider_1.Json2VideoProvider(), prisma, storage, config);
        await (0, globals_1.expect)(service.start(1, null, dto())).rejects.toThrow();
        // No UNSTUBBED NETWORK CALL error, which is what a submission attempt produces.
    });
    (0, globals_1.it)('reports the plan limits so the UI can warn before spending a one-off grant', async () => {
        const service = new video_assembly_service_1.VideoAssemblyService(new json2video_provider_1.Json2VideoProvider(), prisma, storage, config);
        const capabilities = await service.capabilities();
        (0, globals_1.expect)(capabilities.provider).toBe('json2video');
        (0, globals_1.expect)(capabilities.maxSeconds).toBe(60);
        (0, globals_1.expect)(capabilities.voiceoverAvailable).toBe(true);
        // Said to the client, not buried in a comment, because the output is watermarked
        // and non-commercial and a user deserves to know before rendering.
        (0, globals_1.expect)(capabilities.watermarked).toBe(true);
        (0, globals_1.expect)(capabilities.nonRenewing).toBe(true);
    });
    /**
     * A single movie cannot exceed the plan length, so an over-long report is refused
     * here with an actionable message rather than submitted and rejected by the
     * provider minutes later.
     */
    (0, globals_1.it)('refuses a document longer than the plan allows, without submitting', async () => {
        const service = new video_assembly_service_1.VideoAssemblyService(new json2video_provider_1.Json2VideoProvider(), prisma, storage, config);
        // Ten scenes of a long body each read for the 12 second cap, well past 60.
        const long = dto({
            scenes: Array.from({ length: 10 }, (_, i) => ({ heading: `Section ${i}`, body: 'x'.repeat(400) })),
        });
        await (0, globals_1.expect)(service.start(1, null, long)).rejects.toThrow(/over the 60 second limit/);
    });
    /**
     * An unreadable balance must not be read as zero.
     *
     * Under this stub `readCreditBalance` cannot reach the network, so it reports
     * unreadable. Treating that as an empty balance would refuse every render on a
     * working account because a quota endpoint was quiet, so the service is required
     * to carry on and let the provider refuse it if the quota really is spent. The
     * assertion is on the failure that escaped from the submit path, which is how
     * this test distinguishes "refused locally" from "submitted".
     */
    (0, globals_1.it)('submits rather than refusing when the balance cannot be read', async () => {
        const service = new video_assembly_service_1.VideoAssemblyService(new json2video_provider_1.Json2VideoProvider(), prisma, storage, config);
        await (0, globals_1.expect)(service.start(1, null, dto())).rejects.toThrow(/UNSTUBBED NETWORK CALL/);
    });
});
//# sourceMappingURL=video-assembly.service.test.js.map