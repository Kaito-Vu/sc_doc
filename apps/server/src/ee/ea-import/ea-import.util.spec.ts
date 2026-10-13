import {
  eaNodeHasContent,
  eaRootSignature,
  flattenEaNodes,
  isLegacyStubText,
  textHash,
} from './ea-import.util';
import { EaPackageNode } from './types/ea-import.types';

const node = (id: string, over: Partial<EaPackageNode> = {}): EaPackageNode => ({
  id,
  name: id,
  parentId: null,
  order: 0,
  documents: [],
  diagrams: [],
  lanes: [],
  activities: [],
  edges: [],
  children: [],
  ...over,
});

describe('merge helpers', () => {
  it('flattens breadth-first, parents before children', () => {
    const roots = [
      node('a', { children: [node('a1', { children: [node('a1x')] }), node('a2')] }),
      node('b'),
    ];
    expect(flattenEaNodes(roots).map((n) => n.id)).toEqual([
      'a', 'b', 'a1', 'a2', 'a1x',
    ]);
  });

  it('treats title-only nodes as stubs', () => {
    expect(eaNodeHasContent(node('a'))).toBe(false);
    expect(
      eaNodeHasContent(node('a', { documents: [{ base64: 'x' } as any] })),
    ).toBe(true);
  });

  it('recognises legacy stub bodies but not real content', () => {
    expect(isLegacyStubText('')).toBe(true);
    expect(isLegacyStubText(null)).toBe(true);
    expect(isLegacyStubText('3 sub-sections:\nA\nB\nC')).toBe(true);
    expect(isLegacyStubText('Some real text')).toBe(false);
  });

  it('hashes null and empty text identically (matches md5(coalesce(x, \'\')))', () => {
    expect(textHash(null)).toBe(textHash(''));
    expect(textHash('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});

describe('eaRootSignature', () => {
  it('joins root ids in a stable, order-independent way', () => {
    expect(eaRootSignature([{ id: 'B' }, { id: 'A' }])).toBe('A|B');
    expect(eaRootSignature([{ id: 'A' }, { id: 'B' }])).toBe('A|B');
  });

  it('filters out empty or missing ids', () => {
    expect(eaRootSignature([{ id: '' }, { id: 'A' }, { id: '' }])).toBe('A');
  });

  it('returns an empty string when there are no ids', () => {
    expect(eaRootSignature([])).toBe('');
    expect(eaRootSignature([{ id: '' }])).toBe('');
  });
});
