import * as JSZip from 'jszip';
import {
  extractEaZip,
  inspectEaArchive,
  isZipBuffer,
  mimeTypeForImageExt,
  normalizeAssetKey,
  resolveImageForDiagram,
} from './ea-asset.util';
import { EaDiagram } from './types/ea-import.types';

// A valid 1x1 transparent PNG.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function buildZip(files: Record<string, Buffer | string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

function asset(key: string) {
  return {
    key,
    fileName: `${key}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from([1, 2, 3]),
  };
}

const BASE_DIAGRAM: EaDiagram = {
  name: 'ignored',
  ownerId: 'pkg',
  subjectIds: [],
};

describe('isZipBuffer', () => {
  it('detects the PK zip signature', async () => {
    const zip = await buildZip({ 'model.xml': '<XMI/>' });
    expect(isZipBuffer(zip)).toBe(true);
    expect(isZipBuffer(Buffer.from('<?xml version="1.0"?><XMI/>'))).toBe(false);
    expect(isZipBuffer(Buffer.alloc(0))).toBe(false);
  });
});

describe('normalizeAssetKey', () => {
  it('strips path/extension, lowercases and normalizes dashes', () => {
    expect(normalizeAssetKey('Images/EAID-ABC_1.PNG')).toBe('eaid_abc_1');
    expect(normalizeAssetKey('EAID_3891F93B_2CD5_48EA.png')).toBe(
      'eaid_3891f93b_2cd5_48ea',
    );
  });
});

describe('mimeTypeForImageExt', () => {
  it('maps image extensions', () => {
    expect(mimeTypeForImageExt('.png')).toBe('image/png');
    expect(mimeTypeForImageExt('jpeg')).toBe('image/jpeg');
    expect(mimeTypeForImageExt('.SVG')).toBe('image/svg+xml');
    expect(mimeTypeForImageExt('.webp')).toBe('image/webp');
    expect(mimeTypeForImageExt('.txt')).toBe('application/octet-stream');
  });
});

describe('extractEaZip', () => {
  it('returns the first xmi entry plus the image entries', async () => {
    const zip = await buildZip({
      'docs/model.xml': '<?xml version="1.0"?><XMI/>',
      'Images/EAID_ABC_1.png': PNG_1X1,
      'notes.txt': 'ignore me',
    });

    const result = await extractEaZip(zip);

    expect(result.xmi.toString('utf-8')).toContain('<XMI/>');
    expect(result.images).toHaveLength(1);
    expect(result.images[0].fileName).toBe('Images/EAID_ABC_1.png');
    expect(result.images[0].mimeType).toBe('image/png');
    expect(result.images[0].key).toBe('eaid_abc_1');
    expect(result.images[0].buffer.equals(PNG_1X1)).toBe(true);
  });

  it('rejects an archive without an xmi entry', async () => {
    const zip = await buildZip({ 'Images/a.png': PNG_1X1 });
    await expect(extractEaZip(zip)).rejects.toThrow();
  });
});

describe('inspectEaArchive', () => {
  it('collects html pages and images without an xmi document', async () => {
    const zip = await buildZip({
      'index.htm':
        '<html><head><title>My Report</title></head><body></body></html>',
      'diagram.htm': '<html><body><img src="diagram.png"></body></html>',
      'diagram.png': PNG_1X1,
    });

    const result = await inspectEaArchive(zip);

    expect(result.xmi).toBeNull();
    expect(result.htmlPages).toHaveLength(2);
    expect(result.htmlImages).toHaveLength(1);
    expect(result.htmlImages[0].relativePath).toBe('diagram.png');
    expect(result.htmlImages[0].mimeType).toBe('image/png');
    expect(result.htmlImages[0].buffer.equals(PNG_1X1)).toBe(true);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].key).toBe('diagram');
  });

  it('collects the xmi alongside html pages when both are present', async () => {
    const zip = await buildZip({
      'model.xml': '<?xml version="1.0"?><XMI/>',
      'index.html': '<html><body>page</body></html>',
    });

    const result = await inspectEaArchive(zip);

    expect(result.xmi?.toString('utf-8')).toContain('<XMI/>');
    expect(result.htmlPages).toHaveLength(1);
    expect(result.htmlPages[0].relativePath).toBe('index.html');
    expect(result.htmlImages).toHaveLength(0);
  });
});

describe('resolveImageForDiagram', () => {
  it('resolves by diagramId first', () => {
    const byKey = new Map([['eaid_abc_1', asset('eaid_abc_1')]]);
    const diagram: EaDiagram = { ...BASE_DIAGRAM, diagramId: 'EAID_ABC_1' };
    expect(resolveImageForDiagram(diagram, byKey)?.key).toBe('eaid_abc_1');
  });

  it('resolves by imageId', () => {
    const byKey = new Map([['2000954772', asset('2000954772')]]);
    const diagram: EaDiagram = { ...BASE_DIAGRAM, imageId: 2000954772 };
    expect(resolveImageForDiagram(diagram, byKey)?.key).toBe('2000954772');
  });

  it('resolves by diagram name', () => {
    const byKey = new Map([['eaid_abc_1', asset('eaid_abc_1')]]);
    const diagram: EaDiagram = { ...BASE_DIAGRAM, name: 'EAID-ABC-1' };
    expect(resolveImageForDiagram(diagram, byKey)?.key).toBe('eaid_abc_1');
  });

  it('returns undefined when nothing matches', () => {
    const byKey = new Map([['eaid_abc_1', asset('eaid_abc_1')]]);
    expect(resolveImageForDiagram(BASE_DIAGRAM, byKey)).toBeUndefined();
  });
});
