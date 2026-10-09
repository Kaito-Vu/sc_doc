import * as JSZip from 'jszip';
import {
  buildDiagramHtml,
  buildDocumentsHtml,
  buildFlowHtml,
  decodeModelDocument,
  stripDuplicateLeadingHeading,
  stripEaCodePrefix,
} from './ea-content.builder';
import { eaRtfImagePlaceholder } from './rtf-to-html';
import { EaPackageNode, EaRtfImage } from './types/ea-import.types';

// A real ZIP containing a single `str.dat` RTF with Vietnamese text
// ("GS_01:Theo dõi các sự kiện ...").
const VALID_MODEL_DOCUMENT =
  'UEsDBBQAAAAIAJxkSV35ZYTZjgAAALEAAAAHAAAAc3RyLmRhdDWMTQ6CMBCFrzInMEyBQHXligPochJT+wMNpJjS6oL07g4m7r689763U0wOSYXNk7FuUWGsqx53cmtI6bkwVHCNXi2XUujt7Wf2wTSUNdJLRcM1uU0IGG6PCs/3ya5gKIumBQ+aQbSgYaPcSYEAs2fqOwnhsAFPMPwSKXmepn+bQU+HgjXLgV9aNsZDKV9QSwECFAAUAAAACACcZEld+WWE2Y4AAACxAAAABwAAAAAAAAAAAAAAAAAAAAAAc3RyLmRhdFBLBQYAAAAAAQABADUAAACzAAAAAAA=';

// A valid 1x1 transparent PNG.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function buildModelDocument(rtf: string): Promise<string> {
  const zip = new JSZip();
  zip.file('str.dat', Buffer.from(rtf, 'latin1'));
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer.toString('base64');
}

function makeNode(overrides: Partial<EaPackageNode>): EaPackageNode {
  return {
    id: 'pkg-1',
    name: 'Package',
    parentId: null,
    order: 0,
    documents: [],
    diagrams: [],
    lanes: [],
    activities: [],
    edges: [],
    children: [],
    ...overrides,
  };
}

function limits(overrides: Partial<{ maxDocBytes: number; maxTotalBytes: number }>) {
  return {
    maxDocBytes: overrides.maxDocBytes ?? 16 * 1024 * 1024,
    maxTotalBytes: overrides.maxTotalBytes ?? 32 * 1024 * 1024,
    usedTotal: { bytes: 0 },
  };
}

describe('stripEaCodePrefix', () => {
  it('strips a leading code before the first colon', () => {
    expect(stripEaCodePrefix('GS_01:Theo dõi')).toEqual({
      title: 'Theo dõi',
      code: 'GS_01',
    });
  });

  it('returns a null code when there is no colon', () => {
    expect(stripEaCodePrefix('1. Mô tả chi tiết')).toEqual({
      title: '1. Mô tả chi tiết',
      code: null,
    });
  });
});

describe('decodeModelDocument', () => {
  it('decodes the base64 ZIP RTF into HTML with Vietnamese glyphs', async () => {
    const html = await decodeModelDocument(
      VALID_MODEL_DOCUMENT,
      limits({}),
    );
    expect(html).toContain('Theo dõi');
    // `\u`-decoded glyphs (not present as raw bytes).
    expect(html).toContain('dõi');
    expect(html).toContain('sự');
  });

  it('throws when a document exceeds the per-document limit', async () => {
    await expect(
      decodeModelDocument(VALID_MODEL_DOCUMENT, limits({ maxDocBytes: 10 })),
    ).rejects.toThrow();
  });

  it('throws when the total budget is exhausted', async () => {
    await expect(
      decodeModelDocument(VALID_MODEL_DOCUMENT, limits({ maxTotalBytes: 10 })),
    ).rejects.toThrow();
  });

  it('throws on malformed base64/zip input', async () => {
    await expect(decodeModelDocument('bm90IGEgemlw', limits({}))).rejects.toThrow();
  });
});

describe('buildFlowHtml', () => {
  it('includes the provenance callout and a mermaid block for a linear chain', () => {
    const node = makeNode({
      name: '2. Luồng màn hình',
      activities: [
        { id: 'a1', name: 'Bắt đầu' },
        { id: 'a2', name: 'Xử lý' },
      ],
      edges: [{ from: 'a1', to: 'a2' }],
    });
    const html = buildFlowHtml(node);
    expect(html).toContain('Enterprise Architect');
    expect(html).toContain('flowchart LR');
    expect(html).toContain('language-mermaid');
    expect(html).toContain('Bắt đầu');
  });

  it('omits the mermaid block when an edge does not resolve', () => {
    const node = makeNode({
      activities: [{ id: 'a1', name: 'A' }],
      edges: [{ from: 'a1', to: 'missing' }],
    });
    const html = buildFlowHtml(node);
    expect(html).toContain('Enterprise Architect');
    expect(html).not.toContain('language-mermaid');
  });
});

describe('buildDiagramHtml', () => {
  it('lists diagrams and includes the wireframe not-embedded note', () => {
    const node = makeNode({
      name: '3. Giao diện',
      diagrams: [
        { name: '3.1. MH Tìm kiếm', ownerId: 'pkg-1', subjectIds: [] },
      ],
    });
    const html = buildDiagramHtml(node);
    expect(html).toContain('Enterprise Architect');
    expect(html).toContain('3.1. MH Tìm kiếm');
    expect(html).toContain('Wireframe images are not embedded in the EA export.');
  });

  it('embeds a matched diagram image after its list item', () => {
    const node = makeNode({
      name: '3. Giao diện',
      diagrams: [
        { name: '3.1. MH Tìm kiếm', ownerId: 'pkg-1', subjectIds: [], diagramId: 'D1' },
      ],
    });
    const imageHtml =
      '<img src="/api/files/att-1/d.png" data-attachment-id="att-1" width="800" data-align="center">';
    const html = buildDiagramHtml(node, new Map([['D1', imageHtml]]));
    expect(html).toContain(imageHtml);
    expect(html).not.toContain(
      'Wireframe images are not embedded in the EA export.',
    );
  });
});

describe('stripDuplicateLeadingHeading', () => {
  it('removes a leading heading that matches the title', () => {
    const json = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '  theo   DÕI ' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
      ],
    };
    const result = stripDuplicateLeadingHeading(json, 'Theo dõi');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('paragraph');
  });

  it('ensures at least one paragraph when the document is emptied', () => {
    const json = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] }],
    };
    const result = stripDuplicateLeadingHeading(json, 'Title');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('paragraph');
  });
});

describe('RTF \\pict sink forwarding', () => {
  it('decodeModelDocument forwards extracted images to the sink', async () => {
    const hex = PNG_1X1.toString('hex');
    const base64 = await buildModelDocument(
      `{\\rtf1\\ansi Before {\\pict\\pngblip ${hex}} After\\par}`,
    );
    const sink: EaRtfImage[] = [];

    const html = await decodeModelDocument(base64, limits({}), sink);

    expect(html).toContain(eaRtfImagePlaceholder(0));
    expect(html).not.toContain(hex);
    expect(sink).toHaveLength(1);
    expect(sink[0].mimeType).toBe('image/png');
    expect(sink[0].buffer.equals(PNG_1X1)).toBe(true);
  });

  it('buildDocumentsHtml forwards the sink through each document', async () => {
    const hex = PNG_1X1.toString('hex');
    const base64 = await buildModelDocument(
      `{\\rtf1\\ansi {\\pict\\pngblip ${hex}}\\par}`,
    );
    const node = makeNode({
      documents: [{ ownerId: 'pkg-1', ownerName: 'Doc', order: 0, base64 }],
    });
    const sink: EaRtfImage[] = [];

    const result = await buildDocumentsHtml(node, limits({}), sink);

    expect(result.warnings).toHaveLength(0);
    expect(result.html).toContain(eaRtfImagePlaceholder(0));
    expect(sink).toHaveLength(1);
    expect(sink[0].buffer.equals(PNG_1X1)).toBe(true);
  });
});
