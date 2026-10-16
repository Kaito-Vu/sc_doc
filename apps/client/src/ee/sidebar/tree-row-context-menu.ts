import type { MouseEvent } from "react";

// Right-click on a tree row opens that row's existing "⋯" NodeMenu, so the
// items stay context-aware (canEdit, favorite state, ...) and are edited in
// one place. The menu anchors to the ⋯ button, not the cursor.
export function onTreeRowContextMenu(e: MouseEvent<HTMLElement>) {
  const trigger = e.currentTarget.querySelector<HTMLElement>(
    "[data-node-menu-trigger]",
  );
  if (!trigger) return;
  e.preventDefault();
  trigger.click();
}
