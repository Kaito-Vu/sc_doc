import { FC } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import classes from "@/features/editor/components/fixed-toolbar/fixed-toolbar.module.css";

interface Props {
  editor: Editor;
}

export const RestartNumberingButton: FC<Props> = ({ editor }) => {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor || ctx.editor.isDestroyed) return null;
      return {
        isOrderedList: ctx.editor.isActive("orderedList"),
        isRestarted: ctx.editor.getAttributes("orderedList").restart === true,
      };
    },
  });

  if (!state?.isOrderedList) return null;

  return (
    <Tooltip label={t("Restart numbering here")} withArrow>
      <ActionIcon
        variant="subtle"
        color="dark"
        size="md"
        aria-label={t("Restart numbering here")}
        aria-pressed={state.isRestarted}
        className={clsx({ [classes.active]: state.isRestarted })}
        onClick={() => editor.chain().focus().toggleNumberingRestart().run()}
      >
        <IconRestore size={16} />
      </ActionIcon>
    </Tooltip>
  );
};
