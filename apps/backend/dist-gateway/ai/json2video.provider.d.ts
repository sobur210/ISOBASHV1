import { ProviderCreditBalance } from './video-provider.types';
import { AssembleVideoRequest, AssemblyResolution, AssemblyResult, VideoAssemblyJob, VideoAssemblyProvider } from './video-assembly.types';
export declare class Json2VideoProvider implements VideoAssemblyProvider {
    readonly name = "json2video";
    readonly resolutions: readonly AssemblyResolution[];
    /**
     * The free plan's 60 second cap.
     *
     * Read from the environment so a paid plan can raise it, but the default is the
     * free ceiling and the assembler will not build a longer movie than this.
     */
    readonly maxSeconds: number;
    private readonly baseUrl;
    private get apiKey();
    health(): Promise<{
        provider: string;
        status: 'healthy' | 'unconfigured' | 'degraded';
        detail: string;
    }>;
    /**
     * Turn a report or summary into a slideshow recipe.
     *
     * The shape is deliberately simple and legible: a title card, one scene per
     * section, an outro. No template, no animation library, no `component` elements.
     * The point of this feature is that a long piece of research becomes a watchable
     * clip, and a recipe full of JSON2Video-specific styling would be unreviewable
     * and unfixable from ISOBASH's side.
     *
     * Every scene carries a `comment` naming its source section, so a rendered
     * video can be traced back to the text it came from. JSON2Video ignores `comment`
     * when rendering; it is documentation, carried in the stored recipe.
     */
    buildRecipe(request: AssembleVideoRequest): Record<string, unknown>;
    submit(request: AssembleVideoRequest): Promise<AssemblyResult>;
    getJob(id: string): Promise<VideoAssemblyJob>;
    /**
     * Poll until the movie is `done`, `error` or `timeout`.
     *
     * `timeout` is listed as a client-side status: the docs say the server keeps
     * `running` internally past 15 minutes and instruct clients to treat `timeout` as
     * fatal. It is handled as a failure here rather than waited out.
     */
    waitForCompletion(initial: VideoAssemblyJob, signal?: AbortSignal): Promise<VideoAssemblyJob>;
    downloadResult(job: VideoAssemblyJob): Promise<{
        mimeType: string;
        data: string;
    }>;
    /**
     * Whole seconds left on the account, read from `remaining_quota.time`.
     *
     * This is the only honest number JSON2Video offers about the account, and it is
     * in seconds rather than credits -- which is the point: the free grant is 600
     * credits at 1 credit/second, so the two are numerically equal today, and the
     * seconds figure stays correct if the per-second rate ever changes.
     *
     * `readable: false` when the field is absent, which stops spending rather than
     * assuming a full pool.
     */
    readCreditBalance(): Promise<ProviderCreditBalance>;
    /** Submit, poll, download -- the one call a caller needs. */
    assemble(request: AssembleVideoRequest): Promise<{
        job: VideoAssemblyJob;
        recipe: Record<string, unknown>;
        video: {
            mimeType: string;
            data: string;
        };
    }>;
    private toJob;
    private requireKey;
    private requestJson;
}
