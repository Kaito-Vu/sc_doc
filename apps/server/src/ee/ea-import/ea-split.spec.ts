import { splitMultiItems } from './ea-import.util';
import { buildFlowHtml } from './ea-content.builder';
import { EaPackageNode } from './types/ea-import.types';

const node = (over: Partial<EaPackageNode>): EaPackageNode => ({
  id: 'P',
  name: 'P',
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
const doc = (ownerName: string) => ({ ownerId: 'P', ownerName, order: 0, base64: 'x' });
const dg = (name: string) => ({ name, ownerId: 'P', subjectIds: [] });

describe('splitMultiItems', () => {
  it('splits documents and diagrams into name-sorted child pages, pairing same-named ones', () => {
    const p = node({
      documents: [doc('4.10. B'), doc('4.2. A')],
      diagrams: [dg('4.2. A'), dg('4.3. C')],
    });
    splitMultiItems([p]);
    expect(p.documents).toHaveLength(0);
    expect(p.diagrams).toHaveLength(0);
    expect(p.children.map((c) => c.name)).toEqual(['4.2. A', '4.3. C', '4.10. B']);
    expect(p.children[0].documents).toHaveLength(1);
    expect(p.children[0].diagrams).toHaveLength(1);
  });

  it('leaves single-item and flow packages alone', () => {
    const single = node({ documents: [doc('x')] });
    const flow = node({ diagrams: [dg('a'), dg('b')], activities: [{ id: '1', name: 'a' }] });
    splitMultiItems([single, flow]);
    expect(single.documents).toHaveLength(1);
    expect(flow.diagrams).toHaveLength(2);
    expect(single.children.length + flow.children.length).toBe(0);
  });
});

describe('diagram flow graph', () => {
  it('renders the connected flow drawn on a diagram as mermaid', () => {
    const p = node({
      name: 'Flow',
      activities: [{ id: 'z', name: 'undrawn' }],
      diagrams: [
        {
          name: 'd',
          ownerId: 'P',
          subjectIds: [],
          graph: {
            nodes: [{ id: 'a', name: 'Chọn Menu' }, { id: 'b', name: '3.1. MH' }],
            edges: [{ from: 'a', to: 'b' }],
          },
        },
      ],
    });
    const html = buildFlowHtml(p);
    expect(html).toContain('language-mermaid');
    expect(html).toContain('n0 --&gt; n1');
    expect(html).not.toContain('undrawn');
  });
});
