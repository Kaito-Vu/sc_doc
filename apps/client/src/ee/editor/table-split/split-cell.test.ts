// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { TableMap } from "@tiptap/pm/tables";
import { TextSelection as TS } from "@tiptap/pm/state";
import { splitCellInto } from "./split-cell";

const cell = (t: string) => ({ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

function setup() {
  const editor = new Editor({
    extensions: [StarterKit, Table, TableRow, TableCell, TableHeader],
    content: { type: "doc", content: [{ type: "table", content: [
      { type: "tableRow", content: [cell("a"), cell("b")] },
      { type: "tableRow", content: [cell("c"), cell("d")] },
    ] }] },
  });
  let pos = 0;
  editor.state.doc.descendants((n, p) => { if (n.type.name === "tableCell" && !pos) pos = p; });
  editor.view.dispatch(editor.state.tr.setSelection(TS.create(editor.state.doc, pos + 2)));
  return editor;
}
const mapOf = (e: Editor) => {
  let m!: TableMap;
  e.state.doc.descendants((n) => { if (n.type.name === "table") m = TableMap.get(n); });
  return m;
};

describe("split 1x1 cell", () => {
  it("into 2 columns", () => {
    const e = setup();
    expect(splitCellInto(e, "column")).toBe(true);
    const m = mapOf(e);
    expect([m.width, m.height]).toEqual([3, 2]);
    expect(m.problems).toBeFalsy();
  });
  it("into 2 rows", () => {
    const e = setup();
    expect(splitCellInto(e, "row")).toBe(true);
    const m = mapOf(e);
    expect([m.width, m.height]).toEqual([2, 3]);
    expect(m.problems).toBeFalsy();
  });
});
