import { useCallback } from "react";

const MIN = 0.25;
const MAX = 4;

/** Ctrl/Cmd + wheel zooms the element's contents (CSS `zoom`); plain wheel scrolls the page. */
export function useCtrlWheelZoom() {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    let scale = 1;
    el.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        scale = Math.min(MAX, Math.max(MIN, scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        el.style.zoom = String(scale);
        el.style.overflow = scale > 1 ? "auto" : "";
      },
      { passive: false },
    );
  }, []);
}
