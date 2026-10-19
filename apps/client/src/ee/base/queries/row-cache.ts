import type { InfiniteData } from "@tanstack/react-query";
import type { IBaseRow } from "@/ee/base/types/base.types";

type RowsPage = { items: IBaseRow[] };
type RowsCache<P extends RowsPage> = InfiniteData<P> | undefined;

// Pure updaters for base-row infinite caches. They keep the reference of every
// page the change does not touch (and of the whole cache when nothing matched),
// so React Query's structural sharing and downstream selectors skip the
// unchanged rows instead of re-walking thousands of cells per edit.

export function patchRowIn<P extends RowsPage>(
  rowId: string,
  patch: (row: IBaseRow) => IBaseRow,
): (old: RowsCache<P>) => RowsCache<P> {
  return (old) => {
    if (!old) return old;
    let changed = false;
    const pages = old.pages.map((page) => {
      const index = page.items.findIndex((row) => row.id === rowId);
      if (index === -1) return page;
      changed = true;
      const items = page.items.slice();
      items[index] = patch(items[index]);
      return { ...page, items };
    });
    return changed ? { ...old, pages } : old;
  };
}

export function removeRowsIn<P extends RowsPage>(
  rowIds: ReadonlySet<string>,
): (old: RowsCache<P>) => RowsCache<P> {
  return (old) => {
    if (!old) return old;
    let changed = false;
    const pages = old.pages.map((page) => {
      if (!page.items.some((row) => rowIds.has(row.id))) return page;
      changed = true;
      return {
        ...page,
        items: page.items.filter((row) => !rowIds.has(row.id)),
      };
    });
    return changed ? { ...old, pages } : old;
  };
}
