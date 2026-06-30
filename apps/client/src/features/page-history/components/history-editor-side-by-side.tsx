import "@/features/editor/styles/index.css";
import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { mainExtensions } from "@/features/editor/extensions/extensions";
import { Badge, Group, Divider, Text } from "@mantine/core";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import historyClasses from "./css/history.module.css";
import { recreateTransform } from "@docmost/editor-ext";
import { Node } from "@tiptap/pm/model";
import { ChangeSet, simplifyChanges } from "@tiptap/pm/changeset";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  diffCountsAtom,
  highlightChangesAtom,
} from "@/features/page-history/atoms/history-atoms";

export interface HistoryEditorSideBySideProps {
  content: any;
  previousContent: any;
  /** human-readable label for the new/right side, e.g. "Jun 27, 11:27AM (#efcbb05d)" or "Current version" */
  rightLabel: string;
  /** human-readable label for the old/left side */
  leftLabel: string;
}

// Renders the same diff as HistoryEditor, but as two read-only panes instead
// of one merged document: the left pane is the old revision with deletions
// highlighted in place, the right pane is the new revision with additions
// highlighted in place. Reuses the same recreateTransform()/ChangeSet diff
// computation as the inline view — only how the changes are decorated differs.
export function HistoryEditorSideBySide({
  content,
  previousContent,
  rightLabel,
  leftLabel,
}: Readonly<HistoryEditorSideBySideProps>) {
  const { t } = useTranslation();
  const [highlightChanges] = useAtom(highlightChangesAtom);
  const [, setDiffCounts] = useAtom(diffCountsAtom);

  const leftEditor = useEditor({ extensions: mainExtensions, editable: false });
  const rightEditor = useEditor({ extensions: mainExtensions, editable: false });

  useEffect(() => {
    if (
      !leftEditor ||
      leftEditor.isDestroyed ||
      !rightEditor ||
      rightEditor.isDestroyed ||
      !content ||
      !previousContent
    ) {
      return;
    }

    let leftDecorationSet = DecorationSet.empty;
    let rightDecorationSet = DecorationSet.empty;
    let addedCount = 0;
    let deletedCount = 0;

    try {
      const schema = leftEditor.schema;
      const oldContent = Node.fromJSON(schema, previousContent);
      const newContent = Node.fromJSON(schema, content);

      const tr = recreateTransform(oldContent, newContent, {
        complexSteps: false,
        wordDiffs: true,
        simplifyDiff: true,
      });

      const changeSet = ChangeSet.create(oldContent).addSteps(
        tr.doc,
        tr.mapping.maps,
        [],
      );
      const changes = simplifyChanges(changeSet.changes, newContent);

      leftEditor.commands.setContent(previousContent);
      rightEditor.commands.setContent(content);

      const leftDecorations: Decoration[] = [];
      const rightDecorations: Decoration[] = [];
      let changeIndex = 0;

      for (const change of changes) {
        if (change.toB > change.fromB) {
          changeIndex++;
          rightDecorations.push(
            Decoration.inline(change.fromB, change.toB, {
              class: "history-diff-added",
              "data-diff-index": String(changeIndex),
            }),
          );
          addedCount += 1;
        }
        if (change.toA > change.fromA) {
          changeIndex++;
          leftDecorations.push(
            Decoration.inline(change.fromA, change.toA, {
              class: "history-diff-removed-side",
              "data-diff-index": String(changeIndex),
            }),
          );
          deletedCount += 1;
        }
      }

      leftDecorationSet = DecorationSet.create(oldContent, leftDecorations);
      rightDecorationSet = DecorationSet.create(newContent, rightDecorations);
    } catch (e) {
      console.error("Side-by-side history diff failed:", e);
      leftEditor.commands.setContent(previousContent);
      rightEditor.commands.setContent(content);
    }

    const total = addedCount + deletedCount;
    // @ts-ignore
    setDiffCounts({ added: addedCount, deleted: deletedCount, total });

    leftEditor.setOptions({
      editorProps: {
        ...leftEditor.options.editorProps,
        decorations: () =>
          highlightChanges ? leftDecorationSet : DecorationSet.empty,
      },
    });
    rightEditor.setOptions({
      editorProps: {
        ...rightEditor.options.editorProps,
        decorations: () =>
          highlightChanges ? rightDecorationSet : DecorationSet.empty,
      },
    });
  }, [
    rightLabel,
    leftLabel,
    content,
    previousContent,
    leftEditor,
    rightEditor,
    highlightChanges,
    setDiffCounts,
  ]);

  return (
    <Group align="flex-start" wrap="nowrap" gap="md" style={{ width: "100%" }}>
      <div className={historyClasses.sideBySidePane}>
        <div className={historyClasses.sideBySideHeader}>
          <Badge color="red" variant="filled" size="sm" radius="sm">
            {t("OLD")}
          </Badge>
          <Text size="sm" fw={500} truncate>
            {leftLabel}
          </Text>
        </div>
        {leftEditor && (
          <EditorContent
            editor={leftEditor}
            className={historyClasses.historyEditor}
          />
        )}
      </div>
      <Divider orientation="vertical" />
      <div className={historyClasses.sideBySidePane}>
        <div className={historyClasses.sideBySideHeader}>
          <Badge color="green" variant="filled" size="sm" radius="sm">
            {t("NEW")}
          </Badge>
          <Text size="sm" fw={500} truncate>
            {rightLabel}
          </Text>
        </div>
        {rightEditor && (
          <EditorContent
            editor={rightEditor}
            className={historyClasses.historyEditor}
          />
        )}
      </div>
    </Group>
  );
}
