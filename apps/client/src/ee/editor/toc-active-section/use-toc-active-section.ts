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
  active?: HTMLElement | null,
) {
  // While editing (editor focused) the caret's section wins over scroll and
  // the core IntersectionObserver, which also write the active heading.
  const caretHeading = (): HTMLElement | null => {
    if (!editor || editor.isDestroyed || !editor.isFocused) return null;
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
    return current;
  };

  useEffect(() => {
    const el = caretHeading();
    if (el && el !== active) setActive(el);
  }, [active]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !headings.length) return;

    const onScroll = () => {
      if (caretHeading()) return;
      const line = window.innerHeight * 0.15;
      let current: HTMLElement | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= line) current = h;
        else break;
      }
      if (current) setActive(current);
    };

    const onSelection = () => {
      const el = caretHeading();
      if (el) setActive(el);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    editor.on("selectionUpdate", onSelection);
    editor.on("focus", onSelection);
    editor.on("blur", onScroll);
    onSelection();
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      editor.off("selectionUpdate", onSelection);
      editor.off("focus", onSelection);
      editor.off("blur", onScroll);
    };
  }, [editor, headings, setActive]);
}
