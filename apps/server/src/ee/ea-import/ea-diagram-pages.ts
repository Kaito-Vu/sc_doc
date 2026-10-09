import { EaPackageNode } from './types/ea-import.types';

/**
 * Promote exported diagrams to pages.
 *
 * EA exports the same "interface" section two different ways: sometimes each
 * screen is its own sub-package (so it already becomes a page), but often the
 * screens are plain **diagrams** owned directly by a leaf package — e.g.
 * `3. Giao diện` holding 20+ wireframe diagrams. Without this step the whole
 * section collapses into a single page with a gallery of images.
 *
 * A leaf package (no sub-packages) that owns two or more diagrams and is not a
 * synthesized BPMN flow gets one child page per diagram, so every screen is a
 * navigable page. Pure: no Nest / DB dependencies.
 */

const MIN_DIAGRAMS_TO_SPLIT = 2;

function leadingInteger(name: string): number | undefined {
  const match = /^\s*(\d+)/.exec(name);
  if (!match) {
    return undefined;
  }
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isFlowPackage(node: EaPackageNode): boolean {
  return (
    node.activities.length > 0 ||
    node.edges.length > 0 ||
    node.lanes.length > 0
  );
}

function compareChildren(a: EaPackageNode, b: EaPackageNode): number {
  return (
    a.order - b.order ||
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );
}

function visit(node: EaPackageNode): void {
  // Recurse into the package's original children first.
  for (const child of [...node.children]) {
    visit(child);
  }

  if (node.children.length > 0) {
    return;
  }
  if (node.diagrams.length < MIN_DIAGRAMS_TO_SPLIT || isFlowPackage(node)) {
    return;
  }

  const diagrams = node.diagrams;
  node.diagrams = [];
  diagrams.forEach((diagram, index) => {
    node.children.push({
      id: `${node.id}#diagram:${diagram.diagramId ?? index}`,
      name: diagram.name,
      parentId: node.id,
      order: leadingInteger(diagram.name) ?? 1e6 + index,
      documents: [],
      diagrams: [diagram],
      lanes: [],
      activities: [],
      edges: [],
      children: [],
    });
  });
  node.children.sort(compareChildren);
}

/** Mutate the parsed roots in place, promoting diagram pages. */
export function expandDiagramPages(roots: EaPackageNode[]): void {
  for (const root of roots) {
    visit(root);
  }
}
