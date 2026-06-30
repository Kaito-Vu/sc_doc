import {
  usePageHistoryListQuery,
  prefetchPageHistory,
} from "@/features/page-history/queries/page-history-query";
import HistoryItem from "@/features/page-history/components/history-item";
import {
  activeHistoryIdAtom,
  activeHistoryPrevIdAtom,
  comparePickModeAtom,
  CURRENT_VERSION_ID,
  historyAtoms,
  viewOnlyModeAtom,
} from "@/features/page-history/atoms/history-atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Button,
  ScrollArea,
  Group,
  Divider,
  Loader,
  Center,
  Alert,
  Text,
} from "@mantine/core";
import { IconArrowsExchange } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useHistoryRestore } from "@/features/page-history/hooks";
import { IPageHistory } from "@/features/page-history/types/page.types";
import { titleEditorAtom } from "@/features/editor/atoms/editor-atoms";
import classes from "./css/history.module.css";

const PREFETCH_DELAY_MS = 150;

function dateGroupKey(date: Date) {
  return date.toDateString();
}

function dateGroupLabel(date: Date) {
  return date
    .toLocaleDateString(undefined, { month: "long", day: "numeric" })
    .toUpperCase();
}

interface Props {
  pageId: string;
}

function HistoryList({ pageId }: Props) {
  const { t } = useTranslation();
  const [activeHistoryId, setActiveHistoryId] = useAtom(activeHistoryIdAtom);
  const setActiveHistoryPrevId = useSetAtom(activeHistoryPrevIdAtom);
  const setHistoryModalOpen = useSetAtom(historyAtoms);
  const setViewOnly = useSetAtom(viewOnlyModeAtom);
  const [comparePickMode, setComparePickMode] = useAtom(comparePickModeAtom);
  const mainEditorTitle = useAtomValue(titleEditorAtom);

  const {
    data: pageHistoryData,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePageHistoryListQuery(pageId);

  const historyItems = useMemo(
    () => pageHistoryData?.pages.flatMap((page) => page.items) ?? [],
    [pageHistoryData],
  );

  const currentItem: IPageHistory = useMemo(
    () => ({
      id: CURRENT_VERSION_ID,
      pageId,
      title: mainEditorTitle?.getText?.() ?? "",
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
    }),
    [pageId, mainEditorTitle],
  );

  const displayItems = useMemo(
    () => [currentItem, ...historyItems],
    [currentItem, historyItems],
  );

  // group items by calendar day for the timeline UI; `index` here is the
  // position within `historyItems` (real revisions only, -1 = synthetic
  // Current row), preserved per-item so prev/next-diff logic keeps working
  const dateGroups = useMemo(() => {
    const groups: { key: string; label: string; items: { item: IPageHistory; index: number }[] }[] = [];
    const byKey = new Map<string, (typeof groups)[number]>();

    displayItems.forEach((item, displayIndex) => {
      const date = new Date(item.createdAt);
      const key = dateGroupKey(date);
      let group = byKey.get(key);
      if (!group) {
        group = { key, label: dateGroupLabel(date), items: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.items.push({ item, index: displayIndex - 1 });
    });

    return groups;
  }, [displayItems]);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { canRestore, confirmRestore } = useHistoryRestore();

  const clearPrefetchTimeout = useCallback(() => {
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
      prefetchTimeoutRef.current = null;
    }
  }, []);

  const handleHover = useCallback(
    (historyId: string, index: number) => {
      if (historyId === CURRENT_VERSION_ID) return;
      clearPrefetchTimeout();
      prefetchTimeoutRef.current = setTimeout(() => {
        prefetchPageHistory(historyId);
        const prevId = historyItems[index + 1]?.id;
        if (prevId) {
          prefetchPageHistory(prevId);
        }
      }, PREFETCH_DELAY_MS);
    },
    [clearPrefetchTimeout, historyItems],
  );

  useEffect(() => {
    return clearPrefetchTimeout;
  }, [clearPrefetchTimeout]);

  // index here refers to the position within `historyItems` (real revisions
  // only); -1 means the synthetic "Current" item was clicked
  const handleSelect = useCallback(
    (id: string, index: number) => {
      if (comparePickMode) {
        setActiveHistoryPrevId(id);
        setComparePickMode(false);
        setViewOnly(false);
        return;
      }

      setActiveHistoryId(id);
      setViewOnly(false);
      if (id === CURRENT_VERSION_ID) {
        setActiveHistoryPrevId(historyItems[0]?.id ?? "");
      } else {
        setActiveHistoryPrevId(historyItems[index + 1]?.id ?? "");
      }
    },
    [
      comparePickMode,
      historyItems,
      setActiveHistoryId,
      setActiveHistoryPrevId,
      setComparePickMode,
      setViewOnly,
    ],
  );

  const handleView = useCallback(
    (id: string) => {
      setActiveHistoryId(id);
      setActiveHistoryPrevId("");
      setViewOnly(true);
      setComparePickMode(false);
    },
    [setActiveHistoryId, setActiveHistoryPrevId, setComparePickMode, setViewOnly],
  );

  const handleCompareWithCurrent = useCallback(
    (id: string) => {
      setActiveHistoryId(id);
      setActiveHistoryPrevId(CURRENT_VERSION_ID);
      setViewOnly(false);
      setComparePickMode(false);
    },
    [setActiveHistoryId, setActiveHistoryPrevId, setComparePickMode, setViewOnly],
  );

  const handleStartComparePick = useCallback(
    (id: string) => {
      setActiveHistoryId(id);
      setViewOnly(false);
      setComparePickMode(true);
    },
    [setActiveHistoryId, setComparePickMode, setViewOnly],
  );

  useEffect(() => {
    if (historyItems.length > 0 && !activeHistoryId) {
      setActiveHistoryId(historyItems[0].id);
      setActiveHistoryPrevId(historyItems[1]?.id ?? "");
    }
  }, [
    historyItems,
    activeHistoryId,
    setActiveHistoryId,
    setActiveHistoryPrevId,
  ]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading) {
    return <></>;
  }

  if (isError) {
    return <div>{t("Error loading page history.")}</div>;
  }

  return (
    <div>
      {comparePickMode && (
        <Alert
          icon={<IconArrowsExchange size={16} />}
          color="blue"
          variant="light"
          mb="xs"
          withCloseButton
          onClose={() => setComparePickMode(false)}
          styles={{ message: { fontSize: "var(--mantine-font-size-sm)" } }}
        >
          {t("Select a revision to compare with")}
        </Alert>
      )}
      <ScrollArea h={comparePickMode ? 580 : 620} w="100%" type="scroll" scrollbarSize={5}>
        {dateGroups.map((group) => (
          <div key={group.key}>
            <Text className={classes.dateGroupLabel}>{group.label}</Text>
            {group.items.map(({ item: historyItem, index }) => (
              <HistoryItem
                key={historyItem.id}
                historyItem={historyItem}
                index={index}
                onSelect={handleSelect}
                onHover={handleHover}
                onHoverEnd={clearPrefetchTimeout}
                isActive={historyItem.id === activeHistoryId}
                canRestore={canRestore}
                onView={handleView}
                onCompareWithCurrent={handleCompareWithCurrent}
                onStartComparePick={handleStartComparePick}
                isPickSource={comparePickMode && historyItem.id === activeHistoryId}
                isPickTarget={comparePickMode && historyItem.id !== activeHistoryId}
              />
            ))}
          </div>
        ))}
        {historyItems.length === 0 && (
          <Center py="md">
            <span>{t("No page history saved yet.")}</span>
          </Center>
        )}
        {hasNextPage && <div ref={loadMoreRef} style={{ height: 1 }} />}
        {isFetchingNextPage && (
          <Center py="sm">
            <Loader size="sm" />
          </Center>
        )}
      </ScrollArea>

      {canRestore && (
        <>
          <Divider />
          <Group p="xs" wrap="nowrap">
            <Button
              variant="default"
              size="compact-md"
              onClick={() => setHistoryModalOpen(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              size="compact-md"
              disabled={activeHistoryId === CURRENT_VERSION_ID}
              onClick={confirmRestore}
            >
              {t("Restore")}
            </Button>
          </Group>
        </>
      )}
    </div>
  );
}

export default HistoryList;
