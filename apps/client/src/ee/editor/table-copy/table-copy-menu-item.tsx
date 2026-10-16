import { FC, useEffect } from "react";
import { Menu } from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";

// The row/column handle menu takes focus away from the editor, so the native
// copy never reaches ProseMirror. Refocus the editor (selection is kept) and
// re-run copy so PM serializes the CellSelection (data + formatting).
const copySelection = (editor: Editor) => {
  editor.view.focus();
  document.execCommand("copy");
};

export const TableCopyMenuItem: FC<{ editor: Editor }> = ({ editor }) => {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection(editor);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [editor]);

  return (
    <Menu.Item leftSection={<IconCopy size={16} />} onClick={() => copySelection(editor)}>
      {t("Copy")}
    </Menu.Item>
  );
};
