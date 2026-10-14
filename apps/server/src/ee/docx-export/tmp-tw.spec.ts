import { withColumnWidths } from './docx-table-widths';
import { pageNodeToDocxBuffer } from '@docmost/editor-ext';
import { jsonToNode } from '../../collaboration/collaboration.util';
import * as JSZip from 'jszip';
const c = (colspan = 1, colwidth: number[] | null = null, rowspan = 1, text = 'x') => ({ type: 'tableCell', attrs: { colspan, rowspan, colwidth },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const cnt = (t: any) => t.content.map((r: any) => r.content.reduce((s: number, x: any) => s + x.attrs.colspan, 0));

it('pads ragged rows and collects widths', async () => {
  const t = { type: 'table', content: [
    { type: 'tableRow', content: [c(), c()] },
    { type: 'tableRow', content: [c(1, [40]), c(1, [100]), c(1, [60]), c(1, [60]), c(1, [30])] },
  ] };
  const out = withColumnWidths(t);
  expect(cnt(out)).toEqual([5, 5]);
  expect(out.content[0].content.map((x: any) => x.attrs.colwidth)).toEqual([[40], [100], [60], [60], [30]]);
  const doc = jsonToNode({ type: 'doc', content: [out] } as any);
  const buf = await pageNodeToDocxBuffer(doc, async () => new Uint8Array());
  const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
  console.log((xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || []).map((r) => (r.match(/<w:tc>/g) || []).length), xml.match(/<w:tblGrid>.*?<\/w:tblGrid>/)![0]);
});
it('rowspan: no padding where a span occupies', () => {
  const t = { type: 'table', content: [
    { type: 'tableRow', content: [c(1, null, 2), c(1), c(1)] },
    { type: 'tableRow', content: [c(1)] },
  ] };
  expect(cnt(withColumnWidths(t))).toEqual([3, 2]);   // row 2: cell + the rowspanned col0 above => needs 1 more
});
it('colspan row shorter than grid', () => {
  const t = { type: 'table', content: [
    { type: 'tableRow', content: [c(2), c(1)] },
    { type: 'tableRow', content: [c(1), c(1), c(1), c(1)] },
  ] };
  expect(cnt(withColumnWidths(t))).toEqual([4, 4]);
});
