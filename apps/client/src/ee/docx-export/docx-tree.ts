// Pure helpers over a flattened page tree (pre-order, `level` = depth), used by
// the DOCX export subpage picker.

export interface TreeItem {
  id: string;
  title: string;
  level: number;
}

export const blockEnd = (a: TreeItem[], i: number) => {
  let j = i + 1;
  while (j < a.length && a[j].level > a[i].level) j++;
  return j;
};

/** Start of the previous sibling's block, or -1 if `i` is the first child. */
export const prevSibling = (a: TreeItem[], i: number) => {
  let k = i - 1;
  while (k >= 0 && a[k].level > a[i].level) k--;
  return k >= 0 && a[k].level === a[i].level ? k : -1;
};

/** Swaps item `i` (with its subtree) with the previous sibling (with its subtree). */
export function moveUp(a: TreeItem[], i: number): TreeItem[] {
  const k = prevSibling(a, i);
  if (k < 0) return a;
  const end = blockEnd(a, i);
  return [
    ...a.slice(0, k),
    ...a.slice(i, end),
    ...a.slice(k, i),
    ...a.slice(end),
  ];
}

export const parentOf = (a: TreeItem[], i: number) => {
  let k = i - 1;
  while (k >= 0 && a[k].level >= a[i].level) k--;
  return k;
};

/** Moves item `from` (with subtree) before/after sibling `to`; no-op unless they share a parent. */
export function moveBlock(
  a: TreeItem[],
  from: number,
  to: number,
  after: boolean,
): TreeItem[] {
  if (from === to || parentOf(a, from) !== parentOf(a, to)) return a;
  const block = a.slice(from, blockEnd(a, from));
  const rest = [...a.slice(0, from), ...a.slice(blockEnd(a, from))];
  const t = rest.findIndex((x) => x.id === a[to].id);
  const at = after ? blockEnd(rest, t) : t;
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

export const canMoveDown = (a: TreeItem[], i: number) => {
  const end = blockEnd(a, i);
  return end < a.length && a[end].level === a[i].level;
};

/** Ancestor indexes of item `i` (excluding the root at 0), nearest first. */
export const ancestors = (a: TreeItem[], i: number) => {
  const out: number[] = [];
  let level = a[i].level;
  for (let k = i - 1; k > 0; k--) {
    if (a[k].level < level) {
      out.push(k);
      level = a[k].level;
    }
  }
  return out;
};
