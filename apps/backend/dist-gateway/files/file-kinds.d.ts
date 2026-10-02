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
/**
 * The database column is a plain string, so a value read back from it is only
 * trusted after passing through this guard.
 */
export declare function asFileKind(value: string): FileKind;
export declare const SUPPORTED_EXTENSIONS: ReadonlyArray<{
    extension: string;
    kind: FileKind;
    mimeType: string;
    extractable: boolean;
}>;
export declare function extensionOf(originalName: string): string;
/**
 * Strip anything that could escape a directory or confuse a download header:
 * path separators, control characters, leading dots, and Windows device names.
 * The stored name is server-generated; this value is only ever displayed.
 */
export declare function safeDisplayName(raw: string): string;
export declare function classifyUpload(rawName: string, declaredMimeType: string, bytes: Buffer): ClassifiedUpload;
