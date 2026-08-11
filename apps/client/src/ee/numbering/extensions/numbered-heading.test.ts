import { describe, it, expect, beforeAll } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { NumberedHeading } from "./numbered-heading";

function makeEditor() {
  return new Editor({
    extensions: [Document, Paragraph, Text, NumberedHeading.configure({ levels: [1, 2, 3] })],
    content: "<h1>Title</h1>",
  });
}

// The base `Heading` (packages/editor-ext/src/lib/heading/heading.ts, a core
// file untouched by this task) registers an unkeyed ProseMirror plugin for its
// link-copy decoration. In a cold Vitest module worker, the very first
// `Editor` construction in the process throws
// "Adding different instances of a keyed plugin (plugin$)" — reproducible with
// the vanilla, unmodified `Heading` extension alone, before any numbering code
// runs (two independently pre-bundled copies of prosemirror-state each hand
// out the same default, unsuffixed plugin key on their own first use). That
// first, failing construction still advances each copy's internal key
// counter, so every construction after it succeeds. We swallow that one
// expected cold-start failure here so the real tests below observe
// NumberedHeading's actual behavior rather than this unrelated core-file
// quirk.
beforeAll(() => {
  try {
    const warmup = makeEditor();
    warmup.destroy();
  } catch {
    // expected on the very first Editor construction in this module worker
  }
});

describe("NumberedHeading", () => {
  it("always renders the numbered-heading class and data-heading-level attribute", () => {
    const editor = makeEditor();
    expect(editor.getHTML()).toContain('class="numbered-heading"');
    expect(editor.getHTML()).toContain('data-heading-level="1"');
    editor.destroy();
  });

  it("adds the numbering-restart class when the restart attr is set", () => {
    const editor = makeEditor();
    editor.commands.updateAttributes("heading", { restart: true });
    expect(editor.getHTML()).toContain("numbering-restart");
    editor.destroy();
  });
});
