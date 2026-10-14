import { useEffect, useState } from "react";
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

export interface DocxOptions {
  singleFile: boolean;
  toc: boolean;
  /** Page ids in export order; empty = default tree order. */
  order: string[];
}

export const defaultDocxOptions: DocxOptions = {
  singleFile: true,
  toc: false,
  order: [],
};

interface TreeItem {
  id: string;
  title: string;
  level: number;
}

const blockEnd = (a: TreeItem[], i: number) => {
  let j = i + 1;
  while (j < a.length && a[j].level > a[i].level) j++;
  return j;
};

/** Start of the previous sibling's block, or -1 if `i` is the first child. */
const prevSibling = (a: TreeItem[], i: number) => {
  let k = i - 1;
  while (k >= 0 && a[k].level > a[i].level) k--;
  return k >= 0 && a[k].level === a[i].level ? k : -1;
};

/** Swaps item `i` (with its subtree) with the previous sibling (with its subtree). */
function moveUp(a: TreeItem[], i: number): TreeItem[] {
  const k = prevSibling(a, i);
  if (k < 0) return a;
  const end = blockEnd(a, i);
  return [
    ...a.slice(0, k),
    ...a.slice(i, end),
    ...a.slice(k, i),
    ...a.slice(end),
  ];
}

const parentOf = (a: TreeItem[], i: number) => {
  let k = i - 1;
  while (k >= 0 && a[k].level >= a[i].level) k--;
  return k;
};

/** Moves item `from` (with subtree) before/after sibling `to`; no-op unless they share a parent. */
function moveBlock(
  a: TreeItem[],
  from: number,
  to: number,
  after: boolean,
): TreeItem[] {
  if (from === to || parentOf(a, from) !== parentOf(a, to)) return a;
  const block = a.slice(from, blockEnd(a, from));
  const rest = [...a.slice(0, from), ...a.slice(blockEnd(a, from))];
  const t = rest.findIndex((x) => x.id === a[to].id);
  const at = after ? blockEnd(rest, t) : t;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

const canMoveDown = (a: TreeItem[], i: number) => {
  const end = blockEnd(a, i);
  return end < a.length && a[end].level === a[i].level;
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
  const [items, setItems] = useState<TreeItem[]>([]);
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
  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  if (!includeChildren) return null;

  const apply = (next: TreeItem[]) => {
    setItems(next);
    onChange({ ...value, order: next.map((i) => i.id) });
  };

  return (
    <>
      <Group justify="space-between" wrap="nowrap" mt="md">
        <Text size="md">{t("Subpages as")}</Text>
        <Select
          data={[
            { value: "single", label: t("Single file") },
            { value: "multiple", label: t("Multiple files (.zip)") },
          ]}
          value={value.singleFile ? "single" : "multiple"}
          onChange={(v) => onChange({ ...value, singleFile: v !== "multiple" })}
          allowDeselect={false}
          withCheckIcon={false}
          styles={{ wrapper: { maxWidth: 200 } }}
        />
      </Group>

      <Group justify="space-between" wrap="nowrap" mt="md">
        <Text size="md">{t("Table of contents")}</Text>
        <Switch
          checked={value.toc}
          onChange={(e) => onChange({ ...value, toc: e.currentTarget.checked })}
        />
      </Group>

      {items.length > 1 && (
        <>
          <Text size="md" mt="md">
            {t("Export order")}
          </Text>
          <ScrollArea.Autosize mah={220} mt={4} type="auto">
            {items.slice(1).map((item, idx) => {
              const i = idx + 1;
              const from = items.findIndex((x) => x.id === dragId);
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
                  <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                    <IconGripVertical
                      size={14}
                      style={{
                        flexShrink: 0,
                        color: "var(--mantine-color-dimmed)",
                      }}
                    />
                    <Text size="sm" truncate>
                      {item.title}
                    </Text>
                  </Group>
                  <Group gap={2} wrap="nowrap">
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
                      onClick={() => apply(moveUp(items, blockEnd(items, i)))}
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
  );
}
