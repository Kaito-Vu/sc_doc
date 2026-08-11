import { OrderedList } from "@tiptap/extension-list";
import { mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

function orderedListDepthAt(doc: ProseMirrorNode, pos: number): number {
  const $pos = doc.resolve(pos + 1);
  let depth = 0;
  for (let d = $pos.depth; d >= 0; d--) {
    if ($pos.node(d).type.name === "orderedList") depth++;
  }
  return Math.min(depth, 10);
}

export const NumberedOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      restart: {
        default: false,
        parseHTML: (element) => element.classList.contains("numbering-restart"),
        renderHTML: (attributes) =>
          attributes.restart ? { class: "numbering-restart" } : {},
      },
    };
  },

  // `NumberedOrderedList` is the single owner of `toggleNumberingRestart` for
  // both node types it can apply to. TipTap merges `addCommands()` from every
  // loaded extension into one flat `editor.commands` object — if `NumberedHeading`
  // also defined a command with this name, whichever extension is registered
  // later in `mainExtensions` would silently overwrite the other. Keeping one
  // owner that branches on `editor.isActive(...)` avoids that collision.
  addCommands() {
    return {
      ...this.parent?.(),
      toggleNumberingRestart:
        () =>
        ({ editor, commands }) => {
          if (editor.isActive("orderedList")) {
            const current = editor.getAttributes("orderedList").restart;
            return commands.updateAttributes("orderedList", { restart: !current });
          }
          if (editor.isActive("heading")) {
            const current = editor.getAttributes("heading").restart;
            return commands.updateAttributes("heading", { restart: !current });
          }
          return false;
        },
    } as any;
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey("numberedOrderedListDepth"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "orderedList") return;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  "data-numbering-depth": String(orderedListDepthAt(state.doc, pos)),
                }),
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const classes = ["numbered-list", node.attrs.restart ? "numbering-restart" : ""]
      .filter(Boolean)
      .join(" ");
    return ["ol", mergeAttributes(HTMLAttributes, { class: classes }), 0];
  },
});
