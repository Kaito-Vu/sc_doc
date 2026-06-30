import { useAtom } from "jotai";
import { useEffect } from "react";
import {
  activeHistoryIdAtom,
  activeHistoryPrevIdAtom,
  compareModeAtom,
  compareSelectionAtom,
  diffCountsAtom,
  viewOnlyModeAtom,
} from "@/features/page-history/atoms/history-atoms";

/**
 * Resets history state when pageId changes.
 * Clears active selection and diff counts.
 */
export function useHistoryReset(pageId: string) {
  const [, setActiveHistoryId] = useAtom(activeHistoryIdAtom);
  const [, setActiveHistoryPrevId] = useAtom(activeHistoryPrevIdAtom);
  const [, setDiffCounts] = useAtom(diffCountsAtom);
  const [, setViewOnly] = useAtom(viewOnlyModeAtom);
  const [, setCompareMode] = useAtom(compareModeAtom);
  const [, setCompareSelection] = useAtom(compareSelectionAtom);

  useEffect(() => {
    setActiveHistoryId("");
    setActiveHistoryPrevId("");
    setViewOnly(false);
    setCompareMode(false);
    setCompareSelection([]);
    // @ts-ignore
    setDiffCounts(null);
  }, [
    pageId,
    setActiveHistoryId,
    setActiveHistoryPrevId,
    setDiffCounts,
    setViewOnly,
    setCompareMode,
    setCompareSelection,
  ]);
}
