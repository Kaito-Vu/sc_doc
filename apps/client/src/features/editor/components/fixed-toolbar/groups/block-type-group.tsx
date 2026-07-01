import { FC } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Button, Menu } from "@mantine/core";
import {
  IconBlockquote,
  IconBraces,
  IconChevronDown,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconH5,
  IconH6,
  IconLetterH,
  IconMenu4,
  IconPageBreak,
  IconTypography,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface Props {
  editor: Editor;
}

export const BlockTypeGroup: FC<Props> = ({ editor }) => {
  const { t } = useTranslation();

  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      headingLevel: [1,2,3,4,5,6,7,8,9,10].find(l =>
        ctx.editor?.isActive("heading", { level: l })
      ) ?? null,
      isBlockquote: !!ctx.editor?.isActive("blockquote"),
      isCodeBlock: !!ctx.editor?.isActive("codeBlock"),
    }),
  });

  let label = t("Normal text");
  if (state.headingLevel) label = t("Heading {{level}}", { level: state.headingLevel });
  else if (state.isBlockquote) label = t("Quote");
  else if (state.isCodeBlock) label = t("Code block");

  return (
    <Menu shadow="md" position="bottom-start" withArrow={false}>
      <Menu.Target>
        <Button
          variant="subtle"
          color="dark"
          size="xs"
          rightSection={<IconChevronDown size={14} />}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconTypography size={16} />}
          onClick={() =>
            editor.chain().focus().toggleNode("paragraph", "paragraph").run()
          }
        >
          {t("Text")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconH1 size={16} />}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          {t("Heading 1")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconH2 size={16} />}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          {t("Heading 2")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconH3 size={16} />}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          {t("Heading 3")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconH4 size={16} />}
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 } as any).run()}
        >
          {t("Heading 4")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconH5 size={16} />}
          onClick={() => editor.chain().focus().toggleHeading({ level: 5 } as any).run()}
        >
          {t("Heading 5")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconH6 size={16} />}
          onClick={() => editor.chain().focus().toggleHeading({ level: 6 } as any).run()}
        >
          {t("Heading 6")}
        </Menu.Item>
        {[7, 8, 9, 10].map((level) => (
          <Menu.Item
            key={level}
            leftSection={<IconLetterH size={16} />}
            onClick={() => editor.chain().focus().toggleHeading({ level } as any).run()}
          >
            {t("Heading {{level}}", { level })}
          </Menu.Item>
        ))}
        <Menu.Item
          leftSection={<IconBlockquote size={16} />}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          {t("Quote")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconBraces size={16} />}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          {t("Code block")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconMenu4 size={16} />}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          {t("Divider")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconPageBreak size={16} />}
          onClick={() => editor.chain().focus().setPageBreak().run()}
        >
          {t("Page break")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
