import { describe, expect, it, vi } from "vitest";
import {
  buildActionItems,
  buildPageItems,
  buildRecentPageItems,
  buildSpaceItems,
  COLLAPSED_SPACES,
  groupItems,
} from "./palette-items";
import type { SwitcherSpace } from "@/ee/ui/space-switcher/space-switcher-data";

const t = (k: string) => k;
const nav = { to: vi.fn(), space: vi.fn(), page: vi.fn() };
const sp = (id: string, extra: Partial<SwitcherSpace> = {}): SwitcherSpace => ({
  id,
  slug: id,
  name: `Space ${id}`,
  ...extra,
});

const actionArgs = {
  t,
  nav,
  term: "",
  spacesMode: false,
  aiChatEnabled: false,
  modernUi: false,
  newDocument: vi.fn(),
  openSearch: vi.fn(),
  toggleModernUi: vi.fn(),
};

describe("buildActionItems", () => {
  it("is empty in spaces mode", () => {
    expect(buildActionItems({ ...actionArgs, spacesMode: true })).toEqual([]);
  });
  it("inserts Ask AI third only when enabled", () => {
    expect(buildActionItems(actionArgs).map((i) => i.id)).not.toContain("ask-ai");
    expect(buildActionItems({ ...actionArgs, aiChatEnabled: true })[2].id).toBe("ask-ai");
  });
  it("filters by term and labels the UI toggle", () => {
    expect(buildActionItems({ ...actionArgs, term: "review" }).map((i) => i.id)).toEqual([
      "reviews",
    ]);
    expect(
      buildActionItems({ ...actionArgs, modernUi: true }).find((i) => i.id === "toggle-modern-ui")
        ?.label,
    ).toBe("Switch to classic UI");
  });
});

describe("buildPageItems", () => {
  const results = [{ id: "1", title: "", slugId: "s1", space: { slug: "a", name: "A" } }];
  it("returns nothing when disabled and falls back to Untitled", () => {
    expect(buildPageItems({ t, nav, results, enabled: false })).toEqual([]);
    expect(buildPageItems({ t, nav, results, enabled: true })[0].label).toBe("Untitled");
  });
});

describe("buildSpaceItems", () => {
  const base = {
    t,
    nav,
    hasNextPage: false,
    spacesMode: false,
    spaceTerm: "",
    favoriteIds: new Set<string>(["a"]),
    fetchNextPage: vi.fn(),
    showMoreSpaces: vi.fn(),
  };
  const empty = { favorites: [], recent: [], all: [] };

  it("is empty outside spaces mode without a term", () => {
    expect(buildSpaceItems({ ...base, sections: { ...empty, all: [sp("a")] } })).toEqual([]);
  });

  it("dedupes across sections in spaces mode (recent wins) and adds markers", () => {
    const items = buildSpaceItems({
      ...base,
      spacesMode: true,
      currentSpaceSlug: "a",
      sections: { recent: [sp("a")], favorites: [sp("a"), sp("b")], all: [sp("a"), sp("b", { isArchived: true })] },
    });
    expect(items.map((i) => i.id)).toEqual(["space-Recent spaces-a", "space-Favorite spaces-b"]);
    expect(items[0].markers).toEqual(["Current", "Pinned"]);
  });

  it("adds a fetch-more item when another page exists", () => {
    const items = buildSpaceItems({
      ...base,
      spacesMode: true,
      hasNextPage: true,
      sections: { ...empty, all: [sp("a")] },
    });
    expect(items.at(-1)?.id).toBe("spaces-more");
    expect(items.at(-1)?.keepOpen).toBe(true);
  });

  it("collapses term results and offers show-more", () => {
    const all = Array.from({ length: COLLAPSED_SPACES + 2 }, (_, i) => sp(String(i)));
    const items = buildSpaceItems({ ...base, spaceTerm: "x", sections: { ...empty, all } });
    expect(items).toHaveLength(COLLAPSED_SPACES + 1);
    items.at(-1)?.run();
    expect(base.showMoreSpaces).toHaveBeenCalled();
  });
});

describe("buildRecentPageItems", () => {
  const recentPages = Array.from({ length: 8 }, (_, i) => ({
    pageId: `p${i}`,
    slugId: `s${i}`,
    title: i === 0 ? "Alpha" : `Page ${i}`,
    spaceSlug: "sp",
    visitedAt: 0,
  }));
  it("caps at 6, filters by term, hides in spaces mode", () => {
    const args = { t, nav, recentPages, term: "", spacesMode: false };
    expect(buildRecentPageItems(args)).toHaveLength(6);
    expect(buildRecentPageItems({ ...args, term: "alpha" }).map((i) => i.id)).toEqual(["recent-p0"]);
    expect(buildRecentPageItems({ ...args, spacesMode: true })).toEqual([]);
  });
});

describe("groupItems", () => {
  it("orders by SECTION_ORDER and drops empty groups", () => {
    const mk = (id: string, section: string) => ({
      id,
      label: id,
      section,
      icon: "file" as const,
      run: () => {},
    });
    const g = groupItems([mk("r", "Recent"), mk("a", "Actions"), mk("x", "Unknown")]);
    expect(g.map((x) => x.section)).toEqual(["Actions", "Recent"]);
  });
});
