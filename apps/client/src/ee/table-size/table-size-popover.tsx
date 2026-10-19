import { useEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { ReactRenderer, type Editor } from "@tiptap/react";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Button, Group, NumberInput, Paper } from "@mantine/core";
import { useTranslation } from "react-i18next";

const MAX = 50;

// NumberInput only clamps on blur, so Enter right after typing "999" would
// otherwise reach insertTable/addRow unclamped and freeze the editor.
const toCount = (v: number | string) =>
  Math.min(MAX, Math.max(1, Math.floor(Number(v)) || 1));

/** Escape closes and refocuses the editor; a pointerdown outside closes. */
function useDismiss(
  rootRef: RefObject<HTMLDivElement | null>,
  editor: Editor,
  close: () => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        editor.commands.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);
}

function TableSizePopover({ editor, close }: { editor: Editor; close: () => void }) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<number | string>(3);
  const [cols, setCols] = useState<number | string>(3);
  useDismiss(rootRef, editor, close);

  const insert = () => {
    close();
    editor
      .chain()
      .focus()
      .insertTable({ rows: toCount(rows), cols: toCount(cols), withHeaderRow: true })
      .run();
  };

  return (
    <Paper
      ref={rootRef}
      shadow="md"
      p="xs"
      withBorder
      onKeyDown={(e) => e.key === "Enter" && insert()}
    >
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <NumberInput
          autoFocus
          size="xs"
          w={70}
          label={t("Rows")}
          min={1}
          max={MAX}
          value={rows}
          onChange={(v) => setRows(v as number | string)}
        />
        <NumberInput
          size="xs"
          w={70}
          label={t("Columns")}
          min={1}
          max={MAX}
          value={cols}
          onChange={(v) => setCols(v as number | string)}
        />
        <Button size="xs" onClick={insert}>
          {t("Insert")}
        </Button>
      </Group>
    </Paper>
  );
}

/** Mounts a React popover anchored at the caret. */
function mountAtCaret(
  editor: Editor,
  Component: (p: { editor: Editor; close: () => void }) => ReactElement,
) {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "absolute",
    top: "0",
    left: "0",
    zIndex: "199",
  });
  document.body.appendChild(host);

  const { from } = editor.state.selection;
  const reference = {
    getBoundingClientRect: () => {
      // autoUpdate re-reads this on scroll/resize; a remote edit may have shrunk the doc.
      const c = editor.view.coordsAtPos(Math.min(from, editor.state.doc.content.size));
      return new DOMRect(c.left, c.top, 0, c.bottom - c.top);
    },
  };
  const stopAutoUpdate = autoUpdate(reference, host, () => {
    computePosition(reference, host, {
      placement: "bottom-start",
      middleware: [offset(4), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      host.style.left = `${x}px`;
      host.style.top = `${y}px`;
    });
  });

  let renderer: ReactRenderer | null = null;
  const close = () => {
    if (!renderer) return;
    renderer.destroy();
    renderer = null;
    stopAutoUpdate();
    host.remove();
    editor.off("destroy", close);
  };

  renderer = new ReactRenderer(Component, {
    editor,
    props: { editor, close },
  });
  host.appendChild(renderer.element);
  editor.on("destroy", close);
}

/** Shows a rows/columns popover at the caret; inserts the table on confirm. */
export const showTableSizePopover = (editor: Editor) => mountAtCaret(editor, TableSizePopover);

type AddCommand = "addRowBefore" | "addRowAfter" | "addColumnBefore" | "addColumnAfter";

/** Shows a count popover at the caret; adds that many rows/columns on confirm. */
export function showAddCountPopover(editor: Editor, command: AddCommand) {
  const isRow = command.startsWith("addRow");
  mountAtCaret(editor, ({ editor, close }) => {
    const { t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);
    const [count, setCount] = useState<number | string>(1);

    useDismiss(rootRef, editor, close);

    const add = () => {
      close();
      let chain = editor.chain().focus();
      for (let i = 0; i < toCount(count); i++) chain = chain[command]();
      chain.run();
    };

    useEffect(() => {
      // Mantine Menu restores focus to its trigger on close; focus after that.
      const id = setTimeout(() => rootRef.current?.querySelector("input")?.select(), 50);
      return () => clearTimeout(id);
    }, []);

    return (
      <Paper ref={rootRef} shadow="md" p="xs" withBorder onKeyDown={(e) => e.key === "Enter" && add()}>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <NumberInput
            size="xs"
            w={80}
            label={isRow ? t("Rows") : t("Columns")}
            min={1}
            max={MAX}
            value={count}
            onChange={(v) => setCount(v as number | string)}
          />
          <Button size="xs" onClick={add}>
            {t("Add")}
          </Button>
        </Group>
      </Paper>
    );
  });
}
