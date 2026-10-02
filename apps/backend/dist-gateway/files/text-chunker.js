"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkText = chunkText;
const SENTENCE_END = /(?<=[.!?])\s+/;
function chunkText(text, options) {
    const paragraphs = text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
    if (paragraphs.length === 0)
        return [];
    const pieces = [];
    let current = '';
    const push = (value) => {
        const trimmed = value.trim();
        if (trimmed)
            pieces.push(trimmed);
    };
    for (const paragraph of paragraphs) {
        if (paragraph.length > options.size) {
            if (current) {
                push(current);
                current = '';
            }
            for (const part of splitLongParagraph(paragraph, options.size))
                push(part);
            continue;
        }
        if (!current) {
            current = paragraph;
            continue;
        }
        if (current.length + paragraph.length + 2 <= options.size) {
            current = `${current}\n\n${paragraph}`;
            continue;
        }
        push(current);
        current = overlapOf(current, options.overlap) + paragraph;
    }
    if (current)
        push(current);
    return pieces.slice(0, options.maxChunks).map((content, index) => ({
        ordinal: index + 1,
        content,
        characters: content.length,
        // A cheap, explicitly approximate size estimate; not a tokenizer count.
        tokenEstimate: Math.max(1, Math.ceil(content.length / 4)),
    }));
}
function splitLongParagraph(paragraph, size) {
    const sentences = paragraph.split(SENTENCE_END).filter(Boolean);
    const parts = [];
    let current = '';
    for (const sentence of sentences) {
        if (current && current.length + sentence.length + 1 > size) {
            parts.push(current);
            current = sentence;
            continue;
        }
        current = current ? `${current} ${sentence}` : sentence;
        while (current.length > size) {
            parts.push(current.slice(0, size));
            current = current.slice(size);
        }
    }
    if (current)
        parts.push(current);
    return parts;
}
/** Keep the tail of the previous chunk so context is not lost at the seam. */
function overlapOf(value, overlap) {
    if (overlap <= 0)
        return '';
    return value.slice(Math.max(0, value.length - overlap));
}
//# sourceMappingURL=text-chunker.js.map