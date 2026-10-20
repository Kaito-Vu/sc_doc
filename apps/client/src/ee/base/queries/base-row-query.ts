import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  InfiniteData,
} from "@tanstack/react-query";
import {
  createRow,
  updateRow,
  deleteRow,
  deleteRows,
  getRowInfo,
  listRows,
  reorderRow,
  IBaseRowsPage,
} from "@/ee/base/services/base-service";
import {
  IBase,
  IBaseRow,
  CreateRowInput,
  UpdateRowInput,
  DeleteRowInput,
  DeleteRowsInput,
  ReorderRowInput,
  FilterNode,
  ViewSortConfig,
  RowReferences,
  NO_VALUE_CHOICE_ID,
} from "@/ee/base/types/base.types";
import { notifications } from "@mantine/notifications";
import { queryClient } from "@/main";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error";
import { useHydrateReferences } from "@/ee/base/reference/reference-store";
import { markRequestIdOutbound } from "@/ee/base/hooks/use-base-socket";
import { v7 as uuid7 } from "uuid";
import {
  RowsData,
  RowsSnapshots,
  appendRow,
  hasKanbanView,
  mapRow,
  patchRowsCache,
  patchSingleRow,
  removeRows,
  removeSingleRows,
  rollbackRows,
  updateRows,
} from "@/ee/base/queries/base-row-cache";

type RowCacheContext = { snapshots: RowsSnapshots };

function showError(error: unknown, fallback: string) {
  notifications.show({ message: getApiErrorMessage(error, fallback), color: "red" });
}

// An empty group filter is the draft-layer's "no predicates" marker (see use-view-draft.ts).
// Strip it at the query boundary to keep request payloads clean and cache keys stable.
export function normalizeFilter(filter: FilterNode | undefined): FilterNode | undefined {
  if (!filter) return undefined;
  if ('children' in filter && filter.children.length === 0) return undefined;
  return filter;
}

// Pre-register the requestId as outbound so the socket echo is suppressed by useBaseSocket.
function newRequestId(): string {
  const id = uuid7();
  markRequestIdOutbound(id);
  return id;
}

export function baseRowsQueryKey(
  pageId: string | undefined,
  filter: FilterNode | undefined,
  sorts: ViewSortConfig[] | undefined,
) {
  return [
    "base-rows",
    pageId,
    normalizeFilter(filter),
    sorts?.length ? sorts : undefined,
  ] as const;
}


export function findRowInInfinite(
  data: InfiniteData<IBaseRowsPage> | undefined,
  rowId: string,
): IBaseRow | undefined {
  if (!data) return undefined;
  for (const page of data.pages) {
    const row = page.items.find((r) => r.id === rowId);
    if (row) return row;
  }
  return undefined;
}

export function useBaseRowsQuery(
  pageId: string | undefined,
  filter?: FilterNode,
  sorts?: ViewSortConfig[],
) {
  const activeFilter = normalizeFilter(filter);
  const activeSorts = sorts?.length ? sorts : undefined;

  const query = useInfiniteQuery({
    queryKey: baseRowsQueryKey(pageId, filter, sorts),
    queryFn: ({ pageParam }) =>
      listRows(pageId!, {
        cursor: pageParam,
        limit: 100,
        filter: activeFilter,
        sorts: activeSorts,
      }),
    enabled: !!pageId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: IBaseRowsPage) =>
      lastPage.meta?.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
  });

  const refPages = useMemo(
    () =>
      (query.data?.pages ?? [])
        .map((p) => p.references)
        .filter(Boolean) as RowReferences[],
    [query.data],
  );
  useHydrateReferences(pageId, refPages);

  return query;
}

export function flattenRows(
  data: InfiniteData<IBaseRowsPage> | undefined,
): IBaseRow[] {
  if (!data) return [];
  return data.pages.flatMap((page) => page.items);
}

export function useCreateRowMutation() {
  const { t } = useTranslation();
  return useMutation<IBaseRow, Error, CreateRowInput>({
    mutationFn: (data) => createRow({ ...data, requestId: newRequestId() }),
    onSuccess: (newRow) => {
      updateRows(queryClient, newRow.pageId, appendRow(newRow));
      if (hasKanbanView(queryClient, newRow.pageId)) {
        queryClient.invalidateQueries({
          queryKey: ["base-rows", newRow.pageId],
          refetchType: "none",
        });
      }
    },
    onError: (error) => showError(error, t("Failed to create row")),
  });
}

/** Single row by id — for deep links (?row=) pointing outside the loaded
 *  pages or the active view's filter. No retry: an error means the row is
 *  gone and the caller should close. */
export function useBaseRowQuery(
  pageId: string | undefined,
  rowId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<IBaseRow, Error>({
    queryKey: ["base-row", pageId, rowId],
    queryFn: () => getRowInfo(rowId!, pageId!),
    enabled: !!pageId && !!rowId && (options?.enabled ?? true),
    retry: false,
  });
}

export function useUpdateRowMutation() {
  const { t } = useTranslation();
  return useMutation<IBaseRow, Error, UpdateRowInput, RowCacheContext>({
    mutationFn: (data) => updateRow({ ...data, requestId: newRequestId() }),
    onMutate: async (variables) => {
      const snapshots = await patchRowsCache(
        queryClient,
        variables.pageId,
        mapRow(variables.rowId, (row) => ({
          ...row,
          cells: { ...row.cells, ...variables.cells },
          ...(variables.position !== undefined && {
            position: variables.position,
          }),
        })),
      );
      patchSingleRow(queryClient, variables.pageId, variables.rowId, (old) => ({
        ...old,
        cells: { ...old.cells, ...variables.cells },
      }));
      return { snapshots };
    },
    onError: (error, variables, context) => {
      rollbackRows(queryClient, context?.snapshots);
      queryClient.invalidateQueries({
        queryKey: ["base-row", variables.pageId, variables.rowId],
      });
      showError(error, t("Failed to update row"));
    },
    onSuccess: (updatedRow, variables) => {
      const merge = (row: IBaseRow): IBaseRow => ({
        ...row,
        ...updatedRow,
        cells: { ...row.cells, ...updatedRow.cells },
      });
      updateRows(queryClient, updatedRow.pageId, mapRow(updatedRow.id, merge));
      patchSingleRow(queryClient, updatedRow.pageId, updatedRow.id, merge);

      const base = queryClient.getQueryData<IBase>(["bases", variables.pageId]);
      const kanbanGroupByIds = new Set(
        (base?.views ?? [])
          .filter((v) => v.type === "kanban")
          .map((v) => v.config?.groupByPropertyId)
          .filter(Boolean) as string[],
      );
      const changedPropertyIds = Object.keys(variables.cells ?? {});
      if (changedPropertyIds.some((id) => kanbanGroupByIds.has(id))) {
        invalidateBaseRows(variables.pageId);
      }
    },
  });
}

export function useDeleteRowMutation() {
  const { t } = useTranslation();
  return useMutation<void, Error, DeleteRowInput, RowCacheContext>({
    mutationFn: (data) => deleteRow({ ...data, requestId: newRequestId() }),
    onMutate: async (variables) => ({
      snapshots: await patchRowsCache(
        queryClient,
        variables.pageId,
        removeRows([variables.rowId]),
      ),
    }),
    onError: (error, _, context) => {
      rollbackRows(queryClient, context?.snapshots);
      showError(error, t("Failed to delete row"));
    },
    // Consistency fix: drop the deep-link single-row entry once the delete is confirmed.
    onSuccess: (_, variables) =>
      removeSingleRows(queryClient, variables.pageId, [variables.rowId]),
  });
}

export function useDeleteRowsMutation() {
  const { t } = useTranslation();
  return useMutation<void, Error, DeleteRowsInput, RowCacheContext>({
    mutationFn: (data) => deleteRows({ ...data, requestId: newRequestId() }),
    onMutate: async (variables) => ({
      snapshots: await patchRowsCache(
        queryClient,
        variables.pageId,
        removeRows(variables.rowIds),
      ),
    }),
    onError: (error, _, context) => {
      rollbackRows(queryClient, context?.snapshots);
      showError(error, t("Failed to delete rows"));
    },
    onSuccess: (_, variables) =>
      removeSingleRows(queryClient, variables.pageId, variables.rowIds),
  });
}

export function useReorderRowMutation() {
  const { t } = useTranslation();
  return useMutation<void, Error, ReorderRowInput, RowCacheContext>({
    mutationFn: (data) => reorderRow({ ...data, requestId: newRequestId() }),
    onMutate: async (variables) => {
      const withPosition = (row: IBaseRow): IBaseRow => ({
        ...row,
        position: variables.position,
      });
      const snapshots = await patchRowsCache(
        queryClient,
        variables.pageId,
        mapRow(variables.rowId, withPosition),
      );
      patchSingleRow(queryClient, variables.pageId, variables.rowId, withPosition);
      return { snapshots };
    },
    onError: (error, variables, context) => {
      rollbackRows(queryClient, context?.snapshots);
      queryClient.invalidateQueries({
        queryKey: ["base-row", variables.pageId, variables.rowId],
      });
      showError(error, t("Failed to reorder row"));
    },
  });
}

type KanbanMoveCardInput = {
  pageId: string;
  rowId: string;
  sourceColumnFilter: FilterNode | undefined;
  destColumnFilter: FilterNode | undefined;
  columnChanged: boolean;
  groupByPropertyId: string;
  destChoiceValue: string | null;
  position: string;
};

type KanbanMoveCardContext = {
  snapshots: [readonly unknown[], unknown][];
};

export function useKanbanMoveCardMutation() {
  const { t } = useTranslation();
  return useMutation<IBaseRow, Error, KanbanMoveCardInput, KanbanMoveCardContext>({
    mutationFn: ({ pageId, rowId, columnChanged, groupByPropertyId, destChoiceValue, position }) =>
      updateRow({
        pageId,
        rowId,
        cells: columnChanged ? { [groupByPropertyId]: destChoiceValue } : {},
        position,
        requestId: newRequestId(),
      }),
    onMutate: async (variables) => {
      const { pageId, rowId, sourceColumnFilter, destColumnFilter, columnChanged, groupByPropertyId, destChoiceValue, position } = variables;

      await queryClient.cancelQueries({ queryKey: ["base-rows", pageId] });

      const sourceKey = baseRowsQueryKey(pageId, sourceColumnFilter, undefined);
      const destKey = baseRowsQueryKey(pageId, destColumnFilter, undefined);

      const sourceSnapshot = queryClient.getQueryData<InfiniteData<IBaseRowsPage>>(sourceKey);
      const destSnapshot = queryClient.getQueryData<InfiniteData<IBaseRowsPage>>(destKey);
      const snapshots: KanbanMoveCardContext["snapshots"] = [
        [sourceKey, sourceSnapshot],
        [destKey, destSnapshot],
      ];

      if (columnChanged) {
        queryClient.setQueryData<RowsData>(sourceKey, removeRows([rowId]));

        const movingRow = findRowInInfinite(sourceSnapshot, rowId);
        if (movingRow) {
          const moved: IBaseRow = {
            ...movingRow,
            cells: { ...movingRow.cells, [groupByPropertyId]: destChoiceValue },
            position,
          };
          queryClient.setQueryData<RowsData>(destKey, appendRow(moved));
        }

      } else {
        queryClient.setQueryData<RowsData>(
          destKey,
          mapRow(rowId, (r) => ({ ...r, position })),
        );
      }

      return { snapshots };
    },
    onError: (error, __, context) => {
      rollbackRows(queryClient, context?.snapshots);
      showError(error, t("Failed to move card"));
    },
  });
}

type KanbanCreateCardInput = {
  pageId: string;
  destColumnFilter: FilterNode | undefined;
  groupByPropertyId: string;
  columnKey: string;
  position?: string;
};

export function useKanbanCreateCardMutation() {
  const { t } = useTranslation();
  return useMutation<IBaseRow, Error, KanbanCreateCardInput>({
    mutationFn: ({ pageId, groupByPropertyId, columnKey, position }) =>
      createRow({
        pageId,
        cells: columnKey === NO_VALUE_CHOICE_ID ? {} : { [groupByPropertyId]: columnKey },
        position,
        requestId: newRequestId(),
      }),
    onSuccess: (newRow, variables) => {
      const { pageId, destColumnFilter } = variables;
      const destKey = baseRowsQueryKey(pageId, destColumnFilter, undefined);
      queryClient.setQueryData<RowsData>(destKey, appendRow(newRow));
      queryClient.setQueryData<IBaseRow>(
        ["base-row", newRow.pageId, newRow.id],
        newRow,
      );
    },
    onError: (error) => showError(error, t("Failed to add card")),
  });
}

export function invalidateBaseRows(pageId: string) {
  queryClient.invalidateQueries({ queryKey: ["base-rows", pageId] });
}
