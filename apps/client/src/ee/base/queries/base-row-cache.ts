import { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { IBaseRowsPage } from "@/ee/base/services/base-service";
import type { IBase, IBaseRow } from "@/ee/base/types/base.types";

export type RowsData = InfiniteData<IBaseRowsPage>;
export type RowsSnapshots = [readonly unknown[], RowsData | undefined][];
type RowsUpdater = (old: RowsData | undefined) => RowsData | undefined;

const rowsKey = (pageId: string) => ["base-rows", pageId];
export const baseRowKey = (pageId: string, rowId: string) => [
  "base-row",
  pageId,
  rowId,
];

// Updater factories: pure functions over the infinite-query data.
function mapItems(fn: (items: IBaseRow[]) => IBaseRow[]): RowsUpdater {
  return (old) =>
    old
      ? { ...old, pages: old.pages.map((p) => ({ ...p, items: fn(p.items) })) }
      : old;
}

export const mapRow = (rowId: string, fn: (row: IBaseRow) => IBaseRow) =>
  mapItems((items) => items.map((r) => (r.id === rowId ? fn(r) : r)));

export const removeRows = (rowIds: string[]) => {
  const ids = new Set(rowIds);
  return mapItems((items) => items.filter((r) => !ids.has(r.id)));
};

export const appendRow = (row: IBaseRow): RowsUpdater => (old) => {
  if (!old) return old;
  const last = old.pages.length - 1;
  return {
    ...old,
    pages: old.pages.map((p, i) =>
      i === last ? { ...p, items: [...p.items, row] } : p,
    ),
  };
};

// Cache operations
export function updateRows(qc: QueryClient, pageId: string, fn: RowsUpdater) {
  qc.setQueriesData<RowsData>({ queryKey: rowsKey(pageId) }, fn);
}

/** Optimistic patch: cancel in-flight fetches, snapshot, apply. */
export async function patchRowsCache(
  qc: QueryClient,
  pageId: string,
  fn: RowsUpdater,
): Promise<RowsSnapshots> {
  await qc.cancelQueries({ queryKey: rowsKey(pageId) });
  const snapshots = qc.getQueriesData<RowsData>({ queryKey: rowsKey(pageId) });
  updateRows(qc, pageId, fn);
  return snapshots;
}

export function rollbackRows(
  qc: QueryClient,
  snapshots: [readonly unknown[], unknown][] | undefined,
) {
  for (const [key, data] of snapshots ?? []) qc.setQueryData(key, data);
}

export function hasKanbanView(qc: QueryClient, pageId: string): boolean {
  const base = qc.getQueryData<IBase>(["bases", pageId]);
  return (base?.views ?? []).some((v) => v.type === "kanban");
}

// Single-row (deep-link) cache
export function patchSingleRow(
  qc: QueryClient,
  pageId: string,
  rowId: string,
  fn: (row: IBaseRow) => IBaseRow,
) {
  qc.setQueryData<IBaseRow>(baseRowKey(pageId, rowId), (old) =>
    old ? fn(old) : old,
  );
}

export function removeSingleRows(
  qc: QueryClient,
  pageId: string,
  rowIds: string[],
) {
  for (const id of rowIds) {
    qc.removeQueries({ queryKey: baseRowKey(pageId, id), exact: true });
  }
}
