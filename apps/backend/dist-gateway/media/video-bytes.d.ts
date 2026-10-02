/**
 * Phase 14 video bytes.
 *
 * A provider says "here is an MP4 of six seconds". That is a claim. The duration,
 * the frame size and the presence of an audio track stored on an asset are read
 * out of the container itself, for the same reason the image phase reads IHDR
 * instead of trusting the requested aspect ratio: a metadata row that repeats what
 * the caller hoped for is not a measurement.
 *
 * Two container families are understood, both of which real video models return:
 *
 *  - ISO base media (`.mp4`, `.m4v`, `.mov`): an `ftyp` box followed by `moov`,
 *    where `mvhd` carries the duration and `tkhd` the display size, the latter as
 *    16.16 fixed point;
 *  - Matroska / WebM: an EBML tree where `Info` carries the duration and
 *    `Tracks` the pixel size.
 *
 * Both require a real **video track** to be accepted. An audio-only `.m4a` carries
 * a perfectly valid `ftyp`, and storing it as a clip would hand the library a file
 * no player can show. Anything unrecognised (a text payload, an HTML error page
 * saved as `.mp4`, a header with no video track) is refused rather than stored
 * with guessed metadata.
 */
export type SniffedVideo = {
    mimeType: string;
    extension: string;
    width: number | null;
    height: number | null;
    /** Playback length from the container header, in whole milliseconds. */
    durationMs: number | null;
    /** Whether the container declares an audio track. */
    hasAudio: boolean | null;
};
export declare function sniffVideo(bytes: Buffer): SniffedVideo | null;
