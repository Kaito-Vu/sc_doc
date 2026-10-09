import { expandDiagramPages } from './ea-diagram-pages';
import { EaPackageNode } from './types/ea-import.types';

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

function diagram(name: string, diagramId?: string) {
  return { name, ownerId: 'pkg-1', subjectIds: [], diagramId };
}

describe('expandDiagramPages', () => {
  it('splits a leaf package with several diagrams into one page per diagram', () => {
    const node = makeNode({
      name: '3. Giao diện',
      diagrams: [diagram('3.2. MH Thêm', 'D2'), diagram('3.1. MH Đăng ký', 'D1')],
    });
    expandDiagramPages([node]);

    expect(node.diagrams).toHaveLength(0);
    expect(node.children.map((c) => c.name)).toEqual([
      '3.1. MH Đăng ký',
      '3.2. MH Thêm',
    ]);
    expect(node.children[0].diagrams).toHaveLength(1);
    expect(node.children[0].parentId).toBe('pkg-1');
    expect(node.children[0].id).toBe('pkg-1#diagram:D1');
  });

  it('keeps a single-diagram leaf package as-is', () => {
    const node = makeNode({ diagrams: [diagram('3.1. MH', 'D1')] });
    expandDiagramPages([node]);
    expect(node.diagrams).toHaveLength(1);
    expect(node.children).toHaveLength(0);
  });

  it('does not split a BPMN flow package', () => {
    const node = makeNode({
      diagrams: [diagram('2. Luồng', 'D1'), diagram('2. Luồng 2', 'D2')],
      activities: [{ id: 'a1', name: 'A' }],
    });
    expandDiagramPages([node]);
    expect(node.diagrams).toHaveLength(2);
    expect(node.children).toHaveLength(0);
  });

  it('does not split a package that already has sub-packages', () => {
    const node = makeNode({
      diagrams: [diagram('d1', 'D1'), diagram('d2', 'D2')],
      children: [makeNode({ id: 'child', parentId: 'pkg-1' })],
    });
    expandDiagramPages([node]);
    expect(node.diagrams).toHaveLength(2);
    expect(node.children).toHaveLength(1);
  });

  it('recurses into nested packages', () => {
    const leaf = makeNode({
      id: 'leaf',
      name: '3. Giao diện',
      diagrams: [diagram('3.1. A', 'A'), diagram('3.2. B', 'B')],
    });
    const root = makeNode({ id: 'root', children: [leaf] });
    expandDiagramPages([root]);

    expect(leaf.children.map((c) => c.name)).toEqual(['3.1. A', '3.2. B']);
    expect(root.children).toHaveLength(1);
  });
});
