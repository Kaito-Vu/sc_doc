import { describe, expect, it } from "vitest";
import {
  buildSwitcherSections,
  pushRecentSpace,
  RecentSpace,
  SwitcherSpace,
} from "./space-switcher-data";

const sp = (id: string, extra: Partial<SwitcherSpace> = {}): SwitcherSpace => ({
  id,
  slug: id,
  name: `Space ${id}`,
  ...extra,
});
const rec = (id: string, visitedAt = 0): RecentSpace => ({
  id,
  slug: id,
  name: `Space ${id}`,
  visitedAt,
});

describe("pushRecentSpace", () => {
  it("puts newest first and dedupes by id", () => {
    const next = pushRecentSpace([rec("a"), rec("b")], rec("b", 5));
    expect(next.map((s) => s.id)).toEqual(["b", "a"]);
  });
  it("caps at max (default 8)", () => {
    let list: RecentSpace[] = [];
    for (let i = 0; i < 12; i++) list = pushRecentSpace(list, rec(String(i)));
    expect(list).toHaveLength(8);
    expect(list[0].id).toBe("11");
  });
});

describe("buildSwitcherSections", () => {
  const base = { favorites: [], recent: [], all: [], query: "" };

  it("removes favorites from recent", () => {
    const s = buildSwitcherSections({
      ...base,
      favorites: [sp("a")],
      recent: [rec("a"), rec("b")],
      all: [sp("a"), sp("b")],
    });
    expect(s.recent.map((x) => x.id)).toEqual(["b"]);
  });

  it("puts personal first and hides archived unless searching", () => {
    const all = [sp("a"), sp("z", { isArchived: true }), sp("p", { isPersonal: true })];
    expect(buildSwitcherSections({ ...base, all }).all.map((x) => x.id)).toEqual(["p", "a"]);
    expect(
      buildSwitcherSections({ ...base, all, query: "space" }).all.map((x) => x.id),
    ).toEqual(["p", "a", "z"]);
  });

  it("drops recents not in the known list", () => {
    const s = buildSwitcherSections({
      ...base,
      recent: [rec("a"), rec("gone")],
      all: [sp("a")],
      knownIds: new Set(["a"]),
    });
    expect(s.recent.map((x) => x.id)).toEqual(["a"]);
  });

  it("filters favorites and recents by query", () => {
    const s = buildSwitcherSections({
      ...base,
      favorites: [sp("alpha"), sp("beta")],
      recent: [rec("gamma")],
      all: [sp("alpha"), sp("beta"), sp("gamma")],
      query: "alp",
    });
    expect(s.favorites.map((x) => x.id)).toEqual(["alpha"]);
    expect(s.recent).toEqual([]);
  });
});
