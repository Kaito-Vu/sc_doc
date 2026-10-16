let lastPageId: string | null = null;

// Title auto-focus is for freshly opened pages only. A re-run for the same
// page (window regained focus, editor re-created) must not move the caret.
export function shouldAutofocusTitle(pageId: string): boolean {
  if (document.activeElement?.closest(".ProseMirror")) return false;
  if (lastPageId === pageId) return false;
  lastPageId = pageId;
  return true;
}
