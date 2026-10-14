import { useCallback } from "react";
import { useStore } from "jotai";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import { spaceRoots, updateSpaceRoots } from "@/features/page/tree/utils/utils.ts";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { queryClient } from "@/main.tsx";
import { fetchAllAncestorChildren } from "@/features/page/queries/page-query.ts";

/** Pull newly imported children of `parentId` into the sidebar tree. */
export function useRefreshSubPages() {
  const store = useStore();

  return useCallback(
    async (parentId: string, spaceId: string) => {
      // fetchAllAncestorChildren caches for 30min; drop it so new children show up.
      queryClient.removeQueries({
        queryKey: ["sidebar-pages"],
        predicate: (q) => (q.queryKey[1] as any)?.pageId === parentId,
      });
      const flag = { hasChildren: true } as Partial<SpaceTreeNode>;
      const parent = treeModel.find(
        spaceRoots(store.get(treeDataAtom), spaceId),
        parentId,
      ) as SpaceTreeNode | null;
      if (!parent) return;

      // Children never lazy-loaded: just show the chevron, expanding fetches them.
      if (parent.hasChildren && !parent.children?.length) {
        store.set(treeDataAtom, (prev) => treeModel.update(prev, parentId, flag));
        return;
      }

      const fetched = await fetchAllAncestorChildren({ pageId: parentId, spaceId });
      store.set(treeDataAtom, (prev) =>
        treeModel.update(treeModel.appendChildren(prev, parentId, fetched), parentId, flag),
      );
    },
    [store],
  );
}
