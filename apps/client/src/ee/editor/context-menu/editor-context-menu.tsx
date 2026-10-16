import { FC, Fragment, useEffect, useState } from "react";
import { Menu } from "@mantine/core";
import type { Editor } from "@tiptap/react";
import "./providers";
import { ContextMenuItem, resolveContextMenuItems } from "./registry";

export const EditorContextMenu: FC<{ editor: Editor }> = ({ editor }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [groups, setGroups] = useState<ContextMenuItem[][]>([]);

  useEffect(() => {
    const dom = editor.view.dom;
    const onContextMenu = (ev: MouseEvent) => {
      // Shift+right-click falls through to the native browser menu.
      if (ev.shiftKey) return;
      ev.preventDefault();
      const { clientX: x, clientY: y } = ev;
      const target = ev.target as HTMLElement;
      // Let the browser/PM move the caret before we read the selection.
      requestAnimationFrame(() => {
        setGroups(resolveContextMenuItems(editor, target));
        setPos({ x, y });
      });
    };
    dom.addEventListener("contextmenu", onContextMenu);
    return () => dom.removeEventListener("contextmenu", onContextMenu);
  }, [editor]);

  if (!pos) return null;

  return (
    <Menu
      opened
      onClose={() => setPos(null)}
      position="bottom-start"
      withinPortal
      shadow="md"
    >
      <Menu.Target>
        <div
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            width: 0,
            height: 0,
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {groups.map((g, i) => (
          <Fragment key={i}>
            {i > 0 && <Menu.Divider />}
            {g.map((it) => (
              <Menu.Item
                key={it.id}
                leftSection={it.icon}
                disabled={it.disabled}
                color={it.danger ? "red" : undefined}
                onClick={it.onClick}
              >
                {it.label}
              </Menu.Item>
            ))}
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
