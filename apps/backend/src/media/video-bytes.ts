/**
 * Phase 14 video bytes.
 *
 * A provider says "here is an MP4 of six seconds". That is a claim. The duration,
 * the frame size and the presence of an audio track stored on an asset are read
 * out of the container itself, for the same reason the image phase reads IHDR
 * instead of trusting the requested aspect ratio: a metadata row that repeats what
 * the caller hoped for is not a measurement.
 *
 * Two container families are understood, both of which real video models return:
 *
 *  - ISO base media (`.mp4`, `.m4v`, `.mov`): an `ftyp` box followed by `moov`,
 *    where `mvhd` carries the duration and `tkhd` the display size, the latter as
 *    16.16 fixed point;
 *  - Matroska / WebM: an EBML tree where `Info` carries the duration and
 *    `Tracks` the pixel size.
 *
 * Both require a real **video track** to be accepted. An audio-only `.m4a` carries
 * a perfectly valid `ftyp`, and storing it as a clip would hand the library a file
 * no player can show. Anything unrecognised (a text payload, an HTML error page
 * saved as `.mp4`, a header with no video track) is refused rather than stored
 * with guessed metadata.
 */

export type SniffedVideo = {
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
  /** Playback length from the container header, in whole milliseconds. */
  durationMs: number | null;
  /** Whether the container declares an audio track. */
  hasAudio: boolean | null;
};

/** Refuse to walk more of the file than this; a header is not a whole movie. */
const MAX_HEADER_SCAN_BYTES = 8 * 1024 * 1024;

export function sniffVideo(bytes: Buffer): SniffedVideo | null {
  if (bytes.byteLength < 16) return null;
  const limit = Math.min(bytes.byteLength, MAX_HEADER_SCAN_BYTES);
  return isoBaseMedia(bytes, limit) ?? matroska(bytes, limit);
}

// ---------------------------------------------------------------------------
// ISO base media file format (MP4 / M4V / MOV)
// ---------------------------------------------------------------------------

/** Brands that mean "this is a QuickTime movie", which browsers serve as .mov. */
const QUICKTIME_BRANDS = new Set(['qt  ']);

function isoBaseMedia(bytes: Buffer, limit: number): SniffedVideo | null {
  // `....ftyp` at offset 4 is the signature. An `ftyp` anywhere else is not a box.
  if (bytes.readUInt32BE(4) !== 0x66747970) return null;

  const brand = bytes.toString('latin1', 8, 12);
  let durationMs: number | null = null;
  let size: { width: number; height: number } | null = null;
  let hasVideoTrack = false;
  let hasAudioTrack = false;

  for (const box of boxes(bytes, 0, limit)) {
    if (box.type !== 'moov') continue;
    for (const child of boxes(bytes, box.bodyStart, Math.min(box.end, limit))) {
      if (child.type === 'mvhd') {
        durationMs = readMovieHeaderDuration(bytes, child.bodyStart, child.end);
      } else if (child.type === 'trak') {
        const track = readTrack(bytes, child.bodyStart, Math.min(child.end, limit));
        if (track.handler === 'vide') {
          hasVideoTrack = true;
          // The first video track wins; a later one never overwrites the size.
          if (size === null && track.width !== null && track.height !== null) {
            size = { width: track.width, height: track.height };
          }
        } else if (track.handler === 'soun') {
          hasAudioTrack = true;
        }
      }
    }
  }

  if (!hasVideoTrack) return null;

  const quicktime = QUICKTIME_BRANDS.has(brand);
  return {
    mimeType: quicktime ? 'video/quicktime' : 'video/mp4',
    extension: quicktime ? 'mov' : 'mp4',
    width: size?.width ?? null,
    height: size?.height ?? null,
    durationMs,
    hasAudio: hasAudioTrack,
  };
}

type Box = { type: string; bodyStart: number; end: number };

function* boxes(bytes: Buffer, start: number, end: number): Generator<Box> {
  let offset = start;
  while (offset + 8 <= end) {
    const declared = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    let size = declared;
    let bodyStart = offset + 8;

    if (size === 1) {
      // 64-bit size: the 32-bit field is 0xffffffff and the real size follows it.
      if (offset + 16 > end) return;
      size = bytes.readUInt32BE(bodyStart) * 2 ** 32 + bytes.readUInt32BE(bodyStart + 4);
      bodyStart = offset + 16;
    } else if (size === 0) {
      // "to the end of the file" is legal and the only case with no declared size.
      size = end - offset;
    }
    if (size < bodyStart - offset) return;
    const boxEnd = Math.min(offset + size, end);
    if (boxEnd <= bodyStart) return;
    yield { type, bodyStart, end: boxEnd };
    offset = boxEnd;
  }
}

function readMovieHeaderDuration(bytes: Buffer, start: number, end: number): number | null {
  if (start + 4 > end) return null;
  const version = bytes[start];
  // version(1)+flags(3), then creation/modification, then the timescale.
  const timescaleAt = version === 1 ? start + 20 : start + 12;
  if (timescaleAt + 8 > end) return null;
  const timescale = bytes.readUInt32BE(timescaleAt);
  if (timescale <= 0) return null;
  const raw = version === 1 ? Number(bytes.readBigUInt64BE(timescaleAt + 4)) : bytes.readUInt32BE(timescaleAt + 4);
  return toMilliseconds(raw, timescale);
}

function readTrack(bytes: Buffer, start: number, end: number): {
  handler: 'vide' | 'soun' | 'other';
  width: number | null;
  height: number | null;
} {
  let handler: 'vide' | 'soun' | 'other' = 'other';
  let width: number | null = null;
  let height: number | null = null;

  for (const box of boxes(bytes, start, end)) {
    // `tkhd` sits directly in the track box and holds the display size.
    if (box.type === 'tkhd') {
      const size = readTrackHeaderSize(bytes, box.bodyStart, box.end);
      if (size) {
        width = size.width;
        height = size.height;
      }
    } else if (box.type === 'mdia') {
      // `hdlr` decides whether this track is the picture or the soundtrack.
      for (const child of boxes(bytes, box.bodyStart, Math.min(box.end, end))) {
        if (child.type !== 'hdlr' || child.bodyStart + 12 > child.end) continue;
        const declared = bytes.toString('latin1', child.bodyStart + 8, child.bodyStart + 12);
        if (declared === 'vide') handler = 'vide';
        else if (declared === 'soun') handler = 'soun';
      }
    }
  }
  return { handler, width, height };
}

/** `tkhd` stores the display size as 16.16 fixed point in its last two fields. */
function readTrackHeaderSize(bytes: Buffer, start: number, end: number): { width: number; height: number } | null {
  if (start + 4 > end) return null;
  // version+flags(4) + creation + modification + trackId + reserved [+ duration],
  // then reserved(8) + layer(2) + group(2) + volume(2) + reserved(2) + matrix(36).
  const widthAt = bytes[start] === 1 ? start + 88 : start + 80;
  if (widthAt + 8 > end) return null;
  const width = bytes.readUInt32BE(widthAt) >>> 16;
  const height = bytes.readUInt32BE(widthAt + 4) >>> 16;
  return width > 0 && height > 0 ? { width, height } : null;
}

// ---------------------------------------------------------------------------
// Matroska / WebM (EBML)
// ---------------------------------------------------------------------------

const EBML_HEADER = 0x1a45dfa3;
const EBML_DOCTYPE = 0x4282;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_TYPE = 0x83;
const VIDEO = 0xe0;
const PIXEL_WIDTH = 0xb0;
const PIXEL_HEIGHT = 0xba;

const TRACK_TYPE_VIDEO = 1;
const TRACK_TYPE_AUDIO = 2;
/** Matroska's own default when `TimecodeScale` is absent: one tick per millisecond. */
const DEFAULT_TIMECODE_SCALE = 1_000_000;

function matroska(bytes: Buffer, limit: number): SniffedVideo | null {
  const docType = readDocType(bytes, limit);
  if (docType === null) return null;

  let timecodeScale = DEFAULT_TIMECODE_SCALE;
  let durationTicks: number | null = null;
  let size: { width: number; height: number } | null = null;
  let hasAudioTrack = false;

  for (const top of elements(bytes, 0, limit)) {
    if (top.id !== SEGMENT) continue;
    for (const child of elements(bytes, top.bodyStart, Math.min(top.end, limit))) {
      if (child.id === INFO) {
        for (const field of elements(bytes, child.bodyStart, Math.min(child.end, limit))) {
          if (field.id === TIMECODE_SCALE) {
            const scale = readUnsigned(bytes, field.bodyStart, field.end);
            if (scale !== null && scale > 0) timecodeScale = scale;
          } else if (field.id === DURATION) {
            durationTicks = readFloat(bytes, field.bodyStart, field.end);
          }
        }
      } else if (child.id === TRACKS) {
        for (const entry of elements(bytes, child.bodyStart, Math.min(child.end, limit))) {
          if (entry.id !== TRACK_ENTRY) continue;
          const track = readTrackEntry(bytes, entry.bodyStart, Math.min(entry.end, limit));
          if (track.type === TRACK_TYPE_VIDEO) {
            if (size === null && track.width > 0 && track.height > 0) {
              size = { width: track.width, height: track.height };
            }
          } else if (track.type === TRACK_TYPE_AUDIO) {
            hasAudioTrack = true;
          }
        }
      }
    }
  }

  // A DocType on its own proves nothing: without a video track there is no picture.
  if (size === null) return null;

  return {
    mimeType: docType === 'webm' ? 'video/webm' : 'video/x-matroska',
    extension: docType === 'webm' ? 'webm' : 'mkv',
    width: size.width,
    height: size.height,
    durationMs: durationTicks === null ? null : Math.round((durationTicks * timecodeScale) / 1_000_000),
    hasAudio: hasAudioTrack,
  };
}

function readTrackEntry(bytes: Buffer, start: number, end: number): { type: number | null; width: number; height: number } {
  let type: number | null = null;
  let width = 0;
  let height = 0;
  for (const entry of elements(bytes, start, end)) {
    if (entry.id === TRACK_TYPE) {
      type = readUnsigned(bytes, entry.bodyStart, entry.end);
    } else if (entry.id === VIDEO) {
      for (const field of elements(bytes, entry.bodyStart, Math.min(entry.end, end))) {
        if (field.id === PIXEL_WIDTH) width = readUnsigned(bytes, field.bodyStart, field.end) ?? 0;
        else if (field.id === PIXEL_HEIGHT) height = readUnsigned(bytes, field.bodyStart, field.end) ?? 0;
      }
    }
  }
  return { type, width, height };
}

function readDocType(bytes: Buffer, limit: number): string | null {
  if (bytes.readUInt32BE(0) !== EBML_HEADER) return null;
  /**
   * `DocType` is a child of the EBML header, not a sibling of it, so this has to
   * descend. Walking the top level only and giving up on the first element that is
   * not `DocType` means the header itself is always the first thing seen, and every
   * WebM would be refused.
   */
  for (const element of elements(bytes, 0, limit)) {
    if (element.id !== EBML_HEADER) continue;
    for (const child of elements(bytes, element.bodyStart, Math.min(element.end, limit))) {
      if (child.id !== EBML_DOCTYPE) continue;
      return bytes.toString('latin1', child.bodyStart, child.end).replace(/\0+$/, '');
    }
  }
  return null;
}

type EbmlElement = { id: number; bodyStart: number; end: number };

/**
 * Element identifiers keep their marker bits and are read as raw big-endian
 * integers; sizes have the marker stripped. An "unknown size" (every value bit
 * set) is legal in Matroska and means "runs to the end of the parent", which is
 * how a `Segment` is normally written.
 */
function* elements(bytes: Buffer, start: number, end: number): Generator<EbmlElement> {
  let offset = start;
  while (offset < end) {
    const id = readId(bytes, offset, end);
    if (!id) return;
    const size = readSize(bytes, offset + id.length, end);
    if (!size) return;
    const bodyStart = offset + id.length + size.length;
    if (bodyStart > end) return;
    const elementEnd = size.unknown ? end : Math.min(bodyStart + size.value, end);
    if (elementEnd <= offset) return;
    yield { id: id.value, bodyStart, end: elementEnd };
    offset = elementEnd;
  }
}

function readId(bytes: Buffer, offset: number, end: number): { value: number; length: number } | null {
  const first = bytes[offset];
  if (first === undefined) return null;
  let length = 1;
  for (let mask = 0x80; mask > 0 && !(first & mask); mask >>= 1) length += 1;
  if (length > 4 || offset + length > end) return null;
  return { value: bytes.readUIntBE(offset, length), length };
}

function readSize(bytes: Buffer, offset: number, end: number): { value: number; length: number; unknown: boolean } | null {
  const first = bytes[offset];
  if (first === undefined) return null;
  let length = 1;
  for (let mask = 0x80; mask > 0 && !(first & mask); mask >>= 1) length += 1;
  /**
   * `Buffer.readUIntBE` reads at most 6 bytes, and a width of 7 or 8 could only
   * describe a size larger than any real file anyway. Capping here makes such a
   * header unparseable, so the caller refuses the payload, instead of throwing out
   * of a sniffer that is fed bytes a provider chose.
   */
  if (length > 6 || offset + length > end) return null;
  /**
   * An EBML size is a VINTINT whose width is found from the position of the first
   * set bit: `1xxxxxxx` is one byte, `01xxxxxx xxxxxxxx` is two, and so on. That
   * puts the marker at bit 7*length counted from the low end, so the value is the
   * raw read minus 2**(7*length) and the all-ones value (2**(7*length)-1) is the
   * "unknown size" sentinel.
   */
  const marker = 2 ** (7 * length);
  const value = bytes.readUIntBE(offset, length) - marker;
  if (value === marker - 1) return { value: end - offset, length, unknown: true };
  return { value, length, unknown: false };
}

function readUnsigned(bytes: Buffer, start: number, end: number): number | null {
  if (start >= end) return null;
  // Capped at 8 bytes so a hostile header cannot demand a giant BigInt read.
  return bytes.readUIntBE(start, Math.min(end - start, 8));
}

function readFloat(bytes: Buffer, start: number, end: number): number | null {
  const length = end - start;
  if (length === 4) return bytes.readFloatBE(start);
  if (length === 8) return bytes.readDoubleBE(start);
  // Some muxers write the duration as a plain integer in 4 or 8 bytes.
  if (length > 0 && length <= 8) return bytes.readUIntBE(start, length);
  return null;
}

function toMilliseconds(duration: number, timescale: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.round((duration / timescale) * 1000);
}
