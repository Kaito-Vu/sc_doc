import { FC, useState } from "react";
import { ActionIcon, Popover, Select, Stack, TextInput, Tooltip } from "@mantine/core";
import { IconListNumbers } from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import "./table-auto-number.css";

const FORMATS = [
  { value: "", label: "Off" },
  { value: "decimal", label: "1, 2, 3" },
  { value: "upper-roman", label: "I, II, III" },
  { value: "lower-roman", label: "i, ii, iii" },
  { value: "upper-alpha", label: "A, B, C" },
  { value: "lower-alpha", label: "a, b, c" },
];

export const TableAutoNumberButton: FC<{ editor: Editor | null }> = ({
  editor,
}) => {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const attrs = ctx.editor?.getAttributes("tableCell") ?? {};
      return {
        format: (attrs.autoNumber as string | null) || "",
        prefix: (attrs.autoNumberPrefix as string) || "",
      };
    },
  });

  if (!editor || !state) return null;

  const update = (attrs: { autoNumber?: string | null; autoNumberPrefix?: string }) =>
    editor.chain().focus().updateAttributes("tableCell", attrs).run();

  return (
    <Popover width={220} position="bottom" opened={opened} onChange={setOpened} withArrow>
      <Popover.Target>
        <Tooltip position="top" label={t("Auto numbering")}>
          <ActionIcon
            variant={state.format ? "light" : "subtle"}
            size="lg"
            aria-label={t("Auto numbering")}
            onClick={() => setOpened((o) => !o)}
          >
            <IconListNumbers size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Select
            size="xs"
            label={t("Auto numbering")}
            allowDeselect={false}
            data={FORMATS.map((f) => ({ value: f.value, label: f.value ? f.label : t(f.label) }))}
            value={state.format}
            onChange={(v) => update({ autoNumber: v || null })}
            comboboxProps={{ withinPortal: false }}
          />
          <TextInput
            size="xs"
            label={t("Prefix")}
            placeholder="1."
            disabled={!state.format}
            value={state.prefix}
            onChange={(e) => update({ autoNumberPrefix: e.currentTarget.value })}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
