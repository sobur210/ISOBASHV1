import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { InjectConfig } from '../shared/config/inject-config';
import { AppConfig } from '../shared/config/configuration';
import { extractHtmlText, normaliseText } from '../shared/text/document-text';
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
 *     and is reported as such — no OCR is pretended).
 * Images and ZIP-based office documents are stored and downloadable but are
 * explicitly not indexed, and they say so.
 */
@Injectable()
export class DocumentExtractorService {
  private readonly log = new Logger('DocumentExtractor');

  constructor(@InjectConfig() private readonly config: AppConfig) {}

  async extract(kind: FileKind, bytes: Buffer): Promise<Extraction> {
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
        return this.finish(extractHtmlText(decodeUtf8(bytes)), limit);
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

  private async pdf(bytes: Buffer, limit: number): Promise<Extraction> {
    let parser: InstanceType<typeof PDFParse> | null = null;
    try {
      parser = new PDFParse({ data: new Uint8Array(bytes) });
      const result = await parser.getText();
      // pdf.js appends a `-- n of m --` footer per page; it is noise in a chunk.
      const text = normaliseText(result.text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, ' '));
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The PDF could not be read.';
      this.log.warn(`PDF extraction failed: ${message}`);
      return { text: '', characters: 0, truncated: false, note: `The PDF could not be read: ${message}` };
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }

  private finish(raw: string, limit: number): Extraction {
    const text = normaliseText(raw);
    const truncated = text.length > limit;
    return {
      text: truncated ? text.slice(0, limit) : text,
      characters: Math.min(text.length, limit),
      truncated,
    };
  }
}

function decodeUtf8(bytes: Buffer): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * RFC 4180-ish CSV reader: quoted fields, doubled quotes inside quotes, and
 * newlines inside quoted fields. A naive `split(',')` would turn a real export
 * into nonsense chunks.
 */
export function parseCsv(input: string, delimiter = '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function rowsToText(input: string): string {
  const delimiter = input.includes('\t') && !input.includes(',') ? '\t' : ',';
  const rows = parseCsv(input, delimiter);
  if (rows.length === 0) return '';
  const header = rows[0].map((cell) => cell.trim());
  const lines: string[] = [];
  for (const row of rows.slice(1)) {
    const cells = row.map((cell, index) => {
      const name = header[index]?.trim() || `column_${index + 1}`;
      const value = cell.trim();
      return value ? `${name}: ${value}` : '';
    }).filter(Boolean);
    if (cells.length > 0) lines.push(`Row ${lines.length + 1} — ${cells.join('; ')}`);
  }
  return lines.join('\n');
}

/** JSON is flattened to `path: value` so a chunk is readable on its own. */
function jsonToText(input: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    // JSON Lines and trailing-comma files are common enough to handle honestly.
    const lines = input
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const objects = lines.map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return null;
      }
    });
    const valid = objects.filter((value) => value !== null);
    if (valid.length === 0) {
      throw new Error('The file is named .json but does not parse as JSON or JSON Lines.');
    }
    parsed = valid;
  }

  const lines: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (lines.length > 20_000) return;
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
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
