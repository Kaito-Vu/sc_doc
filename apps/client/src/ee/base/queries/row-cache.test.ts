import { describe, expect, it } from "vitest";
import { patchRowIn, removeRowsIn } from "./row-cache";

const row = (id: string, n = 0) => ({ id, cells: { a: n } }) as any;
const cache = () =>
  ({
    pageParams: [undefined, "c"],
    pages: [
      { items: [row("1"), row("2")] },
      { items: [row("3")] },
    ],
  }) as any;

describe("row-cache updaters", () => {
  it("patches one row and keeps untouched pages by reference", () => {
    const old = cache();
    const next = patchRowIn("3", (r) => ({ ...r, cells: { a: 9 } }))(old);
    expect(next.pages[1].items[0].cells.a).toBe(9);
    expect(next.pages[0]).toBe(old.pages[0]);
  });

  it("returns the same cache when nothing matches", () => {
    const old = cache();
    expect(patchRowIn("x", (r) => r)(old)).toBe(old);
    expect(removeRowsIn(new Set(["x"]))(old)).toBe(old);
  });

  it("removes rows and keeps untouched pages by reference", () => {
    const old = cache();
    const next = removeRowsIn(new Set(["1"]))(old);
    expect(next.pages[0].items.map((r: any) => r.id)).toEqual(["2"]);
    expect(next.pages[1]).toBe(old.pages[1]);
  });

  it("passes undefined through", () => {
    expect(patchRowIn("1", (r) => r)(undefined)).toBeUndefined();
  });
});
