import { HistoryEditor } from "@/features/page-history/components/history-editor";
import { HistoryEditorSideBySide } from "@/features/page-history/components/history-editor-side-by-side";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  activeHistoryIdAtom,
  activeHistoryPrevIdAtom,
  CURRENT_VERSION_ID,
  diffViewModeAtom,
  viewOnlyModeAtom,
} from "@/features/page-history/atoms/history-atoms";
import { useHistoryItemContent } from "@/features/page-history/hooks";
import { formattedDate } from "@/lib/time";
import { IPageHistory } from "@/features/page-history/types/page.types";

function revisionLabel(
  t: (key: string) => string,
  data?: Pick<IPageHistory, "createdAt" | "contentHash" | "isCurrent">,
) {
  if (!data) return "";
  if (data.isCurrent) return t("Current version");
  return `${formattedDate(new Date(data.createdAt))}${
    data.contentHash ? ` (#${data.contentHash})` : ""
  }`;
}

function HistoryView() {
  const { t } = useTranslation();
  const historyId = useAtomValue(activeHistoryIdAtom);
  const prevHistoryId = useAtomValue(activeHistoryPrevIdAtom);
  const viewOnly = useAtomValue(viewOnlyModeAtom);
  const diffViewMode = useAtomValue(diffViewModeAtom);

  const {
    data,
    isLoading: isLoadingCurrent,
    isError: isErrorCurrent,
  } = useHistoryItemContent(historyId);
  const {
    data: prevData,
    isLoading: isLoadingPrev,
    isError: isErrorPrev,
  } = useHistoryItemContent(viewOnly ? "" : prevHistoryId);

  if (isLoadingCurrent || isLoadingPrev) {
    return <></>;
  }

  if (isErrorCurrent || !data) {
    return <div>{t("Error fetching page data.")}</div>;
  }

  const hasComparison = !viewOnly && !isErrorPrev && !!prevData?.content;

  if (hasComparison && diffViewMode === "side-by-side") {
    return (
      <div>
        <HistoryEditorSideBySide
          content={data.content}
          previousContent={prevData.content}
          rightLabel={revisionLabel(t, {
            createdAt: data.createdAt,
            contentHash: data.contentHash,
            isCurrent: historyId === CURRENT_VERSION_ID,
          })}
          leftLabel={revisionLabel(t, {
            createdAt: prevData.createdAt,
            contentHash: prevData.contentHash,
            isCurrent: prevHistoryId === CURRENT_VERSION_ID,
          })}
        />
      </div>
    );
  }

  return (
    <div>
      <HistoryEditor
        content={data.content}
        title={data.title}
        previousContent={hasComparison ? prevData?.content : undefined}
      />
    </div>
  );
}

export default HistoryView;
