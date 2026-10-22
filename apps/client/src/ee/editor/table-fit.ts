import { findParentNode } from "@tiptap/core";
import type { Editor } from "@tiptap/react";

/**
 * "window": table fills the page. "content": table shrinks to its content.
 * Either way saved column widths are cleared so the new sizing takes effect.
 */
export function setTableFit(editor: Editor, mode: "window" | "content") {
  return editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const table = findParentNode((n) => n.type.name === "table")(
        state.selection,
      );
      if (!table) return false;
      tr.setNodeAttribute(table.pos, "fit", mode === "content" ? "content" : null);
      table.node.descendants((node, pos) => {
        if (node.attrs.colwidth)
          tr.setNodeAttribute(table.pos + 1 + pos, "colwidth", null);
        return !node.isTextblock;
      });
      return true;
    })
    .run();
}
