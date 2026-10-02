/**
 * Phase 12 chunking.
 *
 * Retrieval works on chunks, not files, so the split decides what the model can
 * find. Paragraphs are kept intact where possible (a sentence cut in half makes
 * a citation unverifiable), with a small overlap so a claim that straddles a
 * boundary still appears whole in one chunk. A paragraph longer than the budget
 * is hard-split on sentence boundaries.
 */
export type Chunk = {
    ordinal: number;
    content: string;
    characters: number;
    tokenEstimate: number;
};
export declare function chunkText(text: string, options: {
    size: number;
    overlap: number;
    maxChunks: number;
}): Chunk[];
