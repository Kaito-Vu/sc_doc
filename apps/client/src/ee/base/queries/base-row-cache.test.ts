import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  appendRow,
  mapRow,
  removeRows,
  patchRowsCache,
  rollbackRows,
} from "./base-row-cache";

const row = (id: string) => ({ id, cells: {}, position: id }) as any;
const data = () =>
  ({
    pageParams: [undefined, "c"],
    pages: [
      { items: [row("a"), row("b")], meta: {} },
      { items: [row("c")], meta: {} },
    ],
  }) as any;
const ids = (d: any) => d.pages.map((p: any) => p.items.map((r: any) => r.id));

describe("base-row-cache", () => {
  it("appends to the last page only", () => {
    expect(ids(appendRow(row("z"))(data()))).toEqual([["a", "b"], ["c", "z"]]);
    expect(appendRow(row("z"))(undefined)).toBeUndefined();
  });

  it("removes rows across pages", () => {
    expect(ids(removeRows(["a", "c"])(data()))).toEqual([["b"], []]);
  });

  it("maps one row", () => {
    const out = mapRow("c", (r) => ({ ...r, position: "p" }))(data());
    expect(out.pages[1].items[0].position).toBe("p");
    expect(out.pages[0].items[0].position).toBe("a");
  });

  it("patches then rolls back", async () => {
    const qc = new QueryClient();
    const key = ["base-rows", "p1", undefined, undefined];
    qc.setQueryData(key, data());
    const snaps = await patchRowsCache(qc, "p1", removeRows(["a"]));
    expect(ids(qc.getQueryData(key))).toEqual([["b"], ["c"]]);
    rollbackRows(qc, snaps);
    expect(ids(qc.getQueryData(key))).toEqual([["a", "b"], ["c"]]);
  });
});
