import {
  ActionIcon,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Switch,
  Text,
} from "@mantine/core";
import HistoryList from "@/features/page-history/components/history-list";
import classes from "./css/history.module.css";
import { useAtom, useAtomValue } from "jotai";
import {
  activeHistoryIdAtom,
  activeHistoryPrevIdAtom,
  CURRENT_VERSION_ID,
  diffCountsAtom,
  diffViewModeAtom,
  DiffViewMode,
  highlightChangesAtom,
  viewOnlyModeAtom,
} from "@/features/page-history/atoms/history-atoms";
import HistoryView from "@/features/page-history/components/history-view";
import { useRef } from "react";
import { IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useDiffNavigation,
  useHistoryItemContent,
  useHistoryReset,
} from "@/features/page-history/hooks";
import { formattedDate } from "@/lib/time";

interface Props {
  pageId: string;
}

function revisionLabel(
  id: string,
  t: (key: string) => string,
  data?: { createdAt: string; contentHash?: string },
) {
  if (id === CURRENT_VERSION_ID) return t("Current version");
  if (!data) return "";
  return `${formattedDate(new Date(data.createdAt))}${
    data.contentHash ? ` (#${data.contentHash})` : ""
  }`;
}

export default function HistoryModalBody({ pageId }: Props) {
  const { t } = useTranslation();
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  const activeHistoryId = useAtomValue(activeHistoryIdAtom);
  const activeHistoryPrevId = useAtomValue(activeHistoryPrevIdAtom);
  const viewOnly = useAtomValue(viewOnlyModeAtom);
  const [highlightChanges, setHighlightChanges] = useAtom(highlightChangesAtom);
  const [diffViewMode, setDiffViewMode] = useAtom(diffViewModeAtom);
  const diffCounts = useAtomValue(diffCountsAtom);

  const { data: activeData } = useHistoryItemContent(activeHistoryId);
  const { data: prevData } = useHistoryItemContent(activeHistoryPrevId);

  useHistoryReset(pageId);
  const { currentChangeIndex, handlePrevChange, handleNextChange } =
    useDiffNavigation(scrollViewportRef);

  const isComparing = !viewOnly && !!activeHistoryId && !!activeHistoryPrevId;

  return (
    <div className={classes.sidebarFlex}>
      <nav className={classes.sidebar}>
        <div className={classes.sidebarMain}>
          <HistoryList pageId={pageId} />
        </div>
      </nav>

      <div style={{ position: "relative", flex: 1 }}>
        {isComparing && (
          <Text
            size="xs"
            c="dimmed"
            px="xl"
            pt="sm"
            style={{ position: "sticky", top: 0, zIndex: 1 }}
          >
            {t("Comparing")}{" "}
            <b>{revisionLabel(activeHistoryPrevId, t, prevData)}</b>
            {" → "}
            <b>{revisionLabel(activeHistoryId, t, activeData)}</b>
          </Text>
        )}
        <ScrollArea
          h={650}
          w="100%"
          scrollbarSize={5}
          viewportRef={scrollViewportRef}
        >
          <div className={classes.sidebarRightSection}>
            {activeHistoryId && <HistoryView />}
          </div>
        </ScrollArea>

        {activeHistoryId && activeHistoryPrevId && (
          <Paper
            shadow="md"
            radius="xl"
            px="md"
            py="xs"
            style={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            <Group gap="md" wrap="nowrap">
              <SegmentedControl
                size="xs"
                value={diffViewMode}
                onChange={(value) => setDiffViewMode(value as DiffViewMode)}
                data={[
                  { label: t("Inline"), value: "inline" },
                  { label: t("Side by side"), value: "side-by-side" },
                ]}
              />
              <Switch
                label={t("Highlight changes")}
                checked={highlightChanges}
                onChange={(e) => setHighlightChanges(e.currentTarget.checked)}
                styles={{ label: { userSelect: "none", whiteSpace: "nowrap" } }}
              />
              {highlightChanges && diffCounts && diffCounts.total > 0 && (
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {currentChangeIndex} of {diffCounts.total}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handlePrevChange}
                  >
                    <IconChevronUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handleNextChange}
                  >
                    <IconChevronDown size={16} />
                  </ActionIcon>
                </Group>
              )}
            </Group>
          </Paper>
        )}
      </div>
    </div>
  );
}
