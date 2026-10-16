import { FC, useState } from "react";
import {
  Box,
  Button,
  ColorInput,
  ColorPicker,
  Popover,
  Stack,
  Text,
  Tooltip,
  rem,
} from "@mantine/core";
import { IconChevronDown, IconHighlight, IconTextColor } from "@tabler/icons-react";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { isEditorReady } from "@docmost/editor-ext";
import clsx from "clsx";
import classes from "@/features/editor/components/bubble-menu/bubble-menu.module.css";

// Word-like palette: 10 columns, 1 row of standard colors + shade rows.
const SWATCHES = [
  "#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050",
  "#00B050", "#00B0F0", "#0070C0", "#002060", "#7030A0",
  "#F2F2F2", "#D9D9D9", "#BFBFBF", "#A6A6A6", "#7F7F7F",
  "#595959", "#404040", "#262626", "#0D0D0D", "#000000",
  "#FCE4D6", "#FFF2CC", "#E2EFDA", "#DDEBF7", "#D9E1F2",
  "#EDEDED", "#F8CBAD", "#FFE699", "#C6E0B4", "#BDD7EE",
];

interface Props {
  editor: Editor | null;
}

const MODES = {
  background: {
    label: "Background color",
    remove: "Remove background color",
    attr: ["highlight"],
    set: (e: Editor, color: string) => e.chain().focus().setHighlight({ color }).run(),
    unset: (e: Editor) => e.chain().focus().unsetHighlight().run(),
  },
  text: {
    label: "Text color",
    remove: "Remove text color",
    attr: ["textStyle"],
    set: (e: Editor, color: string) => e.chain().focus().setColor(color).run(),
    unset: (e: Editor) => e.chain().focus().unsetColor().run(),
  },
} as const;

export const BackgroundColorSelector: FC<Props> = ({ editor }) => (
  <ColorSelectorBase editor={editor} mode="background" />
);

export const TextColorSelector: FC<Props> = ({ editor }) => (
  <ColorSelectorBase editor={editor} mode="text" />
);

const ColorSelectorBase: FC<Props & { mode: keyof typeof MODES }> = ({
  editor,
  mode,
}) => {
  const m = MODES[mode];
  const Icon = mode === "text" ? IconTextColor : IconHighlight;
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [custom, setCustom] = useState("#ffff00");

  const current = useEditorState({
    editor,
    selector: (ctx) =>
      (ctx.editor?.getAttributes(m.attr[0]).color as string | null) ?? null,
  });

  if (!editor) return null;

  const apply = (color: string) => {
    if (!isEditorReady(editor)) return;
    m.set(editor, color);
  };

  const remove = () => {
    if (isEditorReady(editor)) m.unset(editor);
    setIsOpen(false);
  };

  return (
    <Popover width={260} opened={isOpen} onChange={setIsOpen} withArrow>
      <Popover.Target>
        <Tooltip label={t(m.label)} withArrow withinPortal={false}>
          <Button
            variant="default"
            radius="0"
            rightSection={<IconChevronDown size={16} />}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setIsOpen(!isOpen)}
            className={clsx(classes.buttonRoot)}
            aria-label={t(m.label)}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
          >
            <Icon
              size={16}
              style={{
                borderBottom: `${rem(3)} solid ${current || "transparent"}`,
              }}
            />
          </Button>
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown
        onMouseDown={(e) => {
          // keep editor selection, but let the hex input take focus
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            {t(m.label)}
          </Text>
          <ColorPicker
            withPicker={false}
            swatches={SWATCHES}
            swatchesPerRow={10}
            size="sm"
            fullWidth
            value={current ?? ""}
            onChange={apply}
          />

          <Text size="sm" fw={600} mt="xs">
            {t("Custom color")}
          </Text>
          <Box>
            <ColorPicker
              format="hex"
              size="sm"
              fullWidth
              value={custom}
              onChange={setCustom}
              onChangeEnd={apply}
            />
            <ColorInput
              mt="xs"
              size="xs"
              format="hex"
              value={custom}
              onChange={setCustom}
              onChangeEnd={apply}
              placeholder="#FFFF00 / rgb(255, 255, 0)"
            />
          </Box>

          <Button variant="default" fullWidth size="xs" onClick={remove}>
            {t(m.remove)}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
