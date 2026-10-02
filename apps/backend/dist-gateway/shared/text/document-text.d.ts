/**
 * HTML → plain text and title extraction.
 *
 * Shared by web retrieval (Phase 11) and document extraction (Phase 12) so a
 * `<script>` or `<style>` body is stripped identically in both places. The
 * output is what a model is allowed to read, so it must contain no markup and
 * no hidden page content.
 */
export declare function extractHtmlText(html: string): string;
export declare function extractHtmlTitle(html: string): string | null;
export declare function looksLikeHtml(contentType: string, body: string): boolean;
/** Collapse runs of whitespace while keeping paragraph breaks readable. */
export declare function normaliseText(value: string): string;
