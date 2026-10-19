import { createHash } from 'crypto';
import { EaPackageNode } from './types/ea-import.types';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Escape text for HTML/XML element content and double-quoted attributes. */
export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Stable, order-independent signature of an EA export's root packages, derived
 * from the root package `xmi:id`s. Two exports of the same EA root package
 * produce the same signature, which is used to detect a duplicate re-import.
 */
export function eaRootSignature(
  roots: Array<Pick<EaPackageNode, 'id'>>,
): string {
  return roots
    .map((root) => root.id)
    .filter((id): id is string => Boolean(id))
    .sort()
    .join('|');
}

/** Breadth-first flatten (parents before children), the order pages are created in. */
export function flattenEaNodes(roots: EaPackageNode[]): EaPackageNode[] {
  const out: EaPackageNode[] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const node = queue.shift()!;
    out.push(node);
    queue.push(...node.children);
  }
  return out;
}

/**
 * EA exports the whole package list but only the selected packages carry
 * content; the rest are title-only stubs.
 */
export function eaNodeHasContent(node: EaPackageNode): boolean {
  return (
    node.documents.length > 0 ||
    node.diagrams.length > 0 ||
    node.activities.length > 0 ||
    node.edges.length > 0 ||
    node.lanes.length > 0
  );
}

export function textHash(text: string | null | undefined): string {
  return createHash('md5')
    .update(text ?? '')
    .digest('hex');
}

/**
 * Imports made before the page map was recorded have no stub hashes; a stub's
 * body is empty or the "N sub-sections:" child list. ponytail: heuristic, only
 * used once per legacy import to seed the hashes.
 */
export function isLegacyStubText(text: string | null | undefined): boolean {
  return /^\s*(?:\d+ sub-sections:[\s\S]*)?$/.test(text ?? '');
}

/**
 * EA lists several Model Documents / diagrams under a package as separate child
 * items; turn each into its own child page instead of concatenating them. A
 * document and diagram sharing a name (screen description + its image) stay
 * together. Flow packages (lanes/activities) are left alone.
 */
export function splitMultiItems(roots: EaPackageNode[]): void {
  for (const node of flattenEaNodes(roots)) {
    splitNode(node);
  }
}

function splitNode(node: EaPackageNode): void {
  if (node.activities.length || node.edges.length || node.lanes.length) {
    return;
  }
  const free = new Set(node.diagrams);
  const units: Array<Pick<EaPackageNode, 'name' | 'documents' | 'diagrams'>> =
    node.documents.map((document) => {
      const diagrams = node.diagrams.filter(
        (d) => free.has(d) && d.name === document.ownerName,
      );
      diagrams.forEach((d) => free.delete(d));
      return { name: document.ownerName, documents: [document], diagrams };
    });
  for (const diagram of free) {
    units.push({ name: diagram.name, documents: [], diagrams: [diagram] });
  }
  if (units.length < 2) {
    return;
  }
  // EA's browser sorts siblings by name; tpos is unreliable for these items.
  units.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  let order = Math.max(-1, ...node.children.map((c) => c.order)) + 1;
  units.forEach((unit, i) => {
    node.children.push({
      id: `${node.id}::item-${i}`,
      name: unit.name,
      parentId: node.id,
      order: order++,
      documents: unit.documents,
      diagrams: unit.diagrams,
      lanes: [],
      activities: [],
      edges: [],
      children: [],
    });
  });
  node.documents = [];
  node.diagrams = [];
}
