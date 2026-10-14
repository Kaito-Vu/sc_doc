import * as JSZip from 'jszip';
import { imageSize } from './image-size';

const TWIP_TO_EMU = 635;
const DEFAULT_CELL_MARGIN = 108;
const EMU_PER_INCH = 914400;
/**
 * Images keep their own size and are only shrunk when wider than the page (or table
 * cell). They are also kept under this share of the page height: a taller image
 * cannot sit under its heading, so Word pushes it to the next page and leaves the
 * previous one almost empty. Override with DOCX_IMAGE_MAX_HEIGHT_PERCENT (10-95).
 */
const MAX_HEIGHT_RATIO =
  Math.min(
    95,
    Math.max(10, Number(process.env.DOCX_IMAGE_MAX_HEIGHT_PERCENT) || 80),
  ) / 100;

/** Rewrites the dxa `w:w` of a width tag, whatever the attribute order. */
const setW = (tag: string, fn: (w: number) => number) =>
  /w:type="dxa"/.test(tag)
    ? tag.replace(/(w:w=")(\d+)"/, (_m, a, w) => `${a}${fn(Number(w))}"`)
    : tag;

/**
 * Makes content fit the Word page. Images get their natural size (pixels / density)
 * and are scaled down, aspect kept, only when wider than the text area or their
 * table cell; tables get a fixed layout so Word cannot widen them past the page.
 */
export async function fitDocx(docx: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docx);
  let xml = await zip.file('word/document.xml').async('string');

  const num = (re: RegExp, fallback: number) => {
    const m = re.exec(xml);
    return m ? Number(m[1]) : fallback;
  };
  const pageW = num(/<w:pgSz[^>]*w:w="(\d+)"/, 11906);
  const pageH = num(/<w:pgSz[^>]*w:h="(\d+)"/, 16838);
  const textW =
    pageW -
    num(/<w:pgMar[^>]*w:left="(\d+)"/, 1440) -
    num(/<w:pgMar[^>]*w:right="(\d+)"/, 1440);
  const textH =
    pageH -
    num(/<w:pgMar[^>]*w:top="(\d+)"/, 1440) -
    num(/<w:pgMar[^>]*w:bottom="(\d+)"/, 1440);
  const maxH = Math.floor(textH * TWIP_TO_EMU * MAX_HEIGHT_RATIO);

  // Natural size of every embedded image, by relationship id.
  const rels =
    (await zip.file('word/_rels/document.xml.rels')?.async('string')) ?? '';
  const natural = new Map<string, { w: number; h: number }>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="(media\/[^"]+)"/.exec(m[0])?.[1];
    const file = target && zip.file('word/' + target);
    if (!id || !file) continue;
    const size = imageSize(await file.async('nodebuffer'));
    if (size) {
      natural.set(id, {
        w: Math.round((size.w / size.dpi) * EMU_PER_INCH),
        h: Math.round((size.h / size.dpi) * EMU_PER_INCH),
      });
    }
  }

  const sizeDrawing = (drawing: string, maxWEmu: number) => {
    const ext = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(drawing);
    if (!ext) return drawing;
    const rid = /r:embed="([^"]+)"/.exec(drawing)?.[1];
    const base = (rid && natural.get(rid)) || { w: +ext[1], h: +ext[2] };
    const f = Math.min(1, maxWEmu / base.w, maxH / base.h);
    const cx = Math.max(1, Math.floor(base.w * f));
    const cy = Math.max(1, Math.floor(base.h * f));
    return drawing
      .replace(/(<wp:extent cx=")\d+(" cy=")\d+/, `$1${cx}$2${cy}`)
      .replace(/(<a:ext cx=")\d+(" cy=")\d+/, `$1${cx}$2${cy}`);
  };
  const sizeIn = (part: string, maxWEmu: number) =>
    part.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, (d) =>
      sizeDrawing(d, maxWEmu),
    );

  // A table is handled as a whole (its images are bound by their cell); any other
  // drawing is bound by the page text area.
  xml = xml.replace(
    /<w:tbl>[\s\S]*?<\/w:tbl>|<w:drawing>[\s\S]*?<\/w:drawing>/g,
    (m) =>
      m.startsWith('<w:tbl>')
        ? fitTable(m)
        : sizeDrawing(m, textW * TWIP_TO_EMU),
  );

  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  function fitTable(tbl: string): string {
    const margin = /<w:tblCellMar>[\s\S]*?<w:left w:w="(\d+)"/.exec(tbl);
    const pad = 2 * (margin ? Number(margin[1]) : DEFAULT_CELL_MARGIN);

    // Scale widths down if the grid is wider than the text area.
    const grid = /<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/.exec(tbl);
    const total = grid
      ? [...grid[1].matchAll(/w:w="(\d+)"/g)].reduce(
          (s, m) => s + Number(m[1]),
          0,
        )
      : 0;
    const f = total > textW ? textW / total : 1;
    if (f < 1) {
      tbl = tbl
        .replace(
          /(<w:gridCol w:w=")(\d+)"/g,
          (_m, a, w) => `${a}${Math.floor(w * f)}"`,
        )
        .replace(/<w:tcW[^>]*>/g, (tag) => setW(tag, (w) => Math.floor(w * f)));
    }
    tbl = tbl.replace(/<w:tblW[^>]*>/, (tag) =>
      setW(tag, (w) => Math.min(w, textW)),
    );

    if (!tbl.includes('<w:tblLayout')) {
      const layout = '<w:tblLayout w:type="fixed"/>';
      tbl = tbl.includes('<w:tblCellMar>')
        ? tbl.replace('<w:tblCellMar>', () => layout + '<w:tblCellMar>')
        : tbl.includes('<w:tblLook')
          ? tbl.replace('<w:tblLook', () => layout + '<w:tblLook')
          : tbl.replace('</w:tblPr>', () => layout + '</w:tblPr>');
    }

    return tbl.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => {
      const w = /<w:tcW[^>]*w:w="(\d+)"/.exec(tc);
      const cellW = w ? Number(w[1]) : textW;
      return sizeIn(tc, Math.max(1, cellW - pad) * TWIP_TO_EMU);
    });
  }
}
