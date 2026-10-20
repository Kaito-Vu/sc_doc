import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type RecentPage = {
  pageId: string;
  slugId: string;
  title: string;
  spaceSlug: string;
  spaceName?: string;
  icon?: string | null;
  visitedAt: number;
};

export type SavedSearchView = {
  id: string;
  name: string;
  query: string;
  spaceId?: string | null;
  contentType: "page" | "attachment";
  titleOnly?: boolean;
};

export const commandPaletteOpenedAtom = atom(false);
export const quickCreateOpenedAtom = atom(false);

export const recentPagesAtom = atomWithStorage<RecentPage[]>(
  "sc.recent-pages.v1",
  [],
  undefined,
  { getOnInit: true },
);

export const recentPagesListAtom = atom((get) => {
  const value = get(recentPagesAtom);
  return Array.isArray(value) ? value : [];
});

export const recordRecentPageAtom = atom(
  null,
  (get, set, page: RecentPage) => {
    const current = get(recentPagesListAtom);
    const next = [
      page,
      ...current.filter((item) => item.pageId !== page.pageId),
    ].slice(0, 20);
    set(recentPagesAtom, next);
  },
);

export const clearRecentPagesAtom = atom(null, (_get, set) => {
  set(recentPagesAtom, []);
});

export const savedSearchViewsAtom = atomWithStorage<SavedSearchView[]>(
  "sc.saved-search-views.v1",
  [],
  undefined,
  { getOnInit: true },
);
