import { Heading } from "@docmost/editor-ext";
import { mergeAttributes } from "@tiptap/core";

export const NumberedHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      restart: {
        default: false,
        parseHTML: (element) => element.classList.contains("numbering-restart"),
        renderHTML: (attributes) =>
          attributes.restart ? { class: "numbering-restart" } : {},
      },
    };
  },

  // No addCommands() here: NumberedOrderedList owns toggleNumberingRestart
  // for both node types (see the comment in numbered-ordered-list.ts) so
  // TipTap's flat command-merging across extensions can't collide.

  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];
    const classes = ["numbered-heading", node.attrs.restart ? "numbering-restart" : ""]
      .filter(Boolean)
      .join(" ");

    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        id: node.attrs.id,
        class: classes,
        "data-heading-level": String(level),
      }),
      0,
    ];
  },
});
