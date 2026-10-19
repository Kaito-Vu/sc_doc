import { useState } from "react";
import {
  ActionIcon,
  Group,
  ScrollArea,
  Select,
  Switch,
  Text,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client.ts";
import { TriStateCheckbox, triState } from "@/ee/components/tri-state-checkbox";
import classes from "./docx-export-options.module.css";
import {
  ancestors,
  blockEnd,
  canMoveDown,
  moveBlock,
  moveUp,
  parentOf,
  prevSibling,
  TreeItem,
} from "./docx-tree";

export interface DocxOptions {
  singleFile: boolean;
  toc: boolean;
  /** Page ids in export order; empty = default tree order. */
  order: string[];
  /** Subpage ids left out of the export. */
  exclude: string[];
}

export const defaultDocxOptions: DocxOptions = {
  singleFile: true,
  toc: false,
  order: [],
  exclude: [],
};

interface Props {
  pageId: string;
  includeChildren: boolean;
  value: DocxOptions;
  onChange: (value: DocxOptions) => void;
}

/** DOCX-only export options: single/multiple files, table of contents, subpage order. */
export function DocxExportOptions({
  pageId,
  includeChildren,
  value,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const [reordered, setReordered] = useState<TreeItem[]>();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);

  const { data } = useQuery({
    queryKey: ["docx-export-tree", pageId],
    queryFn: async () => {
      const res: any = await api.post("/docx-export/tree", { pageId });
      return res.data as TreeItem[];
    },
    enabled: includeChildren,
    staleTime: 0,
  });
  const items = reordered ?? data ?? [];

  const excluded = new Set(value.exclude);
  const setExcluded = (next: Set<string>) =>
    onChange({ ...value, exclude: [...next] });

  /** Unchecking a page drops its subpages too; checking one brings back its parents. */
  const toggle = (i: number, checked: boolean) => {
    const next = new Set(excluded);
    const ids = items.slice(i, blockEnd(items, i)).map((x) => x.id);
    if (checked) {
      ids.forEach((id) => next.delete(id));
      ancestors(items, i).forEach((k) => next.delete(items[k].id));
    } else {
      ids.forEach((id) => next.add(id));
    }
    setExcluded(next);
  };
  const subpages = items.slice(1);
  const selectedCount = subpages.filter((x) => !excluded.has(x.id)).length;

  // Index of the dragged page; computed once, not per row.
  const from = dragId ? items.findIndex((x) => x.id === dragId) : -1;

  const apply = (next: TreeItem[]) => {
    setReordered(next);
    onChange({ ...value, order: next.map((i) => i.id) });
  };

  return (
    <>
      <Group justify="space-between" wrap="nowrap" mt="sm">
        <Text size="md">{t("Table of contents")}</Text>
        <Switch
          checked={value.toc}
          onChange={(e) => onChange({ ...value, toc: e.currentTarget.checked })}
        />
      </Group>

      {includeChildren && (
        <>
          <Group justify="space-between" wrap="nowrap" mt="sm">
            <Text size="md">{t("Subpages as")}</Text>
            <Select
              data={[
                { value: "single", label: t("Single file") },
                { value: "multiple", label: t("Multiple files (.zip)") },
              ]}
              value={value.singleFile ? "single" : "multiple"}
              onChange={(v) =>
                onChange({ ...value, singleFile: v !== "multiple" })
              }
              allowDeselect={false}
              withCheckIcon={false}
              styles={{ wrapper: { maxWidth: 200 } }}
            />
          </Group>

          {items.length > 1 && (
            <>
              <Group justify="space-between" wrap="nowrap" mt="sm">
                <Text size="md">
                  {t("Subpages to export")}{" "}
                  <Text span size="sm" c="dimmed">
                    ({selectedCount}/{subpages.length})
                  </Text>
                </Text>
                <TriStateCheckbox
                  size="xs"
                  label={t("Select all")}
                  state={triState(selectedCount, subpages.length)}
                  onChange={(checked) =>
                    setExcluded(
                      checked ? new Set() : new Set(subpages.map((x) => x.id)),
                    )
                  }
                />
              </Group>
              <ScrollArea.Autosize
                className={classes.list}
                mt={4}
                type="auto"
                scrollbars="y"
              >
                {subpages.map((item, idx) => {
                  const i = idx + 1;
                  // [ ] none, [-] partly, [x] all of this page and its subpages.
                  const block = items.slice(i, blockEnd(items, i));
                  const skipped = block.filter((x) =>
                    excluded.has(x.id),
                  ).length;
                  const state = triState(block.length - skipped, block.length);
                  // Only siblings of the dragged page are valid drop targets.
                  const droppable =
                    from > 0 &&
                    from !== i &&
                    parentOf(items, from) === parentOf(items, i);
                  const edge =
                    droppable && over?.id === item.id
                      ? over.after
                        ? "borderBottom"
                        : "borderTop"
                      : undefined;
                  return (
                    <Group
                      key={item.id}
                      className={classes.row}
                      gap={4}
                      wrap="nowrap"
                      justify="space-between"
                      pl={(item.level - 2) * 16}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", item.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(item.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      onDragOver={(e) => {
                        if (!droppable) return;
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY > r.top + r.height / 2;
                        if (over?.id !== item.id || over.after !== after) {
                          setOver({ id: item.id, after });
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (droppable && over) {
                          apply(moveBlock(items, from, i, over.after));
                        }
                        setDragId(null);
                        setOver(null);
                      }}
                      style={{
                        cursor: "grab",
                        opacity: dragId === item.id ? 0.4 : 1,
                        ...(edge
                          ? {
                              [edge]:
                                "2px solid var(--mantine-primary-color-filled)",
                            }
                          : {}),
                      }}
                    >
                      <Group gap={8} wrap="nowrap" className={classes.title}>
                        <IconGripVertical
                          size={14}
                          style={{
                            flexShrink: 0,
                            color: "var(--mantine-color-dimmed)",
                          }}
                        />
                        <TriStateCheckbox
                          size="xs"
                          aria-label={item.title}
                          state={state}
                          onChange={(checked) => toggle(i, checked)}
                        />
                        <Text
                          size="sm"
                          truncate
                          title={item.title}
                          c={state === "none" ? "dimmed" : undefined}
                        >
                          {item.title}
                        </Text>
                      </Group>
                      <Group gap={2} wrap="nowrap" className={classes.actions}>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          aria-label={t("Move up")}
                          disabled={prevSibling(items, i) < 0}
                          onClick={() => apply(moveUp(items, i))}
                        >
                          <IconChevronUp size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          aria-label={t("Move down")}
                          disabled={!canMoveDown(items, i)}
                          onClick={() =>
                            apply(moveUp(items, blockEnd(items, i)))
                          }
                        >
                          <IconChevronDown size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  );
                })}
              </ScrollArea.Autosize>
            </>
          )}
        </>
      )}
    </>
  );
}
