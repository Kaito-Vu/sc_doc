import { useEffect } from "react";
import { useAtomValue, getDefaultStore } from "jotai";
import { useQueryClient, InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import {
  IBase,
  IBaseProperty,
  IBaseRow,
  IBaseView,
} from "@/ee/base/types/base.types";
import { selectedRowIdsAtomFamily } from "@/ee/base/atoms/base-atoms";
import { formulaRecomputeAtom } from "@/ee/base/atoms/formula-recompute-atom";
import { IPagination } from "@/lib/types";
import { invalidateBaseRows } from "@/ee/base/queries/base-row-query";
import {
  appendRow,
  hasKanbanView,
  mapRow,
  patchSingleRow,
  removeRows,
  removeSingleRows,
  updateRows,
} from "@/ee/base/queries/base-row-cache";

type BaseRowCreated = {
  operation: "base:row:created";
  pageId: string;
  row: IBaseRow;
  requestId?: string | null;
};

type BaseRowUpdated = {
  operation: "base:row:updated";
  pageId: string;
  rowId: string;
  updatedCells: Record<string, unknown>;
  requestId?: string | null;
};

type BaseRowDeleted = {
  operation: "base:row:deleted";
  pageId: string;
  rowId: string;
  requestId?: string | null;
};

type BaseRowsDeleted = {
  operation: "base:rows:deleted";
  pageId: string;
  rowIds: string[];
  requestId?: string | null;
};

type BaseRowReordered = {
  operation: "base:row:reordered";
  pageId: string;
  rowId: string;
  position: string;
  requestId?: string | null;
};

type BasePropertyEvent = {
  operation:
    | "base:property:created"
    | "base:property:updated"
    | "base:property:deleted"
    | "base:property:reordered";
  pageId: string;
  property?: IBaseProperty;
  propertyId?: string;
  requestId?: string | null;
};

type BaseViewEvent = {
  operation:
    | "base:view:created"
    | "base:view:updated"
    | "base:view:deleted";
  pageId: string;
  view?: IBaseView;
  viewId?: string;
};

type BaseRowsUpdated = {
  operation: "base:rows:updated";
  pageId: string;
  rowIds: string[];
  propertyIds: string[];
  requestId?: string | null;
};

type BaseFormulaRecomputeStarted = {
  operation: "base:formula:recompute:started";
  pageId: string;
  propertyIds: string[];
  jobId: string;
};

type BaseFormulaRecomputeCompleted = {
  operation: "base:formula:recompute:completed";
  pageId: string;
  propertyIds: string[];
  jobId: string;
  processed: number;
  errored: number;
};

type BaseSchemaBumped = {
  operation: "base:schema:bumped";
  pageId: string;
  schemaVersion: number;
};

type BaseSubscribed = {
  operation: "base:subscribed";
  pageId: string;
  schemaVersion: number;
};

type BaseInboundEvent =
  | BaseRowCreated
  | BaseRowUpdated
  | BaseRowDeleted
  | BaseRowsDeleted
  | BaseRowReordered
  | BaseRowsUpdated
  | BaseFormulaRecomputeStarted
  | BaseFormulaRecomputeCompleted
  | BaseSchemaBumped
  | BaseSubscribed
  | BasePropertyEvent
  | BaseViewEvent
  | { operation: string; pageId: string };

// Module-level set of requestIds we've just sent. When the socket echoes back
// a mutation with a matching requestId we drop it, as the local mutation
// already updated the cache. Bounded to prevent unbounded growth on long tabs.
const outboundRequestIds = new Set<string>();
const OUTBOUND_MAX = 256;

export function markRequestIdOutbound(requestId: string): void {
  outboundRequestIds.add(requestId);
  if (outboundRequestIds.size > OUTBOUND_MAX) {
    const oldest = outboundRequestIds.values().next().value;
    if (oldest) outboundRequestIds.delete(oldest);
  }
}

function pruneSelection(pageId: string, rowIds: string[]) {
  const store = getDefaultStore();
  const atom = selectedRowIdsAtomFamily(pageId);
  const current = store.get(atom);
  if (!rowIds.some((id) => current.has(id))) return;
  const next = new Set(current);
  for (const id of rowIds) next.delete(id);
  store.set(atom, next);
}

function createBaseEventHandler(
  pageId: string,
  queryClient: QueryClient,
): (raw: unknown) => void {
  return (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const event = raw as BaseInboundEvent;
    if (event.pageId !== pageId) return;

    const requestId = (event as any).requestId as string | undefined;
    if (requestId && outboundRequestIds.has(requestId)) {
      outboundRequestIds.delete(requestId);
      return;
    }

    // Kanban views group server-side, so a local patch can misplace rows: refetch instead.
    const applyUnlessKanban = (fn: Parameters<typeof updateRows>[2]) =>
      hasKanbanView(queryClient, pageId)
        ? invalidateBaseRows(pageId)
        : updateRows(queryClient, pageId, fn);

    switch (event.operation) {
      case "base:row:created": {
        const e = event as BaseRowCreated;
        applyUnlessKanban(appendRow(e.row));
        break;
      }
      case "base:row:updated": {
        const e = event as BaseRowUpdated;
        applyUnlessKanban(
          mapRow(e.rowId, (row) => ({
            ...row,
            cells: { ...row.cells, ...e.updatedCells },
          })),
        );
        break;
      }
      case "base:row:deleted": {
        const e = event as BaseRowDeleted;
        updateRows(queryClient, pageId, removeRows([e.rowId]));
        removeSingleRows(queryClient, pageId, [e.rowId]);
        pruneSelection(pageId, [e.rowId]);
        break;
      }
      case "base:rows:deleted": {
        const e = event as BaseRowsDeleted;
        updateRows(queryClient, pageId, removeRows(e.rowIds));
        removeSingleRows(queryClient, pageId, e.rowIds);
        pruneSelection(pageId, e.rowIds);
        break;
      }
      case "base:row:reordered": {
        const e = event as BaseRowReordered;
        const withPosition = (row: IBaseRow): IBaseRow => ({
          ...row,
          position: e.position,
        });
        applyUnlessKanban(mapRow(e.rowId, withPosition));
        patchSingleRow(queryClient, pageId, e.rowId, withPosition);
        break;
      }
      case "base:rows:updated": {
        const e = event as BaseRowsUpdated;
        // Only refetch if the batch touches rows currently in cache; formula
        // backfills emit one event per 500 rows so this avoids redundant fetches.
        const updatedIds = new Set(e.rowIds);
        const caches = queryClient.getQueriesData<
          InfiniteData<IPagination<IBaseRow>>
        >({ queryKey: ["base-rows", pageId] });
        let touchesCache = false;
        outer: for (const [, data] of caches) {
          if (!data) continue;
          for (const page of data.pages) {
            for (const row of page.items) {
              if (updatedIds.has(row.id)) {
                touchesCache = true;
                break outer;
              }
            }
          }
        }
        if (touchesCache) {
          queryClient.invalidateQueries({ queryKey: ["base-rows", pageId] });
        }
        break;
      }
      case "base:schema:bumped": {
        // Worker committed a type conversion or cell GC; re-fetch under the new schema.
        queryClient.invalidateQueries({ queryKey: ["base-rows", pageId] });
        queryClient.invalidateQueries({ queryKey: ["bases", pageId] });
        break;
      }
      case "base:subscribed": {
        const e = event as BaseSubscribed;
        const cached = queryClient.getQueryData<IBase>(["bases", pageId]);
        if (cached && cached.baseSchemaVersion !== e.schemaVersion) {
          queryClient.invalidateQueries({ queryKey: ["base-rows", pageId] });
          queryClient.invalidateQueries({ queryKey: ["bases", pageId] });
        }
        break;
      }
      case "base:formula:recompute:started": {
        const e = event as BaseFormulaRecomputeStarted;
        const store = getDefaultStore();
        store.set(formulaRecomputeAtom, {
          ...store.get(formulaRecomputeAtom),
          [e.jobId]: e.propertyIds,
        });
        break;
      }
      case "base:formula:recompute:completed": {
        const e = event as BaseFormulaRecomputeCompleted;
        const store = getDefaultStore();
        const current = store.get(formulaRecomputeAtom);
        if (e.jobId in current) {
          const next = { ...current };
          delete next[e.jobId];
          store.set(formulaRecomputeAtom, next);
        }
        break;
      }
      case "base:property:created":
      case "base:property:updated":
      case "base:property:deleted":
      case "base:property:reordered":
      case "base:view:created":
      case "base:view:updated":
      case "base:view:deleted": {
        // Schema/metadata events only affect properties/views, not cell data.
        queryClient.invalidateQueries({ queryKey: ["bases", pageId] });
        break;
      }
      default:
        break;
    }
  };
}

type BaseSubscription = {
  count: number;
  handler: (raw: unknown) => void;
};

const baseSubscriptions = new WeakMap<Socket, Map<string, BaseSubscription>>();

// One room subscription and cache handler per base, shared by every mounted view.
export function retainBaseSubscription(
  socket: Socket,
  pageId: string,
  queryClient: QueryClient,
): () => void {
  const subscriptions =
    baseSubscriptions.get(socket) ?? new Map<string, BaseSubscription>();
  baseSubscriptions.set(socket, subscriptions);

  let subscription = subscriptions.get(pageId);
  if (!subscription) {
    subscription = {
      count: 0,
      handler: createBaseEventHandler(pageId, queryClient),
    };
    subscriptions.set(pageId, subscription);
    socket.on("message", subscription.handler);
    socket.emit("message", { operation: "base:subscribe", pageId });
  }
  subscription.count += 1;

  const retained = subscription;
  return () => {
    retained.count -= 1;
    if (retained.count > 0) return;
    subscriptions.delete(pageId);
    socket.off("message", retained.handler);
    socket.emit("message", { operation: "base:unsubscribe", pageId });
  };
}

// Realtime bridge for a base: reconciles React Query caches on inbound events.
export function useBaseSocket(pageId: string | undefined): void {
  const socket = useAtomValue(socketAtom);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !pageId) return;
    return retainBaseSubscription(socket, pageId, queryClient);
  }, [socket, pageId, queryClient]);
}
