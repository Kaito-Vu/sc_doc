import type { Editor } from "@tiptap/react";
import { CellSelection, selectionCell, TableMap } from "@tiptap/pm/tables";

/**
 * Sets the auto-number format on the selected cells, or, when no cell range is
 * selected, on every body cell of the column holding the caret (the STT use case).
 */
export function setAutoNumber(editor: Editor, format: string | null): boolean {
  const { state, view } = editor;
  const tr = state.tr;
  const mark = (pos: number) => {
    const node = tr.doc.nodeAt(pos);
    if (node?.type.name === "tableCell")
      tr.setNodeMarkup(pos, null, { ...node.attrs, autoNumber: format });
  };
  try {
    if (state.selection instanceof CellSelection) {
      state.selection.forEachCell((_n, pos) => mark(pos));
    } else {
      const $cell = selectionCell(state);
      const table = $cell.node(-1);
      const start = $cell.start(-1);
      const map = TableMap.get(table);
      const { left, right } = map.findCell($cell.pos - start);
      map
        .cellsInRect({ left, right, top: 0, bottom: map.height })
        .forEach((rel) => mark(start + rel));
    }
  } catch {
    return false; // caret not in a table
  }
  view.dispatch(tr);
  view.focus();
  return true;
}
