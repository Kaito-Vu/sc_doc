import "./toc-active-section.css";
import { useEffect } from "react";
import type { Editor } from "@tiptap/react";

// Highlight the TOC entry of the section being viewed/edited, not only the
// heading under the IntersectionObserver band: the active heading is the last
// one above the reading line (scroll) or above the caret (selection).
export function useTocActiveSection(
  editor: Editor | null,
  headings: HTMLElement[],
  setActive: (el: HTMLElement | null) => void,
) {
  useEffect(() => {
    if (!editor || editor.isDestroyed || !headings.length) return;

    const onScroll = () => {
      const line = window.innerHeight * 0.15;
      let current: HTMLElement | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= line) current = h;
        else break;
      }
      if (current) setActive(current);
    };

    const onSelection = () => {
      if (editor.isDestroyed) return;
      const { from } = editor.state.selection;
      let current: HTMLElement | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (pos > from) return false;
        if (node.type.name === "heading") {
          const dom = editor.view.nodeDOM(pos);
          if (dom instanceof HTMLElement && headings.includes(dom)) current = dom;
        }
        return node.type.name !== "heading";
      });
      if (current) setActive(current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    editor.on("selectionUpdate", onSelection);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor, headings, setActive]);
}
