import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useSetAtom, useStore } from "jotai";
import {
  fetchAllAncestorChildren,
  usePageQuery,
} from "@/features/page/queries/page-query.ts";
import { getPageBreadcrumbs } from "@/features/page/services/page-service.ts";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { openTreeNodesAtom } from "@/features/page/tree/atoms/open-tree-nodes-atom.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { extractPageSlugId } from "@/lib";

// Whenever the current page changes (e.g. clicking a grandchild in the
// subpages list), make sure every ancestor is loaded and expanded in the
// sidebar tree so the page is revealed at its real level. DocTree then scrolls
// the selected row into view on its own.
// Core's own reveal only runs when the page is missing from the tree, and
// drops deeper levels when the top ancestor's children are already loaded.
export function useRevealCurrentPage(enabled: boolean) {
  const { pageSlug } = useParams();
  const { data: currentPage } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });
  const store = useStore();
  const setData = useSetAtom(treeDataAtom);
  const setOpen = useSetAtom(openTreeNodesAtom);
  const id = currentPage?.id;

  useEffect(() => {
    if (!enabled || !id) return;
    let cancelled = false;

    const open = (ids: string[]) =>
      setOpen((prev) => {
        const next = { ...prev };
        ids.forEach((i) => (next[i] = true));
        return next;
      });

    (async () => {
      const path = treeModel.path(store.get(treeDataAtom), id);
      if (path) return open(path.slice(0, -1).map((n) => n.id));

      const crumbs = (await getPageBreadcrumbs(id)) ?? [];
      const parentIds = crumbs.filter((p) => p && p.id !== id).map((p) => p!.id);

      // top-down so each level exists before we look for the next one
      for (const parentId of parentIds) {
        if (cancelled) return;
        const node = treeModel.find(
          store.get(treeDataAtom),
          parentId,
        ) as SpaceTreeNode | null;
        if (!node) return;
        if (node.hasChildren && !node.children?.length) {
          const children = await fetchAllAncestorChildren({
            pageId: parentId,
            spaceId: node.spaceId,
          });
          if (cancelled) return;
          setData((prev) => treeModel.appendChildren(prev, parentId, children));
        }
      }
      if (!cancelled) open(parentIds);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, id]);
}
