import { createHash } from 'crypto';
import { EaPackageNode } from './types/ea-import.types';

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
