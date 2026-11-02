import { deflateSync } from 'zlib';
import { EaRtfImage } from './types/ea-import.types';

/**
 * Word/EA pictures that are not PNG/JPEG arrive as an EMF/WMF/DIB wrapping one
 * bitmap (pasted screenshots). There is no renderer here, so pull the bitmap
 * out and re-encode it as PNG; vector-only metafiles stay unsupported (null).
 */

const EMR_BITBLT = 76;
const EMR_STRETCHBLT = 77;
const EMR_SETDIBITSTODEVICE = 80;
const EMR_STRETCHDIBITS = 81;

const WMF_DIBBITBLT = 0x0940;
const WMF_DIBSTRETCHBLT = 0x0b41;
const WMF_SETDIBTODEV = 0x0d33;
const WMF_STRETCHDIB = 0x0f43;

const BI_RGB = 0;
const BI_BITFIELDS = 3;
const BI_JPEG = 4;
const BI_PNG = 5;

const MAX_DIMENSION = 16384;
const MAX_PIXELS = 25_000_000;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Position of the lowest set bit and max value of a channel mask. */
function maskInfo(mask: number): { shift: number; max: number } {
  if (mask === 0) return { shift: 0, max: 0 };
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift++;
  let bits = 0;
  while (bits < 32 && ((mask >>> (shift + bits)) & 1) === 1) bits++;
  return { shift, max: Math.pow(2, bits) - 1 };
}

/**
 * Decode a DIB (BITMAPINFOHEADER at `bmi`, pixels at `bitsAt`; null = packed
 * right after the header and palette) into a PNG, or pass through a
 * JPEG/PNG-compressed DIB payload.
 */
function dibToImage(
  buf: Buffer,
  bmi: number,
  bitsAt: number | null,
  cbBits = 0,
): EaRtfImage | null {
  if (bmi < 0 || bmi + 40 > buf.length) return null;
  const headerSize = buf.readUInt32LE(bmi);
  if (headerSize < 40) return null;
  const width = buf.readInt32LE(bmi + 4);
  const rawHeight = buf.readInt32LE(bmi + 8);
  const bitCount = buf.readUInt16LE(bmi + 14);
  const compression = buf.readUInt32LE(bmi + 16);
  const colorsUsed = buf.readUInt32LE(bmi + 32);
  const height = Math.abs(rawHeight);
  if (width <= 0 || width > MAX_DIMENSION) return null;
  if (height <= 0 || height > MAX_DIMENSION) return null;
  // Off-heap RGB + PNG buffers: bound the pixel count, not just each side.
  if (width * height > MAX_PIXELS) return null;

  const paletteAt = bmi + headerSize;
  const masksBytes =
    compression === BI_BITFIELDS && headerSize === 40 ? 12 : 0;
  const paletteEntries =
    bitCount <= 8 ? colorsUsed || Math.pow(2, bitCount) : colorsUsed;
  const pixelsAt = bitsAt ?? paletteAt + masksBytes + paletteEntries * 4;

  if (compression === BI_JPEG || compression === BI_PNG) {
    const size = cbBits || buf.length - pixelsAt;
    if (size <= 0 || pixelsAt + size > buf.length) return null;
    return {
      mimeType: compression === BI_JPEG ? 'image/jpeg' : 'image/png',
      buffer: buf.subarray(pixelsAt, pixelsAt + size),
    };
  }
  if (compression !== BI_RGB && compression !== BI_BITFIELDS) return null;
  if (![1, 4, 8, 16, 24, 32].includes(bitCount)) return null;

  const stride = Math.floor((width * bitCount + 31) / 32) * 4;
  if (pixelsAt + stride * height > buf.length) return null;

  const palette: number[][] = [];
  if (bitCount <= 8) {
    for (let i = 0; i < paletteEntries; i++) {
      const p = paletteAt + masksBytes + i * 4;
      palette.push([buf[p + 2], buf[p + 1], buf[p]]);
    }
  }
  let masks = [0x7c00, 0x03e0, 0x001f];
  if (bitCount === 32) masks = [0xff0000, 0x00ff00, 0x0000ff];
  if (masksBytes && (bitCount === 16 || bitCount === 32)) {
    masks = [0, 4, 8].map((o) => buf.readUInt32LE(paletteAt + o));
  }
  const ch = masks.map(maskInfo);

  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = pixelsAt + (rawHeight > 0 ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      if (bitCount <= 8) {
        const perByte = 8 / bitCount;
        const byte = buf[row + Math.floor(x / perByte)];
        const shift = 8 - bitCount * ((x % perByte) + 1);
        const c = palette[(byte >> shift) & (Math.pow(2, bitCount) - 1)] ?? [
          0, 0, 0,
        ];
        rgb[o] = c[0];
        rgb[o + 1] = c[1];
        rgb[o + 2] = c[2];
      } else if (bitCount === 24) {
        rgb[o] = buf[row + x * 3 + 2];
        rgb[o + 1] = buf[row + x * 3 + 1];
        rgb[o + 2] = buf[row + x * 3];
      } else {
        const v =
          bitCount === 16
            ? buf.readUInt16LE(row + x * 2)
            : buf.readUInt32LE(row + x * 4);
        for (let k = 0; k < 3; k++) {
          const { shift, max } = ch[k];
          rgb[o + k] = max ? Math.round((((v >>> shift) & max) * 255) / max) : 0;
        }
      }
    }
  }
  return { mimeType: 'image/png', buffer: encodePng(width, height, rgb) };
}

const area = (image: EaRtfImage | null): number =>
  image ? image.buffer.length : -1;

/** Largest bitmap carried by an EMF (bitblt / stretchblt / (stretch)dibits records). */
export function emfToImage(emf: Buffer): EaRtfImage | null {
  let best: EaRtfImage | null = null;
  let off = 0;
  while (off + 8 <= emf.length) {
    const type = emf.readUInt32LE(off);
    const size = emf.readUInt32LE(off + 4);
    if (size < 8 || off + size > emf.length) break;
    let refs: [number, number, number, number] | null = null; // bmi, cbBmi, bits, cbBits
    if (
      (type === EMR_STRETCHDIBITS || type === EMR_SETDIBITSTODEVICE) &&
      size >= 64
    ) {
      refs = [48, 52, 56, 60];
    } else if ((type === EMR_BITBLT || type === EMR_STRETCHBLT) && size >= 100) {
      refs = [84, 88, 92, 96];
    }
    if (refs) {
      const cbBmi = emf.readUInt32LE(off + refs[1]);
      if (cbBmi > 0) {
        const candidate = dibToImage(
          emf,
          off + emf.readUInt32LE(off + refs[0]),
          off + emf.readUInt32LE(off + refs[2]),
          emf.readUInt32LE(off + refs[3]),
        );
        if (area(candidate) > area(best)) best = candidate;
      }
    }
    off += size;
  }
  return best;
}

/** Largest bitmap carried by a (placeable or plain) WMF stretch/blt record. */
export function wmfToImage(wmf: Buffer): EaRtfImage | null {
  let off = 0;
  if (wmf.length >= 22 && wmf.readUInt32LE(0) === 0x9ac6cdd7) off = 22;
  if (off + 18 > wmf.length) return null;
  off += wmf.readUInt16LE(off + 2) * 2; // METAHEADER.HeaderSize (words)

  let best: EaRtfImage | null = null;
  while (off + 6 <= wmf.length) {
    const words = wmf.readUInt32LE(off);
    const fn = wmf.readUInt16LE(off + 4);
    if (words < 3 || off + words * 2 > wmf.length) break;
    // Fixed parameter bytes before the DIB (after the 6-byte record header).
    const fixed =
      fn === WMF_STRETCHDIB
        ? 22
        : fn === WMF_DIBSTRETCHBLT
          ? 20
          : fn === WMF_SETDIBTODEV
            ? 18
            : fn === WMF_DIBBITBLT
              ? 16
              : 0;
    if (fixed && words * 2 >= 6 + fixed + 40) {
      const candidate = dibToImage(wmf, off + 6 + fixed, null, 0);
      if (area(candidate) > area(best)) best = candidate;
    }
    off += words * 2;
  }
  return best;
}

/** `\dibitmap`: a packed DIB. */
export function dibitmapToImage(dib: Buffer): EaRtfImage | null {
  return dibToImage(dib, 0, null, 0);
}
