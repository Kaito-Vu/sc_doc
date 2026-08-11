import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { ListItem } from "@tiptap/extension-list";
import { NumberedOrderedList } from "@/ee/numbering/extensions/numbered-ordered-list";
import { RestartNumberingButton } from "./restart-numbering-button";

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function renderButton(editor: Editor) {
  return render(
    <MantineProvider>
      <RestartNumberingButton editor={editor} />
    </MantineProvider>,
  );
}

describe("RestartNumberingButton", () => {
  it("renders nothing when the selection is not inside an ordered list", () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, ListItem, NumberedOrderedList],
      content: "<p>hello</p>",
    });
    renderButton(editor);
    expect(screen.queryByRole("button")).toBeNull();
    editor.destroy();
  });

  it("toggles the restart attribute when clicked inside an ordered list", () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, ListItem, NumberedOrderedList],
      content: "<ol><li><p>one</p></li></ol>",
    });
    editor.commands.setTextSelection(3); // inside "one"
    renderButton(editor);

    fireEvent.click(screen.getByRole("button"));
    expect(editor.getAttributes("orderedList").restart).toBe(true);
    editor.destroy();
  });
});
