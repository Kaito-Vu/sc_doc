import * as JSZip from 'jszip';

export interface TocEntry {
  level: number;
  text: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// A4 with 1" margins => 9026 twips of text width.
const TEXT_WIDTH = 9026;

const fld = (type: string, extra = '') =>
  `<w:r><w:fldChar w:fldCharType="${type}"${extra}/></w:r>`;

/**
 * Prepends a Word TOC field (heading ..... page number) to a .docx.
 * Page numbers only exist once Word lays the document out, so the field is
 * marked dirty and `updateFields` is set: Word fills the numbers in on open
 * (after a one-time "update fields?" prompt). Until then the entries show the
 * headings with dot leaders.
 */
export async function addToc(
  docx: Buffer,
  entries: TocEntry[],
  title: string,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docx);

  const instr = `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>`;
  const list = entries.length ? entries : [{ level: 1, text: '' }];
  const paras = list
    .map((e, i) => {
      const pre =
        i === 0
          ? fld('begin', ' w:dirty="true"') + instr + fld('separate')
          : '';
      const post = i === list.length - 1 ? fld('end') : '';
      return (
        `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${TEXT_WIDTH}"/></w:tabs>` +
        `<w:ind w:left="${(e.level - 1) * 220}"/></w:pPr>${pre}` +
        `<w:r><w:t xml:space="preserve">${esc(e.text)}</w:t></w:r><w:r><w:tab/></w:r>${post}</w:p>`
      );
    })
    .join('');
  const heading =
    `<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(title)}</w:t></w:r></w:p>`;

  const documentXml = await zip.file('word/document.xml').async('string');
  zip.file(
    'word/document.xml',
    documentXml.replace('<w:body>', () => `<w:body>${heading}${paras}`),
  );

  const settings = zip.file('word/settings.xml');
  if (settings) {
    const xml = await settings.async('string');
    // Schema order: updateFields sits right before compat.
    zip.file(
      'word/settings.xml',
      xml.includes('<w:compat>')
        ? xml.replace(
            '<w:compat>',
            () => '<w:updateFields w:val="true"/><w:compat>',
          )
        : xml.replace(
            '</w:settings>',
            () => '<w:updateFields w:val="true"/></w:settings>',
          ),
    );
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
