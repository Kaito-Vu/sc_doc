export interface ImageSize {
  /** Pixels. */
  w: number;
  h: number;
  /** Pixel density; 96 when the file does not say. */
  dpi: number;
}

const DEFAULT_DPI = 96;

/** Pixel size (and PNG density) of a PNG / JPEG / GIF / BMP, or undefined if unknown. */
export function imageSize(buf: Buffer): ImageSize | undefined {
  if (buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG') {
    let dpi = DEFAULT_DPI;
    for (let pos = 8; pos + 12 <= buf.length; ) {
      const len = buf.readUInt32BE(pos);
      const type = buf.toString('latin1', pos + 4, pos + 8);
      if (type === 'pHYs' && buf[pos + 16] === 1) {
        dpi = buf.readUInt32BE(pos + 8) * 0.0254;
      }
      if (type === 'IDAT') break;
      pos += 12 + len;
    }
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), dpi };
  }
  if (buf.length > 10 && buf.toString('latin1', 0, 4) === 'GIF8') {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8), dpi: DEFAULT_DPI };
  }
  if (buf.length > 26 && buf.toString('latin1', 0, 2) === 'BM') {
    return {
      w: buf.readInt32LE(18),
      h: Math.abs(buf.readInt32LE(22)),
      dpi: DEFAULT_DPI,
    };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    for (let pos = 2; pos + 9 < buf.length; ) {
      if (buf[pos] !== 0xff) return undefined;
      const marker = buf[pos + 1];
      // SOFn (not DHT/JPG/DAC) carry the frame size.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        return {
          w: buf.readUInt16BE(pos + 7),
          h: buf.readUInt16BE(pos + 5),
          dpi: DEFAULT_DPI,
        };
      }
      pos += 2 + buf.readUInt16BE(pos + 2);
    }
  }
  return undefined;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/**
 * Stamps a pixel density (pHYs chunk) on a PNG, so a diagram rendered at 2x reports
 * its logical size: Word then shows it at 1x instead of twice as large.
 */
export function withPngDpi(png: Buffer, dpi: number): Buffer {
  const ppm = Math.round(dpi / 0.0254);
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0);
  data.writeUInt32BE(ppm, 4);
  data[8] = 1; // pixels per metre
  const type = Buffer.from('pHYs', 'latin1');
  const chunk = Buffer.alloc(21);
  chunk.writeUInt32BE(9, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])), 17);
  const ihdrEnd = 8 + 12 + 13; // signature + IHDR chunk
  return Buffer.concat([
    png.subarray(0, ihdrEnd),
    chunk,
    png.subarray(ihdrEnd),
  ]);
}
