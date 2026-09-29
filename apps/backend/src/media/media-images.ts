/**
 * Phase 13 image bytes.
 *
 * A provider tells us the MIME type of what it returned, and that is worth
 * recording — but it is the provider's claim, not a fact about the bytes. The
 * type and the dimensions stored for an asset are read from the file itself, so a
 * mislabelled or truncated payload is visible instead of being served as a
 * 1x1 "image".
 *
 * Dimensions are `null` when they cannot be read from the container rather than
 * guessed from the aspect ratio that was requested.
 */

export type SniffedImage = {
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
};

const ascii = (value: string) => [...value].map((char) => char.charCodeAt(0));

function startsWith(bytes: Buffer, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function asciiAt(bytes: Buffer, offset: number, value: string): boolean {
  return startsWith(bytes.subarray(offset), ascii(value));
}

export function sniffImage(bytes: Buffer): SniffedImage | null {
  if (bytes.byteLength < 12) return null;

  // PNG: 8-byte signature, then an IHDR chunk whose first two fields are the size.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && asciiAt(bytes, 12, 'IHDR')) {
    return {
      mimeType: 'image/png',
      extension: 'png',
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  // GIF: 6-byte header, then a little-endian logical screen descriptor.
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) {
    return {
      mimeType: 'image/gif',
      extension: 'gif',
      width: bytes.readUInt16LE(6),
      height: bytes.readUInt16LE(8),
    };
  }

  // RIFF container; the real format is the four bytes at offset 8.
  if (asciiAt(bytes, 0, 'RIFF')) {
    if (!asciiAt(bytes, 8, 'WEBP')) return null;
    const size = webpSize(bytes);
    return { mimeType: 'image/webp', extension: 'webp', width: size?.width ?? null, height: size?.height ?? null };
  }

  // JPEG: walk the marker segments to the frame header that carries the size.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    const size = jpegSize(bytes);
    return size ? { mimeType: 'image/jpeg', extension: 'jpg', ...size } : null;
  }

  return null;
}

/** Start-of-frame markers, excluding DHT (C4), JPG (C8) and DAC (CC). */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      // Resynchronise: fill bytes between segments are legal padding.
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      if (offset + 9 > bytes.byteLength) return null;
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes: Buffer): { width: number; height: number } | null {
  // Extended format: 24-bit canvas size minus one.
  if (asciiAt(bytes, 12, 'VP8X')) {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    };
  }
  // Lossless: 14-bit dimensions packed after the 0x2f signature byte.
  if (asciiAt(bytes, 12, 'VP8L')) {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  // Lossy: the key frame header stores 16-bit dimensions after the start code.
  if (asciiAt(bytes, 12, 'VP8 ')) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return null;
}
