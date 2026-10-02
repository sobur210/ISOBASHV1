"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_TEXT_CLAUSE = exports.IMAGE_STYLES = void 0;
exports.findImageStyle = findImageStyle;
exports.normaliseStyleId = normaliseStyleId;
exports.IMAGE_STYLES = [
    {
        id: 'cinematic',
        label: 'Cinematic',
        fragment: 'cinematic film still, anamorphic lens, shallow depth of field, dramatic directional light, filmic colour grading, high dynamic range, 35mm',
    },
    {
        id: 'photoreal',
        label: 'Photoreal',
        fragment: 'photorealistic photograph, true-to-life colour, natural texture and micro detail, realistic soft light, 50mm f/1.4, sharp focus on the subject',
    },
    {
        id: 'illustration',
        label: 'Illustration',
        fragment: 'digital illustration, confident clean linework, bold readable composition, flat colour blocking, limited palette, crisp edges',
    },
    {
        id: 'anime',
        label: 'Anime',
        fragment: 'anime key visual, cel shading, expressive eyes, dynamic camera angle, vibrant colour, studio quality',
    },
    {
        id: 'watercolour',
        label: 'Watercolour',
        fragment: 'loose watercolour painting, soft wet edges, pigment blooms on cold-press paper, muted palette, visible paper grain',
    },
    {
        id: 'three-d',
        label: '3D Render',
        fragment: '3D render, physically based materials, soft studio lighting, ambient occlusion, subsurface scattering, high detail',
    },
];
/**
 * Appended to every composed prompt.
 *
 * Image models otherwise drift towards rendering captions, watermarks and
 * signatures into the frame. This is a request, not a guarantee: nothing here
 * inspects the finished pixels or claims the text is gone, it only stops asking
 * for it.
 */
exports.NO_TEXT_CLAUSE = 'no text, no lettering, no captions, no watermark, no signature, no logo, no border, no frame';
function findImageStyle(id) {
    if (!id)
        return null;
    return exports.IMAGE_STYLES.find((style) => style.id === id) ?? null;
}
/** Normalise user input to a known preset id, or null for "no preset". */
function normaliseStyleId(value) {
    const trimmed = value?.trim().toLowerCase();
    if (!trimmed)
        return null;
    return findImageStyle(trimmed) ? trimmed : null;
}
//# sourceMappingURL=image-styles.js.map