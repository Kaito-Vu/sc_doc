import { pageNodeToDocxBuffer } from '@docmost/editor-ext';
import { jsonToNode } from '../../collaboration/collaboration.util';
import * as JSZip from 'jszip';

const cell = (type: string, text: string, attrs: any = {}, textAlign?: string) => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs },
  content: [
    {
      type: 'paragraph',
      attrs: { textAlign },
      content: [{ type: 'text', text, marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#FF0000' } }] }],
    },
  ],
});

it('keeps cell shading, text format, alignment and repeats header rows', async () => {
  const table = {
    type: 'table',
    content: [
      { type: 'tableRow', content: [cell('tableHeader', 'H1', { backgroundColor: '#FFF2CC' }, 'center'), cell('tableHeader', 'H2')] },
      { type: 'tableRow', content: [cell('tableCell', 'a', { backgroundColor: 'rgb(221, 235, 247)' }, 'right'), cell('tableCell', 'b', {}, 'justify')] },
    ],
  };
  const doc = jsonToNode({ type: 'doc', content: [table] } as any);
  const buf = await pageNodeToDocxBuffer(doc, async () => new Uint8Array());
  const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
  expect(xml).toContain('w:fill="fff2cc"');
  expect(xml).toContain('w:fill="ddebf7"');
  expect((xml.match(/<w:tblHeader\/>/g) || []).length).toBe(1); // header row repeats
  expect(xml).toContain('<w:tblHeader w:val="false"/>'); // body row does not
  expect(xml).toContain('<w:jc w:val="center"');
  expect(xml).toContain('<w:jc w:val="right"');
  expect(xml).toContain('<w:jc w:val="both"');
  expect(xml).toContain('<w:b/>');
  expect(xml).toContain('w:val="ff0000"');
});
