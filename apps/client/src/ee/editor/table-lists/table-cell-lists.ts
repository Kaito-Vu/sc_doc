import { Extension } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

// Bullet / numbered list toggles that apply to EVERY selected table cell when
// the selection is a CellSelection (stock commands only touch one cell).
// Registered with a low priority so these definitions win over the stock ones.
const LISTS = [
  { command: "toggleBulletList", node: "bulletList" },
  { command: "toggleOrderedList", node: "orderedList" },
] as const;

export const TableCellLists = Extension.create({
  name: "tableCellLists",
  priority: 1,

  addCommands() {
    const make = (listName: string) => () =>
      ({ state, tr, commands, dispatch }: any) => {
        const keepMarks = this.editor.extensionManager.extensions.find(
          (e) => e.name === listName,
        )?.options?.keepMarks;
        const toggle = () => commands.toggleList(listName, "listItem", keepMarks);

        const sel = state.selection;
        if (!(sel instanceof CellSelection)) return toggle();

        // Already a list in every cell -> unwrap all; otherwise wrap the rest.
        const cells: { from: number; to: number; active: boolean }[] = [];
        sel.forEachCell((cell: any, pos: number) => {
          cells.push({
            from: pos + 1,
            to: pos + cell.nodeSize - 1,
            active: cell.firstChild?.type.name === listName,
          });
        });
        const unwrapAll = cells.every((c) => c.active);
        const targets = cells.filter((c) => unwrapAll || !c.active);
        if (!dispatch) return true;

        const anchor = sel.$anchorCell.pos;
        const head = sel.$headCell.pos;
        const start = tr.steps.length;

        if (unwrapAll) {
          // Replace each cell's leading list by its text blocks (last cell
          // first so earlier positions stay valid).
          for (const c of [...targets].reverse()) {
            const list = tr.doc.nodeAt(c.from);
            if (!list) continue;
            const blocks: PMNode[] = [];
            list.descendants((n) => {
              if (n.isTextblock) blocks.push(n);
              return !n.isTextblock;
            });
            tr.replaceWith(c.from, c.from + list.nodeSize, Fragment.from(blocks));
          }
          const map = tr.mapping.slice(start);
          tr.setSelection(CellSelection.create(tr.doc, map.map(anchor), map.map(head)));
          return true;
        }

        for (const c of targets) {
          const map = tr.mapping.slice(start);
          const from = map.map(c.from);
          const to = map.map(c.to, -1);
          tr.setSelection(TextSelection.create(tr.doc, from, Math.max(from, to)));
          if (!toggle()) return false;
        }
        const map = tr.mapping.slice(start);
        tr.setSelection(
          CellSelection.create(tr.doc, map.map(anchor), map.map(head)),
        );
        return true;
      };

    return Object.fromEntries(
      LISTS.map(({ command, node }) => [command, make(node)]),
    ) as any;
  },
});
