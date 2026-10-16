import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { TableDndKey, TableHandleState } from "@docmost/editor-ext";

const FALLBACK: TableHandleState = {
  hoveringCell: null,
  tableNode: null,
  tablePos: null,
  dragging: null,
  frozen: false,
};

export function useTableHandleState(editor: Editor | null): TableHandleState {
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor) return null;
      return TableDndKey.getState(ctx.editor.state) ?? null;
    },
    // state holds DOM/ProseMirror nodes: a deep compare overflows the stack
    equalityFn: (a, b) => a === b,
  });

  return state ?? FALLBACK;
}
