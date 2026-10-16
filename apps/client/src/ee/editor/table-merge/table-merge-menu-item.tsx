import { FC } from "react";
import { Menu } from "@mantine/core";
import { IconBoxMargin } from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";

export const TableMergeMenuItem: FC<{ editor: Editor }> = ({ editor }) => {
  const { t } = useTranslation();
  return (
    <Menu.Item
      leftSection={<IconBoxMargin size={16} />}
      disabled={!editor.can().mergeCells()}
      onClick={() => editor.chain().focus().mergeCells().run()}
    >
      {t("Merge cells")}
    </Menu.Item>
  );
};
