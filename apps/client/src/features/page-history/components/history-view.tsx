import { HistoryEditor } from "@/features/page-history/components/history-editor";
import { HistoryEditorSideBySide } from "@/features/page-history/components/history-editor-side-by-side";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  activeHistoryIdAtom,
  activeHistoryPrevIdAtom,
  diffViewModeAtom,
  viewOnlyModeAtom,
} from "@/features/page-history/atoms/history-atoms";
import { useHistoryItemContent } from "@/features/page-history/hooks";

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
          title={data.title}
          previousContent={prevData.content}
          previousTitle={prevData.title}
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
