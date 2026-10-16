import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";

export type ContextMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
};

export type ContextMenuProvider = {
  id: string;
  // Lower first. Each provider's items form one group, separated by dividers.
  order: number;
  match: (editor: Editor, target: HTMLElement) => boolean;
  items: (editor: Editor, target: HTMLElement) => ContextMenuItem[];
};

const providers: ContextMenuProvider[] = [];

// Call from any module to add/replace a context-specific group of items.
export function registerContextMenuProvider(p: ContextMenuProvider) {
  const i = providers.findIndex((x) => x.id === p.id);
  if (i >= 0) providers[i] = p;
  else providers.push(p);
}

export function resolveContextMenuItems(
  editor: Editor,
  target: HTMLElement,
): ContextMenuItem[][] {
  return [...providers]
    .sort((a, b) => a.order - b.order)
    .filter((p) => p.match(editor, target))
    .map((p) => p.items(editor, target))
    .filter((g) => g.length > 0);
}
