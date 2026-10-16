// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { CellSelection } from "@tiptap/pm/tables";
import { TableCellLists } from "./table-cell-lists";

const cell = (t: string) => ({ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

function setup() {
  const editor = new Editor({
    extensions: [StarterKit, Table, TableRow, TableCell, TableHeader, TableCellLists],
    content: { type: "doc", content: [{ type: "table", content: [
      { type: "tableRow", content: [cell("a"), cell("b")] },
      { type: "tableRow", content: [cell("c"), cell("d")] },
    ] }] },
  });
  const positions: number[] = [];
  editor.state.doc.descendants((n, pos) => { if (n.type.name === "tableCell") positions.push(pos); });
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, positions[0], positions[3])));
  return editor;
}
const firstTypes = (e: Editor) => {
  const out: string[] = [];
  e.state.doc.descendants((n) => { if (n.type.name === "tableCell") out.push(n.firstChild!.type.name); });
  return out;
};

describe("table cell lists", () => {
  it.each([["toggleBulletList", "bulletList"], ["toggleOrderedList", "orderedList"]])("%s applies to all selected cells and toggles off", (cmd, node) => {
    const e = setup();
    (e.commands as any)[cmd]();
    expect(firstTypes(e)).toEqual([node, node, node, node]);
    expect(e.state.selection).toBeInstanceOf(CellSelection);
    (e.commands as any)[cmd]();
    expect(firstTypes(e)).toEqual(["paragraph", "paragraph", "paragraph", "paragraph"]);
  });
});
