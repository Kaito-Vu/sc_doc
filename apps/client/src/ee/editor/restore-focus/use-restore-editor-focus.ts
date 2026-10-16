import { useEffect } from "react";
import { clientLogger } from "@/ee/logging/client-logger";
import type { Editor } from "@tiptap/react";

type Sel = { from: number; to: number };

// valid only on the calendar day it was saved (local time)
const today = () => new Date().toDateString();
const key = (pageId: string) => `editor-caret:${pageId}`;

function save(pageId: string, sel: Sel) {
  try {
    sessionStorage.setItem(key(pageId), JSON.stringify({ ...sel, day: today() }));
  } catch (err) {
    // storage blocked or full: caret restore is disabled, editing is unaffected
    clientLogger.warn("restore-focus", "cannot save caret position", err);
  }
}

function load(pageId: string): Sel | null {
  try {
    const raw = sessionStorage.getItem(key(pageId));
    if (!raw) return null;
    const { from, to, day } = JSON.parse(raw);
    if (day !== today()) {
      sessionStorage.removeItem(key(pageId));
      return null;
    }
    return { from, to };
  } catch (err) {
    // unreadable storage or corrupted entry: report it and drop the bad entry
    clientLogger.warn("restore-focus", "cannot read caret position", err);
    try {
      sessionStorage.removeItem(key(pageId));
    } catch (removeErr) {
      clientLogger.warn("restore-focus", "cannot remove caret entry", removeErr);
    }
    return null;
  }
}

// Remembers where the caret was in a page body (sessionStorage, same day only) and
// puts it back when the user navigates away and returns.
export function useRestoreEditorFocus(
  editor: Editor | null,
  pageId: string,
  synced: boolean,
) {
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const onSelection = () => {
      if (editor.isDestroyed || !editor.isFocused) return;
      const { from, to } = editor.state.selection;
      save(pageId, { from, to });
    };
    editor.on("selectionUpdate", onSelection);
    return () => {
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor, pageId]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !synced) return;
    const sel = load(pageId);
    if (!sel || sel.to > editor.state.doc.content.size) return;
    editor.chain().focus().setTextSelection(sel).run();
  }, [editor, pageId, synced]);
}
