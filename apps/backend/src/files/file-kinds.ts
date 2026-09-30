import { ApiError } from '../shared/errors/api-error';

/**
 * Phase 12 upload validation.
 *
 * A browser sends a filename and a MIME type, and both are attacker-controlled:
 * `evil.exe` arrives as `notes.txt`, and a ZIP bomb arrives as `report.pdf`. The
 * extension allow-list is the first gate, but the real one is the byte signature
 * below: a file whose contents do not match its claimed type is refused rather
 * than stored under a name that lies about it.
 */
export type FileKind = 'text' | 'markdown' | 'csv' | 'json' | 'html' | 'pdf' | 'image' | 'archive' | 'binary';

export type ClassifiedUpload = {
  originalName: string;
  extension: string;
  kind: FileKind;
  mimeType: string;
  /** True when text can actually be pulled out of the bytes. */
  extractable: boolean;
};

type KindSpec = {
  kind: FileKind;
  mimeType: string;
  extractable: boolean;
  extensions: string[];
  signature?: (bytes: Buffer) => boolean;
  /** Text formats must decode as UTF-8 instead of carrying a signature. */
  text?: boolean;
};

const startsWith = (...prefixes: number[][]) => (bytes: Buffer) =>
  prefixes.some((prefix) => prefix.every((byte, index) => bytes[index] === byte));

const ascii = (value: string) => [...value].map((char) => char.charCodeAt(0));

const SPECS: KindSpec[] = [
  {
    kind: 'pdf',
    mimeType: 'application/pdf',
    extractable: true,
    extensions: ['pdf'],
    signature: startsWith(ascii('%PDF-')),
  },
  {
    kind: 'markdown',
    mimeType: 'text/markdown',
    extractable: true,
    extensions: ['md', 'markdown', 'mdx'],
    text: true,
  },
  {
    kind: 'csv',
    mimeType: 'text/csv',
    extractable: true,
    extensions: ['csv', 'tsv'],
    text: true,
  },
  {
    kind: 'json',
    mimeType: 'application/json',
    extractable: true,
    extensions: ['json', 'jsonl', 'ndjson'],
    text: true,
  },
  {
    kind: 'html',
    mimeType: 'text/html',
    extractable: true,
    extensions: ['html', 'htm', 'xhtml'],
    text: true,
  },
  {
    kind: 'text',
    mimeType: 'text/plain',
    extractable: true,
    extensions: ['txt', 'text', 'log', 'yaml', 'yml', 'ini', 'toml', 'xml', 'rst'],
    text: true,
  },
  {
    kind: 'image',
    mimeType: 'image/png',
    extractable: false,
    extensions: ['png'],
    signature: startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    kind: 'image',
    mimeType: 'image/jpeg',
    extractable: false,
    extensions: ['jpg', 'jpeg'],
    signature: startsWith([0xff, 0xd8, 0xff]),
  },
  {
    kind: 'image',
    mimeType: 'image/gif',
    extractable: false,
    extensions: ['gif'],
    signature: startsWith(ascii('GIF87a'), ascii('GIF89a')),
  },
  {
    kind: 'image',
    mimeType: 'image/webp',
    extractable: false,
    extensions: ['webp'],
    signature: (bytes) =>
      ascii('RIFF').every((byte, index) => bytes[index] === byte) &&
      ascii('WEBP').every((byte, index) => bytes[index + 8] === byte),
  },
  {
    // DOCX/XLSX/PPTX are ZIP containers. They are stored and downloadable, but
    // nothing claims to read them: a document that says "indexed" while holding
    // no text is worse than one that says "not extractable".
    kind: 'archive',
    mimeType: 'application/zip',
    extractable: false,
    extensions: ['docx', 'xlsx', 'pptx', 'odt', 'zip'],
    signature: startsWith([0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06]),
  },
];

const BY_EXTENSION = new Map<string, KindSpec>();
for (const spec of SPECS) {
  for (const extension of spec.extensions) {
    BY_EXTENSION.set(extension, spec);
  }
}

/**
 * The database column is a plain string, so a value read back from it is only
 * trusted after passing through this guard.
 */
export function asFileKind(value: string): FileKind {
  return KINDS.has(value) ? (value as FileKind) : 'binary';
}

const KINDS: ReadonlySet<string> = new Set<FileKind>([
  'text',
  'markdown',
  'csv',
  'json',
  'html',
  'pdf',
  'image',
  'archive',
  'binary',
]);

export const SUPPORTED_EXTENSIONS: ReadonlyArray<{ extension: string; kind: FileKind; mimeType: string; extractable: boolean }> =
  SPECS.map((spec) => ({ extension: spec.extensions.join(', '), kind: spec.kind, mimeType: spec.mimeType, extractable: spec.extractable }));

export function extensionOf(originalName: string): string {
  const match = /\.([A-Za-z0-9]{1,12})$/.exec(originalName.trim());
  return match ? match[1].toLowerCase() : '';
}

/**
 * Strip anything that could escape a directory or confuse a download header:
 * path separators, control characters, leading dots, and Windows device names.
 * The stored name is server-generated; this value is only ever displayed.
 */
export function safeDisplayName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  const safe = cleaned.length > 0 ? cleaned : 'file';
  return safe.slice(0, 180);
}

export function classifyUpload(rawName: string, declaredMimeType: string, bytes: Buffer): ClassifiedUpload {
  const originalName = safeDisplayName(rawName);
  const extension = extensionOf(originalName);
  const spec = BY_EXTENSION.get(extension);

  if (!spec) {
    throw new ApiError(
      `".${extension || '(none)'}" is not an accepted file type. Accepted: ${SPECS.flatMap((s) => s.extensions).join(', ')}.`,
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
  }
  if (bytes.byteLength === 0) {
    throw new ApiError('The uploaded file is empty.', 400, 'EMPTY_FILE');
  }

  // The bytes decide the type, not the name.
  //
  // A format with a magic number must match its own signature. A `.pdf` that
  // is not a PDF is refused even when the bytes match nothing else at all, so
  // this check cannot be conditioned on detecting some *other* format.
  //
  // A text format has no signature of its own, so instead it must not be one of
  // the known binary containers: a PDF or a ZIP is frequently valid UTF-8 as a
  // byte stream and would otherwise be stored as "text".
  if (spec.signature) {
    if (!spec.signature(bytes)) {
      throw new ApiError(
        `The contents of "${originalName}" do not look like a ${spec.kind} file, so it was refused. Renaming a file does not change what it is.`,
        415,
        'CONTENT_SIGNATURE_MISMATCH',
      );
    }
  } else {
    const masquerading = SPECS.find(
      (candidate) => candidate.signature && candidate.kind !== spec.kind && candidate.signature(bytes),
    );
    if (masquerading) {
      throw new ApiError(
        `"${originalName}" is named like a ${spec.kind} file but its bytes are a ${masquerading.kind} file. Renaming a file does not change what it is, so it was refused.`,
        415,
        'CONTENT_SIGNATURE_MISMATCH',
        { detected: masquerading.kind, claimed: spec.kind },
      );
    }
  }

  if (spec.text) {
    assertText(bytes, originalName);
  }

  return {
    originalName,
    extension,
    kind: spec.kind,
    // The MIME type is the one the *bytes* justified, not the one the client claimed.
    mimeType: spec.mimeType,
    extractable: spec.extractable,
  };
}

/** Text is accepted only when it really decodes as UTF-8 text. */
function assertText(bytes: Buffer, originalName: string) {
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) {
    throw new ApiError(
      `"${originalName}" contains NUL bytes, so it is binary rather than text.`,
      415,
      'CONTENT_SIGNATURE_MISMATCH',
    );
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head);
  } catch {
    throw new ApiError(
      `"${originalName}" is not valid UTF-8 text. Re-save it as UTF-8 and upload it again.`,
      415,
      'CONTENT_ENCODING_UNSUPPORTED',
    );
  }
}
