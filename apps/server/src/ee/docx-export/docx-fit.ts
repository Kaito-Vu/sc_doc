import * as JSZip from 'jszip';

const TWIP_TO_EMU = 635;
const DEFAULT_CELL_MARGIN = 108;

/** Rewrites the dxa `w:w` of a width tag, whatever the attribute order. */
const setW = (tag: string, fn: (w: number) => number) =>
  /w:type="dxa"/.test(tag)
    ? tag.replace(/(w:w=")(\d+)"/, (_m, a, w) => `${a}${fn(Number(w))}"`)
    : tag;

/**
 * Makes content fit the Word page: images are scaled down (both dimensions,
 * aspect kept) to the page text area, or to their table cell; tables get a fixed
 * layout so Word cannot widen them past the page. Only ever shrinks.
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
  const maxH = Math.floor(textH * TWIP_TO_EMU * 0.95);

  const shrinkDrawing = (drawing: string, maxWEmu: number) => {
    const ext = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(drawing);
    if (!ext) return drawing;
    const cx = Number(ext[1]);
    const cy = Number(ext[2]);
    const f = Math.min(1, maxWEmu / cx, maxH / cy);
    if (f >= 1) return drawing;
    const ncx = Math.floor(cx * f);
    const ncy = Math.floor(cy * f);
    return drawing
      .split(`cx="${cx}"`)
      .join(`cx="${ncx}"`)
      .split(`cy="${cy}"`)
      .join(`cy="${ncy}"`);
  };
  const shrinkIn = (part: string, maxWEmu: number) =>
    part.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, (d) =>
      shrinkDrawing(d, maxWEmu),
    );

  // Tables first (cells bound their images), then every remaining image against the page.
  xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
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
      return shrinkIn(tc, Math.max(1, cellW - pad) * TWIP_TO_EMU);
    });
  });
  xml = shrinkIn(xml, textW * TWIP_TO_EMU);

  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
