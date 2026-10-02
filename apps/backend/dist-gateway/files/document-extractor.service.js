"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentExtractorService = void 0;
exports.parseCsv = parseCsv;
const common_1 = require("@nestjs/common");
const pdf_parse_1 = require("pdf-parse");
const inject_config_1 = require("../shared/config/inject-config");
const document_text_1 = require("../shared/text/document-text");
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
let DocumentExtractorService = class DocumentExtractorService {
    config;
    log = new common_1.Logger('DocumentExtractor');
    constructor(config) {
        this.config = config;
    }
    async extract(kind, bytes) {
        const limit = this.config.files.maxExtractedCharacters;
        switch (kind) {
            case 'text':
            case 'markdown':
                return this.finish(decodeUtf8(bytes), limit);
            case 'csv':
                return this.finish(rowsToText(decodeUtf8(bytes)), limit);
            case 'json':
                return this.finish(jsonToText(decodeUtf8(bytes)), limit);
            case 'html':
                return this.finish((0, document_text_1.extractHtmlText)(decodeUtf8(bytes)), limit);
            case 'pdf':
                return this.pdf(bytes, limit);
            case 'image':
                return { text: '', characters: 0, truncated: false, note: 'Images carry no text layer; this file is stored and downloadable but not indexed.' };
            case 'archive':
                return { text: '', characters: 0, truncated: false, note: 'Office and archive formats are stored and downloadable but not parsed yet.' };
            default:
                return { text: '', characters: 0, truncated: false, note: 'This file type has no extractor.' };
        }
    }
    async pdf(bytes, limit) {
        let parser = null;
        try {
            parser = new pdf_parse_1.PDFParse({ data: new Uint8Array(bytes) });
            const result = await parser.getText();
            // pdf.js appends a `-- n of m --` footer per page; it is noise in a chunk.
            const text = (0, document_text_1.normaliseText)(result.text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, ' '));
            if (!text) {
                return {
                    text: '',
                    characters: 0,
                    truncated: false,
                    pages: result.total,
                    note: 'The PDF has no extractable text (it is most likely a scan). OCR is not available, so there is nothing to index.',
                };
            }
            return { ...this.finish(text, limit), pages: result.total };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'The PDF could not be read.';
            this.log.warn(`PDF extraction failed: ${message}`);
            return { text: '', characters: 0, truncated: false, note: `The PDF could not be read: ${message}` };
        }
        finally {
            await parser?.destroy().catch(() => undefined);
        }
    }
    finish(raw, limit) {
        const text = (0, document_text_1.normaliseText)(raw);
        const truncated = text.length > limit;
        return {
            text: truncated ? text.slice(0, limit) : text,
            characters: Math.min(text.length, limit),
            truncated,
        };
    }
};
exports.DocumentExtractorService = DocumentExtractorService;
exports.DocumentExtractorService = DocumentExtractorService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, inject_config_1.InjectConfig)()),
    __metadata("design:paramtypes", [Object])
], DocumentExtractorService);
function decodeUtf8(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
}
/**
 * RFC 4180-ish CSV reader: quoted fields, doubled quotes inside quotes, and
 * newlines inside quoted fields. A naive `split(',')` would turn a real export
 * into nonsense chunks.
 */
function parseCsv(input, delimiter = '\t') {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (quoted) {
            if (char === '"') {
                if (input[i + 1] === '"') {
                    field += '"';
                    i += 1;
                }
                else {
                    quoted = false;
                }
            }
            else {
                field += char;
            }
            continue;
        }
        if (char === '"') {
            quoted = true;
        }
        else if (char === delimiter) {
            row.push(field);
            field = '';
        }
        else if (char === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        }
        else if (char !== '\r') {
            field += char;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
function rowsToText(input) {
    const delimiter = input.includes('\t') && !input.includes(',') ? '\t' : ',';
    const rows = parseCsv(input, delimiter);
    if (rows.length === 0)
        return '';
    const header = rows[0].map((cell) => cell.trim());
    const lines = [];
    for (const row of rows.slice(1)) {
        const cells = row.map((cell, index) => {
            const name = header[index]?.trim() || `column_${index + 1}`;
            const value = cell.trim();
            return value ? `${name}: ${value}` : '';
        }).filter(Boolean);
        if (cells.length > 0)
            lines.push(`Row ${lines.length + 1}: ${cells.join('; ')}`);
    }
    return lines.join('\n');
}
/** JSON is flattened to `path: value` so a chunk is readable on its own. */
function jsonToText(input) {
    let parsed;
    try {
        parsed = JSON.parse(input);
    }
    catch {
        // JSON Lines and trailing-comma files are common enough to handle honestly.
        const lines = input
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const objects = lines.map((line) => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        });
        const valid = objects.filter((value) => value !== null);
        if (valid.length === 0) {
            throw new Error('The file is named .json but does not parse as JSON or JSON Lines.');
        }
        parsed = valid;
    }
    const lines = [];
    const walk = (value, path) => {
        if (lines.length > 20_000)
            return;
        if (value === null || value === undefined)
            return;
        if (Array.isArray(value)) {
            value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
            return;
        }
        if (typeof value === 'object') {
            for (const [key, entry] of Object.entries(value)) {
                walk(entry, path ? `${path}.${key}` : key);
            }
            return;
        }
        if (typeof value === 'string' && value.length > 600) {
            lines.push(`${path}: ${value.slice(0, 600)}…`);
            return;
        }
        lines.push(`${path}: ${String(value)}`);
    };
    walk(parsed, '');
    return lines.join('\n');
}
//# sourceMappingURL=document-extractor.service.js.map