import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { pushRecentSpace, RecentSpace } from "./space-switcher-data";

export type { RecentSpace };

export const recentSpacesAtom = atomWithStorage<RecentSpace[]>(
  "sc.recent-spaces.v1",
  [],
  undefined,
  { getOnInit: true },
);

export const recentSpacesListAtom = atom((get) => {
  const value = get(recentSpacesAtom);
  return Array.isArray(value) ? value : [];
});

export const recordRecentSpaceAtom = atom(
  null,
  (get, set, space: Omit<RecentSpace, "visitedAt">) => {
    set(
      recentSpacesAtom,
      pushRecentSpace(get(recentSpacesListAtom), {
        ...space,
        visitedAt: Date.now(),
      }),
    );
  },
);
