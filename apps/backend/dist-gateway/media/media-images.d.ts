/**
 * Phase 13 image bytes.
 *
 * A provider tells us the MIME type of what it returned, and that is worth
 * recording, but it is the provider's claim, not a fact about the bytes. The
 * type and the dimensions stored for an asset are read from the file itself, so a
 * mislabelled or truncated payload is visible instead of being served as a
 * 1x1 "image".
 *
 * Dimensions are `null` when they cannot be read from the container rather than
 * guessed from the aspect ratio that was requested.
 */
export type SniffedImage = {
    mimeType: string;
    extension: string;
    width: number | null;
    height: number | null;
};
export declare function sniffImage(bytes: Buffer): SniffedImage | null;
