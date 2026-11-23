import { buildMergeBookkeeping, MergeTargets, planEaPages } from './ea-import.planner';
import { textHash } from './ea-import.util';
import { EaPackageNode } from './types/ea-import.types';

function node(
  id: string,
  opts: { content?: boolean; children?: EaPackageNode[] } = {},
): EaPackageNode {
  return {
    id,
    name: id,
    parentId: null,
    order: 0,
    documents: opts.content ? [{} as any] : [],
    diagrams: [],
    lanes: [],
    activities: [],
    edges: [],
    children: opts.children ?? [],
  };
}

function target(id: string, text: string | null, editable = true) {
  return { id, slugId: `slug-${id}`, textContent: text, editable };
}

function mergeOf(
  targets: Record<string, ReturnType<typeof target>>,
  stubHashes: Record<string, string> = {},
): MergeTargets {
  return {
    targets: new Map(Object.entries(targets)),
    stubHashes,
    pageMap: {},
    pageIds: [],
    rootPageIds: [],
  };
}

describe('planEaPages', () => {
  it('throws on empty input', () => {
    expect(() => planEaPages([], null)).toThrow(/No importable/);
  });

  it('inserts everything breadth-first without merge, linking parents', () => {
    const c1 = node('c1');
    const g = node('g');
    const a = node('a', { children: [c1] });
    const b = node('b', { children: [g] });
    const out = planEaPages([a, b], null);
    expect(out.map((p) => p.node.id)).toEqual(['a', 'b', 'c1', 'g']);
    expect(out.every((p) => p.action === 'insert')).toBe(true);
    expect(out[0].parentPageId).toBeNull();
    expect(out[2].parentPageId).toBe(out[0].id);
    expect(out[3].parentPageId).toBe(out[1].id);
    expect(out[0].restricted).toBe(false);
  });

  it('merge: keep for stub nodes, fill for untouched stub body, skip for edited', () => {
    const stub = node('stub');
    const fill = node('fill', { content: true });
    const edited = node('edited', { content: true });
    const noHash = node('noHash', { content: true });
    const fresh = node('fresh', { content: true });
    const merge = mergeOf(
      {
        stub: target('p1', ''),
        fill: target('p2', 'stub body'),
        edited: target('p3', 'user text'),
        noHash: target('p4', 'x'),
      },
      { fill: textHash('stub body'), edited: textHash('stub body') },
    );
    const out = planEaPages([stub, fill, edited, noHash, fresh], merge);
    expect(out.map((p) => p.action)).toEqual([
      'keep',
      'fill',
      'skip',
      'skip',
      'insert',
    ]);
    // existing pages reuse id and slug
    expect(out[1].id).toBe('p2');
    expect(out[1].slugId).toBe('slug-p2');
    expect(out[4].id).not.toBe('p2');
  });

  it('restricted target is skipped and propagates to descendants', () => {
    const child = node('child', { content: true });
    const root = node('root', { content: true, children: [child] });
    const merge = mergeOf(
      { root: target('p1', 'stub', false) },
      { root: textHash('stub') },
    );
    const out = planEaPages([root], merge);
    expect(out[0]).toMatchObject({ action: 'skip', restricted: true });
    expect(out[1]).toMatchObject({ action: 'skip', restricted: true });
  });

  it('restricted keep stays keep', () => {
    const root = node('root');
    const out = planEaPages([root], mergeOf({ root: target('p1', '', false) }));
    expect(out[0]).toMatchObject({ action: 'keep', restricted: true });
  });
});

describe('buildMergeBookkeeping', () => {
  const page = (id: string, n: EaPackageNode, action: any, content: any = null) =>
    ({ id, node: n, action, content }) as any;

  it('records inserts in pageMap; no merge key without merge', () => {
    const withContent = node('a', { content: true });
    const p = page('pa', withContent, 'insert');
    const res = buildMergeBookkeeping([p], [p], null, []);
    expect(res.pageMap).toEqual({ a: 'pa' });
    expect(res.stubHashes).toEqual({});
    expect(res.merge).toBeUndefined();
  });

  it('stores stub hash for content-less inserts', () => {
    const p = page('pb', node('b'), 'insert', { type: 'doc', content: [] });
    const res = buildMergeBookkeeping([p], [p], null, []);
    expect(res.stubHashes.b).toBe(textHash(''));
  });

  it('merge counts and filled ids drop stub hashes, inputs not mutated', () => {
    const merge = mergeOf({}, { f: 'h1', other: 'h2', a: 'old' });
    merge.pageMap = { prev: 'pp' };
    const ins = page('pa', node('a', { content: true }), 'insert');
    const fill = page('pf', node('f', { content: true }), 'fill');
    const fillFailed = page('pg', node('g', { content: true }), 'fill');
    const keep = page('pk', node('k'), 'keep');
    const skip = page('ps', node('s'), 'skip');
    const prepared = [ins, fill, fillFailed, keep, skip];
    const res = buildMergeBookkeeping(prepared, [ins, fill, fillFailed], merge, ['pf']);
    expect(res.pageMap).toEqual({ prev: 'pp', a: 'pa' });
    expect(res.stubHashes).toEqual({ other: 'h2' });
    expect(res.merge).toEqual({ added: 1, filled: 1, kept: 1, skipped: 1 });
    expect(merge.stubHashes).toEqual({ f: 'h1', other: 'h2', a: 'old' });
  });
});
