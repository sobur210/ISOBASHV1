/**
 * Video assembly: a second, separate contract from `VideoProvider`.
 *
 * Why this is not a `VideoProvider`
 * ---------------------------------
 * A `VideoProvider` turns one prompt into one generated clip. JSON2Video does
 * something categorically different: the caller already has the pieces (text
 * scenes, images, a voiceover, timing) and wants them composed into a finished
 * video. There is no model to choose, no prompt to write, and nothing to infer.
 * Forcing it through `VideoProvider` would mean inventing a fake "prompt" that
 * describes a document and pretending the output is a generated clip -- and, worse,
 * it would put a renderer with completely different billing (seconds of rendered
 * video) and failure modes (a malformed recipe) into the same failover chain as a
 * generator, where a routing bug would silently swap one for the other.
 *
 * So the two live in different contracts, different services, and different UI
 * entry points. JSON2Video is reached from "turn this report into a video", never
 * from the AI video generation screen.
 *
 * The two billing currencies are also kept apart deliberately, because they are not
 * convertible: Magic Hour bills in credits per second of clip at 512p, DeepAI bills
 * in seconds of a monthly Pro allowance, and JSON2Video bills in credits of a
 * non-renewable 600-credit signup grant. A number that means "96 Magic Hour credits"
 * must never be compared against a JSON2Video balance.
 *
 * The job shape is deliberately close to `VideoJob` -- async submit, poll, download
 * a link that expires -- so the parts that are genuinely the same (poll loop,
 * byte-sniffing download, honesty about failure) are not reinvented. Only the
 * request and result shapes are specific to assembly.
 */
import { ProviderCreditBalance } from './video-provider.types';

export type VideoAssemblyStatus =
  /** Accepted, not yet picked up by a worker. */
  | 'pending'
  /** Rendering in progress. */
  | 'running'
  /** Finished; `url` holds the MP4. */
  | 'done'
  /** The provider reported a failure; `message` carries its reason. */
  | 'error'
  /** The client gave up. Treated as fatal, exactly as JSON2Video's docs instruct. */
  | 'timeout'
  | 'unknown';

export type VideoAssemblyJob = {
  /** JSON2Video's 16-character project id. */
  id: string;
  status: VideoAssemblyStatus;
  /** Public MP4, present only once `status` is `done`. */
  url: string | null;
  thumbnailUrl: string | null;
  /** Output length in seconds, as reported once finished. */
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  /** The provider's own reason, kept verbatim. Never rewritten. */
  message: string | null;
  /**
   * `remaining_quota.time`, when the account reports it.
   *
   * This is the one balance a `VideoProvider` cannot give: it is whole seconds of
   * renderable video left, not credits, and it is the figure the guard needs for
   * this provider.
   */
  remainingQuotaSeconds: number | null;
};

/**
 * One scene: a slice of the timeline holding elements that render together.
 *
 * The shape mirrors JSON2Video's Scene object, but only the fields this feature
 * actually uses. A scene with no elements is dropped by the assembler rather than
 * submitted, because the provider rejects a scene that has nothing to render.
 */
export type AssemblyScene = {
  elements: AssemblyElement[];
};

export type AssemblyElement =
  | { type: 'text'; text: string; duration: number; style?: string; background?: string; color?: string }
  | { type: 'voice'; text: string; duration: number; voice?: string; model?: 'azure' | 'elevenlabs' }
  | { type: 'image'; src: string; duration: number }
  | { type: 'video'; src: string; duration: number };

/**
 * Everything needed to assemble one video.
 *
 * `source` records where the content came from, so an assembled video can be traced
 * back to the report or chat summary it was built from rather than becoming an
 * orphan file in the library.
 */
export type AssembleVideoRequest = {
  title: string;
  subtitle?: string;
  /** Scene bodies, in order. Empty or whitespace-only entries are dropped. */
  scenes: Array<{ heading: string; body: string }>;
  /** TTS the whole thing. Costs 0 credits today on every JSON2Video plan. */
  voiceover: boolean;
  /** Appended as a final scene. */
  outro?: string;
  /** Canvas size, validated against the plan's ceiling before submission. */
  resolution: AssemblyResolution;
  /** Where this came from, for provenance: `research` or `chat`. */
  source: 'research' | 'chat';
  /** Id of the report or conversation, when there is one. */
  sourceId?: string;
  signal?: AbortSignal;
};

/**
 * Resolutions the free plan allows.
 *
 * The free plan caps output at 1080p, so `full-hd` is the ceiling here and
 * anything larger is refused before submission rather than being answered with a
 * `401` after the user has waited. Paid plans raise this; the allow-list is the
 * single place that has to change.
 */
export const ASSEMBLY_RESOLUTIONS = ['sd', 'hd', 'full-hd'] as const;
export type AssemblyResolution = (typeof ASSEMBLY_RESOLUTIONS)[number];

/** Free plan ceiling: 60 seconds for a single movie. */
export const ASSEMBLY_FREE_MAX_SECONDS = 60;

/** The API refuses a request body over 2 MB; signed media URLs are what fill it. */
export const ASSEMBLY_MAX_BODY_BYTES = 2 * 1024 * 1024;

export type AssemblyResult = {
  provider: string;
  job: VideoAssemblyJob;
  /** The exact recipe submitted, so a run is reproducible and reviewable. */
  recipe: Record<string, unknown>;
  /** What it cost, in this provider's own currency. Never mixed with a video provider's. */
  creditsCharged: number | null;
  creditsChargedIsEstimate: boolean;
};

/**
 * A provider that assembles an existing set of pieces into a finished video.
 *
 * Deliberately narrower than `VideoProvider`: it cannot generate, and it is not a
 * failover target for anything that can.
 */
export interface VideoAssemblyProvider {
  readonly name: string;

  /** Canvas sizes this deployment will accept. */
  readonly resolutions: readonly AssemblyResolution[];

  /** Longest single video this plan allows. */
  readonly maxSeconds: number;

  health(): Promise<{ provider: string; status: 'healthy' | 'unconfigured' | 'degraded'; detail: string }>;

  /**
   * Build the recipe, then submit it. Split out from the submission so the exact
   * JSON can be reviewed and tested without a key or a network call.
   */
  buildRecipe(request: AssembleVideoRequest): Record<string, unknown>;

  submit(request: AssembleVideoRequest): Promise<AssemblyResult>;

  /** Current state of a submitted assembly. */
  getJob(id: string): Promise<VideoAssemblyJob>;

  /**
   * Fetch the finished MP4. JSON2Video's `url` is a public CDN link, so the bytes
   * are pulled down and stored by ISOBASH rather than linked.
   */
  downloadResult(job: VideoAssemblyJob): Promise<{ mimeType: string; data: string }>;

  /**
   * Whole seconds of video still renderable on this account.
   *
   * This is the guard's input. It is not comparable with any video provider's
   * credit balance, and the caller must not treat it as one.
   */
  readCreditBalance(): Promise<ProviderCreditBalance>;
}
