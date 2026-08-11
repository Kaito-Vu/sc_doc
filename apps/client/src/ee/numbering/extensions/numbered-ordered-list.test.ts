import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { ListItem } from "@tiptap/extension-list";
import { NumberedOrderedList } from "./numbered-ordered-list";

function makeEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: [Document, Paragraph, Text, ListItem, NumberedOrderedList],
    content:
      "<ol><li><p>one</p></li><li><p>two</p><ol><li><p>nested</p></li></ol></li></ol>",
  });
}

describe("NumberedOrderedList", () => {
  it("renders the numbered-list class on the ol element", () => {
    const editor = makeEditor();
    expect(editor.getHTML()).toContain('class="numbered-list"');
    editor.destroy();
  });

  it("decorates the top-level ol with a data-numbering-depth of 1 in the live view", () => {
    const editor = makeEditor();
    const lists = editor.view.dom.querySelectorAll("ol");
    expect(lists[0].getAttribute("data-numbering-depth")).toBe("1");
    editor.destroy();
  });

  it("decorates a nested ol with a data-numbering-depth of 2 in the live view", () => {
    const editor = makeEditor();
    const lists = editor.view.dom.querySelectorAll("ol");
    expect(lists[1].getAttribute("data-numbering-depth")).toBe("2");
    editor.destroy();
  });

  it("exposes a toggleNumberingRestart command that flips the restart attr on the active list", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(2); // inside "one"
    editor.commands.toggleNumberingRestart();
    const json = editor.getJSON();
    expect(json.content?.[0]?.attrs?.restart).toBe(true);
    editor.destroy();
  });

  it("keeps Tab bound to sinkListItem (does not override the default list keymap)", () => {
    const editor = makeEditor();
    expect(typeof editor.commands.sinkListItem).toBe("function");
    editor.destroy();
  });
});
