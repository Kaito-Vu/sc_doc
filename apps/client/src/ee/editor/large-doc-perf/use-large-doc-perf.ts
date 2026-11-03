import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import "./large-doc-perf.css";

// Doc size (ProseMirror positions) above which the page is treated as "large".
const LARGE_DOC_SIZE = 150_000;

/**
 * Keeps very large pages usable: stops the per-table header-pin observers and
 * lets the browser skip layout/paint of off-screen top-level blocks.
 * One-way latch per editor; small pages are untouched.
 */
export function useLargeDocPerf(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return;
    let active = false;

    const enable = () => {
      active = true;
      editor.off("transaction", check);
      editor.unregisterPlugin("tableHeaderPin");

      // Marked on the ProseMirror node itself: its wrapper can be remounted.
      (editor.view.dom as HTMLElement).dataset.largeDoc = "true";
    };

    const check = () => {
      if (!active && editor.state.doc.content.size > LARGE_DOC_SIZE) enable();
    };

    check();
    editor.on("transaction", check);
    return () => {
      editor.off("transaction", check);
    };
  }, [editor]);
}
