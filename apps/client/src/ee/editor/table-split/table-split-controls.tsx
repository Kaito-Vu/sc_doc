import { FC } from "react";
import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import { IconLayoutColumns, IconLayoutRows } from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { canSplitCell, splitCellInto } from "./split-cell";

// Toolbar buttons (bubble menu)
export const TableSplitButtons: FC<{ editor: Editor }> = ({ editor }) => {
  const { t } = useTranslation();
  return (
    <>
      <Tooltip position="top" label={t("Split cell into 2 columns")}>
        <ActionIcon
          variant="subtle"
          size="lg"
          aria-label={t("Split cell into 2 columns")}
          onClick={() => splitCellInto(editor, "column")}
        >
          <IconLayoutColumns size={18} />
        </ActionIcon>
      </Tooltip>
      <Tooltip position="top" label={t("Split cell into 2 rows")}>
        <ActionIcon
          variant="subtle"
          size="lg"
          aria-label={t("Split cell into 2 rows")}
          onClick={() => splitCellInto(editor, "row")}
        >
          <IconLayoutRows size={18} />
        </ActionIcon>
      </Tooltip>
    </>
  );
};

// Items for the cell chevron menu
export const TableSplitMenuItems: FC<{ editor: Editor }> = ({ editor }) => {
  const { t } = useTranslation();
  const disabled = !canSplitCell(editor);
  return (
    <>
      <Menu.Item
        leftSection={<IconLayoutColumns size={16} />}
        disabled={disabled}
        onClick={() => splitCellInto(editor, "column")}
      >
        {t("Split cell into 2 columns")}
      </Menu.Item>
      <Menu.Item
        leftSection={<IconLayoutRows size={16} />}
        disabled={disabled}
        onClick={() => splitCellInto(editor, "row")}
      >
        {t("Split cell into 2 rows")}
      </Menu.Item>
    </>
  );
};
