import { AppConfig } from '../shared/config/configuration';
import { FileKind } from './file-kinds';
export type Extraction = {
    /** The text a model is allowed to read. Empty when the kind is not readable. */
    text: string;
    characters: number;
    truncated: boolean;
    /** Why a readable-looking file yielded nothing, or why it was not read at all. */
    note?: string;
    pages?: number;
};
/**
 * Phase 12 document extraction.
 *
 * Only formats that can be read *here* are marked extractable:
 *   - text/markdown/log: decoded UTF-8,
 *   - csv: parsed (quotes, embedded newlines) into `header: value` rows,
 *   - json: flattened to `path: value` lines instead of one unreadable blob,
 *   - html: tags, scripts and styles removed,
 *   - pdf: real text extraction with pdf.js (a scanned page has no text layer
 *     and is reported as such. No OCR is pretended).
 * Images and ZIP-based office documents are stored and downloadable but are
 * explicitly not indexed, and they say so.
 */
export declare class DocumentExtractorService {
    private readonly config;
    private readonly log;
    constructor(config: AppConfig);
    extract(kind: FileKind, bytes: Buffer): Promise<Extraction>;
    private pdf;
    private finish;
}
/**
 * RFC 4180-ish CSV reader: quoted fields, doubled quotes inside quotes, and
 * newlines inside quoted fields. A naive `split(',')` would turn a real export
 * into nonsense chunks.
 */
export declare function parseCsv(input: string, delimiter?: string): string[][];
