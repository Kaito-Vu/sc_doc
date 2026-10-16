import { Extension } from "@tiptap/core";
import { clientLogger } from "@/ee/logging/client-logger";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// Replacement for core CleanStyles: still strips inline styles on paste, but
// translates the ones the editor can represent (Word / Google Docs paste):
// text color, background (highlight / table cell), bold, italic, underline,
// strike, sub/superscript and paragraph alignment.

const DEFAULT_COLORS =
  /^(windowtext|auto|inherit|initial|transparent|none|black|#000(000)?|rgb\(0,\s*0,\s*0\))$/i;
const TABLE_TAGS = new Set(["TABLE", "TBODY", "THEAD", "TR", "COL", "COLGROUP"]);
const CELL_TAGS = new Set(["TD", "TH"]);
const SKIP_TAGS = new Set(["BODY", "HTML"]);
const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6"]);
const ALIGNS = new Set(["left", "center", "right", "justify"]);

const usable = (v: string) => !!v && !DEFAULT_COLORS.test(v.trim());

function wrapChildren(el: Element, wrapper: Element) {
  while (el.firstChild) wrapper.appendChild(el.firstChild);
  el.appendChild(wrapper);
}


// Word exports lists as plain paragraphs: <p style="mso-list:l0 level2 lfo1">
// <span style="mso-list:Ignore">1.&nbsp;</span>text</p>. Rebuild real nested
// ul/ol (with ol type/start taken from the marker) before styles are stripped.
const LIST_STYLE = /mso-list:\s*l\d+\s+level(\d+)/i;
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function romanToInt(r: string) {
  let n = 0;
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN[r[i]];
    n += v < (ROMAN[r[i + 1]] ?? 0) ? -v : v;
  }
  return n;
}

function orderedInfo(marker: string): { type: string; start: number } | null {
  const m = /^([0-9]+|[a-zA-Z]+)[.)]$/.exec(marker.replace(/[\s ]/g, ""));
  if (!m) return null;
  const t = m[1];
  if (/^\d+$/.test(t)) return { type: "1", start: parseInt(t, 10) };
  const lower = t === t.toLowerCase();
  if (/^[ivxlcdm]+$/i.test(t) && (t.length > 1 || /^[iI]$/.test(t))) {
    return { type: lower ? "i" : "I", start: romanToInt(t.toLowerCase()) };
  }
  if (t.length === 1) {
    return { type: lower ? "a" : "A", start: t.toLowerCase().charCodeAt(0) - 96 };
  }
  return null;
}

function convertWordLists(doc: Document) {
  const items = Array.from(
    doc.body.querySelectorAll<HTMLElement>("p[style]"),
  ).filter((p) => LIST_STYLE.test(p.getAttribute("style") || ""));
  const done = new Set<HTMLElement>();

  for (const first of items) {
    if (done.has(first)) continue;
    // collect the run of adjacent list paragraphs
    const run: HTMLElement[] = [];
    for (let n: Element | null = first; n && items.includes(n as HTMLElement); n = n.nextElementSibling) {
      run.push(n as HTMLElement);
      done.add(n as HTMLElement);
    }
    const anchor = doc.createComment("");
    first.before(anchor);
    const stack: { level: number; list: HTMLElement; li: HTMLElement | null }[] = [];
    let root: HTMLElement | null = null;

    for (const p of run) {
      const level = parseInt(LIST_STYLE.exec(p.getAttribute("style")!)![1], 10);
      const ignore = Array.from(p.querySelectorAll<HTMLElement>("span[style]")).find((sp) =>
        /mso-list:\s*ignore/i.test(sp.getAttribute("style") || ""),
      );
      const ordered = orderedInfo(ignore?.textContent || "");
      ignore?.remove();

      while (stack.length && stack[stack.length - 1].level > level) stack.pop();
      let top = stack[stack.length - 1];
      if (!top || top.level < level) {
        const list = doc.createElement(ordered ? "ol" : "ul");
        if (ordered) {
          if (ordered.type !== "1") list.setAttribute("type", ordered.type);
          if (ordered.start !== 1) list.setAttribute("start", String(ordered.start));
        }
        if (top?.li) top.li.appendChild(list);
        else if (!root) root = list;
        else root.after(list);
        top = { level, list, li: null };
        stack.push(top);
      }
      const li = doc.createElement("li");
      li.appendChild(p);
      top.list.appendChild(li);
      top.li = li;
    }
    if (root) anchor.replaceWith(root);
    else anchor.remove();
  }
}

export function keepFormattingOnly(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  convertWordLists(doc);
  const wrap = (el: Element, tag: string, setup?: (n: HTMLElement) => void) => {
    const n = doc.createElement(tag);
    setup?.(n);
    wrapChildren(el, n);
  };

  // Word: <td bgcolor="..."> without inline style
  doc.body.querySelectorAll<HTMLElement>("td[bgcolor], th[bgcolor]").forEach((c) => {
    if (!c.style.backgroundColor) c.style.backgroundColor = c.getAttribute("bgcolor")!;
  });

  // Alignment may sit on the align attribute or on a container (div/td/li):
  // push it down to paragraphs/headings that have none of their own.
  const alignOf = (e: HTMLElement) =>
    (e.style.textAlign || e.getAttribute("align") || "").toLowerCase();
  doc.body.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6").forEach((b) => {
    if (ALIGNS.has(alignOf(b))) return;
    const host = b.parentElement?.closest<HTMLElement>("div, td, th, li, blockquote");
    let h: HTMLElement | null | undefined = host;
    while (h && !ALIGNS.has(alignOf(h))) h = h.parentElement?.closest<HTMLElement>("div, td, th, li, blockquote");
    if (h) b.setAttribute("align", alignOf(h));
  });

  doc.body.querySelectorAll<HTMLElement>("[style], p[align], h1[align], h2[align], h3[align], h4[align], h5[align], h6[align]").forEach((el) => {
    const raw = el.getAttribute("style") || "";
    const s = el.style;
    const bg =
      s.backgroundColor || /mso-highlight:\s*([a-z-]+)/i.exec(raw)?.[1] || "";
    const color = s.color;
    const weight = s.fontWeight;
    const italic = s.fontStyle === "italic" || s.fontStyle === "oblique";
    const deco = s.textDecorationLine || s.textDecoration || "";
    const valign = s.verticalAlign;
    const align = (s.textAlign || el.getAttribute("align") || "").toLowerCase();
    const tag = el.tagName;
    el.removeAttribute("style");
    el.removeAttribute("align");

    if (SKIP_TAGS.has(tag) || TABLE_TAGS.has(tag)) return;

    if (CELL_TAGS.has(tag)) {
      if (usable(bg)) el.style.backgroundColor = bg;
      return;
    }

    if (BLOCK_TAGS.has(tag) && ALIGNS.has(align)) el.style.textAlign = align;

    // innermost first: later wrap() calls end up inside the earlier ones
    if (usable(bg)) wrap(el, "mark", (n) => n.setAttribute("data-color", bg));
    if (usable(color)) wrap(el, "span", (n) => (n.style.color = color));
    if (!/^H[1-6]$/.test(tag) && (weight === "bold" || Number(weight) >= 600)) wrap(el, "strong");
    if (italic) wrap(el, "em");
    if (/underline/.test(deco)) wrap(el, "u");
    if (/line-through/.test(deco)) wrap(el, "s");
    if (valign === "super") wrap(el, "sup");
    else if (valign === "sub") wrap(el, "sub");
  });
  return doc.body.innerHTML;
}

export const CleanStylesKeepColors = Extension.create({
  name: "cleanStyles",
  priority: 80,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("cleanStyles"),
        props: {
          transformPastedHTML(html: string) {
            try {
              return keepFormattingOnly(html);
            } catch (err) {
              // never lose the paste: report, then fall back to core behavior
              // (strip all inline styles)
              clientLogger.error("paste-colors", "failed to convert pasted HTML", err);
              return html.replace(/\s+style=("[^"]*"|'[^']*')/gi, "");
            }
          },
        },
      }),
    ];
  },
});
