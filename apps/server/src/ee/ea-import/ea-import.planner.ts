import { v7 } from 'uuid';
import { generateSlugId } from '../../common/helpers';
import { jsonToText } from '../../collaboration/collaboration.util';
import { EaPackageNode } from './types/ea-import.types';
import { eaNodeHasContent, textHash } from './ea-import.util';
import type { EaImportMetadata } from './ea-import.service';

export interface PreparedPage {
  /** insert: new page; fill: empty stub gets content; keep/skip: untouched. */
  action: 'insert' | 'fill' | 'keep' | 'skip';
  node: EaPackageNode;
  id: string;
  slugId: string;
  parentPageId: string | null;
  title: string;
  content: any;
  ydoc: Buffer | null;
  /** Merge target the user may not edit (or sits under one): never write here. */
  restricted?: boolean;
}

export interface MergeTargets {
  /** EA GUID -> existing page; `editable` = the importer may write it. */
  targets: Map<
    string,
    { id: string; slugId: string; textContent: string | null; editable: boolean }
  >;
  stubHashes: Record<string, string>;
  pageMap: Record<string, string>;
  pageIds: string[];
  rootPageIds: string[];
}

/**
 * Flatten the package tree breadth-first so parents are always prepared
 * (and inserted) before their children, deciding per node whether it is a
 * new page or (merge) an existing page to fill, keep or skip.
 */
export function planEaPages(
  roots: EaPackageNode[],
  merge: MergeTargets | null,
): PreparedPage[] {
  const prepared: PreparedPage[] = [];
  const pageIdByNode = new Map<EaPackageNode, string>();
  // Merge must not hang new pages under a page the user cannot edit.
  const restrictedNodes = new Set<EaPackageNode>();
  const queue: Array<{ node: EaPackageNode; parent: EaPackageNode | null }> =
    roots.map((node) => ({ node, parent: null }));

  while (queue.length > 0) {
    const { node, parent } = queue.shift()!;
    const hit = merge?.targets.get(node.id);
    let action: PreparedPage['action'] = 'insert';
    if (hit) {
      const stubHash = merge!.stubHashes[node.id];
      action = !eaNodeHasContent(node)
        ? 'keep'
        : hit.editable &&
            stubHash !== undefined &&
            textHash(hit.textContent) === stubHash
          ? 'fill'
          : 'skip';
    }
    const restricted =
      (hit !== undefined && !hit.editable) ||
      (parent !== null && restrictedNodes.has(parent));
    if (restricted) {
      restrictedNodes.add(node);
      if (action === 'insert' || action === 'fill') action = 'skip';
    }
    const id = hit?.id ?? v7();
    pageIdByNode.set(node, id);
    prepared.push({
      restricted,
      action,
      node,
      id,
      slugId: hit?.slugId ?? generateSlugId(),
      parentPageId: parent ? (pageIdByNode.get(parent) ?? null) : null,
      title: '',
      content: null,
      ydoc: null,
    });
    for (const child of node.children) {
      queue.push({ node: child, parent: node });
    }
  }

  if (prepared.length === 0) {
    throw new Error('No importable Enterprise Architect content found');
  }
  return prepared;
}

/** Cumulative page map + stub hashes let the next merge find these pages. */
export function buildMergeBookkeeping(
  prepared: PreparedPage[],
  work: PreparedPage[],
  merge: MergeTargets | null,
  filledIds: string[],
): Pick<EaImportMetadata, 'pageMap' | 'stubHashes' | 'merge'> {
  const pageMap = { ...merge?.pageMap };
  const stubHashes = { ...merge?.stubHashes };
  const inserts = work.filter((page) => page.action === 'insert');
  for (const page of inserts) {
    pageMap[page.node.id] = page.id;
    if (eaNodeHasContent(page.node)) {
      delete stubHashes[page.node.id];
    } else {
      stubHashes[page.node.id] = textHash(jsonToText(page.content));
    }
  }
  const filled = new Set(filledIds);
  for (const page of work) {
    if (filled.has(page.id)) {
      delete stubHashes[page.node.id];
    }
  }
  return {
    pageMap,
    stubHashes,
    ...(merge && {
      merge: {
        added: inserts.length,
        filled: filledIds.length,
        kept: prepared.filter((page) => page.action === 'keep').length,
        skipped: prepared.filter((page) => page.action === 'skip').length,
      },
    }),
  };
}
