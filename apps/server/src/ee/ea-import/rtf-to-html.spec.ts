import { eaRtfImagePlaceholder, rtfToHtml } from './rtf-to-html';
import { EaRtfImage } from './types/ea-import.types';

// A valid 1x1 transparent PNG.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('rtfToHtml', () => {
  it('turns entirely-bold numbered paragraphs into headings by dot depth', () => {
    const rtf =
      '{\\rtf1\\ansi\\b 1. Giới thiệu\\par\\b 2.1. Chi tiết\\par\\b 2.1.1. Sâu hơn\\par}';
    const html = rtfToHtml(rtf);
    expect(html).toContain('<h1>1. Giới thiệu</h1>');
    expect(html).toContain('<h2>2.1. Chi tiết</h2>');
    expect(html).toContain('<h3>2.1.1. Sâu hơn</h3>');
  });

  it('converts plain paragraphs and keeps inline bold', () => {
    const rtf = '{\\rtf1\\ansi This is normal.\\par\\b Bold part\\b0  and plain.\\par}';
    const html = rtfToHtml(rtf);
    expect(html).toContain('<p>This is normal.</p>');
    expect(html).toContain('<p><strong>Bold part</strong> and plain.</p>');
  });

  it('converts table rows', () => {
    const rtf =
      '{\\rtf1\\ansi\\trowd\\cellx1000\\cellx2000\\intbl A\\cell B\\cell\\row}';
    const html = rtfToHtml(rtf);
    expect(html).toContain('<table>');
    expect(html).toContain('<tr><td>A</td><td>B</td></tr>');
  });

  it('round-trips Vietnamese \\uNNNN sequences', () => {
    const rtf = '{\\rtf1\\ansi Theo d\\u245 i\\par D\\u7919  li\\u7879 u\\par}';
    const html = rtfToHtml(rtf);
    expect(html).toContain('Theo dõi');
    expect(html).toContain('Dữ liệu');
  });

  it("skips exactly one \\'hh fallback after \\uN", () => {
    const rtf = "{\\rtf1\\ansi Theo d\\u245 \\'f5i\\par}";
    const html = rtfToHtml(rtf);
    expect(html).toContain('Theo dõi');
    expect(html).not.toContain('dõõ');
  });

  it('HTML-escapes text runs', () => {
    const rtf = '{\\rtf1\\ansi <script>alert(1)</script>\\par}';
    const html = rtfToHtml(rtf);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('returns a safe stub for malformed input instead of throwing', () => {
    expect(rtfToHtml('not rtf at all')).toBe('<p></p>');
    expect(rtfToHtml('')).toBe('<p></p>');
  });
});

describe('rtfToHtml \\pict extraction', () => {
  it('extracts a \\pngblip pict, emits a placeholder and no raw hex', () => {
    const hex = PNG_1X1.toString('hex');
    const rtf = `{\\rtf1\\ansi Before {\\pict\\pngblip ${hex}} After\\par}`;
    const sink: EaRtfImage[] = [];

    const html = rtfToHtml(rtf, sink);

    expect(html).toContain(eaRtfImagePlaceholder(0));
    expect(html).not.toContain(hex);
    expect(sink).toHaveLength(1);
    expect(sink[0].mimeType).toBe('image/png');
    expect(sink[0].buffer.equals(PNG_1X1)).toBe(true);
  });

  it('tolerates whitespace/CR/LF inside the hex payload', () => {
    const hex = PNG_1X1.toString('hex');
    const spaced = hex.replace(/(.{8})/g, '$1\r\n ');
    const rtf = `{\\rtf1\\ansi {\\pict\\pngblip ${spaced}}\\par}`;
    const sink: EaRtfImage[] = [];

    const html = rtfToHtml(rtf, sink);

    expect(sink).toHaveLength(1);
    expect(sink[0].buffer.equals(PNG_1X1)).toBe(true);
    expect(html).toContain(eaRtfImagePlaceholder(0));
  });

  it('extracts a \\jpegblip pict as image/jpeg', () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const rtf = `{\\rtf1\\ansi {\\pict\\jpegblip ${bytes.toString('hex')}}\\par}`;
    const sink: EaRtfImage[] = [];

    rtfToHtml(rtf, sink);

    expect(sink).toHaveLength(1);
    expect(sink[0].mimeType).toBe('image/jpeg');
    expect(sink[0].buffer.equals(bytes)).toBe(true);
  });

  it('drops pict bytes without throwing when no sink is provided', () => {
    const hex = PNG_1X1.toString('hex');
    const rtf = `{\\rtf1\\ansi Before {\\pict\\pngblip ${hex}} After\\par}`;

    let html = '';
    expect(() => {
      html = rtfToHtml(rtf);
    }).not.toThrow();

    expect(html).not.toContain('EARTFIMGPLACEHOLDER');
    expect(html).not.toContain(hex);
    expect(html).toContain('Before');
    expect(html).toContain('After');
  });

  it('skips unsupported blip types without a placeholder', () => {
    const rtf = '{\\rtf1\\ansi {\\pict\\wmetafile8 0102030405}\\par}';
    const sink: EaRtfImage[] = [];

    const html = rtfToHtml(rtf, sink);

    expect(sink).toHaveLength(0);
    expect(html).not.toContain('EARTFIMGPLACEHOLDER');
  });

  it('does not throw on a malformed pict group', () => {
    const rtf = '{\\rtf1\\ansi {\\pict\\pngblip zz}\\par}';
    const sink: EaRtfImage[] = [];

    expect(() => rtfToHtml(rtf, sink)).not.toThrow();
    expect(sink).toHaveLength(0);
  });
});
