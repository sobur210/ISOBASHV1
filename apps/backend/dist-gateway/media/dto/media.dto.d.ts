export declare class CreateImageGenerationDto {
    prompt: string;
    /**
     * A style preset id from `IMAGE_STYLES`. The allow-list is enforced in the
     * service with the real list, so an unknown value is refused rather than
     * silently dropped (which would render an image the caller did not ask for).
     */
    style?: string;
    /**
     * Ask a routed text model to expand the description before rendering. Best
     * effort: the original words are always what the renderer falls back to.
     */
    enhance?: boolean | string;
    /** Must be one of `MEDIA_ASPECT_RATIOS`; anything else is refused, not coerced. */
    aspectRatio?: string;
    /**
     * How many variations to render. Each is a separate render with its own seed,
     * so this is a real "give me N different takes" control, not a multiplier on
     * one image.
     */
    count?: number;
    projectId?: number;
    /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
    model?: string;
}
export declare class CreateVideoGenerationDto {
    prompt: string;
    /** Must be one of `MEDIA_VIDEO_ASPECT_RATIOS`; anything else is refused, not coerced. */
    aspectRatio?: string;
    /** Must be one of `MEDIA_VIDEO_DURATIONS`. */
    seconds?: number;
    audio?: boolean | string;
    projectId?: number;
    /**
     * A stored IMAGE asset of this account to animate. Anything else (another
     * user's id, a clip, an id that does not exist) is refused at start time.
     */
    sourceAssetId?: string;
    /** `provider` or `provider:model`; omitted lets the Phase 9 router decide. */
    model?: string;
}
