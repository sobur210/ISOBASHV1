/**
 * Image style presets and prompt composition.
 *
 * A preset is a *prompt fragment*, not a filter: there is no post-processing here
 * and nothing is drawn locally. Each fragment is appended to the caller's own
 * words and the whole string is what the renderer receives, so the run can record
 * the exact text that was sent (`enhancedPrompt`).
 *
 * The backend is the single source of truth. `/media/capabilities` ships this list
 * so the UI renders its picker from the server instead of a hard-coded copy that
 * could drift out of sync with what the API will actually accept.
 */
export type ImageStyle = {
    id: string;
    label: string;
    fragment: string;
};
export declare const IMAGE_STYLES: readonly ImageStyle[];
/**
 * Appended to every composed prompt.
 *
 * Image models otherwise drift towards rendering captions, watermarks and
 * signatures into the frame. This is a request, not a guarantee: nothing here
 * inspects the finished pixels or claims the text is gone, it only stops asking
 * for it.
 */
export declare const NO_TEXT_CLAUSE = "no text, no lettering, no captions, no watermark, no signature, no logo, no border, no frame";
export declare function findImageStyle(id: string | null | undefined): ImageStyle | null;
/** Normalise user input to a known preset id, or null for "no preset". */
export declare function normaliseStyleId(value: string | null | undefined): string | null;
