import type { Editor } from "@tiptap/react";
import { selectionCell, TableMap } from "@tiptap/pm/tables";

export type SplitDirection = "column" | "row";

// Native splitCell only splits merged cells. This splits a plain 1x1 cell in two
// by growing the span of every neighbouring cell that crosses the split line.
function plan(editor: Editor) {
  try {
    const $cell = selectionCell(editor.state);
    const cell = $cell.nodeAfter;
    if (!cell || cell.attrs.colspan > 1 || cell.attrs.rowspan > 1) return null;
    const table = $cell.node(-1);
    const tableStart = $cell.start(-1);
    const map = TableMap.get(table);
    const cellPos = $cell.pos - tableStart;
    return { cell, table, tableStart, map, cellPos, rect: map.findCell(cellPos) };
  } catch {
    return null;
  }
}

export const canSplitCell = (editor: Editor) => !!plan(editor);

export function splitCellInto(editor: Editor, dir: SplitDirection): boolean {
  const p = plan(editor);
  if (!p) return false;
  const { cell, table, tableStart, map, cellPos, rect } = p;
  const tr = editor.state.tr;
  const col = dir === "column";
  const covering = map.cellsInRect(
    col
      ? { left: rect.left, right: rect.right, top: 0, bottom: map.height }
      : { left: 0, right: map.width, top: rect.top, bottom: rect.bottom },
  );

  for (const pos of covering) {
    if (pos === cellPos) continue;
    const attrs = { ...table.nodeAt(pos)!.attrs };
    if (col) {
      if (attrs.colwidth) {
        const idx = rect.left - map.colCount(pos);
        const cw = [...attrs.colwidth];
        cw.splice(idx, 0, cw[idx]);
        attrs.colwidth = cw;
      }
      attrs.colspan += 1;
    } else {
      attrs.rowspan += 1;
    }
    tr.setNodeMarkup(tableStart + pos, null, attrs);
  }

  const fresh = cell.type.createAndFill({ ...cell.attrs, backgroundColor: null, backgroundColorName: null })!;
  if (col) {
    tr.insert(tableStart + cellPos + cell.nodeSize, fresh);
  } else {
    let end = 0;
    for (let i = 0; i <= rect.top; i++) end += table.child(i).nodeSize;
    tr.insert(tableStart + end, table.child(rect.top).type.create(null, fresh));
  }
  editor.view.dispatch(tr);
  editor.commands.focus();
  return true;
}
