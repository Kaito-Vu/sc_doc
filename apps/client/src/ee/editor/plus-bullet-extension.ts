import { Extension, InputRule, textInputRule } from "@tiptap/core";

/**
 * Typing `++ `, `--`, `+++ `… at the start of a line makes an indented bullet.
 * `+ `/`- ` already become a bullet via TipTap's BulletList, and `->` → `→` comes
 * from the Typography extension, so only the multi-char case is handled here.
 * Typography turns `--` into `—` as you type, so `—` counts as two dashes.
 */
export const PlusBullet = Extension.create({
  name: "plusBullet",

  addInputRules() {
    return [
      // Typography already does `->` and `<-`; cover `-->` (typed as `—>`) and `<--`.
      textInputRule({ find: /—>$/, replace: "→" }),
      textInputRule({ find: /←-$/, replace: "←" }),
      new InputRule({
        find: /^\s*(\+{2,}|[-—]+)\s$/,
        handler: ({ state, range, match, chain }) => {
          const marks = match[1];
          const len =
            marks[0] === "+"
              ? marks.length
              : [...marks].reduce((n, c) => n + (c === "—" ? 2 : 1), 0);
          if (len < 2) return null;
          const depth = len - 1;
          const $from = state.doc.resolve(range.from);
          // ponytail: needs a bullet to nest under; first `++ ` after plain text makes a flat bullet.
          const inList = $from.node(-1)?.type.name === "listItem";
          const c = chain().deleteRange(range);
          if (!inList) c.toggleBulletList();
          else for (let i = 0; i < depth; i++) c.sinkListItem("listItem");
          c.run();
        },
      }),
    ];
  },
});
