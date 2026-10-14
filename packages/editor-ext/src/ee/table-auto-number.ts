import { Extension } from "@tiptap/core";

export const AUTO_NUMBER_FORMATS = [
  "decimal",
  "upper-roman",
  "lower-roman",
  "upper-alpha",
  "lower-alpha",
] as const;

export type AutoNumberFormat = (typeof AUTO_NUMBER_FORMATS)[number];

/**
 * Adds `autoNumber` (a number format, null = off) and `autoNumberPrefix`
 * (free text typed by the user, e.g. "1." for 1.1, 1.2) to table cells.
 * A flagged cell shows prefix + the ordinal of its row in its own table:
 * a CSS counter in the client, a real number in the DOCX export. Either way
 * it stays correct when rows are inserted, deleted or moved.
 */
export const TableAutoNumber = Extension.create({
  name: "tableAutoNumber",

  addGlobalAttributes() {
    return [
      {
        types: ["tableCell"],
        attributes: {
          autoNumber: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-auto-number"),
            renderHTML: (attributes) =>
              attributes.autoNumber
                ? { "data-auto-number": attributes.autoNumber }
                : {},
          },
          autoNumberPrefix: {
            default: "",
            parseHTML: (element) =>
              element.getAttribute("data-auto-number-prefix") || "",
            renderHTML: (attributes) =>
              attributes.autoNumber && attributes.autoNumberPrefix
                ? { "data-auto-number-prefix": attributes.autoNumberPrefix }
                : {},
          },
        },
      },
    ];
  },
});

const ROMAN: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** Same output as CSS `counter(x, <format>)`, used by the DOCX export. */
export function formatAutoNumber(n: number, format: string): string {
  switch (format) {
    case "upper-roman":
    case "lower-roman": {
      let out = "";
      for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
      return format === "upper-roman" ? out : out.toLowerCase();
    }
    case "upper-alpha":
    case "lower-alpha": {
      let out = "";
      for (; n > 0; n = Math.floor((n - 1) / 26)) {
        out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
      }
      return format === "upper-alpha" ? out : out.toLowerCase();
    }
    default:
      return String(n);
  }
}
