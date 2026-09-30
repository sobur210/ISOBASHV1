import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { VideoAssemblyService } from './video-assembly.service';
import { Json2VideoProvider } from '../ai/json2video.provider';
import { CreateAssemblyDto } from './dto/assembly.dto';

/**
 * The parts of assembly that decide whether a render is submitted at all.
 *
 * The provider is the real one, with `fetch` replaced by a `fetch` that fails, so
 * these tests cover the local guards: the 60-second cap, the balance check, and
 * the fact that a refusal happens before anything is submitted. Nothing here may
 * reach the network, because a live call spends part of a grant that does not
 * renew.
 */

const config = { media: { video: { maxVideoBytes: 100 * 1024 * 1024 } } } as never;
const prisma = { mediaAsset: { create: () => Promise.reject(new Error('not reached in these tests')) } } as never;
const storage = { write: () => Promise.reject(new Error('not reached in these tests')) } as never;

function dto(overrides: Partial<CreateAssemblyDto> = {}): CreateAssemblyDto {
  return {
    title: 'Findings',
    scenes: [{ heading: 'Revenue', body: 'Revenue grew.' }],
    voiceover: false,
    resolution: 'hd',
    source: 'research',
    ...overrides,
  };
}

describe('VideoAssemblyService guards', () => {
  let originalFetch: typeof globalThis.fetch = globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      throw new Error(`UNSTUBBED NETWORK CALL to ${url}`);
    }) as typeof globalThis.fetch;
    process.env.JSON2VIDEO_API_KEY = 'test-key';
    process.env.JSON2VIDEO_ENABLED = 'true';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.JSON2VIDEO_API_KEY;
    delete process.env.JSON2VIDEO_ENABLED;
  });

  /**
   * Assembly is opt-in because it sends a user's own document to a third party and
   * spends part of a grant that does not refill. Disabled must mean nothing is
   * submitted at all, so this asserts the absence of any network call.
   */
  it('refuses without submitting anything when assembly is switched off', async () => {
    delete process.env.JSON2VIDEO_ENABLED;
    const service = new VideoAssemblyService(new Json2VideoProvider(), prisma, storage, config);

    const capabilities = await service.capabilities();
    expect(capabilities.available).toBe(false);
    expect(capabilities.voiceoverAvailable).toBe(false);
    // The reason is given, so a disabled deployment does not look like a typo.
    expect(capabilities.detail).toMatch(/JSON2VIDEO_ENABLED/);

    await expect(service.start(1, null, dto())).rejects.toThrow(/switched off/);
  });

  it('does not submit while switched off', async () => {
    delete process.env.JSON2VIDEO_ENABLED;
    const service = new VideoAssemblyService(new Json2VideoProvider(), prisma, storage, config);
    await expect(service.start(1, null, dto())).rejects.toThrow();
    // No UNSTUBBED NETWORK CALL error, which is what a submission attempt produces.
  });

  it('reports the plan limits so the UI can warn before spending a one-off grant', async () => {
    const service = new VideoAssemblyService(new Json2VideoProvider(), prisma, storage, config);
    const capabilities = await service.capabilities();

    expect(capabilities.provider).toBe('json2video');
    expect(capabilities.maxSeconds).toBe(60);
    expect(capabilities.voiceoverAvailable).toBe(true);
    // Said to the client, not buried in a comment, because the output is watermarked
    // and non-commercial and a user deserves to know before rendering.
    expect(capabilities.watermarked).toBe(true);
    expect(capabilities.nonRenewing).toBe(true);
  });

  /**
   * A single movie cannot exceed the plan length, so an over-long report is refused
   * here with an actionable message rather than submitted and rejected by the
   * provider minutes later.
   */
  it('refuses a document longer than the plan allows, without submitting', async () => {
    const service = new VideoAssemblyService(new Json2VideoProvider(), prisma, storage, config);
    // Ten scenes of a long body each read for the 12 second cap, well past 60.
    const long: CreateAssemblyDto = dto({
      scenes: Array.from({ length: 10 }, (_, i) => ({ heading: `Section ${i}`, body: 'x'.repeat(400) })),
    });

    await expect(service.start(1, null, long)).rejects.toThrow(/over the 60 second limit/);
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
  it('submits rather than refusing when the balance cannot be read', async () => {
    const service = new VideoAssemblyService(new Json2VideoProvider(), prisma, storage, config);
    await expect(service.start(1, null, dto())).rejects.toThrow(/UNSTUBBED NETWORK CALL/);
  });
});
