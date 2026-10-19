import {
  IconBoxMargin,
  IconBold,
  IconClipboard,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconCopy,
  IconCut,
  IconExternalLink,
  IconItalic,
  IconLayoutColumns,
  IconLayoutRows,
  IconLinkOff,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconSelectAll,
  IconSquareToggle,
  IconTableOff,
  IconTableRow,
} from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import i18n from "i18next";
import { isCellSelection, sanitizeUrl } from "@docmost/editor-ext";
import { canSplitCell, splitCellInto } from "../table-split/split-cell";
import { showAddCountPopover } from "@/ee/table-size/table-size-popover";
import { ContextMenuItem, registerContextMenuProvider } from "./registry";

const t = (k: string) => i18n.t(k);
const sz = 16;
const run = (editor: Editor, fn: (c: any) => any) => () =>
  fn(editor.chain().focus()).run();
const nativeCmd = (editor: Editor, cmd: "cut" | "copy") => () => {
  editor.view.focus();
  document.execCommand(cmd);
};

// Context menu items per context. Add/edit/remove providers freely.
registerContextMenuProvider({
  id: "link",
  order: 10,
  match: (e) => e.isActive("link"),
  items: (e) => {
    // Link marks can arrive via collab/API with any scheme: never open javascript: etc.
    const href = sanitizeUrl(e.getAttributes("link").href as string | undefined);
    return [
      {
        id: "open-link",
        label: t("Open link"),
        icon: <IconExternalLink size={sz} />,
        disabled: !href,
        onClick: () => href && window.open(href, "_blank", "noopener"),
      },
      {
        id: "copy-link",
        label: t("Copy link"),
        icon: <IconCopy size={sz} />,
        disabled: !href,
        onClick: () => href && navigator.clipboard.writeText(href),
      },
      {
        id: "remove-link",
        label: t("Remove link"),
        icon: <IconLinkOff size={sz} />,
        onClick: run(e, (c) => c.extendMarkRange("link").unsetLink()),
      },
    ];
  },
});

// Table: items change with the selection (multi-cell range vs single cell vs
// merged cell), unavailable actions are hidden rather than greyed out.
registerContextMenuProvider({
  id: "table",
  order: 20,
  match: (e) => e.isActive("table"),
  items: (e) => {
    const multi = isCellSelection(e.state.selection);
    const canMerge = e.can().mergeCells();
    const canSplit = e.can().splitCell();
    const canSplitInto = canSplitCell(e);
    const items: ContextMenuItem[] = [];
    if (canMerge)
      items.push({
        id: "merge",
        label: t("Merge cells"),
        icon: <IconBoxMargin size={sz} />,
        onClick: run(e, (c) => c.mergeCells()),
      });
    if (canSplit)
      items.push({
        id: "split",
        label: t("Split cell"),
        icon: <IconSquareToggle size={sz} />,
        onClick: run(e, (c) => c.splitCell()),
      });
    if (!multi && canSplitInto)
      items.push(
        {
          id: "split-col",
          label: t("Split cell into 2 columns"),
          icon: <IconLayoutColumns size={sz} />,
          onClick: () => splitCellInto(e, "column"),
        },
        {
          id: "split-row",
          label: t("Split cell into 2 rows"),
          icon: <IconLayoutRows size={sz} />,
          onClick: () => splitCellInto(e, "row"),
        },
      );
    items.push(
      {
        id: "toggle-header",
        label: t("Toggle header cell"),
        icon: <IconTableRow size={sz} />,
        onClick: run(e, (c) => c.toggleHeaderCell()),
      },
      {
        id: "row-above",
        label: multi ? t("Add rows above") : t("Add row above"),
        icon: <IconRowInsertTop size={sz} />,
        onClick: () => showAddCountPopover(e, "addRowBefore"),
      },
      {
        id: "row-below",
        label: multi ? t("Add rows below") : t("Add row below"),
        icon: <IconRowInsertBottom size={sz} />,
        onClick: () => showAddCountPopover(e, "addRowAfter"),
      },
      {
        id: "col-left",
        label: t("Add column before"),
        icon: <IconColumnInsertLeft size={sz} />,
        onClick: () => showAddCountPopover(e, "addColumnBefore"),
      },
      {
        id: "col-right",
        label: t("Add column after"),
        icon: <IconColumnInsertRight size={sz} />,
        onClick: () => showAddCountPopover(e, "addColumnAfter"),
      },
      {
        id: "del-row",
        label: multi ? t("Delete rows") : t("Delete row"),
        icon: <IconRowRemove size={sz} />,
        danger: true,
        onClick: run(e, (c) => c.deleteRow()),
      },
      {
        id: "del-col",
        label: multi ? t("Delete columns") : t("Delete column"),
        icon: <IconColumnRemove size={sz} />,
        danger: true,
        onClick: run(e, (c) => c.deleteColumn()),
      },
      {
        id: "del-table",
        label: t("Delete table"),
        icon: <IconTableOff size={sz} />,
        danger: true,
        onClick: run(e, (c) => c.deleteTable()),
      },
    );
    return items;
  },
});

registerContextMenuProvider({
  id: "text-selection",
  order: 30,
  match: (e) => !e.state.selection.empty,
  items: (e) => [
    {
      id: "bold",
      label: t("Bold"),
      icon: <IconBold size={sz} />,
      onClick: run(e, (c) => c.toggleBold()),
    },
    {
      id: "italic",
      label: t("Italic"),
      icon: <IconItalic size={sz} />,
      onClick: run(e, (c) => c.toggleItalic()),
    },
  ],
});

// Always-present base group.
registerContextMenuProvider({
  id: "base",
  order: 100,
  match: () => true,
  items: (e) => {
    const hasSel = !e.state.selection.empty;
    return [
      {
        id: "cut",
        label: t("Cut"),
        icon: <IconCut size={sz} />,
        disabled: !hasSel,
        onClick: nativeCmd(e, "cut"),
      },
      {
        id: "copy",
        label: t("Copy"),
        icon: <IconCopy size={sz} />,
        disabled: !hasSel,
        onClick: nativeCmd(e, "copy"),
      },
      {
        id: "paste",
        label: t("Paste"),
        icon: <IconClipboard size={sz} />,
        onClick: async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            // Paste as plain text through PM's paste pipeline (same as Ctrl+V),
            // instead of insertContent(), which would parse the text as HTML.
            const clipboardData = new DataTransfer();
            clipboardData.setData("text/plain", text);
            e.view.focus();
            e.view.pasteText(
              text,
              new ClipboardEvent("paste", { clipboardData }),
            );
          } catch {}
        },
      },
      {
        id: "select-all",
        label: t("Select all"),
        icon: <IconSelectAll size={sz} />,
        onClick: run(e, (c) => c.selectAll()),
      },
    ];
  },
});
