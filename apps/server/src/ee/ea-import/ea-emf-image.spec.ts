import { dibitmapToImage, emfToImage, wmfToImage } from './ea-emf-image';
import { rtfToHtml } from './rtf-to-html';

function dib(bitCount: number, width: number, rows: number[][]): Buffer {
  const palette = bitCount <= 8 ? Buffer.from([0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 0, 0]) : Buffer.alloc(0); // BGRA: red, green, blue
  const stride = Math.floor((width * bitCount + 31) / 32) * 4;
  const bmi = Buffer.alloc(40);
  bmi.writeUInt32LE(40, 0);
  bmi.writeInt32LE(width, 4);
  bmi.writeInt32LE(rows.length, 8);
  bmi.writeUInt16LE(1, 12);
  bmi.writeUInt16LE(bitCount, 14);
  if (bitCount <= 8) bmi.writeUInt32LE(3, 32);
  const bits = Buffer.alloc(stride * rows.length);
  rows.forEach((row, i) => Buffer.from(row).copy(bits, (rows.length - 1 - i) * stride));
  return Buffer.concat([bmi, palette, bits]);
}

/** EMF: header + one EMR_STRETCHDIBITS holding `d`. */
function emfWith(d: Buffer, bitsOffset = 40): Buffer {
  const header = Buffer.alloc(88);
  header.writeUInt32LE(1, 0);
  header.writeUInt32LE(88, 4);
  const rec = Buffer.alloc(80 + d.length);
  rec.writeUInt32LE(81, 0);
  rec.writeUInt32LE(rec.length, 4);
  rec.writeUInt32LE(80, 48);
  rec.writeUInt32LE(bitsOffset, 52);
  rec.writeUInt32LE(80 + bitsOffset + (d.length - 40 - (bitsOffset - 40)) * 0, 56);
  d.copy(rec, 80);
  return Buffer.concat([header, rec]);
}

const emf24 = (): Buffer => {
  const d = dib(24, 2, [[0, 0, 255, 255, 0, 0, 0, 0]]);
  const e = emfWith(d);
  e.writeUInt32LE(80 + 40, 88 + 56); // offBits: right after the header
  e.writeUInt32LE(8, 88 + 60);
  return e;
};

describe('emfToImage', () => {
  it('re-encodes the embedded bitmap as a PNG', () => {
    const png = emfToImage(emf24())!;
    expect(png.mimeType).toBe('image/png');
    expect(png.buffer.subarray(1, 4).toString()).toBe('PNG');
    expect(png.buffer.readUInt32BE(16)).toBe(2);
    expect(png.buffer.readUInt32BE(20)).toBe(1);
  });

  it('returns null for an EMF without a bitmap', () => {
    expect(emfToImage(emf24().subarray(0, 88))).toBeNull();
  });
});

describe('dibitmapToImage', () => {
  it('decodes 4-bit and 8-bit palette bitmaps', () => {
    expect(dibitmapToImage(dib(8, 3, [[0, 1, 2]]))!.buffer.readUInt32BE(16)).toBe(3);
    expect(dibitmapToImage(dib(4, 4, [[0x01, 0x20]]))!.buffer.readUInt32BE(16)).toBe(4);
  });
});

describe('wmfToImage', () => {
  it('extracts the bitmap of a META_STRETCHDIB record', () => {
    const d = dib(24, 2, [[0, 0, 255, 255, 0, 0, 0, 0]]);
    const header = Buffer.alloc(18);
    header.writeUInt16LE(1, 0);
    header.writeUInt16LE(9, 2);
    const rec = Buffer.alloc(6 + 22 + d.length);
    rec.writeUInt32LE(rec.length / 2, 0);
    rec.writeUInt16LE(0x0f43, 4);
    d.copy(rec, 28);
    const png = wmfToImage(Buffer.concat([header, rec]))!;
    expect(png.buffer.readUInt32BE(16)).toBe(2);
  });
});

describe('rtf pictures', () => {
  it('keeps a visible note when a picture cannot be imported', () => {
    const rtf = String.raw`{\rtf1\ansi before {\pict\macpict 0102}\par}`;
    expect(rtfToHtml(rtf, [])).toContain('[Image could not be imported]');
  });
});

describe('rtf formatting and OLE objects', () => {
  it('maps \super and \sub to sup/sub', () => {
    const rtf = String.raw`{\rtf1\ansi m\super 2\nosupersub  H\sub 2\nosupersub O\par}`;
    expect(rtfToHtml(rtf)).toBe('<p>m<sup>2</sup> H<sub>2</sub>O</p>');
  });

  it('uses the preview picture of an OLE object', () => {
    const png = emfToImage(emf24())!;
    expect(png).toBeTruthy();
    const hex = emf24().toString('hex');
    const rtf = String.raw`{\rtf1\ansi {\object\objemb{\*\objdata 0102}{\result{\pict\emfblip ${hex}}}}\par}`;
    const sink: any[] = [];
    expect(rtfToHtml(rtf, sink)).toContain('EARTFIMGPLACEHOLDER0Z');
    expect(sink).toHaveLength(1);
  });
});
