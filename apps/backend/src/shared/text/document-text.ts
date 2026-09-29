/**
 * HTML → plain text and title extraction.
 *
 * Shared by web retrieval (Phase 11) and document extraction (Phase 12) so a
 * `<script>` or `<style>` body is stripped identically in both places. The
 * output is what a model is allowed to read, so it must contain no markup and
 * no hidden page content.
 */

const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;

/**
 * Elements whose text is chrome rather than content. Dropping them keeps
 * "Home Docs Pricing" and copyright lines out of the text a model reads and out
 * of the chunks that get embedded, where they would otherwise dilute every
 * similarity score on a real page.
 */
const CHROME = 'nav|footer|header|aside|form|button|select|noscript|template|svg|iframe';

export function extractHtmlText(html: string): string {
  return html
    .replace(new RegExp(`<script[\\s\\S]*?<\\/script>`, 'gi'), ' ')
    .replace(new RegExp(`<style[\\s\\S]*?<\\/style>`, 'gi'), ' ')
    .replace(new RegExp(`<(?:${CHROME})\\b[\\s\\S]*?<\\/(?:${CHROME})>`, 'gi'), ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td|\/th|\/section|\/article|\/blockquote|\/pre)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

export function extractHtmlTitle(html: string): string | null {
  const match = TITLE.exec(html);
  if (!match) return null;
  const title = normaliseText(match[1].replace(/<[^>]+>/g, ' ')).slice(0, 300);
  return title || null;
}

export function looksLikeHtml(contentType: string, body: string): boolean {
  return contentType.includes('html') || /^\s*<(?:!doctype|html)\b/i.test(body);
}

/** Collapse runs of whitespace while keeping paragraph breaks readable. */
export function normaliseText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
