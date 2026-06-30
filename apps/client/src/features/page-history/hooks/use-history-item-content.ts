import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
  pageEditorAtom,
  titleEditorAtom,
} from "@/features/editor/atoms/editor-atoms";
import { usePageHistoryQuery } from "@/features/page-history/queries/page-history-query";
import { CURRENT_VERSION_ID } from "@/features/page-history/atoms/history-atoms";
import { IPageHistory } from "@/features/page-history/types/page.types";

// Resolves a history list item id to its content. Real ids hit the
// page-history API; the synthetic CURRENT_VERSION_ID id is resolved from
// the live editor instead, since the live page is never a `page_history` row.
export function useHistoryItemContent(historyId: string) {
  const isCurrent = historyId === CURRENT_VERSION_ID;
  const mainEditor = useAtomValue(pageEditorAtom);
  const mainEditorTitle = useAtomValue(titleEditorAtom);

  const query = usePageHistoryQuery(isCurrent ? "" : historyId);

  const currentData: IPageHistory | undefined = useMemo(() => {
    if (!isCurrent || !mainEditor || mainEditor.isDestroyed) return undefined;
    return {
      id: CURRENT_VERSION_ID,
      pageId: "",
      title: mainEditorTitle?.getText?.() ?? "",
      content: mainEditor.getJSON(),
      slug: "",
      icon: "",
      coverPhoto: "",
      version: null as unknown as number,
      lastUpdatedById: "",
      workspaceId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUpdatedBy: null as unknown as IPageHistory["lastUpdatedBy"],
      isCurrent: true,
    };
  }, [isCurrent, mainEditor, mainEditorTitle]);

  if (isCurrent) {
    return {
      data: currentData,
      isLoading: false,
      isError: !currentData,
    };
  }

  return query;
}
